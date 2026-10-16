/**
 * tests/api/onboarding_register.test.ts
 * Unit & Integration Tests: Hardening Multi-Tenant Registration & Transactional Outbox.
 *
 * Directive P0/P1 CTO Requirements:
 * 1. True DB Atomicity: `register_merchant_transactional` RPC is the SOLE execution path.
 * 2. Zero Raw Password Policy: Password is cryptographically hashed before passing to RPC; no password_raw.
 * 3. Zod validation failure yields HTTP 400.
 * 4. Invalid referral code yields HTTP 400 (fail-closed server-side validation).
 * 5. Idempotent retry with the same Idempotency-Key returns 200 with idempotent_replay: true.
 * 6. Database error on RPC yields HTTP 500 and NO notification is sent.
 * 7. Atomic Outbox Worker: Claims pending events using `claim_registration_outbox_batch` RPC (or conditional CAS)
 *    with locked_at and status: PROCESSING, then dispatches notification and marks COMPLETED.
 * 8. Non-regression smoke test for tenant products route.
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
        const queryBuilder: any = {
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
          update: jest.fn((patch: any) => {
            let filterField: string | null = null;
            let filterVal: any = null;
            const updateBuilder: any = {
              eq: jest.fn((field: string, val: any) => {
                filterField = field;
                filterVal = val;
                return updateBuilder;
              }),
              select: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockImplementation(() => {
                if (table === 'outbox_events') {
                  const target = storedOutbox.find((o) => o.id === filterVal || o.status === filterVal);
                  if (target) Object.assign(target, patch);
                  return Promise.resolve({ data: target || null, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              }),
              then: (resolve: any) => {
                if (table === 'outbox_events' && filterField && filterVal) {
                  const target = storedOutbox.find((o) => o[filterField!] === filterVal);
                  if (target) Object.assign(target, patch);
                }
                return Promise.resolve({ data: null, error: null }).then(resolve);
              },
            };
            return updateBuilder;
          }),
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
            const filterBuilder: any = {
              eq: jest.fn().mockReturnThis(),
              lte: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation((n: number) => {
                const pending = storedOutbox.filter((o) => o.status === 'PENDING').slice(0, n);
                return Promise.resolve({ data: pending, error: null });
              }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
            return filterBuilder;
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
        return queryBuilder;
      }),
      rpc: jest.fn().mockImplementation((fnName: string, args: any) => {
        if (fnName === 'register_merchant_transactional') {
          const tenantId = `tenant-${Date.now()}`;
          const outboxId = `outbox-${Date.now()}`;

          // Create tenant record in mock memory
          storedTenants.push({
            id: tenantId,
            slug: args.p_slug,
            name: args.p_name,
            tier: 'PRO_SCALE',
            status: 'ACTIVE',
            access_password: args.p_password,
          });

          // Create outbox event in mock memory
          storedOutbox.push({
            id: outboxId,
            event_type: 'MERCHANT_REGISTERED',
            aggregate_id: args.p_slug,
            status: 'PENDING',
            idempotency_key: args.p_idempotency_key || null,
            payload: args.p_outbox_payload || {},
          });

          return Promise.resolve({
            data: {
              success: true,
              tenant_id: tenantId,
              slug: args.p_slug,
              name: args.p_name,
              tier: 'PRO_SCALE',
              status: 'ACTIVE',
              outbox_event_id: outboxId,
            },
            error: null,
          });
        }

        if (fnName === 'claim_registration_outbox_batch') {
          const batchSize = args.batch_size || 10;
          const pending = storedOutbox
            .filter((o) => o.status === 'PENDING')
            .slice(0, batchSize);

          const claimed = pending.map((item) => {
            item.status = 'PROCESSING';
            item.locked_at = new Date().toISOString();
            return { ...item };
          });

          return Promise.resolve({ data: claimed, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      }),
    };

    (supabaseClientModule.getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabase);
    (supabaseClientModule.getSupabase as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('1. Valid Registration & True DB Atomicity', () => {
    it('executes via register_merchant_transactional RPC with hashed password and enqueues outbox event', async () => {
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

      // 1. Verifikasi RPC dipanggil sebagai SATU-SATUNYA jalur transaksi atomik
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'register_merchant_transactional',
        expect.objectContaining({
          p_slug: 'toko-budi-sukses',
          p_name: 'Toko Budi Sukses',
          p_owner_name: 'Budi Hartono',
          p_email: 'budi.hartono@example.com',
          p_phone: '081234567890',
          p_ref_code: 'buzzerukm',
        })
      );

      // 2. Verifikasi Password Hashing Standard (Zero Plaintext Password Policy)
      const rpcArgs = mockSupabase.rpc.mock.calls.find(
        (c: any[]) => c[0] === 'register_merchant_transactional'
      )[1];
      expect(rpcArgs.p_password).not.toBe('AmanPassword123!');
      expect(rpcArgs.p_password).toHaveLength(64); // SHA-256 hex string

      // 3. Verifikasi baris outbox tersimpan dengan status PENDING
      expect(storedOutbox.length).toBe(1);
      expect(storedOutbox[0].status).toBe('PENDING');

      // 4. Decoupled Notification: notification service TIDAK dipanggil secara sinkron di HTTP request
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
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
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
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('4. Idempotency Protection', () => {
    it('returns idempotent replay without duplicate execution when same Idempotency-Key is provided', async () => {
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

  describe('5. Database RPC Failure Handling (Strict No-Fallback)', () => {
    it('returns HTTP 500 immediately without executing manual fallback when stored procedure fails', async () => {
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database transaction lock timeout in stored procedure' },
      });

      const payload = {
        store_name: 'Toko Gagal RPC',
        slug: 'toko-gagal-rpc',
        owner_name: 'Pak Gagal',
        email: 'gagal@example.com',
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

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Gagal memproses pendaftaran tenant secara atomik');

      // Notification was NOT sent
      expect(
        affiliateNotificationModule.sendNewAffiliateRegistrationNotification
      ).not.toHaveBeenCalled();
    });

    it('returns HTTP 409 Conflict if RPC reports slug already registered', async () => {
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Slug toko toko-duplikat sudah terdaftar.' },
      });

      const payload = {
        store_name: 'Toko Duplikat',
        slug: 'toko-duplikat',
        owner_name: 'Pak Duplikat',
        email: 'duplikat@example.com',
        phone: '081234567890',
        password: 'Password123!',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('sudah terdaftar');
    });
  });

  describe('6. Decoupled Asynchronous Outbox Worker with Atomic Locking', () => {
    it('claims pending outbox event via claim_registration_outbox_batch RPC and dispatches notification', async () => {
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
