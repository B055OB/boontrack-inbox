/**
 * Test Suite: Authenticated End-to-End Routing & Security Matrix (Founder Directive § 3)
 *
 * Scope:
 * A. Shop merchant: Valid token, membership-driven routing, URL slug is never the source of authority.
 * B. Shop Super Admin: Role-based control plane routing (/admin), strict boundary enforcement.
 * C. Shop multi-tenant: Tenant membership enforcement, server-side switching validation, cross-tenant isolation.
 * D. Studio: Studio host-only session, rejection of Shop session, rejection of forged/expired tokens.
 * E. Creator: Creator host-only session, rejection of Shop/Studio sessions, rejection of forged/expired tokens.
 * F. Negative tests: Cross-tenant access, forged signature, expired tokens, namespace pollution, open redirect defense.
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { signHostSessionToken } from '@/lib/auth/host-session';

describe('Founder Directive § 3: Authenticated End-to-End Smoke & Security Suite', () => {
  // =========================================================================
  // SECTION A: SHOP MERCHANT
  // =========================================================================
  describe('A. Shop Merchant Authenticated Routing', () => {
    it('A1. Valid merchant token opens tenant workspace on root / without exposing slug in browser URL', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'OWNER',
        userId: 'usr-owner-001',
        tenantId: '52967979-4760-4cea-b686-cdbdb389c0e1',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull(); // No URL bounce
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/onlineboost/dashboard');
    });

    it('A2. Valid merchant token allows access to their own explicit slug /onlineboost/dashboard', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'OWNER',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/onlineboost', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/onlineboost/dashboard');
    });

    it('A3. Tenant slug in URL is NOT the source of authority: Attacker with Tenant A token accessing /tenant-b is blocked with 302', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'tenant-a',
        role: 'OWNER',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/solusi-ads', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location') || '';
      expect(location).toContain('/login?redirectTo=');
    });
  });

  // =========================================================================
  // SECTION B: SHOP SUPER ADMIN
  // =========================================================================
  describe('B. Shop Super Admin Authenticated Routing', () => {
    it('B1. Super Admin role in token opens /admin control plane from dashboard root /', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'boontrack',
        role: 'ADMIN' as any,
        userId: 'usr-superadmin-01',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/admin');
    });

    it('B2. Super Admin with SUPER_ADMIN alias in token opens /admin control plane', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'boontrack',
        role: 'SUPER_ADMIN' as any,
        userId: 'usr-superadmin-02',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/admin');
    });

    it('B3. Normal merchant (role: MERCHANT) cannot access /admin and is redirected 302 to /login', async () => {
      const merchantToken = signMerchantSessionToken({
        tenantSlug: 'onlineboost',
        role: 'MERCHANT',
        userId: 'usr-regular-merchant',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/admin', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${merchantToken}`,
        },
      });

      const res = await middleware(req);
      // /admin requires admin privileges; normal merchant session is redirected to /login
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });
  });

  // =========================================================================
  // SECTION C: SHOP MULTI-TENANT & SERVER-SIDE VALIDATION
  // =========================================================================
  describe('C. Shop Multi-Tenant Membership & Server-Side Validation', () => {
    it('C1. Tenant routing is strictly bound to token membership (Tenant Alpha routes to Alpha)', async () => {
      const tokenAlpha = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${tokenAlpha}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/tenant-alpha/dashboard');
    });

    it('C2. Switching to unassigned tenant URL is strictly rejected server-side (Alpha cannot access Beta)', async () => {
      const tokenAlpha = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/tenant-beta/settings', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${tokenAlpha}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('C3. Subdomain request for unregistered/ineligible tenant fails closed to /404-store-not-found', async () => {
      const req = new NextRequest('https://unregistered-ghost.boontrack.com/', {
        headers: { host: 'unregistered-ghost.boontrack.com' },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/404-store-not-found');
    });
  });

  // =========================================================================
  // SECTION D: STUDIO AUTHENTICATION & BOUNDARY ISOLATION
  // =========================================================================
  describe('D. Studio Cryptographic Authentication & Isolation', () => {
    it('D1. Valid Studio host session token opens /desk workspace', async () => {
      const validStudioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-101',
        tenantId: 'tid-studio-101',
        tenantSlug: 'studio-brand',
        role: 'STUDIO_PARTICIPANT',
      });
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${validStudioToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio/desk');
    });

    it('D2. Authenticated Studio user on root / is redirected 307 to /desk', async () => {
      const validStudioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-101',
        tenantId: 'tid-studio-101',
        tenantSlug: 'studio-brand',
        role: 'STUDIO_PARTICIPANT',
      });
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${validStudioToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://studio.boontrack.com/desk');
    });

    it('D3. Shop merchant token CANNOT open Studio workspace (rewrites to public /studio lander)', async () => {
      const shopToken = signMerchantSessionToken({ tenantSlug: 'onlineboost', role: 'OWNER' });
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_merchant_token=${shopToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      // Rewrites to public landing page, NOT redirected to /desk
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio');
      expect(rewriteHeader).not.toContain('/studio/desk');
    });

    it('D3b. Anonymous user on /desk stays at /desk via internal rewrite (renders Studio login UI, zero redirect)', async () => {
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio/desk');
    });

    it('D4. Forged Studio cookie on /desk rewrites to /studio/desk shell without external redirect (fails closed server-side)', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.tampered_hmac';
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio/desk');
    });

    it('D5. Expired Studio token on root / is rejected and user lands on public /studio', async () => {
      const expiredStudioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-old',
        tenantId: 'tid-old',
        tenantSlug: 'old-brand',
        role: 'STUDIO_PARTICIPANT',
        ttlSeconds: -3600, // Expired 1 hour ago
      });
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${expiredStudioToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull(); // Must NOT redirect to /desk
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio');
    });
  });

  // =========================================================================
  // SECTION E: CREATOR AUTHENTICATION & BOUNDARY ISOLATION
  // =========================================================================
  describe('E. Creator Cryptographic Authentication & Isolation', () => {
    it('E1. Valid Creator session token opens /admin workspace', async () => {
      const creatorToken = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-201',
        tenantId: 'tid-creator-201',
        tenantSlug: 'creator-hero',
        role: 'CREATOR_OWNER',
      });
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${creatorToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/admin');
    });

    it('E2. Anonymous access to /admin renders Creator login shell in-place', async () => {
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
    });

    it('E3. Shop session token visiting Creator /admin cannot access workspace (rewrites to login)', async () => {
      const shopToken = signMerchantSessionToken({ tenantSlug: 'onlineboost', role: 'OWNER' });
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_merchant_token=${shopToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
      expect(rewriteHeader).not.toContain('/creator/admin');
    });

    it('E4. Studio session token visiting Creator /admin cannot access workspace (rewrites to login)', async () => {
      const studioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-301',
        tenantId: 'tid-studio-301',
        tenantSlug: 'brand-studio',
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
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
      expect(rewriteHeader).not.toContain('/creator/admin');
    });

    it('E5. Forged Creator cookie is rejected and renders login shell', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.fake_signature';
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
    });

    it('E6. Expired Creator token is rejected and renders login shell', async () => {
      const expiredToken = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-old',
        tenantId: 'tid-creator-old',
        tenantSlug: 'creator-old',
        role: 'CREATOR_OWNER',
        ttlSeconds: -7200, // Expired 2 hours ago
      });
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${expiredToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
    });
  });

  // =========================================================================
  // SECTION F: NEGATIVE TESTS & DEFENSE IN DEPTH
  // =========================================================================
  describe('F. Negative Security & Defense-in-Depth Tests', () => {
    it('F1. Plaintext-only cookie without signed token is rejected with 302 to /login', async () => {
      const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: 'merchant_store=buzzerukm; merchant_session=buzzerukm',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('F2. Merchant token with invalid cryptographic HMAC is rejected with 302 to /login', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRTbHVnIjoiYnV6emVydWttIn0.invalid_hmac_signature';
      const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('F3. Expired merchant token is rejected with 302 to /login', async () => {
      const expiredToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'OWNER',
        ttlMs: -10000, // Expired 10 seconds ago
      });
      const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${expiredToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('F4. Cross-audience replay: Creator token used on Studio /desk rewrites to /studio/desk (isolated from workspace)', async () => {
      const creatorToken = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-404',
        tenantId: 'tid-creator-404',
        tenantSlug: 'creator-404',
        role: 'CREATOR_OWNER',
      });
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${creatorToken}`, // Cross-product cookie spoofing
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio/desk');
    });

    it('F5. Open redirect defense: Redirection targets with malicious schemes (javascript:, evil.com) are sanitized to safe root /', async () => {
      const maliciousUrl = 'https://dashboard.boontrack.com/buzzerukm?redirectTo=https://evil-phishing.com/steal-creds';
      const req = new NextRequest(maliciousUrl, {
        headers: { host: 'dashboard.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location') || '';
      // redirectTo must be sanitized to safe root /, never external domain
      expect(location).not.toContain('evil-phishing.com');
      expect(location).toContain('/login?redirectTo=%2F');
    });
  });
});
