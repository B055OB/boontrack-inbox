/**
 * __tests__/workforce/workforce-middleware.test.ts
 * BWM Gate E6: Isolated Workforce Middleware Routing Suite
 *
 * Verifies that:
 * 1. /login is never redirected to dashboard.boontrack.com or any external domain.
 * 2. Unauthenticated requests to "/" redirect locally to "/login".
 * 3. Authenticated requests with bwm_session_token proceed to "/".
 * 4. Static assets and APIs pass freely.
 */

import { NextRequest } from 'next/server';
import { middleware } from '../../workforce-web/middleware';

describe('Workforce Isolated Middleware Routing Suite', () => {
  it('should NOT redirect /login to dashboard.boontrack.com', () => {
    const req = new NextRequest('https://workforce.boontrack.com/login');
    const res = middleware(req);

    // It should allow through (status 200 / next), NOT redirect (status 302/307)
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('should redirect unregistered host access to neutral fallback /login (default-deny)', () => {
    const req = new NextRequest('https://malicious-intruder.com/');
    const res = middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('workforce.boontrack.com/login');
  });

  it('should allow root "/" as PUBLIC ROUTE and attach x-tenant-id header without redirect', () => {
    const req = new NextRequest('https://workforce.boontrack.com/');
    const res = middleware(req);

    // Root is a public route: returns 200, no redirect to /login
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-tenant-id')).toBe('tenant_satya_001');
  });

  it('should redirect unauthenticated access to internal/dashboard routes to /login', () => {
    const req = new NextRequest('https://workforce.boontrack.com/dashboard');
    const res = middleware(req);

    // Protected route without token redirects to /login
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).not.toContain('dashboard.boontrack.com');
  });

  it('should allow authenticated access to internal routes with bwm_session_token', () => {
    const validJwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({
      sub: '00000000-0000-0000-0000-000000000001',
      tenant_id: 'tenant_satya_001',
      role: 'field_personnel',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url')}.mock_sig`;

    const req = new NextRequest('https://workforce.boontrack.com/portal', {
      headers: {
        cookie: `bwm_session_token=${validJwt}`,
      },
    });
    const res = middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('should pass API and static asset routes freely', () => {
    const apiReq = new NextRequest('https://workforce.boontrack.com/api/auth/login');
    const apiRes = middleware(apiReq);
    expect(apiRes.status).toBe(200);

    const manifestReq = new NextRequest('https://workforce.boontrack.com/workforce.webmanifest');
    const manifestRes = middleware(manifestReq);
    expect(manifestRes.status).toBe(200);
  });
});

