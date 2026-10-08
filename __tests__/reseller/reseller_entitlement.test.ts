/**
 * @file __tests__/reseller/reseller_entitlement.test.ts
 * @description Unit Test Suite for Store Reseller V1 Commercial & Entitlement Contract
 *
 * Verifies:
 * 1. Dynamic Quota Entitlement Resolution:
 *    - FREE: 5 active resellers
 *    - STARTER: 25 active resellers
 *    - SCALE: 100 active resellers
 *    - UNLIMITED / ENTERPRISE: 999,999 active resellers
 * 2. Server-side Deterministic Limit Rejection:
 *    - Counts ONLY ACTIVE members (is_active = true and not frozen)
 *    - Structured 403 JSON payload on quota limit breach
 * 3. Downgrade-Safe Guardrails & Status FROZEN:
 *    - FIFO preservation of active members
 *    - Non-destructive transition to FROZEN (read-only)
 *    - Auto-thaw recovery upon tier upgrade
 *    - HTTP DELETE soft-deactivation (zero hard delete)
 * 4. Transaction Attribution & Commission Protection:
 *    - resolveResellerContext returns null for FROZEN resellers
 *    - recordResellerCommissionOnCanonicalEvent rejects commission for non-active resellers
 */

import {
  resolveResellerEntitlement,
  syncDowngradeSafeResellers,
  resolveResellerContext,
  recordResellerCommissionOnCanonicalEvent,
} from '@/lib/store-reseller';
import { POST, PATCH, DELETE } from '@/app/api/v1/tenants/[slug]/reseller/members/route';
import { NextRequest } from 'next/server';

describe('Store Reseller V1 - Entitlement & Downgrade-Safe Contract', () => {
  describe('1. Dynamic Quota Entitlement Resolution (resolveResellerEntitlement)', () => {
    it('resolves FREE tier by default (max 5 active resellers)', () => {
      const res = resolveResellerEntitlement({ tier: 'SOLO' });
      expect(res.tier).toBe('FREE');
      expect(res.max_active_resellers).toBe(5);
      expect(res.current_quota).toBe(5);
      expect(res.upgrade_url).toBe('/dashboard/billing?feature=reseller_starter');
      expect(res.message).toContain('Batas kuota mitra reseller aktif telah tercapai');
    });

    it('resolves STARTER Add-on tier (max 25 active resellers)', () => {
      const res = resolveResellerEntitlement({
        tier: 'SOLO',
        metadata: { reseller_settings: { tier: 'STARTER' } },
      });
      expect(res.tier).toBe('STARTER');
      expect(res.max_active_resellers).toBe(25);
      expect(res.current_quota).toBe(25);
      expect(res.upgrade_url).toBe('/dashboard/billing?feature=reseller_scale');
    });

    it('resolves STARTER from features or addons flag', () => {
      const res = resolveResellerEntitlement({
        metadata: { addons: { reseller_starter: true } },
      });
      expect(res.tier).toBe('STARTER');
      expect(res.max_active_resellers).toBe(25);
    });

    it('resolves SCALE Add-on tier (max 100 active resellers)', () => {
      const res = resolveResellerEntitlement({
        metadata: { reseller_tier: 'SCALE' },
      });
      expect(res.tier).toBe('SCALE');
      expect(res.max_active_resellers).toBe(100);
      expect(res.current_quota).toBe(100);
      expect(res.upgrade_url).toBe('/dashboard/billing?feature=reseller_unlimited');
    });

    it('resolves UNLIMITED tier for Enterprise or Unlimited Add-on', () => {
      const resEnt = resolveResellerEntitlement({ tier: 'ENTERPRISE' });
      expect(resEnt.tier).toBe('UNLIMITED');
      expect(resEnt.max_active_resellers).toBe(999999);

      const resTeam = resolveResellerEntitlement({ tier: 'TEAM_SCALE' });
      expect(resTeam.tier).toBe('UNLIMITED');

      const resMeta = resolveResellerEntitlement({
        metadata: { reseller_settings: { tier: 'UNLIMITED' } },
      });
      expect(resMeta.tier).toBe('UNLIMITED');
    });
  });

  describe('2. Downgrade-Safe Reconcile & Status FROZEN (syncDowngradeSafeResellers)', () => {
    it('freezes excess active resellers FIFO during tier downgrade without hard-deleting', async () => {
      const updateFn = jest.fn().mockReturnThis();
      const mockSupabase: any = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              { id: 'r1', created_at: '2026-01-01T00:00:00Z', status: 'ACTIVE' },
              { id: 'r2', created_at: '2026-01-02T00:00:00Z', status: 'ACTIVE' },
              { id: 'r3', created_at: '2026-01-03T00:00:00Z', status: 'ACTIVE' },
              { id: 'r4', created_at: '2026-01-04T00:00:00Z', status: 'ACTIVE' },
              { id: 'r5', created_at: '2026-01-05T00:00:00Z', status: 'ACTIVE' },
              { id: 'r6', created_at: '2026-01-06T00:00:00Z', status: 'ACTIVE' },
              { id: 'r7', created_at: '2026-01-07T00:00:00Z', status: 'ACTIVE' },
            ],
            error: null,
          }),
          update: updateFn,
        })),
      };

      // Free tier max limit: 5
      await syncDowngradeSafeResellers('tenant_123', 5, mockSupabase);

      // Verify r6 and r7 were updated to FROZEN
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FROZEN',
          metadata: expect.objectContaining({
            frozen_reason: 'DOWNGRADE_QUOTA_EXCEEDED',
            previous_status: 'ACTIVE',
          }),
        })
      );
      expect(updateFn).toHaveBeenCalledTimes(2);
    });

    it('auto-thaws previously FROZEN resellers when quota expands upon upgrade', async () => {
      const updateFn = jest.fn().mockReturnThis();
      const mockSupabase: any = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [{ id: 'r3', created_at: '2026-01-03T00:00:00Z', status: 'FROZEN' }],
              error: null,
            }),
            then: (resolve: any) =>
              resolve({
                data: [
                  { id: 'r1', created_at: '2026-01-01T00:00:00Z', status: 'ACTIVE' },
                  { id: 'r2', created_at: '2026-01-02T00:00:00Z', status: 'ACTIVE' },
                ],
                error: null,
              }),
          }),
          update: updateFn,
        })),
      };

      await syncDowngradeSafeResellers('tenant_123', 5, mockSupabase);

      // Verify r3 was thawed back to ACTIVE
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACTIVE',
          metadata: expect.objectContaining({
            unfrozen_at: expect.any(String),
          }),
        })
      );
    });
  });

  describe('3. Server-side Deterministic Limit Rejection in API Gateway', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('rejects POST mutation with HTTP 403 RESELLER_LIMIT_REACHED when Free tier reaches 5 active members', async () => {
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'tenant_123', slug: 'demo-shop', tier: 'SOLO', metadata: {} },
                error: null,
              }),
            };
          }
          if (table === 'store_resellers') {
            return {
              select: jest.fn((fields: string, opts?: any) => {
                if (opts?.count === 'exact') {
                  return {
                    eq: jest.fn().mockReturnValue({
                      eq: jest.fn().mockResolvedValue({ count: 5, data: null, error: null }),
                    }),
                  };
                }
                return {
                  eq: jest.fn().mockReturnThis(),
                  order: jest.fn().mockReturnValue({
                    data: [],
                    error: null,
                    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                    then: (resolve: any) => resolve({ data: [], error: null }),
                  }),
                  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase);
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabase').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost/api/v1/tenants/demo-shop/reseller/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mitra Ke-6',
          phone: '081234567890',
        }),
      });

      const response = await POST(req, { params: Promise.resolve({ slug: 'demo-shop' }) });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json).toEqual({
        success: false,
        error: 'RESELLER_LIMIT_REACHED',
        message: 'Batas kuota mitra reseller aktif telah tercapai. Upgrade ke Starter Add-on untuk menambah hingga 25 reseller.',
        current_quota: 5,
        upgrade_url: '/dashboard/billing?feature=reseller_starter',
      });
    });

    it('rejects PATCH mutating frozen member parameters without activating (read-only guardrail)', async () => {
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'tenant_123', slug: 'demo-shop', tier: 'SOLO', metadata: {} },
                error: null,
              }),
            };
          }
          if (table === 'store_resellers') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'r_frozen', tenant_id: 'tenant_123', status: 'FROZEN', name: 'Mitra Beku' },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase);
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabase').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost/api/v1/tenants/demo-shop/reseller/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'r_frozen',
          commission_value: 20,
        }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ slug: 'demo-shop' }) });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('RESELLER_FROZEN_READ_ONLY');
    });

    it('performs soft-deactivation (status: INACTIVE) on DELETE to preserve ledger audit trail', async () => {
      const updateFn = jest.fn().mockReturnThis();
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'tenant_123', slug: 'demo-shop' },
                error: null,
              }),
            };
          }
          if (table === 'store_resellers') {
            return {
              update: updateFn,
              eq: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'r_active', status: 'INACTIVE', code: 'MITRA01' },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase);
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabase').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost/api/v1/tenants/demo-shop/reseller/members?id=r_active', {
        method: 'DELETE',
      });

      const response = await DELETE(req, { params: Promise.resolve({ slug: 'demo-shop' }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'INACTIVE',
        })
      );
    });
  });

  describe('4. Attribution & Commission Protection for FROZEN Resellers', () => {
    it('resolveResellerContext returns null when reseller status is not ACTIVE (e.g. FROZEN)', async () => {
      const mockSupabase: any = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null, // Because query filters .eq('status', 'ACTIVE')
            error: null,
          }),
        })),
      };

      const result = await resolveResellerContext('demo-shop', 'FROZEN01', mockSupabase);
      expect(result).toBeNull();
    });

    it('recordResellerCommissionOnCanonicalEvent refuses to record commission if reseller is FROZEN', async () => {
      const upsertFn = jest.fn();
      const mockSupabase: any = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { status: 'FROZEN' },
            error: null,
          }),
          upsert: upsertFn,
        })),
      };

      const result = await recordResellerCommissionOnCanonicalEvent({
        tenantId: 'tenant_123',
        orderId: 'order_abc',
        resellerId: 'reseller_frozen',
        commissionBase: 100000,
        commissionType: 'PERCENTAGE',
        commissionValue: 10,
        supabaseClient: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Reseller is not active');
      // Zero commission insertion
      expect(upsertFn).not.toHaveBeenCalled();
    });
  });
});
