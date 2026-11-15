/**
 * Test Suite: BoonTrack Independent Product Routing & Simplification Master Suite
 *
 * Authority: Founder / CTO Directive
 * Architecture Philosophy: "ONE PRODUCT DOMAIN · ONE STABLE ENTRY URL · SESSION-DRIVEN WORKSPACE"
 *
 * Target Matrix (14 Scenarios + Cross-Product Security Hardening):
 * 1.  Shop anonymous: https://dashboard.boontrack.com/ -> internal rewrite to /login (status 200, URL preserved).
 * 2.  Shop merchant: https://dashboard.boontrack.com/ -> resolves tenant from authoritative session -> rewrite to /{tenantSlug}/dashboard (status 200).
 * 3.  Shop super-admin: https://dashboard.boontrack.com/ -> resolves admin role -> rewrite to /admin (status 200).
 * 4.  Shop legacy normalization: https://shop.boontrack.com/dashboard -> 302 to https://dashboard.boontrack.com/login.
 * 5.  Shop legacy normalization with tenant: https://shop.boontrack.com/onlineboost/dashboard -> 302 to https://dashboard.boontrack.com/onlineboost.
 * 6.  Shop public storefront: https://shop.boontrack.com/onlineboost -> passes through with x-tenant-slug and x-tenant-id headers (status 200).
 * 7.  Shop product detail: https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale -> passes through with tenant headers (status 200).
 * 8.  Short link root: https://boontrack.com/onlineboost -> 307 temporary redirect to https://shop.boontrack.com/onlineboost with attribution isolation.
 * 9.  Short link product: https://boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale -> 307 temporary redirect preserving full path & query.
 * 10. Creator @handle priority: https://boontrack.com/@influencer_hero -> 301 canonical redirect to https://creator.boontrack.com/@influencer_hero (ahead of short links).
 * 11. Creator /admin anonymous: https://creator.boontrack.com/admin -> internal rewrite to /creator/login (status 200, URL preserved).
 * 12. Creator /admin authenticated: https://creator.boontrack.com/admin with valid creator token -> internal rewrite to /creator/admin (status 200).
 * 13. Studio /desk anonymous: https://studio.boontrack.com/desk -> internal rewrite to /studio/desk (status 200, URL preserved).
 * 14. Studio /desk authenticated: https://studio.boontrack.com/desk with valid studio token -> internal rewrite to /studio/desk (status 200).
 * 15. Cross-product isolation & security:
 *     - Forged cookie on Studio /desk -> treated as unauthenticated.
 *     - Shop merchant token on Studio root -> cannot authorize Studio workspace (rewrites to /studio landing).
 *     - Studio token on Dashboard root -> cannot authorize Shop dashboard (rewrites to /login).
 *     - Shop token on Creator /admin -> cannot authorize Creator admin (rewrites to /creator/login).
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { signHostSessionToken } from '@/lib/auth/host-session';

describe('BoonTrack Independent Product Routing & Simplification Master Suite', () => {
  // =========================================================================
  // PRODUCT 1: SHOP (dashboard.boontrack.com & shop.boontrack.com)
  // =========================================================================
  describe('Product 1: Shop Entry & Navigation Architecture', () => {
    it('Scenario 1: Shop anonymous on https://dashboard.boontrack.com/ rewrites internally to /login without browser redirect', async () => {
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: { host: 'dashboard.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/login');
    });

    it('Scenario 1b: Preserves query parameters when anonymous accesses https://dashboard.boontrack.com/?tab=settings', async () => {
      const req = new NextRequest('https://dashboard.boontrack.com/?tab=settings', {
        headers: { host: 'dashboard.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/login?tab=settings');
    });

    it('Scenario 2: Shop authenticated merchant on https://dashboard.boontrack.com/ rewrites internally to /{tenantSlug}/dashboard', async () => {
      const token = signMerchantSessionToken({ tenantSlug: 'onlineboost', role: 'OWNER' });
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
      expect(rewriteHeader).toContain('/onlineboost/dashboard');
    });

    it('Scenario 3: Shop authenticated Super Admin on https://dashboard.boontrack.com/ rewrites internally to /admin', async () => {
      const token = signMerchantSessionToken({ tenantSlug: 'boontrack', role: 'ADMIN' as any });
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

    it('Scenario 4: Shop legacy normalization: https://shop.boontrack.com/dashboard redirects 302 to https://dashboard.boontrack.com/login', async () => {
      const req = new NextRequest('https://shop.boontrack.com/dashboard', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/login');
    });

    it('Scenario 5: Shop legacy normalization with tenant: https://shop.boontrack.com/onlineboost/dashboard redirects 302 to https://dashboard.boontrack.com/onlineboost', async () => {
      const req = new NextRequest('https://shop.boontrack.com/onlineboost/dashboard', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/onlineboost');
    });

    it('Scenario 6: Shop public storefront: https://shop.boontrack.com/onlineboost passes through with authoritative tenant headers', async () => {
      const req = new NextRequest('https://shop.boontrack.com/onlineboost', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-tenant-slug')).toBe('onlineboost');
      expect(res.headers.get('x-tenant-id')).toBeTruthy();
      expect(res.headers.get('cache-tag')).toBe('tenant-onlineboost');
    });

    it('Scenario 7: Shop product detail: https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale passes through with tenant headers', async () => {
      const req = new NextRequest('https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-tenant-slug')).toBe('onlineboost');
      expect(res.headers.get('x-tenant-id')).toBeTruthy();
    });
  });

  // =========================================================================
  // CANONICAL SHORT LINKS & ATTRIBUTION ISOLATION (boontrack.com/{slug})
  // =========================================================================
  describe('Canonical Short Links & Attribution Isolation', () => {
    it('Scenario 8: Short link root https://boontrack.com/onlineboost returns 307 temporary redirect to https://shop.boontrack.com/onlineboost with referral isolation', async () => {
      const req = new NextRequest('https://boontrack.com/onlineboost?ref=promo_lead&r=reseller_partner', {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toBe('https://shop.boontrack.com/onlineboost?ref=promo_lead&r=reseller_partner');

      // Attribution cookie isolation
      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('ref=promo_lead');
      expect(setCookie).toContain('boontrack_referral_code=promo_lead');
      expect(setCookie).toContain('boontrack_merchant_ref=promo_lead');
      expect(setCookie).toContain('Domain=.boontrack.com');
      expect(setCookie).toContain('bt_reseller_code=reseller_partner');
      expect(setCookie).not.toContain('ref=reseller_partner');
    });

    it('Scenario 9: Short link product https://boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale returns 307 temporary redirect preserving full path', async () => {
      const req = new NextRequest('https://boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale?aff=affiliate_alpha', {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale?aff=affiliate_alpha');

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('ref=affiliate_alpha');
      expect(setCookie).not.toContain('bt_reseller_code');
    });

    it('Scenario 9b: Unknown tenant slug on boontrack.com fails closed to /404-store-not-found rewrite', async () => {
      const req = new NextRequest('https://boontrack.com/unknown-ghost-merchant', {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/404-store-not-found');
    });
  });

  // =========================================================================
  // PRODUCT 2: CREATOR (creator.boontrack.com)
  // =========================================================================
  describe('Product 2: Creator Entry & Canonical Routing Architecture', () => {
    it('Scenario 10: Canonical @handle priority: https://boontrack.com/@influencer_hero redirects 301 to https://creator.boontrack.com/@influencer_hero ahead of short links', async () => {
      const req = new NextRequest('https://boontrack.com/@influencer_hero', {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://creator.boontrack.com/@influencer_hero');
    });

    it('Scenario 10b: Creator host https://creator.boontrack.com/@influencer_hero rewrites internally to /creator/influencer_hero', async () => {
      const req = new NextRequest('https://creator.boontrack.com/@influencer_hero', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/influencer_hero');
    });

    it('Scenario 11: Creator /admin anonymous on https://creator.boontrack.com/admin rewrites internally to /creator/login', async () => {
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
    });

    it('Scenario 12: Creator /admin authenticated on https://creator.boontrack.com/admin with valid token rewrites internally to /creator/admin', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-42',
        tenantId: 'tid-creator-42',
        tenantSlug: 'influencer-alpha',
        role: 'CREATOR_MEMBER',
      });
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_creator_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/admin');
    });
  });

  // =========================================================================
  // PRODUCT 3: STUDIO (studio.boontrack.com)
  // =========================================================================
  describe('Product 3: Studio Entry & Cryptographic Isolation Architecture', () => {
    it('Scenario 13: Studio /desk anonymous on https://studio.boontrack.com/desk redirects to /login', async () => {
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('Scenario 14: Studio /desk authenticated on https://studio.boontrack.com/desk with valid token rewrites to /studio/desk workspace', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-77',
        tenantId: 'tid-studio-77',
        tenantSlug: 'brand-studio',
        role: 'STUDIO_PARTICIPANT',
      });
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio/desk');
    });

    it('Scenario 14b: Authenticated Studio user on https://studio.boontrack.com/ root redirects 307 to /desk', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-77',
        tenantId: 'tid-studio-77',
        tenantSlug: 'brand-studio',
        role: 'STUDIO_PARTICIPANT',
      });
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://studio.boontrack.com/desk');
    });

    it('Scenario 14c: Anonymous Studio user on https://studio.boontrack.com/ root rewrites internally to /studio landing', async () => {
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio');
      expect(rewriteHeader).not.toContain('/studio/');
    });
  });

  // =========================================================================
  // CROSS-PRODUCT SECURITY & PRIVILEGE BOUNDARY VERIFICATION
  // =========================================================================
  describe('Cross-Product Security & Privilege Boundary Verification', () => {
    it('Scenario 15a: Forged/tampered Studio token is rejected and redirects to /login', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.tampered_signature';
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_studio_session=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('Scenario 15b: Shop merchant token visiting Studio root CANNOT authorize Studio workspace (rewrites to /studio landing)', async () => {
      const shopToken = signMerchantSessionToken({ tenantSlug: 'onlineboost', role: 'OWNER' });
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: {
          host: 'studio.boontrack.com',
          cookie: `bt_merchant_token=${shopToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      // Must NOT redirect to /desk; must rewrite to /studio public landing
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/studio');
      expect(res.headers.get('location')).toBeNull();
    });

    it('Scenario 15c: Studio session token visiting Shop dashboard root CANNOT authorize Shop workspace (rewrites to /login)', async () => {
      const studioToken = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-99',
        tenantId: 'tid-onlineboost',
        tenantSlug: 'onlineboost',
        role: 'STUDIO_PARTICIPANT',
      });
      const req = new NextRequest('https://dashboard.boontrack.com/', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_studio_session=${studioToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      // Must NOT rewrite to /onlineboost/dashboard; must treat as anonymous and rewrite to /login
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/login');
      expect(rewriteHeader).not.toContain('/onlineboost/dashboard');
    });

    it('Scenario 15d: Shop merchant token visiting Creator /admin CANNOT authorize Creator workspace (rewrites to /creator/login)', async () => {
      const shopToken = signMerchantSessionToken({ tenantSlug: 'onlineboost', role: 'OWNER' });
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: {
          host: 'creator.boontrack.com',
          cookie: `bt_merchant_token=${shopToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      // Must rewrite to /creator/login
      const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
      expect(rewriteHeader).toContain('/creator/login');
      expect(rewriteHeader).not.toContain('/creator/admin');
    });
  });
});
