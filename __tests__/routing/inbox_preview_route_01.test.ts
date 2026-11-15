/**
 * Test Suite: INBOX-PREVIEW-ROUTE-01 & Creator Preview/Staging Isolation Verification
 *
 * Mandate:
 * 1. Eliminate all hardcoded / unvalidated redirects or silent fallbacks from Vercel Preview
 *    (*.vercel.app) or Staging (staging.boontrack.com) to dashboard.boontrack.com,
 *    shop.boontrack.com, creator.boontrack.com, or Production domains.
 * 2. Ensure active preview/staging origin is strictly preserved across /login, /dashboard,
 *    Reseller, Creator, Creator Reseller, and cross-module navigation.
 * 3. Enforce strict tenant isolation (Tenant A cannot access Tenant B dashboard).
 * 4. Verify relative URLs and environment-aware link builders.
 * 5. Verify host-only cookie scoping (zero leakage of wildcard .boontrack.com from preview/staging).
 */

import { NextRequest } from 'next/server';
import { middleware, isPreviewOrStagingHost } from '@/middleware';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { getStorefrontUrl, isPreviewOrStagingDomain } from '@/lib/utils/storefrontUrl';
import { getDashboardBaseUrl, getStorefrontBaseUrl } from '@/lib/platform-urls';

describe('INBOX-PREVIEW-ROUTE-01: Preview & Staging Origin-Preserving Routing', () => {
  const PREVIEW_HOST = 'boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app';
  const STAGING_HOST = 'staging.boontrack.com';
  const PROD_DASHBOARD_HOST = 'dashboard.boontrack.com';
  const PROD_SHOP_HOST = 'shop.boontrack.com';
  const PROD_CREATOR_HOST = 'creator.boontrack.com';

  describe('1. Host Classification Guard', () => {
    it('correctly identifies Vercel preview hosts', () => {
      expect(isPreviewOrStagingHost(PREVIEW_HOST)).toBe(true);
      expect(isPreviewOrStagingHost('boontrack-inbox-dcpfvhem4-boontrack.vercel.app')).toBe(true);
    });

    it('correctly identifies Staging hosts', () => {
      expect(isPreviewOrStagingHost(STAGING_HOST)).toBe(true);
      expect(isPreviewOrStagingHost('staging.boontrack.com')).toBe(true);
      expect(isPreviewOrStagingHost('alpha.staging.boontrack.com')).toBe(true);
    });

    it('does NOT mark production hosts as preview/staging', () => {
      expect(isPreviewOrStagingHost(PROD_DASHBOARD_HOST)).toBe(false);
      expect(isPreviewOrStagingHost(PROD_SHOP_HOST)).toBe(false);
      expect(isPreviewOrStagingHost(PROD_CREATOR_HOST)).toBe(false);
      expect(isPreviewOrStagingHost('boontrack.com')).toBe(false);
    });
  });

  describe('2. Module A: /login & Dashboard Origin Preservation', () => {
    it('Preview: Visiting /login does NOT redirect to dashboard.boontrack.com (stays on preview)', async () => {
      const req = new NextRequest(`https://${PREVIEW_HOST}/login`, {
        headers: { host: PREVIEW_HOST },
      });

      const res = await middleware(req);
      // Status 200 pass-through to render app/login/page.tsx
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Staging: Visiting /login does NOT redirect to dashboard.boontrack.com (stays on staging)', async () => {
      const req = new NextRequest(`https://${STAGING_HOST}/login`, {
        headers: { host: STAGING_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Production: Non-dashboard host (shop.boontrack.com/login) redirects 302 to canonical dashboard', async () => {
      const req = new NextRequest(`https://${PROD_SHOP_HOST}/login`, {
        headers: { host: PROD_SHOP_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/login');
    });

    it('Preview: Unauthenticated access to /[tenant]/dashboard redirects to /login on active preview origin', async () => {
      const req = new NextRequest(`https://${PREVIEW_HOST}/toko-demo/dashboard`, {
        headers: { host: PREVIEW_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBeDefined();
      expect(location).toContain(`https://${PREVIEW_HOST}/login?redirectTo=`);
      expect(location).not.toContain('dashboard.boontrack.com');
    });

    it('Preview: Authenticated access to /[tenant]/dashboard passes through on active preview origin', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'toko-demo',
        role: 'OWNER',
        ttlMs: 3600000,
      });

      const req = new NextRequest(`https://${PREVIEW_HOST}/toko-demo/dashboard`, {
        headers: { host: PREVIEW_HOST },
      });
      req.cookies.set('bt_merchant_token', token);

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Tenant Isolation: Tenant A cannot access Tenant B dashboard on Preview', async () => {
      const tokenA = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
        ttlMs: 3600000,
      });

      const req = new NextRequest(`https://${PREVIEW_HOST}/tenant-beta/dashboard`, {
        headers: { host: PREVIEW_HOST },
      });
      req.cookies.set('bt_merchant_token', tokenA);

      const res = await middleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain(`https://${PREVIEW_HOST}/login?redirectTo=`);
    });
  });

  describe('3. Module C: Creator & /@handle Origin Preservation', () => {
    it('Preview: Visiting /@mycreator rewrites to /creator/mycreator on active preview origin', async () => {
      const req = new NextRequest(`https://${PREVIEW_HOST}/@mycreator`, {
        headers: { host: PREVIEW_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain(`https://${PREVIEW_HOST}/creator/mycreator`);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Staging: Visiting /@mycreator rewrites to /creator/mycreator on active staging origin', async () => {
      const req = new NextRequest(`https://${STAGING_HOST}/@mycreator`, {
        headers: { host: STAGING_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain(`https://${STAGING_HOST}/creator/mycreator`);
      expect(res.headers.get('location')).toBeNull();
    });

    it('Production: Non-creator host (shop.boontrack.com/@mycreator) 301 redirects to creator.boontrack.com', async () => {
      const req = new NextRequest(`https://${PROD_SHOP_HOST}/@mycreator`, {
        headers: { host: PROD_SHOP_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://creator.boontrack.com/@mycreator');
    });

    it('Creator Subdomain: creator.boontrack.com/login rewrites to /creator/login', async () => {
      const req = new NextRequest(`https://${PROD_CREATOR_HOST}/login`, {
        headers: { host: PROD_CREATOR_HOST },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/creator/login');
    });
  });

  describe('4. Cookie Isolation Guard (Zero Wildcard Domain on Preview/Staging)', () => {
    it('Preview: Referral cookies do NOT attach domain: .boontrack.com', async () => {
      const req = new NextRequest(`https://${PREVIEW_HOST}/?ref=creator_partner`, {
        headers: { host: PREVIEW_HOST },
      });

      const res = await middleware(req);
      const refCookie = res.cookies.get('ref');
      expect(refCookie).toBeDefined();
      expect(refCookie?.value).toBe('creator_partner');

      const setCookieHeader = res.headers.get('set-cookie') || '';
      expect(setCookieHeader).not.toContain('Domain=.boontrack.com');
      expect(setCookieHeader).not.toContain('domain=.boontrack.com');
    });

    it('Staging: Referral cookies do NOT attach domain: .boontrack.com', async () => {
      const req = new NextRequest(`https://${STAGING_HOST}/?ref=staging_tester`, {
        headers: { host: STAGING_HOST },
      });

      const res = await middleware(req);
      const refCookie = res.cookies.get('ref');
      expect(refCookie).toBeDefined();
      expect(refCookie?.value).toBe('staging_tester');

      const setCookieHeader = res.headers.get('set-cookie') || '';
      expect(setCookieHeader).not.toContain('Domain=.boontrack.com');
      expect(setCookieHeader).not.toContain('domain=.boontrack.com');
    });

    it('Production: Referral cookies DO attach domain: .boontrack.com on boontrack.com', async () => {
      const req = new NextRequest(`https://boontrack.com/?ref=prod_affiliate`, {
        headers: { host: 'boontrack.com' },
      });

      const res = await middleware(req);
      const setCookieHeader = res.headers.get('set-cookie') || '';
      expect(setCookieHeader).toContain('Domain=.boontrack.com');
    });
  });

  describe('5. Client Link Helper Isolation (Storefront & Dashboard URL Resolvers)', () => {
    const originalWindow = global.window;

    afterEach(() => {
      // @ts-ignore
      global.window = originalWindow;
    });

    it('getStorefrontUrl returns active preview origin when executed in preview browser context', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      global.window = {
        location: {
          hostname: PREVIEW_HOST,
          origin: `https://${PREVIEW_HOST}`,
        },
      };

      expect(isPreviewOrStagingDomain(PREVIEW_HOST)).toBe(true);
      const url = getStorefrontUrl('om-budi');
      expect(url).toBe(`https://${PREVIEW_HOST}/om-budi`);
    });

    it('getStorefrontUrl returns active staging origin when executed in staging browser context', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      global.window = {
        location: {
          hostname: STAGING_HOST,
          origin: `https://${STAGING_HOST}`,
        },
      };

      const url = getStorefrontUrl('om-budi');
      expect(url).toBe(`https://${STAGING_HOST}/om-budi`);
    });

    it('getDashboardBaseUrl returns active preview origin in preview browser context', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      global.window = {
        location: {
          hostname: PREVIEW_HOST,
          origin: `https://${PREVIEW_HOST}`,
        },
      };

      expect(getDashboardBaseUrl()).toBe(`https://${PREVIEW_HOST}`);
      expect(getStorefrontBaseUrl()).toBe(`https://${PREVIEW_HOST}`);
    });
  });
});
