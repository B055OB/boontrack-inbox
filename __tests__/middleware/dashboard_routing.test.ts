/**
 * Test Suite: Subdomain Routing Middleware for dashboard.boontrack.com
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('dashboard.boontrack.com Subdomain Routing Middleware', () => {
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

  it('4. Rewrites /buzzerukm to /[tenant]/dashboard (/buzzerukm/dashboard)', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard');
  });

  it('5. Rewrites /buzzerukm/ (trailing slash) to /buzzerukm/dashboard', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard');
  });

  it('6. Rewrites /buzzerukm/settings to /buzzerukm/dashboard/settings', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/settings', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard/settings');
  });

  it('7. Handles /buzzerukm/dashboard without duplicating dashboard segment', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/dashboard', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard');
    expect(rewriteHeader).not.toContain('/buzzerukm/dashboard/dashboard');
  });

  it('8. Handles /buzzerukm/dashboard/settings without duplicating dashboard segment', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm/dashboard/settings', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard/settings');
    expect(rewriteHeader).not.toContain('/dashboard/dashboard');
  });

  it('9. Preserves query parameters during rewrite (e.g. ?tab=orders)', async () => {
    const req = new NextRequest('https://dashboard.boontrack.com/buzzerukm?tab=orders', {
      headers: { host: 'dashboard.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBeDefined();
    expect(rewriteHeader).toContain('/buzzerukm/dashboard?tab=orders');
  });

  it('10. Works 100% dynamically for any tenant slug (Zero Hardcoding)', async () => {
    const testSlugs = ['toko-kreatif', 'klinik-sehat', 'warung-kopi', 'digital-pro'];
    for (const slug of testSlugs) {
      const req = new NextRequest(`https://dashboard.boontrack.com/${slug}`, {
        headers: { host: 'dashboard.boontrack.com' },
      });
      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toContain(`/${slug}/dashboard`);
    }
  });

  it('11. Bypasses static assets and API endpoints without rewriting', async () => {
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
      // Should return regular next() response
      expect(res.status).toBe(200);
    }
  });
});
