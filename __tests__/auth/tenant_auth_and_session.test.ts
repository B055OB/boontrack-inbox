/**
 * __tests__/auth/tenant_auth_and_session.test.ts
 *
 * Comprehensive P0 Regression Test Suite:
 * 1. Canonical Dashboard Login Origin Enforcement (dashboard.boontrack.com)
 * 2. Server-Signed HMAC-SHA256 Merchant & CS Session Tokens
 * 3. Strict Tenant Isolation (Cross-Tenant Rejection)
 * 4. Open Redirect & Path Traversal Defense
 * 5. Role-Based Access Control (Owner vs CS live chat only)
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  signMerchantSessionToken,
  verifyMerchantSessionToken,
  extractMerchantSessionToken,
  validateTenantIdentityConsistency,
} from '@/lib/auth/merchant-session';
import { PUT as putProduct, DELETE as deleteProduct } from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import { PUT as putTheme } from '@/app/api/v1/tenants/[slug]/theme/route';
import { GET as getAnalyticsSummary } from '@/app/api/v1/tenants/[slug]/analytics/summary/route';
import { POST as postResellerCompliance } from '@/app/api/v1/tenants/[slug]/reseller/compliance/route';
import { GET as getResellers } from '@/app/api/v1/tenants/[slug]/resellers/route';
import { PATCH as patchReseller } from '@/app/api/v1/tenants/[slug]/resellers/[id]/route';
import { GET as getTenantOrders } from '@/app/api/v1/tenants/[slug]/orders/route';

describe('P0 Tenant Login & Server-Authoritative Session Security', () => {
  // Test Secret for isolated test runs
  const TEST_SECRET = 'bt_p0_auth_test_secret_key_minimum_32_characters_long!';

  describe('1. Canonical Login Origin Enforcement', () => {
    it('redirects shop.boontrack.com/login (302) to https://dashboard.boontrack.com/login', async () => {
      const req = new NextRequest('https://shop.boontrack.com/login', {
        headers: { host: 'shop.boontrack.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/login');
    });

    it('redirects boontrack.com/login (302) to https://dashboard.boontrack.com/login', async () => {
      const req = new NextRequest('https://boontrack.com/login', {
        headers: { host: 'boontrack.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/login');
    });

    it('preserves query parameters when redirecting non-dashboard login to canonical origin', async () => {
      const req = new NextRequest('https://boontrack.com/login?redirectTo=%2Fsolusi-ads%2Fdashboard&ref=promo', {
        headers: { host: 'boontrack.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe('https://dashboard.boontrack.com/login?redirectTo=%2Fsolusi-ads%2Fdashboard&ref=promo');
    });

    it('allows direct access on canonical origin dashboard.boontrack.com/login with internal rewrite', async () => {
      const req = new NextRequest('https://dashboard.boontrack.com/login', {
        headers: { host: 'dashboard.boontrack.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/login');
    });

    it('allows isolated studio login on studio.boontrack.com/login without cross-subdomain redirect', async () => {
      const req = new NextRequest('https://studio.boontrack.com/login?redirectTo=/desk', {
        headers: { host: 'studio.boontrack.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/login?redirectTo=/desk');
    });
  });

  describe('2. Server-Signed HMAC-SHA256 Token Minting & Verification', () => {
    it('mints and verifies a valid Owner session token', () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        tenantId: 'tenant_123',
        role: 'OWNER',
        name: 'Solusi Ads Owner',
      }, TEST_SECRET);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(2);

      const verification = verifyMerchantSessionToken(token, 'solusi-ads', TEST_SECRET);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
      expect(verification.payload?.tenantSlug).toBe('solusi-ads');
      expect(verification.payload?.role).toBe('OWNER');
    });

    it('mints and verifies a valid CS Agent session token with role CS', () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        tenantId: 'tenant_456',
        role: 'CS',
        userId: 'cs_agent_789',
        name: 'CS Officer Siti',
        phone: '6281234567890',
      }, TEST_SECRET);

      const verification = verifyMerchantSessionToken(token, 'buzzerukm', TEST_SECRET);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
      expect(verification.payload?.tenantSlug).toBe('buzzerukm');
      expect(verification.payload?.role).toBe('CS');
      expect(verification.payload?.userId).toBe('cs_agent_789');
    });

    it('rejects forged / manipulated session token (signature mismatch)', () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'OWNER',
      }, TEST_SECRET);

      const [payload, sig] = token.split('.');
      // Tamper with payload (e.g. attacker changing tenant to solusi-ads)
      const tamperedPayload = Buffer.from(JSON.stringify({ tenantSlug: 'solusi-ads', role: 'OWNER', exp: Date.now() + 100000 })).toString('base64url');
      const forgedToken = `${tamperedPayload}.${sig}`;

      const verification = verifyMerchantSessionToken(forgedToken, 'solusi-ads', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('Tanda tangan sesi merchant tidak sah');
    });

    it('rejects expired session token', () => {
      const expiredToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'OWNER',
        ttlMs: -1000, // expired 1s ago
      }, TEST_SECRET);

      const verification = verifyMerchantSessionToken(expiredToken, 'buzzerukm', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('kedaluwarsa');
    });

    it('rejects missing or non-string tokens', () => {
      expect(verifyMerchantSessionToken(null as any).valid).toBe(false);
      expect(verifyMerchantSessionToken(undefined as any).valid).toBe(false);
      expect(verifyMerchantSessionToken('').valid).toBe(false);
      expect(verifyMerchantSessionToken('invalid-format-no-dot').valid).toBe(false);
    });
  });

  describe('3. Strict Tenant Isolation (Zero Cross-Tenant Leakage)', () => {
    it('blocks Tenant A session token from accessing Tenant B dashboard (403 Forbidden)', () => {
      const tokenTenantA = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = verifyMerchantSessionToken(tokenTenantA, 'tenant-beta', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(403);
      expect(verification.error).toContain('tidak cocok dengan target toko');
    });

    it('middleware blocks cross-tenant access when Tenant A bt_merchant_token visits Tenant B with 302 Redirect', async () => {
      const tokenTenantA = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
      });

      const req = new NextRequest('https://dashboard.boontrack.com/solusi-ads', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${tokenTenantA}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('middleware permits valid bt_merchant_token for matching tenant', async () => {
      const validToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'OWNER',
      });

      const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${validToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toContain('/buzzerukm/dashboard');
    });
  });

  describe('4. Token Extraction Invariants', () => {
    it('extracts token from bt_merchant_token cookie', () => {
      const candidate = 'eyJhbGciOiJIUzI1NiJ9.signature123';
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          cookie: `bt_merchant_token=${candidate}; other_cookie=xyz`,
        },
      });
      expect(extractMerchantSessionToken(req)).toBe(candidate);
    });

    it('extracts token from x-merchant-token header', () => {
      const candidate = 'eyJhbGciOiJIUzI1NiJ9.signature123';
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          'x-merchant-token': candidate,
        },
      });
      expect(extractMerchantSessionToken(req)).toBe(candidate);
    });

    it('extracts token from Authorization: Bearer when formatted as single dot token', () => {
      const candidate = 'payloadPart.sigPart';
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          authorization: `Bearer ${candidate}`,
        },
      });
      expect(extractMerchantSessionToken(req)).toBe(candidate);
    });

    it('ignores Supabase 3-part JWTs in Authorization header', () => {
      const supabaseJwt = 'header.payload.signature';
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          authorization: `Bearer ${supabaseJwt}`,
        },
      });
      expect(extractMerchantSessionToken(req)).toBe('');
    });
  });

  describe('5. Open Redirect Defense on Login Destinations', () => {
    function sanitizeDestination(redirectTo?: string | null, cleanSlug: string = 'buzzerukm'): string {
      const defaultDest = `/${cleanSlug}/dashboard`;
      if (!redirectTo || typeof redirectTo !== 'string') return defaultDest;
      const clean = redirectTo.trim();
      if (
        clean.startsWith('/') &&
        !clean.startsWith('//') &&
        !clean.includes('://') &&
        !clean.includes('\\')
      ) {
        return clean;
      }
      return defaultDest;
    }

    it('allows valid relative path destination /solusi-ads/dashboard', () => {
      expect(sanitizeDestination('/solusi-ads/dashboard')).toBe('/solusi-ads/dashboard');
    });

    it('allows valid relative path destination /margasari/desk', () => {
      expect(sanitizeDestination('/margasari/desk', 'margasari')).toBe('/margasari/desk');
    });

    it('defends against absolute protocol open redirects (https://evil.com)', () => {
      expect(sanitizeDestination('https://evil.com/phish')).toBe('/buzzerukm/dashboard');
    });

    it('defends against protocol-relative open redirects (//evil.com)', () => {
      expect(sanitizeDestination('//evil.com/phish')).toBe('/buzzerukm/dashboard');
    });

    it('defends against backslash bypass attempts (\\evil.com)', () => {
      expect(sanitizeDestination('\\evil.com')).toBe('/buzzerukm/dashboard');
    });
  });

  describe('6. Production Secret Resolution Fails Closed', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns empty secrets and throws error when secrets are absent in production', () => {
      const {
        getMerchantSessionSecrets,
        getMerchantSessionSecret,
      } = require('@/lib/auth/merchant-session');

      process.env.NODE_ENV = 'production';
      delete process.env.MERCHANT_SESSION_SECRET;
      delete process.env.MERCHANT_SESSION_SECRETS;
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;
      delete process.env.NEXTAUTH_SECRET;

      const secrets = getMerchantSessionSecrets();
      expect(secrets).toEqual([]);
      expect(() => getMerchantSessionSecret()).toThrow('Merchant session signing secret is unconfigured in production.');
    });

    it('verifyMerchantSessionToken fails closed when candidate secrets array is empty', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.MERCHANT_SESSION_SECRET;
      delete process.env.MERCHANT_SESSION_SECRETS;
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;
      delete process.env.NEXTAUTH_SECRET;

      const res = verifyMerchantSessionToken('somepayload.somesig', 'demo-store');
      expect(res.valid).toBe(false);
      expect(res.status).toBe(401);
      expect(res.error).toContain('Konfigurasi keamanan sesi belum lengkap pada server');
    });
  });

  describe('7. Server-Side Logout Endpoint (POST /api/v1/auth/logout)', () => {
    it('successfully expires bt_merchant_token and legacy session cookies with past date and maxAge=0', async () => {
      const { POST: logoutHandler } = await import('@/app/api/v1/auth/logout/route');
      const req = new NextRequest('https://dashboard.boontrack.com/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          cookie: 'bt_merchant_token=some_token; merchant_store=buzzerukm',
        },
      });

      const res = await logoutHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('Logged out');

      // Verify Set-Cookie header contains expired bt_merchant_token
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.length).toBeGreaterThan(0);
      const tokenCookie = setCookies.find((c) => c.startsWith('bt_merchant_token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('Max-Age=0');
      expect(tokenCookie).toContain('HttpOnly');
    });
  });

  describe('8. Login Rate Limiter (Brute-Force Defense)', () => {
    it('blocks excessive failed PIN attempts (5 per 15 min window) with isLimited: true', () => {
      const {
        enforceLoginRateLimit,
        recordLoginFailure,
        recordLoginSuccess,
        clearAllRateLimits,
      } = require('@/lib/auth/rate-limiter');

      clearAllRateLimits();
      const testSlug = 'brute-test-tenant';
      const req = new NextRequest('https://dashboard.boontrack.com/login', {
        headers: { 'x-forwarded-for': '198.51.100.99' },
      });

      // 1. Initial attempt is allowed
      const check1 = enforceLoginRateLimit(req, testSlug);
      expect(check1.isLimited).toBe(false);

      // 2. Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        recordLoginFailure(req, testSlug);
      }

      // 3. 6th attempt is blocked
      const checkBlocked = enforceLoginRateLimit(req, testSlug);
      expect(checkBlocked.isLimited).toBe(true);
      expect(checkBlocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(checkBlocked.error).toContain('Terlalu banyak percobaan PIN');

      // 4. Success resets tenant failure counter
      recordLoginSuccess(req, testSlug);
      const checkReset = enforceLoginRateLimit(req, testSlug);
      expect(checkReset.isLimited).toBe(false);
    });
  });

  describe('9. Server-Side Role-Based Access Control (RBAC)', () => {
    const { authorizeMerchantRequest } = require('@/lib/auth/merchant-session');

    it('rejects unauthenticated request with 401 Unauthorized', () => {
      const req = new NextRequest('https://dashboard.boontrack.com/api/orders');
      const result = authorizeMerchantRequest(req, 'solusi-ads', ['OWNER', 'MERCHANT']);
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(401);
    });

    it('rejects cross-tenant request with 403 Forbidden', () => {
      const token = signMerchantSessionToken({ tenantSlug: 'tenant-alpha', role: 'OWNER' });
      const req = new NextRequest('https://dashboard.boontrack.com/api/orders', {
        headers: { cookie: `bt_merchant_token=${token}` },
      });
      const result = authorizeMerchantRequest(req, 'tenant-beta', ['OWNER', 'MERCHANT']);
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
    });

    it('rejects CS role from Owner/Merchant restricted sensitive operations with 403 Forbidden', () => {
      const csToken = signMerchantSessionToken({ tenantSlug: 'solusi-ads', role: 'CS' });
      const req = new NextRequest('https://dashboard.boontrack.com/api/v1/tenants/solusi-ads/products', {
        headers: { cookie: `bt_merchant_token=${csToken}` },
      });
      const result = authorizeMerchantRequest(req, 'solusi-ads', ['OWNER', 'MERCHANT']);
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
    });

    it('allows OWNER role for Owner/Merchant restricted operations', () => {
      const ownerToken = signMerchantSessionToken({ tenantSlug: 'solusi-ads', role: 'OWNER' });
      const req = new NextRequest('https://dashboard.boontrack.com/api/v1/tenants/solusi-ads/products', {
        headers: { cookie: `bt_merchant_token=${ownerToken}` },
      });
      const result = authorizeMerchantRequest(req, 'solusi-ads', ['OWNER', 'MERCHANT']);
      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.payload.role).toBe('OWNER');
        expect(result.payload.tenantSlug).toBe('solusi-ads');
      }
    });

    it('allows CS role for endpoints explicitly permitting CS (e.g. read masked settings / livechat desk)', () => {
      const csToken = signMerchantSessionToken({ tenantSlug: 'solusi-ads', role: 'CS' });
      const req = new NextRequest('https://dashboard.boontrack.com/api/v1/tenants/solusi-ads/settings', {
        headers: { cookie: `bt_merchant_token=${csToken}` },
      });
      const result = authorizeMerchantRequest(req, 'solusi-ads', ['OWNER', 'MERCHANT', 'CS', 'OPERATOR']);
      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.payload.role).toBe('CS');
      }
    });
  });

  describe('10. Direct Route Handler Security Verification (P0 Phase 2.5 Security Patch)', () => {
    const TARGET_SLUG = 'solusi-ads';
    const OTHER_SLUG = 'other-tenant';

    describe('10.1 products/[id] (PUT & DELETE)', () => {
      it('rejects anonymous PUT request with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/products/prod-123`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hacked Product' }),
        });
        const res = await putProduct(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'prod-123' }) });
        expect(res.status).toBe(401);
      });

      it('rejects plaintext cookie on PUT with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/products/prod-123`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `merchant_store=${TARGET_SLUG}`,
          },
          body: JSON.stringify({ name: 'Hacked Product' }),
        });
        const res = await putProduct(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'prod-123' }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant token on PUT with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/products/prod-123`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${attackerToken}`,
          },
          body: JSON.stringify({ name: 'Hacked Product' }),
        });
        const res = await putProduct(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'prod-123' }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from mutating products with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/products/prod-123`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${csToken}`,
          },
          body: JSON.stringify({ name: 'Hacked Product' }),
        });
        const res = await putProduct(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'prod-123' }) });
        expect(res.status).toBe(403);
      });

      it('rejects anonymous DELETE request with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/products/prod-123`, {
          method: 'DELETE',
        });
        const res = await deleteProduct(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'prod-123' }) });
        expect(res.status).toBe(401);
      });
    });

    describe('10.2 theme (PUT)', () => {
      it('rejects anonymous PUT request with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visual_theme: 'midnight_luxe' }),
        });
        const res = await putTheme(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant theme change with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/theme`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${attackerToken}`,
          },
          body: JSON.stringify({ visual_theme: 'midnight_luxe' }),
        });
        const res = await putTheme(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from mutating theme with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/theme`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${csToken}`,
          },
          body: JSON.stringify({ visual_theme: 'midnight_luxe' }),
        });
        const res = await putTheme(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });
    });

    describe('10.3 analytics/summary (GET)', () => {
      it('rejects anonymous GET request with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/analytics/summary`);
        const res = await getAnalyticsSummary(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects plaintext cookie with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/analytics/summary`, {
          headers: { cookie: `merchant_store=${TARGET_SLUG}` },
        });
        const res = await getAnalyticsSummary(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant analytics read with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/analytics/summary`, {
          headers: { cookie: `bt_merchant_token=${attackerToken}` },
        });
        const res = await getAnalyticsSummary(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from viewing omzet analytics with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/analytics/summary`, {
          headers: { cookie: `bt_merchant_token=${csToken}` },
        });
        const res = await getAnalyticsSummary(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });
    });

    describe('10.4 reseller/compliance (POST)', () => {
      it('rejects anonymous POST request with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/reseller/compliance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted: true }),
        });
        const res = await postResellerCompliance(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant compliance acceptance with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/reseller/compliance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${attackerToken}`,
          },
          body: JSON.stringify({ accepted: true }),
        });
        const res = await postResellerCompliance(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from accepting reseller compliance with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/reseller/compliance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${csToken}`,
          },
          body: JSON.stringify({ accepted: true }),
        });
        const res = await postResellerCompliance(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });
    });

    describe('10.5 resellers (GET & PATCH)', () => {
      it('rejects anonymous GET resellers with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/resellers`);
        const res = await getResellers(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects plaintext cookie on GET resellers with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/resellers`, {
          headers: { cookie: `merchant_store=${TARGET_SLUG}` },
        });
        const res = await getResellers(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant GET resellers with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/resellers`, {
          headers: { cookie: `bt_merchant_token=${attackerToken}` },
        });
        const res = await getResellers(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from reading resellers list with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/resellers`, {
          headers: { cookie: `bt_merchant_token=${csToken}` },
        });
        const res = await getResellers(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects anonymous PATCH reseller status with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/resellers/app-123`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'APPROVED' }),
        });
        const res = await patchReseller(req, { params: Promise.resolve({ slug: TARGET_SLUG, id: 'app-123' }) });
        expect(res.status).toBe(401);
      });
    });

    describe('10.6 tenants/[slug]/orders (GET)', () => {
      it('rejects anonymous orders read with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/orders`);
        const res = await getTenantOrders(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects plaintext cookie with 401 Unauthorized', async () => {
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/orders`, {
          headers: { cookie: `merchant_store=${TARGET_SLUG}` },
        });
        const res = await getTenantOrders(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(401);
      });

      it('rejects cross-tenant token with 403 Forbidden', async () => {
        const attackerToken = signMerchantSessionToken({ tenantSlug: OTHER_SLUG, role: 'OWNER' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/orders`, {
          headers: { cookie: `bt_merchant_token=${attackerToken}` },
        });
        const res = await getTenantOrders(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });

      it('rejects CS role from reading tenant orders list with 403 Forbidden', async () => {
        const csToken = signMerchantSessionToken({ tenantSlug: TARGET_SLUG, role: 'CS' });
        const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${TARGET_SLUG}/orders`, {
          headers: { cookie: `bt_merchant_token=${csToken}` },
        });
        const res = await getTenantOrders(req, { params: Promise.resolve({ slug: TARGET_SLUG }) });
        expect(res.status).toBe(403);
      });
    });
  });

  describe('11. Tenant Identity Consistency & Canonical Database Invariants (Pre-Staging Final Patch)', () => {
    const CANONICAL_RECORD = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'solusi-ads',
    };

    describe('11.1 validateTenantIdentityConsistency unit invariants', () => {
      it('accepts consistent dual-identifier session payload matching canonical record', () => {
        const payload: any = {
          tenantSlug: 'solusi-ads',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, CANONICAL_RECORD);
        expect(res.valid).toBe(true);
        expect(res.status).toBe(200);
      });

      it('rejects contradictory session where slug matches but UUID differs (Fail-Closed)', () => {
        const payload: any = {
          tenantSlug: 'solusi-ads',
          tenantId: 'attacker-uuid-9999-9999-999999999999',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
        expect(res.error).toContain('Kontradiksi identitas tenant');
      });

      it('rejects contradictory session where UUID matches but slug differs (Fail-Closed)', () => {
        const payload: any = {
          tenantSlug: 'attacker-store-slug',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
        expect(res.error).toContain('Kontradiksi identitas tenant');
      });

      it('preserves deliberate legacy-token compatibility for tokens containing only slug when agreeing with canonical record', () => {
        const legacyPayload: any = {
          tenantSlug: 'solusi-ads',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(legacyPayload, CANONICAL_RECORD);
        expect(res.valid).toBe(true);
        expect(res.status).toBe(200);
      });

      it('preserves deliberate legacy-token compatibility for tokens containing only UUID when agreeing with canonical record', () => {
        const legacyPayload: any = {
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(legacyPayload, CANONICAL_RECORD);
        expect(res.valid).toBe(true);
        expect(res.status).toBe(200);
      });

      it('rejects legacy token with only slug when slug contradicts canonical record', () => {
        const legacyPayload: any = {
          tenantSlug: 'other-store',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(legacyPayload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });

      it('rejects legacy token with only UUID when UUID contradicts canonical record', () => {
        const legacyPayload: any = {
          tenantId: 'other-uuid-0000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(legacyPayload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });

      it('fails closed when canonical tenant record is unresolved (null or undefined)', () => {
        const payload: any = {
          tenantSlug: 'solusi-ads',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, null);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });

      it('fails closed when canonical record has empty identifiers', () => {
        const payload: any = {
          tenantSlug: 'solusi-ads',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, { id: '', slug: '' });
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });

      it('fails closed when token payload has neither slug nor UUID', () => {
        const payload: any = {
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });

      it('rejects cross-tenant access from unrelated tenant (both slug & UUID belong to tenant-beta)', () => {
        const payload: any = {
          tenantSlug: 'tenant-beta',
          tenantId: '770e8400-e29b-41d4-a716-999999999999',
          role: 'OWNER',
        };
        const res = validateTenantIdentityConsistency(payload, CANONICAL_RECORD);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(403);
      });
    });

    describe('11.2 verifyMerchantSessionToken canonical verification integration', () => {
      it('successfully verifies token when both slug and UUID agree with canonical record', () => {
        const token = signMerchantSessionToken({
          tenantSlug: 'solusi-ads',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        }, TEST_SECRET);

        const verification = verifyMerchantSessionToken(token, 'solusi-ads', TEST_SECRET, CANONICAL_RECORD);
        expect(verification.valid).toBe(true);
        expect(verification.status).toBe(200);
      });

      it('rejects signed token with 403 when slug matches URL but UUID contradicts canonical record', () => {
        const contradictoryToken = signMerchantSessionToken({
          tenantSlug: 'solusi-ads',
          tenantId: 'imposter-uuid-1111',
          role: 'OWNER',
        }, TEST_SECRET);

        const verification = verifyMerchantSessionToken(contradictoryToken, 'solusi-ads', TEST_SECRET, CANONICAL_RECORD);
        expect(verification.valid).toBe(false);
        expect(verification.status).toBe(403);
        expect(verification.error).toContain('Kontradiksi identitas tenant');
      });

      it('rejects signed token with 403 when UUID matches canonical but slug contradicts canonical record', () => {
        const contradictoryToken = signMerchantSessionToken({
          tenantSlug: 'imposter-slug',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'OWNER',
        }, TEST_SECRET);

        const verification = verifyMerchantSessionToken(contradictoryToken, 'imposter-slug', TEST_SECRET, CANONICAL_RECORD);
        expect(verification.valid).toBe(false);
        expect(verification.status).toBe(403);
        expect(verification.error).toContain('Kontradiksi identitas tenant');
      });

      it('accepts safe legacy single-identifier token when matching canonical record', () => {
        const legacyToken = signMerchantSessionToken({
          tenantSlug: 'solusi-ads',
          role: 'OWNER',
        }, TEST_SECRET);

        const verification = verifyMerchantSessionToken(legacyToken, 'solusi-ads', TEST_SECRET, CANONICAL_RECORD);
        expect(verification.valid).toBe(true);
        expect(verification.status).toBe(200);
      });
    });
  });
});
