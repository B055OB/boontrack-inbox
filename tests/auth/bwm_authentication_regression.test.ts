/**
 * BWM Phase 6.1B — Zero-Trust Authentication Closure & Session Revocation Test Suite
 *
 * Verifies CTO Work Order Phase 6.1B Invariants:
 * 1. Zero-membership tenant strictly fails closed (HTTP 403 NO_ENROLLED_MEMBERSHIP).
 * 2. Missing membership strictly fails closed (HTTP 403 MEMBERSHIP_REQUIRED).
 * 3. Revoked membership strictly fails closed (HTTP 403 MEMBERSHIP_REVOKED).
 * 4. Cross-tenant membership strictly fails closed (HTTP 403 CROSS_TENANT_MEMBERSHIP_FORBIDDEN).
 * 5. Invalid PIN / credential fails closed (HTTP 401 INVALID_CREDENTIALS).
 * 6. Correctly formatted but unauthenticated PIN fails closed (HTTP 401 INVALID_CREDENTIALS).
 * 7. Deterministic UUID cannot independently establish authorization (HTTP 403).
 * 8. Live session rejection after membership revocation (HTTP 403 MEMBERSHIP_REVOKED).
 * 9. Live session rejection after user deactivation (HTTP 403 MEMBERSHIP_NOT_FOUND).
 * 10. Live session rejection after tenant suspension (HTTP 403 TENANT_SUSPENDED).
 * 11. Session replay after logout strictly fails closed (HTTP 401 SESSION_REVOKED_LOGGED_OUT).
 * 12. Valid enrolled member with valid credentials succeeds with 200 OK and authoritative role.
 * 13. Resolves alphanumeric slugs without PostgreSQL 22P02 errors.
 * 14. Rejects injection and malformed inputs with 400.
 */

import { NextRequest } from 'next/server';
import { POST as loginRoute } from '../../workforce-web/app/api/auth/login/route';
import { GET as meRoute } from '../../workforce-web/app/api/auth/me/route';
import { POST as logoutRoute } from '../../workforce-web/app/api/auth/logout/route';
import {
  signBwmSessionToken,
  verifyBwmSessionToken,
  enforceTenantScope,
  clearRevocationRegistry,
} from '../../workforce-web/lib/auth/session';
import { clearAllRateLimits } from '../../workforce-web/lib/auth/rate-limiter';

// In-Memory Test State
interface MockTenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  metadata?: any;
}

interface MockMembership {
  id: string;
  user_id: string;
  tenant_id: string;
  tenant_slug: string;
  role: string;
  is_active: boolean;
}

let mockTenants: MockTenant[] = [];
let mockMemberships: MockMembership[] = [];

// Mock getSupabaseAdmin from workforce-web/lib/supabase
jest.mock('../../workforce-web/lib/supabase', () => {
  return {
    getSupabaseAdmin: () => ({
      schema: (_schemaName: string) => ({
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: (_cols: string) => ({
                eq: (col: string, val: any) => ({
                  maybeSingle: async () => {
                    const row = mockTenants.find((t) => (t as any)[col] === val);
                    return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
                  },
                }),
                or: (conditionStr: string) => ({
                  maybeSingle: async () => {
                    const match = conditionStr.match(/slug\.eq\.(.+),id\.eq\.(.+)/);
                    if (match) {
                      const idVal = match[2];
                      const CANONICAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                      if (!CANONICAL_UUID_REGEX.test(idVal)) {
                        return {
                          data: null,
                          error: {
                            code: '22P02',
                            message: `invalid input syntax for type uuid: "${idVal}"`,
                          },
                        };
                      }
                      const row = mockTenants.find((t) => t.slug === match[1] || t.id === match[2]);
                      return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
                    }
                    return { data: null, error: null };
                  },
                }),
              }),
            };
          }

          if (table === 'tenant_memberships') {
            return {
              select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
                or: (conditionStr: string) => {
                  const match = conditionStr.match(/tenant_id\.eq\.([^,]+),tenant_slug\.eq\.(.+)/);
                  let matchedRows = mockMemberships;
                  if (match) {
                    const tId = match[1];
                    const tSlug = match[2];
                    matchedRows = mockMemberships.filter(
                      (m) => m.tenant_id === tId || m.tenant_slug === tSlug
                    );
                  }
                  if (opts?.count === 'exact') {
                    return Promise.resolve({ count: matchedRows.length, error: null });
                  }
                  const p: any = Promise.resolve({ data: matchedRows, error: null });
                  p.maybeSingle = async () => ({ data: matchedRows[0] || null, error: null });
                  return p;
                },
                eq: (col1: string, val1: any) => {
                  let filtered = mockMemberships.filter((m) => (m as any)[col1] === val1);
                  const p: any = Promise.resolve({ data: filtered, error: null });
                  p.maybeSingle = async () => ({ data: filtered[0] || null, error: null });
                  p.eq = (col2: string, val2: any) => {
                    const doublyFiltered = filtered.filter((m) => (m as any)[col2] === val2);
                    const p2: any = Promise.resolve({ data: doublyFiltered, error: null });
                    p2.maybeSingle = async () => ({ data: doublyFiltered[0] || null, error: null });
                    return p2;
                  };
                  return p;
                },
              }),
            };
          }

          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      }),
    }),
  };
});

function createLoginRequest(body: any, origin: string = 'https://workforce.boontrack.com'): NextRequest {
  return new NextRequest('https://workforce.boontrack.com/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': origin,
      'host': 'workforce.boontrack.com',
    },
    body: JSON.stringify(body),
  });
}

describe('CTO WORK ORDER — BWM PHASE 6.1B ZERO-TRUST AUTHENTICATION CLOSURE', () => {
  const alphaTenantId = 'ba2b1751-622d-4f8b-b5a6-bf51a801cae8';
  const betaTenantId = 'e4f1a2b3-c4d5-4e6f-a7b8-c9d0e1f2a3b4';
  const enrolledTenantId = '77777777-7777-4777-8777-777777777777';
  const userUuid = '11111111-2222-4333-8444-555555555555';
  const validPin = '9876';

  beforeEach(() => {
    clearRevocationRegistry();
    clearAllRateLimits();
    mockTenants = [
      {
        id: alphaTenantId,
        name: 'Alpha Security Corp',
        slug: 'tenant-api-alpha-1794053601886',
        tier: 'PRO_SCALE',
        metadata: { access_pin: validPin },
      },
      {
        id: betaTenantId,
        name: 'Beta Protective Services',
        slug: 'beta-protective-services',
        tier: 'ENTERPRISE',
        metadata: { access_pin: validPin },
      },
      {
        id: enrolledTenantId,
        name: 'Enrolled Members Agency',
        slug: 'enrolled-members-agency',
        tier: 'ENTERPRISE',
        metadata: { access_pin: validPin },
      },
    ];
    mockMemberships = [];
  });

  // ==========================================================================
  // SECTION 1: UUID CAST ERROR & INPUT SANITIZATION
  // ==========================================================================
  describe('Section 1 — UUID Cast Error & Input Sanitization', () => {
    test('1.1: Resolves alphanumeric slug without PostgreSQL 22P02 error (HTTP 200 for enrolled member)', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.session.agency_slug).toBe('tenant-api-alpha-1794053601886');
      expect(json.session.tenant_id).toBe(alphaTenantId);
    });

    test('1.2: Resolves canonical UUID tenant identifier without error (HTTP 200 for enrolled member)', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: alphaTenantId,
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.session.tenant_id).toBe(alphaTenantId);
    });

    test('1.3: Rejects unknown slug with HTTP 404 (TENANT_NOT_FOUND, not 500)', async () => {
      const req = createLoginRequest({
        slug: 'nonexistent-agency-slug',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    test('1.4: Rejects unknown canonical UUID with HTTP 404 (TENANT_NOT_FOUND, not 500)', async () => {
      const req = createLoginRequest({
        slug: '00000000-0000-0000-0000-000000000000',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    test('1.5: Rejects malformed UUID-like string cleanly with HTTP 404 (never 500)', async () => {
      const req = createLoginRequest({
        slug: '12345678-1234-1234-1234-invaliduuid',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    test('1.6: Rejects empty or missing inputs with HTTP 400', async () => {
      const emptySlugRes = await loginRoute(createLoginRequest({ slug: '', nik: userUuid, pin: validPin }));
      expect(emptySlugRes.status).toBe(400);
      expect((await emptySlugRes.json()).error).toBe('INVALID_SLUG');

      const emptyNikRes = await loginRoute(createLoginRequest({ slug: 'alpha', nik: '', pin: validPin }));
      expect(emptyNikRes.status).toBe(400);
      expect((await emptyNikRes.json()).error).toBe('INVALID_NIK');

      const emptyPinRes = await loginRoute(createLoginRequest({ slug: 'alpha', nik: userUuid, pin: '' }));
      expect(emptyPinRes.status).toBe(400);
      expect((await emptyPinRes.json()).error).toBe('INVALID_PIN');
    });

    test('1.7: Rejects PostgREST/SQL injection attempts with HTTP 400 (never 500)', async () => {
      const injectionAttempts = [
        "slug.eq.alpha,id.eq.beta",
        "' OR '1'='1",
        "alpha; DROP TABLE tenants; --",
        "alpha<script>alert(1)</script>",
        "slug with spaces",
      ];

      for (const injection of injectionAttempts) {
        const req = createLoginRequest({
          slug: injection,
          nik: userUuid,
          pin: validPin,
        });
        const res = await loginRoute(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error).toBe('INVALID_SLUG');
      }
    });
  });

  // ==========================================================================
  // SECTION 2: ZERO-TRUST MEMBERSHIP & CREDENTIAL AUTHORIZATION
  // ==========================================================================
  describe('Section 2 — Zero-Trust Membership & Credential Authorization', () => {
    test('2.1: Zero-membership tenant strictly fails closed with HTTP 403 (NO_ENROLLED_MEMBERSHIP)', async () => {
      mockMemberships = []; // Zero memberships in DB

      const req = createLoginRequest({
        slug: 'enrolled-members-agency',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('NO_ENROLLED_MEMBERSHIP');
    });

    test('2.2: Enrolled tenant with missing user membership strictly fails closed with HTTP 403 (MEMBERSHIP_REQUIRED)', async () => {
      mockMemberships = [
        {
          id: 'mem-other',
          user_id: '99999999-9999-4999-8999-999999999999',
          tenant_id: enrolledTenantId,
          tenant_slug: 'enrolled-members-agency',
          role: 'OWNER',
          is_active: true,
        },
      ];

      // Request with unregistered userUuid
      const req = createLoginRequest({
        slug: 'enrolled-members-agency',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('MEMBERSHIP_REQUIRED');
    });

    test('2.3: Rejects revoked / inactive membership with HTTP 403 (MEMBERSHIP_REVOKED)', async () => {
      mockMemberships = [
        {
          id: 'mem-revoked',
          user_id: userUuid,
          tenant_id: enrolledTenantId,
          tenant_slug: 'enrolled-members-agency',
          role: 'MERCHANT',
          is_active: false, // Revoked!
        },
      ];

      const req = createLoginRequest({
        slug: 'enrolled-members-agency',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('MEMBERSHIP_REVOKED');
    });

    test('2.4: Rejects cross-tenant membership access with HTTP 403 (CROSS_TENANT_MEMBERSHIP_FORBIDDEN)', async () => {
      // User is enrolled in Beta Protective Services, but tries to log in to Alpha Security Corp
      mockMemberships = [
        {
          id: 'mem-beta',
          user_id: userUuid,
          tenant_id: betaTenantId,
          tenant_slug: 'beta-protective-services',
          role: 'OWNER',
          is_active: true,
        },
        {
          id: 'mem-alpha-other',
          user_id: '88888888-8888-4888-8888-888888888888',
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('CROSS_TENANT_MEMBERSHIP_FORBIDDEN');
    });

    test('2.5: Invalid PIN fails closed with HTTP 401 (INVALID_CREDENTIALS)', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: 'wrong_pin_9999',
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe('INVALID_CREDENTIALS');
    });

    test('2.6: Correctly formatted but unauthenticated PIN fails closed with HTTP 401 (INVALID_CREDENTIALS)', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      // Formatted PIN (4 digits) that does not match validPin ('9876')
      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: '1234',
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe('INVALID_CREDENTIALS');
    });

    test('2.7: Deterministic / non-UUID string cannot establish authorization (HTTP 403 MEMBERSHIP_REQUIRED)', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      // Badge ID string that is not an enrolled UUID
      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: 'SEC-OFFICER-01',
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('MEMBERSHIP_REQUIRED');
    });

    test('2.8: Tenant without configured credentials fails closed with HTTP 403 (CREDENTIAL_NOT_CONFIGURED)', async () => {
      // Clear metadata PIN on tenant
      const unconfiguredTenant = mockTenants.find((t) => t.id === alphaTenantId);
      if (unconfiguredTenant) {
        unconfiguredTenant.metadata = {};
      }

      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREDENTIAL_NOT_CONFIGURED');
    });

    test('2.9: Valid enrolled member with valid credentials succeeds (HTTP 200) and adopts authoritative role', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const req = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: validPin,
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.session.userId).toBe(userUuid);
      expect(json.session.role).toBe('master_reseller'); // Authoritative DB mapping
    });

    test('2.10: Rejects prototype property names and unissued role tokens fail-closed (HTTP 403)', async () => {
      for (const badRole of ['constructor', 'toString', '__proto__', 'valueOf', 'super']) {
        mockMemberships = [
          {
            id: 'mem-alpha',
            user_id: userUuid,
            tenant_id: alphaTenantId,
            tenant_slug: 'tenant-api-alpha-1794053601886',
            role: badRole,
            is_active: true,
          },
        ];

        const req = createLoginRequest({
          slug: 'tenant-api-alpha-1794053601886',
          nik: userUuid,
          pin: validPin,
        });

        const res = await loginRoute(req);
        const json = await res.json();

        expect(res.status).toBe(403);
        expect(json.success).toBe(false);
        expect(json.error).toBe('UNRECOGNIZED_MEMBERSHIP_ROLE');
      }
    });
  });

  // ==========================================================================
  // SECTION 3: SESSION REVOCATION, LIFECYCLE & /api/auth/me
  // ==========================================================================
  describe('Section 3 — Session Revocation, Lifecycle & /api/auth/me', () => {
    beforeEach(() => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];
    });

    test('3.1: Valid session token passes live authority check on /api/auth/me', async () => {
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller',
        nik: userUuid,
        name: 'Officer User',
        agencyName: 'Alpha Security Corp',
        agencySlug: 'tenant-api-alpha-1794053601886',
      });

      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(true);
      expect(json.session.userId).toBe(userUuid);
    });

    test('3.2: Rejects request with missing session cookie (HTTP 401 NO_SESSION_COOKIE)', async () => {
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me');
      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('NO_SESSION_COOKIE');
    });

    test('3.3: Rejects tampered session token on /api/auth/me (HTTP 401 INVALID_SIGNATURE_TAMPERED)', async () => {
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'field_personnel',
        nik: userUuid,
        name: 'Officer User',
      });

      const [header, payload, sig] = token.split('.');
      const rawPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      rawPayload.role = 'master_reseller'; // Tamper
      const tamperedPayload = Buffer.from(JSON.stringify(rawPayload)).toString('base64url');
      const forgedToken = `${header}.${tamperedPayload}.${sig}`;

      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${forgedToken}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('INVALID_SIGNATURE_TAMPERED');
    });

    test('3.4: Rejects expired session token (HTTP 401 SESSION_EXPIRED)', async () => {
      const expiredToken = signBwmSessionToken(
        {
          userId: userUuid,
          tenantId: alphaTenantId,
          tenantSlug: 'tenant-api-alpha-1794053601886',
          role: 'master_reseller',
          nik: userUuid,
          name: 'Officer User',
        },
        -10 // expired 10 seconds ago
      );

      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${expiredToken}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('SESSION_EXPIRED');
    });

    test('3.5: Session after membership revocation is rejected on /api/auth/me with HTTP 403 (MEMBERSHIP_REVOKED)', async () => {
      // 1. Issue valid session
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller',
        nik: userUuid,
        name: 'Officer User',
      });

      // 2. Revoke membership in database SSOT
      const mem = mockMemberships.find((m) => m.user_id === userUuid);
      if (mem) {
        mem.is_active = false;
      }

      // 3. Attempt protected route access
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('MEMBERSHIP_REVOKED');
    });

    test('3.6: Session after user deactivation / membership deletion is rejected with HTTP 403 (MEMBERSHIP_NOT_FOUND)', async () => {
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller',
        nik: userUuid,
        name: 'Officer User',
      });

      // Delete membership from DB
      mockMemberships = [];

      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('MEMBERSHIP_NOT_FOUND');
    });

    test('3.7: Session after tenant suspension is rejected with HTTP 403 (TENANT_SUSPENDED)', async () => {
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller',
        nik: userUuid,
        name: 'Officer User',
      });

      // Suspend tenant in DB
      const tenant = mockTenants.find((t) => t.id === alphaTenantId);
      if (tenant) {
        tenant.metadata = { ...tenant.metadata, status: 'SUSPENDED' };
      }

      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('TENANT_SUSPENDED');
    });

    test('3.8: Session replay after logout is strictly rejected with HTTP 401 (SESSION_REVOKED_LOGGED_OUT)', async () => {
      const token = signBwmSessionToken({
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller',
        nik: userUuid,
        name: 'Officer User',
      });

      // 1. User performs explicit logout
      const logoutReq = new NextRequest('https://workforce.boontrack.com/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });
      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);

      // 2. Attacker attempts to replay the token
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${token}`,
        },
      });

      const res = await meRoute(meReq);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.authenticated).toBe(false);
      expect(json.error).toBe('SESSION_REVOKED_LOGGED_OUT');
    });

    test('3.9: enforceTenantScope strictly prevents cross-tenant data access', () => {
      const session = {
        userId: userUuid,
        tenantId: alphaTenantId,
        tenantSlug: 'tenant-api-alpha-1794053601886',
        role: 'master_reseller' as const,
        nik: userUuid,
        name: 'Agency Admin',
        iat: 1000,
        exp: 2000,
        expires_at: new Date(2000 * 1000).toISOString(),
        nonce: 'abc',
      };

      // Allowed self
      expect(enforceTenantScope(session, alphaTenantId).authorized).toBe(true);
      expect(enforceTenantScope(session, 'tenant-api-alpha-1794053601886').authorized).toBe(true);

      // Forbidden cross-tenant
      const crossId = enforceTenantScope(session, betaTenantId);
      expect(crossId.authorized).toBe(false);
      expect(crossId.error).toContain('CROSS_TENANT_ACCESS_FORBIDDEN');

      const crossSlug = enforceTenantScope(session, 'beta-protective-services');
      expect(crossSlug.authorized).toBe(false);
      expect(crossSlug.error).toContain('CROSS_TENANT_ACCESS_FORBIDDEN');
    });
  });

  // ==========================================================================
  // SECTION 4: ANTI-BRUTE-FORCE RATE LIMITING (PRIORITY 1)
  // ==========================================================================
  describe('Section 4 — Anti-Brute-Force Rate Limiting (Priority 1)', () => {
    test('4.1: Blocks brute force with HTTP 429 after 5 failed attempts on an agency', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const badReqBody = {
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: '0000', // Invalid PIN
      };

      // Execute 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        const req = createLoginRequest(badReqBody);
        const res = await loginRoute(req);
        expect(res.status).toBe(401);
      }

      // 6th attempt must be rejected with HTTP 429 Too Many Requests
      const blockedReq = createLoginRequest(badReqBody);
      const blockedRes = await loginRoute(blockedReq);
      const json = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(json.success).toBe(false);
      expect(json.error).toBe('TOO_MANY_REQUESTS');
      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      expect(Number(blockedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
    });

    test('4.2: Rate limit response does not leak account or tenant existence', async () => {
      const nonExistentBody = {
        slug: 'non-existent-ghost-agency',
        nik: '99999999-9999-4999-8999-999999999999',
        pin: '0000',
      };

      // 5 failed attempts against non-existent tenant
      for (let i = 0; i < 5; i++) {
        const req = createLoginRequest(nonExistentBody);
        const res = await loginRoute(req);
        expect(res.status).toBe(404);
      }

      // 6th attempt returns generic 429 that looks identical to existing accounts
      const req = createLoginRequest(nonExistentBody);
      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.error).toBe('TOO_MANY_REQUESTS');
      expect(json.message).not.toContain('non-existent');
      expect(json.message).not.toContain('Akun tidak ditemukan');
    });

    test('4.3: Resets attempt counter on successful login', async () => {
      mockMemberships = [
        {
          id: 'mem-alpha',
          user_id: userUuid,
          tenant_id: alphaTenantId,
          tenant_slug: 'tenant-api-alpha-1794053601886',
          role: 'OWNER',
          is_active: true,
        },
      ];

      const badReqBody = {
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: '0000',
      };

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        const req = createLoginRequest(badReqBody);
        const res = await loginRoute(req);
        expect(res.status).toBe(401);
      }

      // Successful login with correct PIN
      const successReq = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: validPin,
      });
      const successRes = await loginRoute(successReq);
      expect(successRes.status).toBe(200);

      // Now 3 more failed attempts should not lock out immediately because counter was reset
      for (let i = 0; i < 3; i++) {
        const req = createLoginRequest(badReqBody);
        const res = await loginRoute(req);
        expect(res.status).toBe(401);
      }
    });

    test('4.4: Enforces identifier-scoped rate limiting across different IP headers', async () => {
      const badReqBody = {
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: '0000',
      };

      // 5 attempts from 5 different IPs targeting the SAME officer identifier
      for (let i = 1; i <= 5; i++) {
        const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'origin': 'https://workforce.boontrack.com',
            'host': 'workforce.boontrack.com',
            'x-forwarded-for': `198.51.100.${i}`,
          },
          body: JSON.stringify(badReqBody),
        });
        await loginRoute(req);
      }

      // 6th attempt from a fresh 6th IP targeting that same identifier must be rejected with 429
      const sprayReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'origin': 'https://workforce.boontrack.com',
          'host': 'workforce.boontrack.com',
          'x-forwarded-for': '198.51.100.99',
        },
        body: JSON.stringify(badReqBody),
      });

      const res = await loginRoute(sprayReq);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe('TOO_MANY_REQUESTS');
    });

    test('4.5: Rate limit key cannot be bypassed by identifier variations (casing, whitespace, Unicode)', async () => {
      // 5 failed attempts with different variations of the same identifier
      const variations = [
        ` ${userUuid} `,
        userUuid.toUpperCase(),
        `  ${userUuid.toUpperCase()}  `,
        userUuid,
        userUuid,
      ];

      for (const variant of variations) {
        const req = createLoginRequest({
          slug: 'Tenant-Api-Alpha-1794053601886 ',
          nik: variant,
          pin: '0000',
        });
        await loginRoute(req);
      }

      // Next attempt with clean identifier must still be blocked by 429
      const blockedReq = createLoginRequest({
        slug: 'tenant-api-alpha-1794053601886',
        nik: userUuid,
        pin: '0000',
      });
      const res = await loginRoute(blockedReq);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe('TOO_MANY_REQUESTS');
    });
  });
});
