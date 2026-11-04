/**
 * __tests__/workforce/e6-auth-regression.test.ts
 * BWM Gate E6: End-to-End Auth Flow & Tenant Resolution Regression Suite
 *
 * Verifies:
 * 1. Login flow & hardened HttpOnly cookies (bwm_session_token, bwm_csrf_token).
 * 2. Dynamic multi-tenant resolution (zero hardcoding).
 * 3. Session query via /api/auth/me.
 * 4. Session refresh via /api/auth/refresh.
 * 5. Standalone callback via /api/auth/callback without dashboard redirect.
 * 6. Logout cookie invalidation via /api/auth/logout.
 * 7. Zero cross-domain redirect leakage to dashboard.boontrack.com.
 */

import { NextRequest } from 'next/server';
import { POST as loginHandler } from '../../workforce-web/app/api/auth/login/route';
import { GET as meHandler } from '../../workforce-web/app/api/auth/me/route';
import { POST as refreshHandler } from '../../workforce-web/app/api/auth/refresh/route';
import { POST as logoutHandler } from '../../workforce-web/app/api/auth/logout/route';
import { GET as callbackHandler } from '../../workforce-web/app/api/auth/callback/route';
import { middleware } from '../../workforce-web/middleware';

describe('BWM Gate E6: Auth Flow & Tenant Resolution Regression Suite', () => {
  const TEST_TENANT_A = 'satya';
  const TEST_TENANT_B = 'garda-nusantara';
  const TEST_NIK = '3171012345678901';
  const TEST_SUPERVISOR_PIN = '987654';
  const TEST_FIELD_PIN = '123456';

  // ─── 1. Login & Hardened Cookie Verification ──────────────────────────────
  describe('1. Login & Role Resolution', () => {
    it('successfully authenticates field personnel with supervisor pin', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TEST_TENANT_A,
          nik: TEST_NIK,
          pin: TEST_SUPERVISOR_PIN,
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.agency_slug).toBe(TEST_TENANT_A);
      expect(data.session.nik).toBe(TEST_NIK);
      expect(data.session.role).toBe('BRANCH_SUPERVISOR');

      // Verify cookies
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('bwm_session_token=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader?.toLowerCase()).toContain('samesite=lax');
      expect(cookieHeader).toContain('bwm_csrf_token=');
    });

    it('successfully resolves field personnel role when pin does not start with 9', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TEST_TENANT_B,
          nik: '3204123456780001',
          pin: TEST_FIELD_PIN,
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.agency_slug).toBe(TEST_TENANT_B);
      expect(data.session.role).toBe('FIELD_PERSONNEL');
    });

    it('rejects invalid credentials fail-closed', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: '',
          nik: '123',
          pin: '1',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  // ─── 2. Multi-Tenant Resolution & Session Inspection (/api/auth/me) ──────
  describe('2. Multi-Tenant Isolation & Session Resolution', () => {
    it('resolves tenant session correctly from session cookie', async () => {
      // First log in to obtain real session cookie
      const loginReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TEST_TENANT_A,
          nik: TEST_NIK,
          pin: TEST_SUPERVISOR_PIN,
        }),
      });

      const loginRes = await loginHandler(loginReq);
      const sessionCookie = loginRes.cookies.get('bwm_session_token')?.value;
      expect(sessionCookie).toBeDefined();

      // Query /api/auth/me with session cookie
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me', {
        headers: {
          cookie: `bwm_session_token=${sessionCookie}`,
        },
      });

      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);

      const meData = await meRes.json();
      expect(meData.authenticated).toBe(true);
      expect(meData.session.agency_slug).toBe(TEST_TENANT_A);
      expect(meData.session.nik).toBe(TEST_NIK);
    });

    it('returns unauthenticated when cookie is missing', async () => {
      const meReq = new NextRequest('https://workforce.boontrack.com/api/auth/me');
      const meRes = await meHandler(meReq);
      const meData = await meRes.json();
      expect(meData.authenticated).toBe(false);
      expect(meData.session).toBeNull();
    });
  });

  // ─── 3. Session Refresh Flow (/api/auth/refresh) ──────────────────────────
  describe('3. Session Refresh Flow', () => {
    it('refreshes active session and issues updated cookie', async () => {
      // Log in
      const loginReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TEST_TENANT_A,
          nik: TEST_NIK,
          pin: TEST_SUPERVISOR_PIN,
        }),
      });
      const loginRes = await loginHandler(loginReq);
      const initialCookie = loginRes.cookies.get('bwm_session_token')?.value;

      // Refresh
      const refreshReq = new NextRequest('https://workforce.boontrack.com/api/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: `bwm_session_token=${initialCookie}`,
        },
      });

      const refreshRes = await refreshHandler(refreshReq);
      expect(refreshRes.status).toBe(200);

      const refreshData = await refreshRes.json();
      expect(refreshData.success).toBe(true);
      expect(refreshData.session.agency_slug).toBe(TEST_TENANT_A);

      const newCookie = refreshRes.cookies.get('bwm_session_token')?.value;
      expect(newCookie).toBeDefined();
    });
  });

  // ─── 4. Logout Invalidation (/api/auth/logout) ─────────────────────────────
  describe('4. Logout Invalidation', () => {
    it('invalidates session cookies cleanly', async () => {
      const logoutReq = new NextRequest('https://workforce.boontrack.com/api/auth/logout', {
        method: 'POST',
      });

      const logoutRes = await logoutHandler(logoutReq);
      expect(logoutRes.status).toBe(200);

      const cookieHeader = logoutRes.headers.get('set-cookie');
      expect(cookieHeader).toContain('bwm_session_token=;');
      expect(cookieHeader).toContain('Max-Age=0');
    });
  });

  // ─── 5. Standalone Callback Resolution (/api/auth/callback) ────────────────
  describe('5. Standalone Callback Resolution', () => {
    it('redirects auth callback locally without external redirect', async () => {
      const callbackReq = new NextRequest('https://workforce.boontrack.com/api/auth/callback?code=mock_oauth_code_123');
      const callbackRes = await callbackHandler(callbackReq);

      expect(callbackRes.status).toBe(307);
      const location = callbackRes.headers.get('location');
      expect(location).toBe('https://workforce.boontrack.com/');
      expect(location).not.toContain('dashboard.boontrack.com');
    });
  });

  // ─── 6. Zero Cross-Domain Redirect Leakage ─────────────────────────────────
  describe('6. Zero Redirect Leakage Guarantee', () => {
    it('middleware never redirects workforce routes to dashboard.boontrack.com', () => {
      const pathsToTest = ['/login', '/', '/dashboard', '/api/auth/me', '/workforce.webmanifest'];

      for (const path of pathsToTest) {
        const req = new NextRequest(`https://workforce.boontrack.com${path}`);
        const res = middleware(req);

        const location = res.headers.get('location');
        if (location) {
          expect(location).not.toContain('dashboard.boontrack.com');
          expect(location).toMatch(/^https:\/\/workforce\.boontrack\.com/);
        }
      }
    });
  });
});
