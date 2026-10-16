/**
 * tests/api/onboarding_register.test.ts
 * Unit & Integration Tests: Hardening Multi-Tenant Registration & Transactional Outbox.
 *
 * Directive P1 CTO Requirements:
 * 1. Valid registration request yields HTTP 200 and tenant/outbox rows are saved.
 * 2. Zod validation failure yields HTTP 400.
 * 3. Invalid referral code yields HTTP 400 (fail-closed server-side validation).
 * 4. Idempotent retry with the same Idempotency-Key avoids duplicate tenant creation.
 * 5. Simulated database error yields HTTP 500 and NO notification is sent.
 * 6. Decoupled Outbox worker consumes pending events asynchronously.
 * 7. Non-regression smoke test for tenant products route.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/onboarding/register/route';
import { GET as getTenantProducts } from '@/app/api/v1/tenants/[slug]/products/route';
import { processRegistrationOutboxEvents } from '@/lib/outbox/registration-worker';
import * as supabaseClientModule from '@/lib/supabaseClient';
import * as affiliateNotificationModule from '@/lib/affiliate-notification-service';

jest.mock('@/lib/supabaseClient', () => {
  const original = jest.requireActual('@/lib/supabaseClient');
  return {
    ...original,
    getSupabaseAdmin: jest.fn(),
    getSupabase: jest.fn(),
  };
});

jest.mock('@/lib/affiliate-notification-service', () => ({
  sendNewAffiliateRegistrationNotification: jest.fn().mockResolvedValue({
    success: true,
    dispatchedTo: ['buzzerukm@gmail.com'],
  }),
}));

describe('Onboarding Register & Transactional Outbox (P1 Clearance)', () => {
  let mockSupabase: any;
  let storedTenants: any[] = [];
  let storedOutbox: any[] = [];
  let storedReferrals: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    storedTenants = [];
    storedOutbox = [];
    storedReferrals = [];

    mockSupabase = {
      from: jest.fn((table: string) => {
        return {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn((payload: any) => {
            const row = { id: `id-${Date.now()}-${Math.random()}`, ...payload };
            if (table === 'tenants') storedTenants.push(row);
            if (table === 'outbox_events') storedOutbox.push(row);
            if (table === 'affiliate_referrals') storedReferrals.push(row);

            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: row, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
            };
          }),
          update: jest.fn((patch: any) => ({
            eq: jest.fn((field: string, val: any) => {
              if (table === 'outbox_events') {
                const target = storedOutbox.find((o) => o[field] === val);
                if (target) Object.assign(target, patch);
              }
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          delete: jest.fn(() => ({
            eq: jest.fn((field: string, val: any) => {
              if (table === 'tenants') storedTenants = storedTenants.filter((t) => t[field] !== val);
              if (table === 'outbox_events') storedOutbox = storedOutbox.filter((o) => o[field] !== val);
              if (table === 'affiliate_referrals') storedReferrals = storedReferrals.filter((r) => r[field] !== val);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          eq: jest.fn((field: string, val: any) => {
            if (table === 'tenants' && field === 'slug') {
              const found = storedTenants.find((t) => t.slug === val);
              return {
                maybeSingle: jest.fn().mockResolvedValue({ data: found || null, error: null }),
                single: jest.fn().mockResolvedValue({ data: found || null, error: null }),
              };
            }
            if (table === 'outbox_events' && field === 'idempotency_key') {
              const found = storedOutbox.find((o) => o.idempotency_key === val);
              return {
                maybeSingle: jest.fn().mockResolvedValue({ data: found || null, error: null }),
              };
            }
            return {
              eq: jest.fn().mockReturnThis(),
              lte: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation((n: number) => {
                const pending = storedOutbox.filter((o) => o.status === 'PENDING').slice(0, n);
                return Promise.resolve({ data: pending, error: null });
              }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
          ilike: jest.fn((field: string, val: string) => {
            if (table === 'affiliates' && field === 'referral_code') {
              if (val.toLowerCase() === 'buzzerukm') {
                return {
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: 'aff-sakti-1',
                      name: 'Sakti Alamsyah',
                      email: 'buzzerukm@gmail.com',
                      phone: '6287822706930',
                      referral_code: 'buzzerukm',
                      role: 'am',
                      status: 'ACTIVE',
                    },
                    error: null,
                  }),
                };
              } else {
                return {
                  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
            }
            return {
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }),
      rpc: jest.fn().mockImplementation((fnName: string, args: any) => {
        // Fall through to JS compensating transaction handler for mock flexibility
        return Promise.reject(new Error('RPC mock fallback to compensating transaction'));
      }),
    };

    (supabaseClientModule.getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabase);
    (supabaseClientModule.getSupabase as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('1. Valid Registration & Transactional Outbox', () => {
    it('creates tenant (ACTIVE / PRO_SCALE) and enqueues outbox event with status PENDING', async () => {
      const payload = {
        store_name: 'Toko Budi Sukses',
        slug: 'toko-budi-sukses',
        owner_name: 'Budi Hartono',
        email: 'budi.hartono@example.com',
        phone: '081234567890',
        password: 'AmanPassword123!',
        ref_code: 'buzzerukm',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant.slug).toBe('toko-budi-sukses');
      expect(json.tenant.status).toBe('ACTIVE');

      // Verify row saved in tenants
      expect(storedTenants.length).toBe(1);
      expect(storedTenants[0].slug).toBe('toko-budi-sukses');
      expect(storedTenants[0].tier).toBe('PRO_SCALE');
      expect(storedTenants[0].status).toBe('ACTIVE');

      // Verify row saved in outbox_events with status PENDING
      expect(storedOutbox.length).toBe(1);
      expect(storedOutbox[0].event_type).toBe('MERCHANT_REGISTERED');
      expect(storedOutbox[0].status).toBe('PENDING');

      // Crucial: sendNewAffiliateRegistrationNotification must NOT be called synchronously
      expect(
        affiliateNotificationModule.sendNewAffiliateRegistrationNotification
      ).not.toHaveBeenCalled();
    });
  });

  describe('2. Zod Schema Validation (Fail-Closed)', () => {
    it('rejects invalid email and malformed slug with HTTP 400', async () => {
      const invalidPayload = {
        store_name: 'T', // Too short (min 2)
        slug: 'slug with spaces and capital LETTERS!', // Invalid characters
        owner_name: 'B',
        email: 'not-an-email',
        phone: '123', // Too short
        password: '123', // Too short
      };

      const req = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Validasi pendaftaran gagal');
      expect(storedTenants.length).toBe(0);
    });
  });

  describe('3. Server-Side Referral Validation', () => {
    it('rejects registration when referral code is invalid or not in database', async () => {
      const payload = {
        store_name: 'Toko Maju Jaya',
        slug: 'toko-maju-jaya',
        owner_name: 'Maju Jaya',
        email: 'majujaya@example.com',
        phone: '081234567890',
        password: 'Password123!',
        ref_code: 'KODE_PALSU_TIDAK_ADA',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('tidak valid atau tidak aktif');
      expect(storedTenants.length).toBe(0);
    });
  });

  describe('4. Idempotency Protection', () => {
    it('returns idempotent replay without creating duplicate tenants when same Idempotency-Key is provided', async () => {
      const idempotencyKey = 'test-idemp-unique-12345';
      const payload = {
        store_name: 'Toko Idempotent',
        slug: 'toko-idempotent',
        owner_name: 'Pak Doni',
        email: 'doni@example.com',
        phone: '081234567890',
        password: 'Password123!',
      };

      // 1st Call
      const req1 = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      expect(storedTenants.length).toBe(1);
      expect(storedOutbox.length).toBe(1);

      // 2nd Call with identical Idempotency-Key
      const req2 = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await POST(req2);
      expect(res2.status).toBe(200);

      const json2 = await res2.json();
      expect(json2.idempotent_replay).toBe(true);

      // No second tenant inserted
      expect(storedTenants.length).toBe(1);
      expect(storedOutbox.length).toBe(1);
    });
  });

  describe('5. Database Error Simulation & Total Rollback', () => {
    it('executes compensating rollback and returns 500 when outbox insert fails', async () => {
      // Mock outbox insert error
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Simulated PostgreSQL disk failure / outbox error' },
              }),
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {
          insert: jest.fn((payload: any) => {
            const row = { id: `id-${Date.now()}`, ...payload };
            if (table === 'tenants') storedTenants.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: row, error: null }),
            };
          }),
          delete: jest.fn(() => ({
            eq: jest.fn((field: string, val: any) => {
              if (table === 'tenants') storedTenants = [];
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
          ilike: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'aff-1', referral_code: 'buzzerukm', status: 'ACTIVE' },
              error: null,
            }),
          }),
        };
      });

      const payload = {
        store_name: 'Toko Rollback Test',
        slug: 'toko-rollback-test',
        owner_name: 'Pak Test',
        email: 'paktest@example.com',
        phone: '081234567890',
        password: 'Password123!',
        ref_code: 'buzzerukm',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      // Verify compensating rollback wiped the partially created tenant
      expect(storedTenants.length).toBe(0);

      // Notification was NOT sent
      expect(
        affiliateNotificationModule.sendNewAffiliateRegistrationNotification
      ).not.toHaveBeenCalled();
    });
  });

  describe('6. Decoupled Asynchronous Outbox Worker', () => {
    it('consumes pending outbox event and dispatches notification without modifying tenant', async () => {
      // Seed a pending outbox row
      storedOutbox.push({
        id: 'event-outbox-1',
        event_type: 'MERCHANT_REGISTERED',
        aggregate_id: 'toko-mandiri',
        status: 'PENDING',
        scheduled_at: new Date(Date.now() - 1000).toISOString(),
        payload: {
          store_name: 'Toko Mandiri',
          owner_name: 'Pak Mandiri',
          email: 'mandiri@example.com',
          phone: '081234567890',
          referral_code: 'buzzerukm',
        },
      });

      const result = await processRegistrationOutboxEvents({ limit: 10 });
      expect(result.claimed).toBe(1);
      expect(result.completed).toBe(1);

      // Verify status changed to COMPLETED
      expect(storedOutbox[0].status).toBe('COMPLETED');
      expect(
        affiliateNotificationModule.sendNewAffiliateRegistrationNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          affiliateName: 'Pak Mandiri',
          affiliateCode: 'buzzerukm',
        })
      );
    });
  });

  describe('7. Products Endpoint Non-Regression Smoke Test', () => {
    it('verifies GET /api/v1/tenants/[slug]/products returns 200 without regression', async () => {
      mockSupabase.from = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: 'tenant-onlineboost-id',
            slug: 'onlineboost',
            name: 'OnlineBoost ID',
            metadata: {
              products: [
                {
                  id: 'prod-1',
                  name: 'Jasa Setup AI Sales Rep',
                  price: 1500000,
                  active: true,
                },
              ],
            },
          },
          error: null,
        }),
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/onlineboost/products');
      const res = await getTenantProducts(req, {
        params: Promise.resolve({ slug: 'onlineboost' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.products).toBeDefined();
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.length).toBeGreaterThan(0);
    });
  });
});
