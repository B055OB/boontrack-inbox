/**
 * __tests__/workforce/e6-auth-regression.test.ts
 * BWM Gate E6: End-to-End Auth Flow & Tenant Resolution Regression Suite
 *
 * Verifies:
 * 1. 3 Independent Demo Accounts (Field Personnel, Supervisor, Master Reseller).
 * 2. Hardened HttpOnly cookies (bwm_session_token, bwm_csrf_token).
 * 3. Dynamic multi-tenant resolution from database SSOT (zero hardcoding).
 * 4. Zero-trust canonical UUID membership verification (fail-closed on non-membership).
 * 5. Session query via /api/auth/me.
 * 6. Session refresh via /api/auth/refresh.
 * 7. Standalone callback via /api/auth/callback without dashboard redirect.
 * 8. Logout cookie invalidation via /api/auth/logout.
 * 9. Zero cross-domain redirect leakage to dashboard.boontrack.com.
 */

import { NextRequest } from 'next/server';

// ─── Test Fixture & Mock Database SSOT ──────────────────────────────────────
const FIELD_OFFICER_ID = '11111111-1111-4111-8111-111111111111';
const SUPERVISOR_ID = '22222222-2222-4222-8222-222222222222';
const RESELLER_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_USER_ID = '99999999-9999-4999-8999-999999999999';

const TENANT_SATYA_ID = 'tenant_satya_001';
const TENANT_GARDA_ID = 'tenant_garda_002';

const mockTenantsDb: Record<string, any> = {
  satya: {
    id: TENANT_SATYA_ID,
    slug: 'satya',
    name: 'PT Satya Mandiri Perkasa',
    tier: 'ENTERPRISE',
    metadata: {
      access_pin: '123456',
    },
  },
  [TENANT_SATYA_ID]: {
    id: TENANT_SATYA_ID,
    slug: 'satya',
    name: 'PT Satya Mandiri Perkasa',
    tier: 'ENTERPRISE',
    metadata: {
      access_pin: '123456',
    },
  },
  'garda-nusantara': {
    id: TENANT_GARDA_ID,
    slug: 'garda-nusantara',
    name: 'PT Garda Nusantara',
    tier: 'ENTERPRISE',
    metadata: {
      access_pin: '901105',
    },
  },
  [TENANT_GARDA_ID]: {
    id: TENANT_GARDA_ID,
    slug: 'garda-nusantara',
    name: 'PT Garda Nusantara',
    tier: 'ENTERPRISE',
    metadata: {
      access_pin: '901105',
    },
  },
};

const mockMembershipsDb: any[] = [
  {
    id: 'mem_satya_cindy',
    user_id: FIELD_OFFICER_ID,
    tenant_id: TENANT_SATYA_ID,
    tenant_slug: 'satya',
    role: 'field_personnel',
    is_active: true,
  },
  {
    id: 'mem_satya_bambang',
    user_id: SUPERVISOR_ID,
    tenant_id: TENANT_SATYA_ID,
    tenant_slug: 'satya',
    role: 'supervisor',
    is_active: true,
  },
  {
    id: 'mem_satya_hendra',
    user_id: RESELLER_ID,
    tenant_id: TENANT_SATYA_ID,
    tenant_slug: 'satya',
    role: 'master_reseller',
    is_active: true,
  },
  {
    id: 'mem_garda_bambang',
    user_id: SUPERVISOR_ID,
    tenant_id: TENANT_GARDA_ID,
    tenant_slug: 'garda-nusantara',
    role: 'supervisor',
    is_active: true,
  },
];

function createWorkforceMockSupabase() {
  return {
    schema: (_schemaName: string) => ({
      from: (tableName: string) => {
        let filters: Record<string, any> = {};
        let orClause = '';
        let isCountQuery = false;

        const builder: any = {
          select: (_cols?: string, options?: any) => {
            if (options?.count === 'exact') {
              isCountQuery = true;
            }
            return builder;
          },
          eq: (col: string, val: any) => {
            filters[col] = val;
            return builder;
          },
          or: (clause: string) => {
            orClause = clause;
            return builder;
          },
          maybeSingle: async () => {
            if (tableName === 'tenants') {
              const slugOrId = filters['slug'] || filters['id'] || (orClause.includes('satya') ? 'satya' : orClause.includes('garda') ? 'garda-nusantara' : null);
              const tenant = slugOrId ? mockTenantsDb[slugOrId] || null : null;
              return { data: tenant, error: null };
            }
            if (tableName === 'tenant_memberships') {
              const userId = filters['user_id'];
              const tenantId = filters['tenant_id'];
              const matched = mockMembershipsDb.find((m) => (!userId || m.user_id === userId) && (!tenantId || m.tenant_id === tenantId));
              return { data: matched || null, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (tableName === 'tenant_memberships') {
              if (isCountQuery) {
                return resolve({ count: mockMembershipsDb.length, error: null });
              }
              const userId = filters['user_id'];
              const matched = mockMembershipsDb.filter((m) => !userId || m.user_id === userId);
              return resolve({ data: matched, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };

        return builder;
      },
    }),
  };
}

const workforceMockClient = createWorkforceMockSupabase();

jest.mock('@/workforce-web/lib/supabase', () => ({
  getSupabaseAdmin: () => workforceMockClient,
  getSupabase: () => workforceMockClient,
  supabase: workforceMockClient,
  assertExactWorkforceUrl: (url: string) => url,
  WORKFORCE_ALLOWED_HOST: 'tjkbgxrckaocgosvmzmj.supabase.co',
}));

import { POST as loginHandler } from '../../workforce-web/app/api/auth/login/route';
import { GET as meHandler } from '../../workforce-web/app/api/auth/me/route';
import { POST as refreshHandler } from '../../workforce-web/app/api/auth/refresh/route';
import { POST as logoutHandler } from '../../workforce-web/app/api/auth/logout/route';
import { GET as callbackHandler } from '../../workforce-web/app/api/auth/callback/route';
import { middleware } from '../../workforce-web/middleware';

describe('BWM Gate E6: Auth Flow & Tenant Resolution Regression Suite', () => {
  const TENANT_SLUG = 'satya';

  // ─── 1. Three Independent Demo Accounts ──────────────────────────────────
  describe('1. Three Independent Demo Accounts Resolution', () => {
    it('authenticates Demo Personel (Field Personnel) with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: FIELD_OFFICER_ID,
          pin: '123456',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('field_personnel');
      expect(data.session.userId).toBe(FIELD_OFFICER_ID);
      expect(data.session.tenant_slug).toBe(TENANT_SLUG);
      expect(data.session.agency_name).toBe('PT Satya Mandiri Perkasa');

      // Verify cookies
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('bwm_session_token=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader?.toLowerCase()).toContain('samesite=lax');
      expect(cookieHeader).toContain('bwm_csrf_token=');
    });

    it('authenticates Demo Supervisor with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: SUPERVISOR_ID,
          pin: '123456',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('supervisor');
      expect(data.session.userId).toBe(SUPERVISOR_ID);
      expect(data.session.agency_name).toBe('PT Satya Mandiri Perkasa');
    });

    it('authenticates Demo Master Reseller with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: RESELLER_ID,
          pin: '123456',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('master_reseller');
      expect(data.session.userId).toBe(RESELLER_ID);
      expect(data.session.agency_name).toBe('PT Satya Mandiri Perkasa');
    });

    it('rejects invalid credentials fail-closed (status 400)', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: '',
          nik: '12',
          pin: '1',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('rejects non-canonical UUID user identifier fail-closed (status 403 MEMBERSHIP_REQUIRED)', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: 'unregistered-non-uuid-user',
          pin: '123456',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('MEMBERSHIP_REQUIRED');
    });

    it('rejects wrong PIN fail-closed (status 401 INVALID_CREDENTIALS)', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: FIELD_OFFICER_ID,
          pin: '999999',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_CREDENTIALS');
    });
  });

  // ─── 2. Multi-Tenant Resolution & Session Inspection (/api/auth/me) ──────
  describe('2. Multi-Tenant Isolation & Session Resolution', () => {
    it('resolves tenant session correctly from session cookie', async () => {
      // First log in as supervisor on garda-nusantara
      const loginReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: 'garda-nusantara',
          nik: SUPERVISOR_ID,
          pin: '901105',
        }),
      });

      const loginRes = await loginHandler(loginReq);
      expect(loginRes.status).toBe(200);
      const sessionCookie = loginRes.cookies.get('bwm_session_token')?.value;
      expect(sessionCookie).toBeDefined();

      // Query /api/auth/me with session cookie
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${sessionCookie}`,
        },
      });

      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);

      const meData = await meRes.json();
      expect(meData.authenticated).toBe(true);
      expect(meData.session.agency_slug).toBe('garda-nusantara');
      expect(meData.session.role).toBe('supervisor');
    });

    it('returns unauthenticated when cookie is missing', async () => {
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me');
      const meRes = await meHandler(meReq);
      const meData = await meRes.json();
      expect(meData.authenticated).toBe(false);
      expect(meData.session).toBeNull();
    });
  });

  // ─── 3. Session Refresh Flow (/api/auth/refresh) ──────────────────────────
  describe('3. Session Refresh Flow', () => {
    it('refreshes active session and issues updated cookie', async () => {
      // Log in
      const loginReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: RESELLER_ID,
          pin: '123456',
        }),
      });
      const loginRes = await loginHandler(loginReq);
      expect(loginRes.status).toBe(200);
      const initialCookie = loginRes.cookies.get('bwm_session_token')?.value;
      expect(initialCookie).toBeDefined();

      // Refresh
      const refreshReq = new NextRequest('https://workforce.boontrack.com/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `bwm_session_token=${initialCookie}`,
        },
      });

      const refreshRes = await refreshHandler(refreshReq);
      expect(refreshRes.status).toBe(200);

      const refreshData = await refreshRes.json();
      expect(refreshData.success).toBe(true);
      expect(refreshData.session.agency_slug).toBe(TENANT_SLUG);
      expect(refreshData.session.role).toBe('master_reseller');

      const newCookie = refreshRes.cookies.get('bwm_session_token')?.value;
      expect(newCookie).toBeDefined();
    });
  });

  // ─── 4. Logout Invalidation (/api/auth/logout) ─────────────────────────────
  describe('4. Logout Invalidation', () => {
    it('invalidates session cookies cleanly', async () => {
      const logoutReq = new NextRequest('https://workforce.boontrack.com/api/auth/logout', {
        method: 'POST',
      });

      const logoutRes = await logoutHandler(logoutReq);
      expect(logoutRes.status).toBe(200);

      const cookieHeader = logoutRes.headers.get('set-cookie');
      expect(cookieHeader).toContain('bwm_session_token=;');
      expect(cookieHeader).toContain('Max-Age=0');
    });
  });

  // ─── 5. Standalone Callback Resolution (/api/auth/callback) ────────────────
  describe('5. Standalone Callback Resolution', () => {
    it('redirects auth callback locally without external redirect', async () => {
      const callbackReq = new NextRequest('https://workforce.boontrack.com/api/auth/callback?code=mock_oauth_code_123');
      const callbackRes = await callbackHandler(callbackReq);

      expect(callbackRes.status).toBe(307);
      const location = callbackRes.headers.get('location');
      expect(location).toBe('https://workforce.boontrack.com/');
      expect(location).not.toContain('dashboard.boontrack.com');
    });
  });

  // ─── 6. Zero Cross-Domain Redirect Leakage ─────────────────────────────────
  describe('6. Zero Redirect Leakage Guarantee', () => {
    it('middleware never redirects workforce routes to dashboard.boontrack.com', () => {
      const pathsToTest = ['/login', '/', '/dashboard', '/api/auth/me', '/workforce.webmanifest'];

      for (const path of pathsToTest) {
        const req = new NextRequest(`https://workforce.boontrack.com${path}`);
        const res = middleware(req);

        const location = res.headers.get('location');
        if (location) {
          expect(location).not.toContain('dashboard.boontrack.com');
          expect(location).toMatch(/^https:\/\/workforce\.boontrack\.com/);
        }
      }
    });
  });
});
