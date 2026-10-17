/**
 * tests/api/partners_rbac.test.ts
 * Unit Tests: RBAC Authorization & Security Isolation on Manager Partners Endpoint.
 *
 * Directive P0/P1 CTO Requirements:
 * 1. ZERO TRUST ON CLIENT HEADERS: Total elimination of `x-user-role` or client-supplied role claims.
 * 2. NO SERVICE ROLE AS HUMAN BEARER: Explicitly reject SUPABASE_SERVICE_ROLE_KEY (HTTP 401).
 * 3. AUTHENTICATION VIA SUPABASE AUTH: Validate token via `supabaseAdmin.auth.getUser(token)`.
 *    - Token missing -> HTTP 401
 *    - Token fake/invalid -> HTTP 401
 *    - Token expired -> HTTP 401
 *    - Header role spoofing (`x-user-role: SUPERADMIN`) ignored and rejected (401 / 403).
 * 4. STRICT FAIL-CLOSED ON ROLES: Non-manager roles (AFFILIATE, CUSTOMER, substring traps) -> HTTP 403.
 * 5. AUTHORIZED MANAGERS (SUPERADMIN, AFFILIATE_MANAGER) -> HTTP 200.
 * 6. ZERO RAW PASSWORDS: POST auto-provisions tenant via `register_merchant_transactional` with hashed password.
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/manager/partners/route';
import * as supabaseClientModule from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient', () => {
  const original = jest.requireActual('@/lib/supabaseClient');
  return {
    ...original,
    getSupabaseAdmin: jest.fn(),
    getSupabase: jest.fn(),
  };
});

describe('RBAC & Security Isolation: /api/v1/manager/partners', () => {
  let mockSupabaseAdmin: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-secret-key-999' };

    mockSupabaseAdmin = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'partner-1',
            name: 'Kang Budi',
            phone_number: '6285183088404',
            email: 'budiawan@example.com',
            role: 'AFFILIATE',
            referral_code: 'SPASIALHUB',
            status: 'ACTIVE',
            commission_rate: 15,
            metadata: {},
          },
        ],
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'partner-new' }],
        error: null,
      }),
      rpc: jest.fn().mockResolvedValue({
        data: { success: true, tenant_id: 'tenant-123', outbox_event_id: 'event-123' },
        error: null,
      }),
      or: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    (supabaseClientModule.getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabaseAdmin);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Unauthorized Access & Token Validation (HTTP 401)', () => {
    it('rejects GET requests without authorization credentials with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('rejects POST requests without authorization credentials with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mitra Test', phone: '08123456789' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('rejects requests with SUPABASE_SERVICE_ROLE_KEY used as a human bearer token with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer test-service-role-secret-key-999',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('SUPABASE_SERVICE_ROLE_KEY dilarang');
      expect(mockSupabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    });

    it('rejects requests with a fake / invalid token with 401', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT signature' },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer fake_invalid_jwt_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockSupabaseAdmin.auth.getUser).toHaveBeenCalledWith('fake_invalid_jwt_token');
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('rejects requests with an expired token with 401', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer expired_jwt_token_123',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('rejects fake token even when client sends spoofed x-user-role: SUPERADMIN header (401)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer fake_token',
          'x-user-role': 'SUPERADMIN',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });
  });

  describe('2. Forbidden Role Access & Spoofing Immunity (HTTP 403)', () => {
    it('rejects request with valid session but unauthorized role (AFFILIATE) even with spoofed x-user-role header (403)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-affiliate-123',
            email: 'mitra@example.com',
            app_metadata: { role: 'AFFILIATE' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_session_affiliate_token',
          'x-user-role': 'SUPERADMIN', // Spoofed client header MUST be ignored!
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');
      expect(mockSupabaseAdmin.order).not.toHaveBeenCalled();
    });

    it('rejects POST requests from CUSTOMER role with 403', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-customer-456',
            email: 'customer@example.com',
            app_metadata: { role: 'CUSTOMER' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer valid_session_customer_token',
        },
        body: JSON.stringify({ name: 'Mitra Test', phone: '08123456789' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockSupabaseAdmin.insert).not.toHaveBeenCalled();
    });

    it('rejects role values that attempt substring bypass like not_an_admin or submanager (403)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-sub-789',
            email: 'sub@example.com',
            app_metadata: { role: 'submanager' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_session_submanager',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('rejects privilege escalation attempts via user_metadata.role with 403 (Blocker 1)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-escalate-001',
            email: 'attacker@example.com',
            user_metadata: { role: 'SUPERADMIN' }, // Client-controlled metadata
            app_metadata: {}, // Empty secure app_metadata
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_attacker_session_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');
      expect(mockSupabaseAdmin.order).not.toHaveBeenCalled();
    });

    it('rejects ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET from claiming universal SUPERADMIN role on manager routes (Blocker 5)', async () => {
      process.env.ADMIN_INTERNAL_SECRET = 'test-admin-internal-secret-999';

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer test-admin-internal-secret-999',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('ADMIN_INTERNAL_SECRET');
      expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    });
  });

  describe('3. Authorized Manager Access (HTTP 200)', () => {
    it('allows GET requests from SUPERADMIN (via app_metadata) and fetches partners from database', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-superadmin-001',
            email: 'admin@boontrack.com',
            app_metadata: { role: 'SUPERADMIN' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_superadmin_session_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.partners).toBeDefined();
      expect(Array.isArray(json.partners)).toBe(true);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('affiliates');
    });

    it('allows GET requests from AFFILIATE_MANAGER role (via app_metadata)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-am-002',
            email: 'am@boontrack.com',
            app_metadata: { role: 'AFFILIATE_MANAGER' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_am_session_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('affiliates');
    });

    it('allows GET requests when role is resolved from database affiliates table', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-db-am-003',
            email: 'db_am@boontrack.com',
            app_metadata: {},
          },
        },
        error: null,
      });

      // Role check query returns AM
      mockSupabaseAdmin.maybeSingle.mockResolvedValueOnce({
        data: { id: 'user-db-am-003', role: 'AM', status: 'ACTIVE' },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        headers: {
          authorization: 'Bearer valid_db_resolved_token',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('allows POST requests from SUPERADMIN to register partner and auto-provisions tenant via atomic RPC without raw passwords', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-superadmin-001',
            email: 'admin@boontrack.com',
            app_metadata: { role: 'SUPERADMIN' },
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer superadmin_auth_token',
        },
        body: JSON.stringify({
          name: 'Partner Baru Sukses',
          phone: '081299887766',
          email: 'partnerbaru@example.com',
          role: 'AFFILIATE',
          ref_code: 'PARTNERSUKSES',
          password: 'SecretPassword123!',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant_slug).toBe('partnersukses');

      // 1. Verifikasi auto-provisioning dan registrasi mitra dieksekusi via atomic RPC register_merchant_transactional
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
        'register_merchant_transactional',
        expect.objectContaining({
          p_slug: 'partnersukses',
          p_name: 'Partner Baru Sukses',
          p_ref_code: 'PARTNERSUKSES',
          p_password: expect.any(String),
          p_partner_data: expect.objectContaining({
            referral_code: 'PARTNERSUKSES',
            role: 'AFFILIATE',
          }),
        })
      );

      // 2. Verifikasi password yang dikirim ke RPC adalah hash bcrypt (bukan plaintext 'SecretPassword123!' atau raw SHA-256)
      const rpcArgs = mockSupabaseAdmin.rpc.mock.calls[0][1];
      expect(rpcArgs.p_password).not.toBe('SecretPassword123!');
      expect(rpcArgs.p_password).toHaveLength(60); // bcrypt hash length
      expect(rpcArgs.p_password).toMatch(/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    });

    it('returns HTTP 500 fail-closed when atomic RPC fails without leaving orphan data (Blocker 4)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-superadmin-001',
            email: 'admin@boontrack.com',
            app_metadata: { role: 'SUPERADMIN' },
          },
        },
        error: null,
      });

      // Simulate atomic RPC failure
      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database transaction lock timeout in stored procedure' },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer superadmin_auth_token',
        },
        body: JSON.stringify({
          name: 'Partner Gagal RPC',
          phone: '081299887766',
          email: 'gagal@example.com',
          role: 'AFFILIATE',
          ref_code: 'GAGALRPC',
          password: 'SecretPassword123!',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('Database transaction lock timeout');
      expect(json.partner).toBeUndefined();
    });

    it('returns HTTP 409 Conflict when atomic RPC reports duplicate slug (Blocker 4)', async () => {
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-superadmin-001',
            email: 'admin@boontrack.com',
            app_metadata: { role: 'SUPERADMIN' },
          },
        },
        error: null,
      });

      // Simulate duplicate slug error from atomic RPC
      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Slug toko toko-duplikat sudah terdaftar.' },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/manager/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer superadmin_auth_token',
        },
        body: JSON.stringify({
          name: 'Partner Duplikat',
          phone: '081299887766',
          email: 'duplikat@example.com',
          role: 'AFFILIATE',
          ref_code: 'DUPLIKAT',
          password: 'SecretPassword123!',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('sudah terdaftar');
    });
  });
});
