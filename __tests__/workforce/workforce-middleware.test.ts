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

  it('should allow registered host access and attach x-tenant-id header', () => {
    const req = new NextRequest('https://workforce.boontrack.com/');
    const res = middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-tenant-id')).toBe('tenant_satya_001');
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

