/**
 * Unit & Integration Test Suite: Server-Authoritative Owner & CS Login Fail-Closed Endpoints
 *
 * Verifies P0 Security Invariants:
 * 1. Rejects 401 Unauthorized if PIN / access key is empty or missing.
 * 2. Rejects 403 Forbidden (Fail-Closed) if tenant exists in database but has no configured PIN/password.
 * 3. Rejects 401 Unauthorized if provided PIN is incorrect.
 * 4. Successfully returns 200 OK and mints valid HMAC-SHA256 bt_merchant_token only when PIN matches.
 * 5. Verifies equivalent fail-closed behavior on cs-login endpoint.
 */

import { NextRequest } from 'next/server';
import { POST as ownerLogin } from '@/app/api/v1/auth/owner-login/route';
import { POST as csLogin } from '@/app/api/v1/auth/cs-login/route';
import { clearAllRateLimits } from '@/lib/auth/rate-limiter';
import { verifyMerchantSessionToken } from '@/lib/auth/merchant-session';

// Mock in-memory tenants database
let mockTenants: any[] = [];
let mockTenantUsers: any[] = [];

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: () => mockSupabaseClient,
    getSupabase: () => mockSupabaseClient,
  };
});

const mockSupabaseClient = {
  from: (table: string) => {
    if (table === 'tenants') {
      return {
        select: (_cols?: string) => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              const row = mockTenants.find((t) => t[col] === val);
              return { data: row || null, error: null };
            },
          }),
        }),
      };
    }

    if (table === 'tenant_users') {
      return {
        select: (_cols?: string) => ({
          or: (_cond: string) => ({
            eq: (_col: string, _val: any) => {
              return { data: mockTenantUsers, error: null };
            },
          }),
        }),
      };
    }

    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    };
  },
};

function createPostRequest(url: string, body: any): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': `192.168.1.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

describe('P0 Fail-Closed Authentication: Owner Login Endpoint', () => {
  beforeEach(() => {
    clearAllRateLimits();
    mockTenants = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'secure-store',
        name: 'Secure Store Official',
        tier: 'PRO_SCALE',
        metadata: {
          access_pin: '889900',
        },
        access_password: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        slug: 'unconfigured-store',
        name: 'Unconfigured Store Without PIN',
        tier: 'STARTER',
        metadata: {},
        access_password: null,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        slug: 'legacy-pass-store',
        name: 'Store With Access Password',
        tier: 'ENTERPRISE',
        metadata: {},
        access_password: 'pass-legacy-2026',
      },
    ];
    mockTenantUsers = [];
  });

  it('rejects 400 Bad Request if tenantSlug is missing', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      pin: '889900',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Slug / nama domain toko wajib diisi');
  });

  it('rejects 401 Unauthorized if PIN / access key is empty string', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'secure-store',
      accessKey: '',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toContain('PIN / Password akses toko wajib diisi');
  });

  it('rejects 401 Unauthorized if PIN / access key is omitted from payload', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'secure-store',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toContain('PIN / Password akses toko wajib diisi');
  });

  it('rejects 404 Not Found if tenant does not exist in database', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'nonexistent-shop',
      pin: '123456',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toContain('belum terdaftar');
  });

  it('rejects 403 Forbidden (Fail-Closed) if tenant exists but has NO configured PIN or password', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'unconfigured-store',
      pin: 'any-guess-pin',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toContain('belum mengonfigurasi PIN akses atau akun belum diaktifkan');
  });

  it('rejects 401 Unauthorized if provided PIN does not match configured PIN', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'secure-store',
      pin: 'wrong-pin-999',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toContain('PIN / Password akses yang Anda masukkan salah');
  });

  it('permits 200 OK and mints valid OWNER session token when PIN is correct', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'secure-store',
      accessKey: '889900',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe('/secure-store/dashboard');
    expect(body.tenant.slug).toBe('secure-store');

    // Verify minted cookie
    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain('bt_merchant_token=');
    expect(cookieHeader).toContain('merchant_store=secure-store');

    // Extract and verify session token validity
    const match = cookieHeader?.match(/bt_merchant_token=([^;]+)/);
    expect(match).not.toBeNull();
    const token = match![1];

    const verify = verifyMerchantSessionToken(token, 'secure-store');
    expect(verify.valid).toBe(true);
    expect(verify.payload?.role).toBe('OWNER');
    expect(verify.payload?.tenantSlug).toBe('secure-store');
  });

  it('permits 200 OK when authenticating against access_password column', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/owner-login', {
      tenantSlug: 'legacy-pass-store',
      pin: 'pass-legacy-2026',
    });
    const res = await ownerLogin(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenant.slug).toBe('legacy-pass-store');
  });
});

describe('P0 Fail-Closed Authentication: CS Login Endpoint', () => {
  beforeEach(() => {
    clearAllRateLimits();
    mockTenants = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'secure-store',
        name: 'Secure Store Official',
        tier: 'PRO_SCALE',
        metadata: {
          access_pin: '889900',
        },
        access_password: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        slug: 'unconfigured-store',
        name: 'Unconfigured Store Without PIN',
        tier: 'STARTER',
        metadata: {},
        access_password: null,
      },
    ];
    mockTenantUsers = [];
  });

  it('rejects 401 Unauthorized if CS PIN is omitted', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/cs-login', {
      tenantSlug: 'secure-store',
      phone: '081234567890',
    });
    const res = await csLogin(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toContain('PIN Tenant wajib diisi');
  });

  it('rejects 403 Forbidden (Fail-Closed) if CS tries to log into unconfigured tenant', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/cs-login', {
      tenantSlug: 'unconfigured-store',
      phone: '081234567890',
      pin: 'any-pin',
    });
    const res = await csLogin(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toContain('belum mengonfigurasi PIN akses');
  });

  it('rejects 401 Unauthorized if CS provides wrong PIN', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/cs-login', {
      tenantSlug: 'secure-store',
      phone: '081234567890',
      pin: 'wrong-pin',
    });
    const res = await csLogin(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toContain('PIN Tenant salah');
  });

  it('permits 200 OK and mints valid CS session token when PIN is correct', async () => {
    const req = createPostRequest('http://dashboard.boontrack.com/api/v1/auth/cs-login', {
      tenantSlug: 'secure-store',
      phone: '081234567890',
      pin: '889900',
    });
    const res = await csLogin(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.cs.phone).toContain('6281234567890');

    // Verify minted cookie
    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toContain('bt_merchant_token=');

    const match = cookieHeader?.match(/bt_merchant_token=([^;]+)/);
    expect(match).not.toBeNull();
    const token = match![1];

    const verify = verifyMerchantSessionToken(token, 'secure-store');
    expect(verify.valid).toBe(true);
    expect(verify.payload?.role).toBe('CS');
    expect(verify.payload?.tenantSlug).toBe('secure-store');
  });
});
