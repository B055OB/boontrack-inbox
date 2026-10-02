import { GET, resolveBaselineQuota } from '@/app/api/v1/tenants/[slug]/ai-quota/route';
import { NextRequest } from 'next/server';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('AI Session Quota & Subscription Entitlement Suite', () => {
  describe('resolveBaselineQuota', () => {
    it('returns 0 for STARTER, SOLO, LITE or empty tiers', () => {
      expect(resolveBaselineQuota('STARTER')).toBe(0);
      expect(resolveBaselineQuota('starter')).toBe(0);
      expect(resolveBaselineQuota('SOLO')).toBe(0);
      expect(resolveBaselineQuota('CHECKOUT_LITE')).toBe(0);
      expect(resolveBaselineQuota(null)).toBe(0);
      expect(resolveBaselineQuota(undefined)).toBe(0);
      expect(resolveBaselineQuota('')).toBe(0);
    });

    it('returns 300 for PRO_SCALE, ADS_PERFORMANCE, and PRO variants', () => {
      expect(resolveBaselineQuota('PRO_SCALE')).toBe(300);
      expect(resolveBaselineQuota('pro_scale')).toBe(300);
      expect(resolveBaselineQuota('ADS_PERFORMANCE')).toBe(300);
      expect(resolveBaselineQuota('PRO')).toBe(300);
    });

    it('returns 600 for ENTERPRISE, TEAM_SCALE, and ENTERPRISE variants', () => {
      expect(resolveBaselineQuota('ENTERPRISE')).toBe(600);
      expect(resolveBaselineQuota('enterprise')).toBe(600);
      expect(resolveBaselineQuota('TEAM_SCALE')).toBe(600);
      expect(resolveBaselineQuota('TEAM')).toBe(600);
    });
  });

  describe('GET /api/v1/tenants/[slug]/ai-quota route integration', () => {
    const mockTenantId = 'tenant-uuid-1111-2222';
    const mockSlug = 'tokoberkah';

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns 300 quota and active subscription period for PRO_SCALE tenant', async () => {
      const futurePeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: mockTenantId,
                  slug: mockSlug,
                  name: 'Toko Berkah',
                  tier: 'PRO_SCALE',
                  subscription_tier: 'PRO_SCALE',
                  subscription_status: 'ACTIVE',
                  metadata: {
                    ai_sessions_used: 50,
                  },
                },
                error: null,
              }),
            };
          }
          if (table === 'shop_subscriptions') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'sub-active-pro',
                  tier: 'PRO_SCALE',
                  current_period_starts_at: new Date().toISOString(),
                  current_period_ends_at: futurePeriodEnd,
                  expires_at: futurePeriodEnd,
                  status: 'ACTIVE',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${mockSlug}/ai-quota`);
      const res = await GET(req, { params: Promise.resolve({ slug: mockSlug }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.tier).toBe('PRO_SCALE');
      expect(json.base_quota).toBe(300);
      expect(json.total_quota).toBe(300);
      expect(json.remaining_sessions).toBe(250);
      expect(json.used_sessions).toBe(50);
      expect(json.days_remaining).toBeGreaterThanOrEqual(14);
      expect(json.days_remaining).toBeLessThanOrEqual(16);
      expect(json.current_period_ends_at).toBe(futurePeriodEnd);
    });

    it('returns 600 quota and active subscription period for ENTERPRISE tenant', async () => {
      const futurePeriodEnd = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: mockTenantId,
                  slug: mockSlug,
                  name: 'Toko Berkah Enterprise',
                  tier: 'ENTERPRISE',
                  subscription_tier: 'ENTERPRISE',
                  subscription_status: 'ACTIVE',
                  metadata: {
                    ai_sessions_used: 100,
                  },
                },
                error: null,
              }),
            };
          }
          if (table === 'shop_subscriptions') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'sub-active-ent',
                  tier: 'ENTERPRISE',
                  current_period_starts_at: new Date().toISOString(),
                  current_period_ends_at: futurePeriodEnd,
                  expires_at: futurePeriodEnd,
                  status: 'ACTIVE',
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${mockSlug}/ai-quota`);
      const res = await GET(req, { params: Promise.resolve({ slug: mockSlug }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.tier).toBe('ENTERPRISE');
      expect(json.base_quota).toBe(600);
      expect(json.total_quota).toBe(600);
      expect(json.remaining_sessions).toBe(500);
      expect(json.days_remaining).toBeGreaterThanOrEqual(24);
      expect(json.current_period_ends_at).toBe(futurePeriodEnd);
    });

    it('returns 0 quota and is_depleted true for STARTER tenant', async () => {
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: mockTenantId,
                  slug: mockSlug,
                  name: 'Toko Berkah Starter',
                  tier: 'STARTER',
                  subscription_tier: 'STARTER',
                  subscription_status: 'ACTIVE',
                  metadata: {},
                },
                error: null,
              }),
            };
          }
          if (table === 'shop_subscriptions') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${mockSlug}/ai-quota`);
      const res = await GET(req, { params: Promise.resolve({ slug: mockSlug }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.tier).toBe('STARTER');
      expect(json.base_quota).toBe(0);
      expect(json.total_quota).toBe(0);
      expect(json.remaining_sessions).toBe(0);
      expect(json.is_depleted).toBe(true);
    });
  });
});
