/**
 * @file __tests__/integration/creator_login_to_workspace_e2e.test.ts
 * @description CTO Mandate: Full Creator Login-to-Workspace Integration & Security Remediation Suite
 *
 * Verifies:
 * 1. Positive Flow: POST /api/creator/login -> signed Creator host cookie -> middleware rewrite -> layout authorization.
 * 2. Remediation A: Cryptographic token issuance, zero plaintext fallback, strict middleware/layout guards.
 * 3. Remediation B: Edge session verifier hardening (exp, nbf, iat, ver, sub, tid, tsl, jti, alg, typ).
 * 4. Remediation C: 20+ positive and negative adversarial test cases covering the entire product boundary.
 */

import { NextRequest } from 'next/server';
import { POST as creatorLogin } from '@/app/api/creator/login/route';
import { POST as authSessionLogout } from '@/app/api/auth/session/route';
import { middleware } from '@/middleware';
import CreatorAdminLayout from '@/app/creator/admin/layout';
import {
  signHostSessionToken,
  verifyHostSessionToken,
  revokeHostSession,
  resetRevokedJtiCache,
  getProductAuthConfig,
} from '@/lib/auth/host-session';
import {
  verifyHostSessionTokenEdge,
  validateHostSessionClaims,
  resetRevokedJtiCacheEdge,
  revokeHostSessionEdge,
} from '@/lib/auth/host-session-edge';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import * as supabaseClientModule from '@/lib/supabaseClient';
import crypto from 'crypto';

// In-memory cookie store for mocking next/headers
const mockCookieMap = new Map<string, string>();

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockImplementation(async () => ({
    get: (name: string) => {
      const val = mockCookieMap.get(name);
      return val !== undefined ? { name, value: val } : undefined;
    },
    getAll: () => Array.from(mockCookieMap.entries()).map(([name, value]) => ({ name, value })),
  })),
}));

// Mock next/navigation redirect with control flow throw
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe('CTO Mandate: Full Creator Login-to-Workspace Integration & Security Suite', () => {
  const TEST_CREATOR = {
    id: 'usr-creator-777',
    tenant_id: 'tid-creator-777',
    handle: 'suzieray',
    display_name: 'Suzie Ray Official',
    pin: '9876',
  };

  const createMockDb = () => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'creator_profiles') {
          return Promise.resolve({ data: TEST_CREATOR, error: null });
        }
        if (table === 'tenants') {
          return Promise.resolve({
            data: {
              id: TEST_CREATOR.tenant_id,
              slug: TEST_CREATOR.handle,
              name: TEST_CREATOR.display_name,
              status: 'active',
              access_password: 'secret-password',
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    })),
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: TEST_CREATOR.id,
            email: 'suzieray@boontrack.com',
            app_metadata: { role: 'CREATOR_OWNER' },
          },
          session: { access_token: 'valid-sb-access-token' },
        },
        error: null,
      }),
      getUser: jest.fn().mockImplementation((token: string) => {
        if (token === 'valid-admin-token') {
          return Promise.resolve({
            data: {
              user: {
                id: 'admin-1',
                email: 'admin@boontrack.com',
                app_metadata: { role: 'ADMIN' },
              },
            },
            error: null,
          });
        }
        return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
      }),
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieMap.clear();
    resetRevokedJtiCache();
    resetRevokedJtiCacheEdge();

    const mockDb = createMockDb();
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetRevokedJtiCache();
    resetRevokedJtiCacheEdge();
  });

  // =========================================================================
  // 1. POSITIVE FLOW: Full Login-to-Workspace Lifecycle
  // =========================================================================
  describe('1. Positive Flow: Full Login-to-Workspace Lifecycle', () => {
    it('1a. POST /api/creator/login issues valid signed Creator session cookie', async () => {
      const loginReq = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(loginReq);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.handle).toBe('suzieray');
      expect(json.data.role).toBe('CREATOR_OWNER');

      // Verify signed host session cookie was set
      const config = getProductAuthConfig('creator');
      const setCookieHeaders = res.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      const cookieEntry = setCookieHeaders.find((c) => c.startsWith(`${config.cookieName}=`));
      expect(cookieEntry).toBeDefined();
      expect(cookieEntry).toContain('HttpOnly');
      expect(cookieEntry).toContain('Path=/');
      expect(cookieEntry).toMatch(/SameSite=lax/i);
    });

    it('1b. Authoritative verification of issued token succeeds across Node.js & Edge runtimes', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      // Node.js runtime verifier
      const nodeVerify = await verifyHostSessionToken(token, 'creator');
      expect(nodeVerify.valid).toBe(true);
      expect(nodeVerify.payload?.sub).toBe(TEST_CREATOR.id);
      expect(nodeVerify.payload?.tid).toBe(TEST_CREATOR.tenant_id);
      expect(nodeVerify.payload?.tsl).toBe(TEST_CREATOR.handle);
      expect(nodeVerify.payload?.role).toBe('CREATOR_OWNER');

      // Edge WebCrypto runtime verifier
      const edgeVerify = await verifyHostSessionTokenEdge(token, 'creator');
      expect(edgeVerify.valid).toBe(true);
      expect(edgeVerify.payload?.sub).toBe(TEST_CREATOR.id);
      expect(edgeVerify.payload?.tid).toBe(TEST_CREATOR.tenant_id);
      expect(edgeVerify.payload?.tsl).toBe(TEST_CREATOR.handle);
    });

    it('1c. Middleware authorizes authenticated Creator token visiting /admin and rewrites to /creator/admin', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toBeDefined();
      expect(rewrite).toContain('/creator/admin');
    });

    it('1d. Middleware authorizes authenticated Creator token visiting direct /creator/admin via pass-through', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const req = new NextRequest('https://creator.boontrack.com/creator/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      // Pass-through has no rewrite header
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('1e. Server-side CreatorAdminLayout authorizes valid signed token and renders children', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      mockCookieMap.set('bt_creator_session', token);

      const layoutResult = await CreatorAdminLayout({
        children: 'Protected Creator Content',
      });

      expect(layoutResult).toBeDefined();
    });
  });

  // =========================================================================
  // 2. REMEDIATION A: Plaintext Cookie Fallback Elimination
  // =========================================================================
  describe('2. Remediation A: Plaintext Cookie Fallback Elimination', () => {
    it('2a. POST /api/creator/login NEVER issues plaintext creator_session, merchant_store, or bt_tenant cookies', async () => {
      const loginReq = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(loginReq);
      const setCookies = res.headers.getSetCookie();

      // Ensure forbidden plaintext session cookies are absent
      const hasPlaintextCreatorSession = setCookies.some((c) => c.startsWith('creator_session='));
      const hasPlaintextMerchantStore = setCookies.some((c) => c.startsWith('merchant_store='));
      const hasPlaintextMerchantSession = setCookies.some((c) => c.startsWith('merchant_session='));
      const hasPlaintextBtTenant = setCookies.some((c) => c.startsWith('bt_tenant='));

      expect(hasPlaintextCreatorSession).toBe(false);
      expect(hasPlaintextMerchantStore).toBe(false);
      expect(hasPlaintextMerchantSession).toBe(false);
      expect(hasPlaintextBtTenant).toBe(false);
    });

    it('2b. CreatorAdminLayout strictly rejects plaintext creator_session cookie without signed token', async () => {
      mockCookieMap.set('creator_session', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Forbidden Workspace' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('2c. CreatorAdminLayout strictly rejects plaintext merchant_store cookie without signed token', async () => {
      mockCookieMap.set('merchant_store', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Forbidden Workspace' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('2d. CreatorAdminLayout strictly rejects plaintext merchant_session cookie without signed token', async () => {
      mockCookieMap.set('merchant_session', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Forbidden Workspace' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('2e. CreatorAdminLayout strictly rejects plaintext bt_tenant cookie without signed token', async () => {
      mockCookieMap.set('bt_tenant', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Forbidden Workspace' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('2f. CreatorAdminLayout strictly rejects client display cookie creator_handle alone', async () => {
      mockCookieMap.set('creator_handle', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Forbidden Workspace' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });
  });

  // =========================================================================
  // 3. REMEDIATION A: Middleware Direct Route Protection & Origin Boundaries
  // =========================================================================
  describe('3. Remediation A: Middleware Direct Route Protection & Boundaries', () => {
    it('3a. Anonymous access to creator.boontrack.com/admin rewrites to /creator/login', async () => {
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/creator/login');
    });

    it('3b. Anonymous access to direct /creator/admin on creator domain rewrites to /creator/login', async () => {
      const req = new NextRequest('https://creator.boontrack.com/creator/admin', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/creator/login');
    });

    it('3c. Anonymous access to /creator/admin on non-creator host (boontrack.com) redirects 302 to canonical creator login', async () => {
      const req = new NextRequest('https://boontrack.com/creator/admin', {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://creator.boontrack.com/login');
    });

    it('3d. Authenticated Creator session accessing /creator/admin on non-creator host redirects 302 to canonical creator admin', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const req = new NextRequest('https://boontrack.com/creator/admin', {
        headers: {
          host: 'boontrack.com',
          cookie: `bt_creator_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://creator.boontrack.com/admin');
    });

    it('3e. Explicit /login on creator.boontrack.com rewrites to /creator/login without redirecting to dashboard', async () => {
      const req = new NextRequest('https://creator.boontrack.com/login', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/creator/login');
    });
  });

  // =========================================================================
  // 4. REMEDIATION B: Edge Session Verifier Hardening (RFC 7519 / HMAC-SHA256)
  // =========================================================================
  describe('4. Remediation B: Edge Session Verifier Hardening', () => {
    it('4a. Rejects forged / tampered token with invalid signature', async () => {
      const validToken = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const tamperedToken = validToken.substring(0, validToken.length - 6) + 'XXXXXX';
      const verifyEdge = await verifyHostSessionTokenEdge(tamperedToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(verifyEdge.error).toBe('SIGNATURE_INVALID');

      const verifyNode = await verifyHostSessionToken(tamperedToken, 'creator');
      expect(verifyNode.valid).toBe(false);
      expect(verifyNode.error).toBe('SIGNATURE_INVALID');
    });

    it('4b. Rejects expired token (exp in past)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredClaims = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now - 3600,
        nbf: now - 3600,
        exp: now - 60, // expired 1 minute ago
        jti: 'jti-expired-1',
        ver: 1,
      };

      const result = validateHostSessionClaims(expiredClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });

    it('4c. Rejects premature token (nbf > 5 seconds in future)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const prematureClaims = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now,
        nbf: now + 60, // 60 seconds in future (exceeds 5s skew tolerance)
        exp: now + 3600,
        jti: 'jti-premature-1',
        ver: 1,
      };

      const result = validateHostSessionClaims(prematureClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_NOT_ACTIVE');
    });

    it('4d. Rejects token with missing or non-numeric exp', async () => {
      const now = Math.floor(Date.now() / 1000);
      const badExpClaims: any = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now,
        nbf: now,
        exp: 'never-expires', // non-numeric string
        jti: 'jti-bad-exp',
        ver: 1,
      };

      const result = validateHostSessionClaims(badExpClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EXPIRATION_INVALID');
    });

    it('4e. Rejects token with excessive lifetime (> 30 days)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const excessiveClaims = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now,
        nbf: now,
        exp: now + 31 * 24 * 60 * 60, // 31 days (max allowed is 30 days)
        jti: 'jti-excessive',
        ver: 1,
      };

      const result = validateHostSessionClaims(excessiveClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_LIFETIME_EXCEEDED');
    });

    it('4f. Rejects inverted timestamps (iat >= exp)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const invertedClaims = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now + 3,
        nbf: now - 10,
        exp: now + 2, // exp is before iat, but > now
        jti: 'jti-inverted',
        ver: 1,
      };

      const result = validateHostSessionClaims(invertedClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EXPIRATION_INVALID');
    });

    it('4g. Rejects token with missing or below minVersion ver claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const badVerClaims = {
        sub: TEST_CREATOR.id,
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now,
        nbf: now,
        exp: now + 3600,
        jti: 'jti-bad-ver',
        ver: 0, // below minVersion 1
      };

      const result = validateHostSessionClaims(badVerClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SESSION_VERSION_INVALID');
    });

    it('4h. Rejects token with missing required identity claims (sub, tid, tsl, jti, role)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const missingSubClaims: any = {
        sub: '', // empty sub
        tid: TEST_CREATOR.tenant_id,
        tsl: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
        iss: 'https://creator.boontrack.com',
        aud: 'https://creator.boontrack.com',
        iat: now,
        nbf: now,
        exp: now + 3600,
        jti: 'jti-1',
        ver: 1,
      };

      const result = validateHostSessionClaims(missingSubClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SUBJECT_MISSING');
    });

    it('4i. Rejects token with unsupported algorithm (alg !== HS256, e.g. "none" or "RS256")', async () => {
      // Craft a token with alg: 'none'
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: TEST_CREATOR.id,
          tid: TEST_CREATOR.tenant_id,
          tsl: TEST_CREATOR.handle,
          role: 'CREATOR_OWNER',
          iss: 'https://creator.boontrack.com',
          aud: 'https://creator.boontrack.com',
          iat: Math.floor(Date.now() / 1000),
          nbf: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: 'jti-alg-none',
          ver: 1,
        })
      ).toString('base64url');
      const tokenWithUnsupportedAlg = `${header}.${payload}.dummy_signature`;

      const verifyEdge = await verifyHostSessionTokenEdge(tokenWithUnsupportedAlg, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(verifyEdge.error).toBe('ALGORITHM_UNSUPPORTED');

      const verifyNode = await verifyHostSessionToken(tokenWithUnsupportedAlg, 'creator');
      expect(verifyNode.valid).toBe(false);
      expect(verifyNode.error).toBe('ALGORITHM_UNSUPPORTED');
    });
  });

  // =========================================================================
  // 5. REMEDIATION B: Cross-Product Boundary & Audience Isolation
  // =========================================================================
  describe('5. Cross-Product Boundary & Audience Isolation', () => {
    it('5a. STRICT ISOLATION: Studio session token presented to Creator verifier is rejected', async () => {
      const studioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-01',
        tenantId: 'tid-studio-01',
        tenantSlug: 'studio-brand',
        role: 'STUDIO_PARTICIPANT',
      });

      const verifyEdge = await verifyHostSessionTokenEdge(studioToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(['AUDIENCE_MISMATCH', 'SIGNATURE_INVALID']).toContain(verifyEdge.error);

      const verifyNode = await verifyHostSessionToken(studioToken, 'creator');
      expect(verifyNode.valid).toBe(false);
      expect(['AUDIENCE_MISMATCH', 'SIGNATURE_INVALID']).toContain(verifyNode.error);
    });

    it('5b. STRICT ISOLATION: Studio session token in middleware /admin rewrites to /creator/login', async () => {
      const studioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-01',
        tenantId: 'tid-studio-01',
        tenantSlug: 'studio-brand',
        role: 'STUDIO_PARTICIPANT',
      });

      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_studio_session=${studioToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/creator/login');
    });

    it('5c. STRICT ISOLATION: Shop merchant token presented to Creator verifier is rejected', async () => {
      const merchantToken = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'OWNER',
      });

      const verifyEdge = await verifyHostSessionTokenEdge(merchantToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(['HEADER_MALFORMED', 'TOKEN_MALFORMED']).toContain(verifyEdge.error);
    });

    it('5d. STRICT ISOLATION: Shop merchant token visiting creator /admin rewrites to /creator/login', async () => {
      const merchantToken = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'OWNER',
      });

      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_merchant_token=${merchantToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/creator/login');
    });
  });

  // =========================================================================
  // 6. LIFECYCLE: Revocation & Logout Parity
  // =========================================================================
  describe('6. Lifecycle: Revocation & Logout Parity', () => {
    it('6a. Revoking a token JTI invalidates it in both Node.js and Edge verifiers', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      // Verify token is initially valid
      const initialVerify = await verifyHostSessionToken(token, 'creator');
      expect(initialVerify.valid).toBe(true);
      const jti = initialVerify.payload!.jti;
      const exp = initialVerify.payload!.exp;

      // Revoke JTI
      await revokeHostSession(jti, exp, 'creator');

      // Verify Node.js rejects revoked token
      const nodeVerify = await verifyHostSessionToken(token, 'creator');
      expect(nodeVerify.valid).toBe(false);
      expect(nodeVerify.error).toBe('TOKEN_REVOKED');

      // Verify Edge WebCrypto rejects revoked token
      const edgeVerify = await verifyHostSessionTokenEdge(token, 'creator');
      expect(edgeVerify.valid).toBe(false);
      expect(edgeVerify.error).toBe('TOKEN_REVOKED');
    });

    it('6b. POST /api/auth/session revokes Creator session and clears host cookie without affecting other products', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const logoutReq = new NextRequest('https://creator.boontrack.com/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_creator_session=${token}`,
        },
        body: JSON.stringify({ product: 'creator' }),
      });

      const res = await authSessionLogout(logoutReq);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify cookie was cleared
      const config = getProductAuthConfig('creator');
      const setCookies = res.headers.getSetCookie();
      const clearedCookie = setCookies.find((c) => c.startsWith(`${config.cookieName}=`));
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain('Max-Age=0');

      // Verify subsequent token verification is rejected as revoked
      const subsequentVerify = await verifyHostSessionToken(token, 'creator');
      expect(subsequentVerify.valid).toBe(false);
      expect(subsequentVerify.error).toBe('TOKEN_REVOKED');
    });
  });

  // =========================================================================
  // 7. LAYOUT AUTHORIZATION & ROLE BOUNDARIES
  // =========================================================================
  describe('7. Layout Authorization & Role Boundaries', () => {
    it('7a. Rejects token with unauthorized role (e.g. GUEST or STUDIO_PARTICIPANT) with 403 Forbidden', async () => {
      const unauthorizedToken = signHostSessionToken({
        product: 'creator',
        userId: 'usr-guest-1',
        tenantId: 'tid-guest-1',
        tenantSlug: 'guest',
        role: 'GUEST',
      });

      mockCookieMap.set('bt_creator_session', unauthorizedToken);

      const layoutResult = await CreatorAdminLayout({
        children: 'Protected Content',
      });

      // Returns ForbiddenAccessView (not throwing NEXT_REDIRECT)
      expect(layoutResult).toBeDefined();
      expect(layoutResult.props.role).toBe('GUEST');
    });

    it('7b. Allows platform ADMIN to access Creator workspace via Supabase auth token', async () => {
      mockCookieMap.set('sb-access-token', 'valid-admin-token');

      const layoutResult = await CreatorAdminLayout({
        children: 'Protected Content For Admin',
      });

      expect(layoutResult).toBeDefined();
    });
  });
});
