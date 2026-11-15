import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('app.boontrack.com Root & Routing Boundaries', () => {
  it('rewrites https://app.boontrack.com/ root to /app-portal with HTTP 200', async () => {
    const req = new NextRequest('https://app.boontrack.com/', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/app-portal');
  });

  it('allows /gym on app.boontrack.com to pass through via Universal pass-through with HTTP 200', async () => {
    const req = new NextRequest('https://app.boontrack.com/gym', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    // Pass-through does not redirect (no Location header, status is 200)
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('allows /margasari on app.boontrack.com to render civic demo with HTTP 200', async () => {
    const req = new NextRequest('https://app.boontrack.com/margasari', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/margasari');
  });

  it('safely renders true 404 for unknown browser navigation path on app.boontrack.com (never redirects to dashboard/shop)', async () => {
    const req = new NextRequest('https://app.boontrack.com/some-unknown-path', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(404);
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404');
    expect(rewriteHeader).toContain('/app-portal/404');
  });

  it('remediates CANONICAL-7-8: app.boontrack.com/unknown-system-path-xyz999 returns isolated 404 and does not match [tenant] slug 404', async () => {
    const req = new NextRequest('https://app.boontrack.com/unknown-system-path-xyz999', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();

    // Verify rewrite points to the isolated App Hub 404 route, never falling through to /[tenant]
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/app-portal/404');
    expect(rewriteHeader).not.toContain('/[tenant]');
    expect(res.headers.get('x-matched-path')).toBe('/app-portal/404');
  });

  it('verifies non-app product domains remain completely unaffected by App Hub 404 routing', async () => {
    // 1. dashboard.boontrack.com anonymous root -> /login (200)
    const dashReq = new NextRequest('https://dashboard.boontrack.com/', {
      headers: { host: 'dashboard.boontrack.com' },
    });
    const dashRes = await middleware(dashReq);
    expect(dashRes.status).toBe(200);
    expect(dashRes.headers.get('x-middleware-rewrite')).toContain('/login');

    // 2. studio.boontrack.com/desk -> /studio/desk (200)
    const studioReq = new NextRequest('https://studio.boontrack.com/desk', {
      headers: { host: 'studio.boontrack.com' },
    });
    const studioRes = await middleware(studioReq);
    expect(studioRes.status).toBe(200);
    expect(studioRes.headers.get('x-middleware-rewrite')).toContain('/studio/desk');

    // 3. creator.boontrack.com/admin -> /creator/login (200)
    const creatorReq = new NextRequest('https://creator.boontrack.com/admin', {
      headers: { host: 'creator.boontrack.com' },
    });
    const creatorRes = await middleware(creatorReq);
    expect(creatorRes.status).toBe(200);
    expect(creatorRes.headers.get('x-middleware-rewrite')).toContain('/creator/login');

    // 4. boontrack.com/@influencer -> 301 canonical redirect
    const handleReq = new NextRequest('https://boontrack.com/@influencer', {
      headers: { host: 'boontrack.com' },
    });
    const handleRes = await middleware(handleReq);
    expect(handleRes.status).toBe(301);
    expect(handleRes.headers.get('location')).toBe('https://creator.boontrack.com/@influencer');
  });
});
