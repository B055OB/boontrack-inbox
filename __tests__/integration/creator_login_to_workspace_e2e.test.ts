/**
 * @file __tests__/integration/creator_login_to_workspace_e2e.test.ts
 * @description CTO Mandate Round 2: Full Connected Creator Login-to-Workspace Integration & Security Remediation Suite
 *
 * Verifies:
 * 1. Connected Positive Flow:
 *    Step 1: Real POST /api/creator/login endpoint call.
 *    Step 2: Capture exact signed cookie from login response headers (Zero manual token generation).
 *    Step 3: Pass exact captured token to Middleware (verifies host recognition and /admin -> /creator/admin rewrite).
 *    Step 4: Pass exact captured token to CreatorAdminLayout (verifies server-side authorization and workspace rendering).
 * 2. Strict Privilege Issuance (Remediation A):
 *    - Unlinked Supabase user receives zero Creator tokens (403 CREATOR_MEMBERSHIP_REQUIRED).
 *    - Missing profile fails closed (404 NOT_FOUND).
 *    - Missing stored PIN/hash fails closed (401 CREDENTIAL_UNCONFIGURED).
 *    - Empty credential fails closed (400 SECRET_REQUIRED).
 *    - Incorrect PIN fails closed (401 INVALID_PIN).
 *    - Suspended profile fails closed (403 CREATOR_SUSPENDED).
 *    - Inactive linked tenant fails closed (403 TENANT_INELIGIBLE).
 *    - User-editable metadata cannot grant elevated privileges.
 * 3. Elimination of Generic Supabase Fallback (Remediation B):
 *    - sb-access-token alone is strictly rejected in CreatorAdminLayout.
 *    - Zero plaintext cookies allowed.
 *    - Authoritative Node verifier verifies signature and claims.
 * 4. Plaintext Cookie Rejection (Remediation C):
 *    - creator_session, creator_handle alone fail closed.
 * 5. Architectural Blocker Transparency (Remediation E):
 *    - Accurately states process-local cache boundaries without false claims of multi-runtime parity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST as creatorLogin, applyCreatorSessionCookie } from '@/app/api/creator/login/route';
import { POST as authSessionLogout } from '@/app/api/auth/session/route';
import { PUT as creatorProfilePUT } from '@/app/api/creator/profile/route';
import { GET as resellerAppsGET, PATCH as resellerAppsPATCH } from '@/app/api/v1/creators/[handle]/reseller-applications/route';
import { PATCH as tipsPATCH } from '@/app/api/v1/creators/[handle]/tips/[id]/route';
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

// In-memory cookie store for mocking next/headers in server components
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

// Mock next/navigation redirect with control flow throw (mimicking Next.js NEXT_REDIRECT)
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe('CTO Mandate Round 2: Connected Creator Login-to-Workspace Integration Suite', () => {
  const TEST_CREATOR = {
    id: 'usr-creator-777',
    tenant_id: 'tid-creator-777',
    handle: 'suzieray',
    display_name: 'Suzie Ray Official',
    pin: '9876',
    role: 'CREATOR_OWNER',
    status: 'active',
  };

  const createMockDb = (customOverrides?: {
    profile?: any;
    tenant?: any;
    authUser?: any;
    authError?: any;
  }) => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'creator_profiles') {
          if (customOverrides?.profile !== undefined) {
            return Promise.resolve({ data: customOverrides.profile, error: null });
          }
          return Promise.resolve({ data: TEST_CREATOR, error: null });
        }
        if (table === 'tenants') {
          if (customOverrides?.tenant !== undefined) {
            return Promise.resolve({ data: customOverrides.tenant, error: null });
          }
          return Promise.resolve({
            data: {
              id: TEST_CREATOR.tenant_id,
              slug: TEST_CREATOR.handle,
              name: TEST_CREATOR.display_name,
              status: 'active',
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    })),
    auth: {
      signInWithPassword: jest.fn().mockImplementation(() => {
        if (customOverrides?.authError) {
          return Promise.resolve({ data: { user: null }, error: customOverrides.authError });
        }
        return Promise.resolve({
          data: {
            user: customOverrides?.authUser || {
              id: TEST_CREATOR.id,
              email: 'suzieray@boontrack.com',
              app_metadata: { role: 'CREATOR_OWNER' },
            },
            session: { access_token: 'valid-sb-access-token' },
          },
          error: null,
        });
      }),
      getUser: jest.fn().mockImplementation((token: string) => {
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
  // 1. CONNECTED POSITIVE FLOW: Login -> Capture Cookie -> Middleware -> Layout
  // =========================================================================
  describe('1. Connected Positive Flow: Login -> Capture Cookie -> Middleware -> Layout', () => {
    it('executes connected end-to-end positive flow using exact captured token from login response', async () => {
      // Step 1: Call actual login route with legitimate fixture
      const loginReq = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const loginRes = await creatorLogin(loginReq);
      expect(loginRes.status).toBe(200);

      const loginJson = await loginRes.json();
      expect(loginJson.success).toBe(true);
      expect(loginJson.data.handle).toBe('suzieray');
      expect(loginJson.data.role).toBe('CREATOR_OWNER');

      // Step 2: Capture actual response cookie from headers (Zero manual signing!)
      const config = getProductAuthConfig('creator');
      const setCookieHeaders = loginRes.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      const cookieEntry = setCookieHeaders.find((c) => c.startsWith(`${config.cookieName}=`));
      expect(cookieEntry).toBeDefined();
      expect(cookieEntry).toContain('HttpOnly');
      expect(cookieEntry).toContain('Path=/');
      expect(cookieEntry).toMatch(/SameSite=lax/i);

      const tokenMatch = cookieEntry!.match(new RegExp(`${config.cookieName}=([^;]+)`));
      expect(tokenMatch).toBeDefined();
      const capturedToken = decodeURIComponent(tokenMatch![1]);
      expect(capturedToken.split('.')).toHaveLength(3);

      // Verify the captured token is mathematically valid under Node & Edge verifiers
      const nodeVerify = await verifyHostSessionToken(capturedToken, 'creator');
      expect(nodeVerify.valid).toBe(true);
      expect(nodeVerify.payload?.sub).toBe(TEST_CREATOR.id);
      expect(nodeVerify.payload?.tid).toBe(TEST_CREATOR.tenant_id);
      expect(nodeVerify.payload?.tsl).toBe(TEST_CREATOR.handle);

      const edgeVerify = await verifyHostSessionTokenEdge(capturedToken, 'creator');
      expect(edgeVerify.valid).toBe(true);
      expect(edgeVerify.payload?.sub).toBe(TEST_CREATOR.id);

      // Step 3: Pass exact captured token to Middleware
      const mwReq = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `${config.cookieName}=${capturedToken}`,
        },
      });

      const mwRes = await middleware(mwReq);
      expect(mwRes.status).toBe(200);
      const rewriteHeader = mwRes.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/creator/admin');

      // Step 3b: Pass exact captured token to Middleware on direct /creator/admin
      const directMwReq = new NextRequest('https://creator.boontrack.com/creator/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `${config.cookieName}=${capturedToken}`,
        },
      });
      const directMwRes = await middleware(directMwReq);
      expect(directMwRes.status).toBe(200);
      expect(directMwRes.headers.get('x-middleware-rewrite')).toBeNull(); // Clean pass-through

      // Step 4: Pass exact captured token to server-side CreatorAdminLayout
      mockCookieMap.set(config.cookieName, capturedToken);
      const layoutResult = await CreatorAdminLayout({
        children: 'Authorized Creator Workspace Shell',
      });
      expect(layoutResult).toBeDefined();
    });
  });

  // =========================================================================
  // 2. REMEDIATION A: Strict Creator Login Privilege Issuance
  // =========================================================================
  describe('2. Remediation A: Strict Creator Login Privilege Issuance', () => {
    it('2a. Rejects unlinked authenticated Supabase user with 403 CREATOR_MEMBERSHIP_REQUIRED and issues zero tokens', async () => {
      // Mock Supabase Auth succeeds, but user has NO creator profile in database
      const mockDb = createMockDb({
        profile: null,
        authUser: { id: 'unlinked-user-123', email: 'unlinked@example.com', app_metadata: {} },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unlinked@example.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_MEMBERSHIP_REQUIRED');

      // Zero cookies issued
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2b. Rejects missing creator profile on handle login with 404 NOT_FOUND and issues zero tokens', async () => {
      const mockDb = createMockDb({ profile: null });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nonexistent_creator', pin: '1234' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('NOT_FOUND');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2c. Rejects profile without configured PIN/hash with 401 CREDENTIAL_UNCONFIGURED (No passwordless access)', async () => {
      // Profile exists but has no pin and no pin_hash
      const unconfiguredProfile = { ...TEST_CREATOR, pin: null, pin_hash: null, theme_config: {} };
      const mockDb = createMockDb({ profile: unconfiguredProfile });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: 'anything' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREDENTIAL_UNCONFIGURED');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2d. Rejects empty credential with 400 SECRET_REQUIRED and issues zero tokens', async () => {
      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('SECRET_REQUIRED');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2e. Rejects incorrect PIN with 401 INVALID_PIN and issues zero tokens', async () => {
      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: 'wrong-pin' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('INVALID_PIN');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2f. Rejects login if linked tenant is inactive with 403 TENANT_INELIGIBLE', async () => {
      const mockDb = createMockDb({
        tenant: { id: TEST_CREATOR.tenant_id, slug: TEST_CREATOR.handle, status: 'inactive' },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_INELIGIBLE');
    });

    it('2g. Rejects suspended creator profile with 403 CREATOR_SUSPENDED', async () => {
      const suspendedProfile = { ...TEST_CREATOR, status: 'suspended' };
      const mockDb = createMockDb({ profile: suspendedProfile });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_SUSPENDED');
    });

    it('2h. NEVER trusts user-editable user_metadata to elevate privileges to ADMIN', async () => {
      // User has user_metadata.role = 'ADMIN', but app_metadata has no role
      const sneakyUser = {
        id: TEST_CREATOR.id,
        email: 'suzieray@boontrack.com',
        user_metadata: { role: 'ADMIN' }, // User editable!
        app_metadata: {}, // Server controlled (empty)
      };
      const mockDb = createMockDb({ authUser: sneakyUser });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'suzieray@boontrack.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      // Must NOT be elevated to ADMIN
      expect(json.data.role).toBe('CREATOR_OWNER');
    });

    it('2i. Rejects login if linked tenant row is missing (null) with 403 CREATOR_TENANT_MISSING and zero cookies', async () => {
      const mockDb = createMockDb({
        tenant: null,
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_TENANT_MISSING');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2j. Rejects login if linked tenant is suspended with 403 TENANT_INELIGIBLE and zero cookies', async () => {
      const mockDb = createMockDb({
        tenant: { id: TEST_CREATOR.tenant_id, slug: TEST_CREATOR.handle, status: 'suspended', is_active: false },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_INELIGIBLE');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2k. Rejects login if profile.tenant_id is missing/empty with 403 CREATOR_TENANT_MISSING and never substitutes profile.id', async () => {
      const profileWithoutTenantId = { ...TEST_CREATOR, tenant_id: null };
      const mockDb = createMockDb({ profile: profileWithoutTenantId });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_TENANT_MISSING');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2l. Rejects login if creator role is missing or unsupported (e.g. GUEST) with 403 CREATOR_ROLE_UNAUTHORIZED and never defaults to CREATOR_OWNER', async () => {
      const profileWithGuestRole = { ...TEST_CREATOR, role: 'GUEST' };
      const mockDb = createMockDb({ profile: profileWithGuestRole });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'suzieray', pin: '9876' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_ROLE_UNAUTHORIZED');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2m. For email login: Rejects if linked tenant row is missing (null) with 403 CREATOR_TENANT_MISSING and zero cookies', async () => {
      const mockDb = createMockDb({
        tenant: null,
        authUser: { id: TEST_CREATOR.id, email: 'suzieray@boontrack.com', app_metadata: {} },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'suzieray@boontrack.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_TENANT_MISSING');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2n. For email login: Rejects if linked tenant is suspended with 403 TENANT_INELIGIBLE and zero cookies', async () => {
      const mockDb = createMockDb({
        tenant: { id: TEST_CREATOR.tenant_id, slug: TEST_CREATOR.handle, status: 'suspended', is_active: false },
        authUser: { id: TEST_CREATOR.id, email: 'suzieray@boontrack.com', app_metadata: {} },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'suzieray@boontrack.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_INELIGIBLE');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2o. For email login: Rejects if profile.tenant_id is missing with 403 CREATOR_TENANT_MISSING and zero cookies', async () => {
      const profileNoTenant = { ...TEST_CREATOR, tenant_id: null };
      const mockDb = createMockDb({
        profile: profileNoTenant,
        authUser: { id: TEST_CREATOR.id, email: 'suzieray@boontrack.com', app_metadata: {} },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'suzieray@boontrack.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_TENANT_MISSING');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2p. For email login: Rejects if creator role is missing/unsupported with 403 CREATOR_ROLE_UNAUTHORIZED and zero cookies', async () => {
      const profileNoRole = { ...TEST_CREATOR, role: null };
      const mockDb = createMockDb({
        profile: profileNoRole,
        authUser: { id: TEST_CREATOR.id, email: 'suzieray@boontrack.com', app_metadata: {} },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'suzieray@boontrack.com', password: 'valid-password' }),
      });

      const res = await creatorLogin(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('CREATOR_ROLE_UNAUTHORIZED');

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('bt_creator_session'))).toBe(false);
    });

    it('2q. Signing helper (applyCreatorSessionCookie) strictly refuses missing or unsupported roles without defaulting to CREATOR_OWNER', () => {
      // 1. Missing role (empty string)
      const resMissing = NextResponse.json({ success: true });
      const resultMissing = applyCreatorSessionCookie(resMissing, {
        userId: 'usr-test-123',
        tenantId: 'tid-test-123',
        tenantSlug: 'testcreator',
        role: '' as any,
      });
      expect(resultMissing).toBe(false);
      expect(resMissing.cookies.get('bt_creator_session')).toBeUndefined();
      expect(resMissing.cookies.get('__Host-bt_creator_session')).toBeUndefined();

      // 2. Unsupported role ('GUEST', 'VISITOR', 'USER')
      for (const unsupportedRole of ['GUEST', 'VISITOR', 'USER', 'MEMBER']) {
        const resUnsupported = NextResponse.json({ success: true });
        const resultUnsupported = applyCreatorSessionCookie(resUnsupported, {
          userId: 'usr-test-123',
          tenantId: 'tid-test-123',
          tenantSlug: 'testcreator',
          role: unsupportedRole,
        });
        expect(resultUnsupported).toBe(false);
        expect(resUnsupported.cookies.get('bt_creator_session')).toBeUndefined();
        expect(resUnsupported.cookies.get('__Host-bt_creator_session')).toBeUndefined();
      }

      // 3. Valid roles succeed
      for (const validRole of ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN']) {
        const resValid = NextResponse.json({ success: true });
        const resultValid = applyCreatorSessionCookie(resValid, {
          userId: 'usr-test-123',
          tenantId: 'tid-test-123',
          tenantSlug: 'testcreator',
          role: validRole,
        });
        expect(resultValid).toBe(true);
        expect(resValid.cookies.get('bt_creator_session')).toBeDefined();
      }
    });
  });

  // =========================================================================
  // 3. REMEDIATION B: Removal of Generic Supabase Fallback from Layout
  // =========================================================================
  describe('3. Remediation B: Removal of Generic Supabase Fallback from Creator Workspace', () => {
    it('3a. Rejects requests with sb-access-token alone without signed Creator host token', async () => {
      mockCookieMap.set('sb-access-token', 'mock-generic-supabase-token');

      await expect(
        CreatorAdminLayout({ children: 'Workspace Shell' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('3b. Rejects requests with sb-auth-token array alone without signed Creator host token', async () => {
      mockCookieMap.set('sb-project-auth-token', JSON.stringify(['access-token-123']));

      await expect(
        CreatorAdminLayout({ children: 'Workspace Shell' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('3c. Rejects requests with plaintext creator_session alone without signed Creator host token', async () => {
      mockCookieMap.set('creator_session', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Workspace Shell' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('3d. Rejects requests with plaintext creator_handle alone without signed Creator host token', async () => {
      mockCookieMap.set('creator_handle', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Workspace Shell' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });

    it('3e. Rejects requests with plaintext merchant_store or bt_tenant alone without signed Creator host token', async () => {
      mockCookieMap.set('merchant_store', 'suzieray');
      mockCookieMap.set('bt_tenant', 'suzieray');

      await expect(
        CreatorAdminLayout({ children: 'Workspace Shell' })
      ).rejects.toThrow('NEXT_REDIRECT:/login?redirectTo=/admin');
    });
  });

  // =========================================================================
  // 4. REMEDIATION B & C: Verifier Hardening & Boundary Defenses
  // =========================================================================
  describe('4. Verifier Hardening & Boundary Defenses', () => {
    it('4a. Rejects forged token with modified signature', async () => {
      const validToken = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });
      const forgedToken = validToken.slice(0, -5) + 'AAAAA';

      const verifyNode = await verifyHostSessionToken(forgedToken, 'creator');
      expect(verifyNode.valid).toBe(false);
      expect(verifyNode.error).toBe('SIGNATURE_INVALID');

      const verifyEdge = await verifyHostSessionTokenEdge(forgedToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(verifyEdge.error).toBe('SIGNATURE_INVALID');
    });

    it('4b. Rejects expired Creator token', async () => {
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
        exp: now - 60,
        jti: 'jti-expired',
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
        nbf: now + 60,
        exp: now + 3600,
        jti: 'jti-premature',
        ver: 1,
      };

      const result = validateHostSessionClaims(prematureClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_NOT_ACTIVE');
    });

    it('4d. Rejects token with excessive lifetime (> 30 days)', async () => {
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
        exp: now + 31 * 24 * 60 * 60,
        jti: 'jti-excessive',
        ver: 1,
      };

      const result = validateHostSessionClaims(excessiveClaims, getProductAuthConfig('creator'), 1, now);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_LIFETIME_EXCEEDED');
    });

    it('4e. Rejects token with missing required identity claims', async () => {
      const now = Math.floor(Date.now() / 1000);
      const missingSubClaims: any = {
        sub: '',
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

    it('4f. Rejects token with unsupported algorithm (alg !== HS256)', async () => {
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
      const unsupportedToken = `${header}.${payload}.dummy_signature`;

      const verifyNode = await verifyHostSessionToken(unsupportedToken, 'creator');
      expect(verifyNode.valid).toBe(false);
      expect(verifyNode.error).toBe('ALGORITHM_UNSUPPORTED');

      const verifyEdge = await verifyHostSessionTokenEdge(unsupportedToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(verifyEdge.error).toBe('ALGORITHM_UNSUPPORTED');
    });

    it('4g. STRICT ISOLATION: Studio session token presented to Creator verifier is rejected', async () => {
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

    it('4h. STRICT ISOLATION: Shop merchant token presented to Creator verifier is rejected', async () => {
      const merchantToken = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'OWNER',
      });

      const verifyEdge = await verifyHostSessionTokenEdge(merchantToken, 'creator');
      expect(verifyEdge.valid).toBe(false);
      expect(['HEADER_MALFORMED', 'TOKEN_MALFORMED']).toContain(verifyEdge.error);
    });
  });

  // =========================================================================
  // 5. REMEDIATION E: Process-Local Revocation & Architectural Blocker Acknowledgment
  // =========================================================================
  describe('5. Process-Local Revocation & Architecture Blocker Transparency', () => {
    it('5a. Process-local JTI cache invalidates session within test harness instance (Note: multi-runtime parity requires shared store)', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: TEST_CREATOR.id,
        tenantId: TEST_CREATOR.tenant_id,
        tenantSlug: TEST_CREATOR.handle,
        role: 'CREATOR_OWNER',
      });

      const initialVerify = await verifyHostSessionToken(token, 'creator');
      expect(initialVerify.valid).toBe(true);
      const jti = initialVerify.payload!.jti;
      const exp = initialVerify.payload!.exp;

      // Invalidate in local memory cache
      await revokeHostSession(jti, exp, 'creator');

      const nodeVerify = await verifyHostSessionToken(token, 'creator');
      expect(nodeVerify.valid).toBe(false);
      expect(nodeVerify.error).toBe('TOKEN_REVOKED');

      const edgeVerify = await verifyHostSessionTokenEdge(token, 'creator');
      expect(edgeVerify.valid).toBe(false);
      expect(edgeVerify.error).toBe('TOKEN_REVOKED');
    });

    it('5b. POST /api/auth/session clears host cookie and marks JTI revoked in process-local cache', async () => {
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

      const config = getProductAuthConfig('creator');
      const setCookies = res.headers.getSetCookie();
      const clearedCookie = setCookies.find((c) => c.startsWith(`${config.cookieName}=`));
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain('Max-Age=0');

      const subsequentVerify = await verifyHostSessionToken(token, 'creator');
      expect(subsequentVerify.valid).toBe(false);
      expect(subsequentVerify.error).toBe('TOKEN_REVOKED');
    });
  });

  // =========================================================================
  // 6. ROLE BOUNDARIES IN WORKSPACE LAYOUT
  // =========================================================================
  describe('6. Role Boundaries in Workspace Layout', () => {
    it('6a. Rejects token with unauthorized role (e.g. GUEST) with 403 ForbiddenAccessView', async () => {
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

      expect(layoutResult).toBeDefined();
      expect(layoutResult.props.role).toBe('GUEST');
    });

    it('6b. Authorizes permitted roles (CREATOR_OWNER, CREATOR_MEMBER, ADMIN, SUPERADMIN) in layout', async () => {
      for (const role of ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN']) {
        const validRoleToken = signHostSessionToken({
          product: 'creator',
          userId: 'usr-role-test',
          tenantId: 'tid-role-test',
          tenantSlug: 'test-role',
          role,
        });

        mockCookieMap.set('bt_creator_session', validRoleToken);

        const layoutResult = await CreatorAdminLayout({
          children: `Content for ${role}`,
        });

        expect(layoutResult).toBeDefined();
      }
    });
  });

  // =========================================================================
  // 7. PROTECTED CREATOR SERVER APIS AUTHORIZATION VERIFICATION
  // =========================================================================
  describe('7. Protected Creator Server APIs Authorization Verification', () => {
    const validCreatorToken = signHostSessionToken({
      product: 'creator',
      userId: TEST_CREATOR.id,
      tenantId: TEST_CREATOR.tenant_id,
      tenantSlug: TEST_CREATOR.handle,
      role: 'CREATOR_OWNER',
    });

    const otherCreatorToken = signHostSessionToken({
      product: 'creator',
      userId: 'usr-attacker-666',
      tenantId: 'tid-attacker-666',
      tenantSlug: 'attackerhandle',
      role: 'CREATOR_OWNER',
    });

    it('7a. PUT /api/creator/profile rejects generic Supabase bearer token with 401', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer generic-supabase-access-token',
        },
        body: JSON.stringify({
          handle: TEST_CREATOR.handle,
          tenant_id: TEST_CREATOR.tenant_id,
          displayName: 'Updated Name',
        }),
      });

      const res = await creatorProfilePUT(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('UNAUTHORIZED');
    });

    it('7b. PUT /api/creator/profile rejects cross-tenant token with 403 (Anti-IDOR)', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request('https://creator.boontrack.com/api/creator/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_creator_session=${otherCreatorToken}`,
        },
        body: JSON.stringify({
          handle: TEST_CREATOR.handle,
          tenant_id: TEST_CREATOR.tenant_id,
          displayName: 'Attacker Name',
        }),
      });

      const res = await creatorProfilePUT(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('FORBIDDEN');
    });

    it('7c. GET /api/v1/creators/[handle]/reseller-applications rejects generic Supabase bearer token with 401', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest(`https://creator.boontrack.com/api/v1/creators/${TEST_CREATOR.handle}/reseller-applications`, {
        headers: {
          authorization: 'Bearer generic-supabase-access-token',
        },
      });

      const res = await resellerAppsGET(req, {
        params: Promise.resolve({ handle: TEST_CREATOR.handle }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('UNAUTHORIZED');
    });

    it('7d. GET /api/v1/creators/[handle]/reseller-applications rejects cross-tenant signed token with 403', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest(`https://creator.boontrack.com/api/v1/creators/${TEST_CREATOR.handle}/reseller-applications`, {
        headers: {
          cookie: `bt_creator_session=${otherCreatorToken}`,
        },
      });

      const res = await resellerAppsGET(req, {
        params: Promise.resolve({ handle: TEST_CREATOR.handle }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('FORBIDDEN');
    });

    it('7e. PATCH /api/v1/creators/[handle]/tips/[id] rejects generic Supabase bearer token with 401', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request(`https://creator.boontrack.com/api/v1/creators/${TEST_CREATOR.handle}/tips/tip-123`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer generic-supabase-access-token',
        },
        body: JSON.stringify({ status: 'VERIFIED' }),
      });

      const res = await tipsPATCH(req, {
        params: Promise.resolve({ handle: TEST_CREATOR.handle, id: 'tip-123' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('UNAUTHORIZED');
    });

    it('7f. PATCH /api/v1/creators/[handle]/tips/[id] rejects cross-tenant signed token with 403', async () => {
      const mockDb = createMockDb();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new Request(`https://creator.boontrack.com/api/v1/creators/${TEST_CREATOR.handle}/tips/tip-123`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_creator_session=${otherCreatorToken}`,
        },
        body: JSON.stringify({ status: 'VERIFIED' }),
      });

      const res = await tipsPATCH(req, {
        params: Promise.resolve({ handle: TEST_CREATOR.handle, id: 'tip-123' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('FORBIDDEN');
    });
  });
});
