/**
 * @file __tests__/studio/intelligence-foundation.test.ts
 * @description Unit and Regression Test Suite for § 54 Studio Intelligence Foundation
 * Covers:
 * 1. Freshness logic & degradation stages (FRESH, AGING, STALE, EXPIRED).
 * 2. Entitlement guard: rejects unentitled tenants (403 FEATURE_NOT_ENTITLED).
 * 3. Entitlement guard: allows PRO_SCALE / ENTERPRISE / active feature flag tenants.
 * 4. Entitlement guard: rejects Paid Ads Ingestion (HOLD status per CTO mandate).
 * 5. Hook Pattern Injection & Query: filters commercial_eligibility=true & freshness_status=FRESH.
 */

import { evaluateFreshness } from '@/lib/studio/intelligence/freshness';
import {
  checkStudioIntelligenceEntitled,
  assertStudioIntelligenceEntitled,
  StudioEntitlementError,
} from '@/lib/entitlements/studio-guard';
import {
  getFreshHookPatternInsights,
  CURATED_FRESH_HOOK_PATTERNS,
} from '@/lib/studio/intelligence/repository';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('§ 54 Studio Intelligence Foundation Test Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. FRESHNESS EVALUATION ENGINE
  // =========================================================================
  describe('1. Freshness Logic & Degradation Stages', () => {
    const now = Date.now();

    it('marks signals observed within 48 hours as FRESH', () => {
      const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const fortySevenHoursAgo = new Date(now - 47 * 60 * 60 * 1000).toISOString();

      expect(evaluateFreshness(oneHourAgo)).toBe('FRESH');
      expect(evaluateFreshness(twentyFourHoursAgo)).toBe('FRESH');
      expect(evaluateFreshness(fortySevenHoursAgo)).toBe('FRESH');
    });

    it('marks signals between 48 hours and 7 days as AGING', () => {
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();

      expect(evaluateFreshness(threeDaysAgo)).toBe('AGING');
      expect(evaluateFreshness(sixDaysAgo)).toBe('AGING');
    });

    it('marks signals between 7 days and 14 days as STALE', () => {
      const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
      const twelveDaysAgo = new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString();

      expect(evaluateFreshness(eightDaysAgo)).toBe('STALE');
      expect(evaluateFreshness(twelveDaysAgo)).toBe('STALE');
    });

    it('marks signals older than 14 days as EXPIRED', () => {
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      expect(evaluateFreshness(fifteenDaysAgo)).toBe('EXPIRED');
      expect(evaluateFreshness(thirtyDaysAgo)).toBe('EXPIRED');
    });

    it('marks signals with an elapsed expiresAt timestamp as EXPIRED regardless of age', () => {
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
      const pastExpiry = new Date(now - 1000).toISOString();

      expect(evaluateFreshness(tenMinutesAgo, pastExpiry)).toBe('EXPIRED');
    });

    it('falls back safely to STALE for malformed date input', () => {
      expect(evaluateFreshness('invalid-timestamp-string')).toBe('STALE');
    });
  });

  // =========================================================================
  // 2. ENTITLEMENT GUARD: UNENTITLED TENANTS
  // =========================================================================
  describe('2. Entitlement Guard: Unentitled Tenant Rejection (403 FEATURE_NOT_ENTITLED)', () => {
    it('rejects a SOLO tier tenant without explicit feature flag', async () => {
      const mockTenant = {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'solostore',
        tier: 'SOLO',
        status: 'active',
        is_active: true,
        metadata: { features: {} },
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const check = await checkStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(check.entitled).toBe(false);
      expect(check.reason).toContain('not entitled to Viral Trends Radar');

      await expect(
        assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR')
      ).rejects.toThrow(StudioEntitlementError);

      try {
        await assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('FEATURE_NOT_ENTITLED');
      }
    });

    it('rejects empty or blank tenant identifier with 403', async () => {
      await expect(
        assertStudioIntelligenceEntitled('', 'VIRAL_TRENDS_RADAR')
      ).rejects.toThrow(StudioEntitlementError);
    });

    it('rejects a suspended or inactive tenant even if high tier', async () => {
      const mockTenant = {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'suspendedstore',
        tier: 'ENTERPRISE',
        status: 'suspended',
        is_active: false,
        metadata: {},
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const check = await checkStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(check.entitled).toBe(false);
      expect(check.reason).toContain('not active or suspended');

      await expect(
        assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR')
      ).rejects.toThrow(StudioEntitlementError);
    });
  });

  // =========================================================================
  // 3. ENTITLEMENT GUARD: ENTITLED TENANTS
  // =========================================================================
  describe('3. Entitlement Guard: Allowed Tenants (PRO_SCALE / ENTERPRISE / Flags)', () => {
    it('allows PRO_SCALE tier tenant', async () => {
      const mockTenant = {
        id: '33333333-3333-4333-8333-333333333333',
        slug: 'proscale-brand',
        tier: 'PRO_SCALE',
        status: 'active',
        is_active: true,
        metadata: {},
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const result = await assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(result).toBeDefined();
      expect(result.id).toBe(mockTenant.id);
    });

    it('allows ENTERPRISE tier tenant', async () => {
      const mockTenant = {
        id: '44444444-4444-4444-8444-444444444444',
        slug: 'enterprise-agency',
        tier: 'ENTERPRISE',
        status: 'active',
        is_active: true,
        metadata: {},
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const result = await assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(result.tier).toBe('ENTERPRISE');
    });

    it('allows tenant with explicit VIRAL_TRENDS_RADAR feature flag', async () => {
      const mockTenant = {
        id: '55555555-5555-4555-8555-555555555555',
        slug: 'custom-feature-store',
        tier: 'SOLO',
        status: 'active',
        is_active: true,
        metadata: {
          features: {
            VIRAL_TRENDS_RADAR: true,
          },
        },
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const check = await checkStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(check.entitled).toBe(true);

      const asserted = await assertStudioIntelligenceEntitled(mockTenant.id, 'VIRAL_TRENDS_RADAR');
      expect(asserted.slug).toBe('custom-feature-store');
    });
  });

  // =========================================================================
  // 4. ENTITLEMENT GUARD: PAID ADS INGESTION (HOLD STATUS)
  // =========================================================================
  describe('4. Entitlement Guard: Paid Ads Ingestion (HOLD Status per CTO Mandate)', () => {
    it('rejects Paid Ads capability by default with HOLD reason', async () => {
      const mockTenant = {
        id: '66666666-6666-4666-8666-666666666666',
        slug: 'active-brand',
        tier: 'ENTERPRISE',
        status: 'active',
        is_active: true,
        metadata: {},
      };

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const check = await checkStudioIntelligenceEntitled(mockTenant.id, 'PAID_ADS_INTELLIGENCE');
      expect(check.entitled).toBe(false);
      expect(check.reason).toContain('HOLD');

      await expect(
        assertStudioIntelligenceEntitled(mockTenant.id, 'PAID_ADS_INTELLIGENCE')
      ).rejects.toThrow(StudioEntitlementError);
    });
  });

  // =========================================================================
  // 5. HOOK PATTERN REPOSITORY & INJECTION
  // =========================================================================
  describe('5. Hook Pattern Injection & Query', () => {
    it('queries DB with commercial_eligibility=true and freshness_status=FRESH filters', async () => {
      const mockInsightsDb = [
        {
          id: 'insight-01',
          item_id: 'item-01',
          insight_type: 'HOOK_PATTERN',
          pattern_template: 'Pola hook viral 1',
          confidence_score: 0.95,
          commercial_eligibility: true,
          created_at: new Date().toISOString(),
          studio_intelligence_items: {
            category: 'skincare',
            freshness_status: 'FRESH',
          },
        },
      ];

      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockInsightsDb, error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const results = await getFreshHookPatternInsights('skincare', 3);

      expect(mockQuery.select).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('insight_type', 'HOOK_PATTERN');
      expect(mockQuery.eq).toHaveBeenCalledWith('commercial_eligibility', true);
      expect(mockQuery.eq).toHaveBeenCalledWith('studio_intelligence_items.freshness_status', 'FRESH');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].pattern_template).toBe('Pola hook viral 1');
      expect(results[0].commercial_eligibility).toBe(true);
    });

    it('falls back to curated Indonesian fresh hook templates when database is unmigrated or empty', async () => {
      // Mock empty DB return
      const mockQuery: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn().mockReturnValue(mockQuery),
      } as any);

      const skincareInsights = await getFreshHookPatternInsights('skincare', 3);
      expect(skincareInsights.length).toBe(3);
      expect(skincareInsights[0].category).toBe('skincare');
      expect(skincareInsights[0].pattern_template).toContain('pori-pori');

      const fashionInsights = await getFreshHookPatternInsights('fashion', 2);
      expect(fashionInsights.length).toBe(2);
      expect(fashionInsights[0].category).toBe('fashion');
      expect(fashionInsights[0].confidence_score).toBeGreaterThanOrEqual(0.9);
    });
  });
});
