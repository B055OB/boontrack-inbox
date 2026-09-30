/**
 * Test Suite: Subdomain Routing & Security Middleware for dashboard.boontrack.com
 * Enforces P0 Broken Access Control Remediation & Tenant Isolation Guard
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('dashboard.boontrack.com Subdomain Routing & Security Middleware', () => {
  it('1. Internally rewrites root / to /login without redirect (stays under dashboard.boontrack.com)', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/login');
  });

  it('2. Preserves query parameters when rewriting root / to /login', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/?ref=promo&from=banner', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/login?ref=promo&from=banner');
  });

  it('3. Internally rewrites /login directly to /login (stays under dashboard.boontrack.com/login)', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/login', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/login');
  });

  it('4. [P0 SECURITY] Blocks unauthenticated / incognito access to /buzzerukm with 302 Redirect to /login', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toBeDefined();
    expect(location).toContain('/login?redirectTo=');
  });

  it('5. [TENANT ISOLATION] Blocks cross-tenant access when Tenant A cookie visits Tenant B with 302 Redirect', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/solusi-ads', {
      headers: {
        host: 'dashboard.boontrack.com',
        cookie: 'merchant_store=tenant-alpha; merchant_session=tenant-alpha',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toBeDefined();
    expect(location).toContain('/login?redirectTo=');
  });

  it('6. Allows authenticated tenant to access their own dashboard (/buzzerukm) and rewrites to /buzzerukm/dashboard', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
      headers: {
        host: 'dashboard.boontrack.com',
        cookie: 'merchant_store=buzzerukm; merchant_session=buzzerukm',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard');
  });

  it('7. Allows authenticated tenant on /buzzerukm/settings and rewrites to /buzzerukm/dashboard/settings', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/settings', {
      headers: {
        host: 'dashboard.boontrack.com',
        cookie: 'merchant_store=buzzerukm; merchant_session=buzzerukm',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard/settings');
  });

  it('8. Handles /buzzerukm/dashboard without duplicating dashboard segment when authenticated', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/dashboard', {
      headers: {
        host: 'dashboard.boontrack.com',
        cookie: 'merchant_store=buzzerukm; merchant_session=buzzerukm',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard');
    expect(rewriteHeader).not.toContain('/buzzerukm/dashboard/dashboard');
  });

  it('9. Preserves query parameters during rewrite for authenticated tenant (e.g. ?tab=orders)', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm?tab=orders', {
      headers: {
        host: 'dashboard.boontrack.com',
        cookie: 'merchant_store=buzzerukm; merchant_session=buzzerukm',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard?tab=orders');
  });

  it('10. Works 100% dynamically for any authenticated tenant slug (Zero Hardcoding)', async () => {
    const testSlugs = ['toko-kreatif', 'klinik-sehat', 'warung-kopi', 'digital-pro'];
    for (const slug of testSlugs) {
      const req = new NextRequest(`https://dashboard.boontrack.com/${slug}`, {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `merchant_store=${slug}; merchant_session=${slug}`,
        },
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toContain(`/${slug}/dashboard`);
    }
  });

  it('11. [P0 SECURITY] Standard domain /:slug/dashboard blocks unauthenticated access with 302 Redirect', async () => {
    const req = new NextRequest('https://boontrack.com/solusi-ads/dashboard', {
      headers: { host: 'boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/login?redirectTo=');
  });

  it('12. [TENANT ISOLATION] Standard domain /:slug/dashboard blocks cross-tenant access with 302 Redirect', async () => {
    const req = new NextRequest('https://boontrack.com/solusi-ads/dashboard', {
      headers: {
        host: 'boontrack.com',
        cookie: 'merchant_store=other-merchant; merchant_session=other-merchant',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/login?redirectTo=');
  });

  it('13. Bypasses static assets and API endpoints without rewriting', async () => {
    const staticPaths = [
      '/_next/static/chunks/app.js',
      '/favicon.ico',
      '/images/logo.png',
      '/images/banner.webp',
      '/api/v1/orders',
    ];

    for (const path of staticPaths) {
      const req = new NextRequest(`https://dashboard.boontrack.com${path}`, {
        headers: { host: 'dashboard.boontrack.com' },
      });
      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeNull();
      expect(res.status).toBe(200);
    }
  });

  it('14. [QUEUE #5.1 HOTFIX] Redirects /:tenantSlug/invoice/:orderId to shop.boontrack.com with 307', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/tanev-food/invoice/ORD-9999?source=wa', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBe('https://shop.boontrack.com/tanev-food/invoice/ORD-9999?source=wa');
  });
});

