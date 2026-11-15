import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('app.boontrack.com Root & Routing Boundaries', () => {
  it('rewrites https://app.boontrack.com/ root to /app-portal', async () => {
    const req = new NextRequest('https://app.boontrack.com/', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    // In Next.js middleware, NextResponse.rewrite sets x-middleware-rewrite header
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/app-portal');
  });

  it('allows /gym on app.boontrack.com to pass through via Universal pass-through', async () => {
    const req = new NextRequest('https://app.boontrack.com/gym', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    // Pass-through does not redirect (no Location header, status is 200)
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('allows /margasari on app.boontrack.com to render civic demo', async () => {
    const req = new NextRequest('https://app.boontrack.com/margasari', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.headers.get('location')).toBeNull();
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/margasari');
  });

  it('safely renders 404 for unknown browser navigation path on app.boontrack.com (never redirects to dashboard/shop)', async () => {
    const req = new NextRequest('https://app.boontrack.com/some-unknown-path', {
      headers: { host: 'app.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res.headers.get('location')).toBeNull();
    const rewriteHeader = res.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toContain('/404');
  });
});
