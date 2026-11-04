/**
 * __tests__/workforce/e6-auth-regression.test.ts
 * BWM Gate E6: End-to-End Auth Flow & Tenant Resolution Regression Suite
 *
 * Verifies:
 * 1. 3 Independent Demo Accounts (Cindy/Personel, Bambang/Supervisor, Hendra/Reseller).
 * 2. Hardened HttpOnly cookies (bwm_session_token, bwm_csrf_token).
 * 3. Dynamic multi-tenant resolution (zero hardcoding).
 * 4. Session query via /api/auth/me.
 * 5. Session refresh via /api/auth/refresh.
 * 6. Standalone callback via /api/auth/callback without dashboard redirect.
 * 7. Logout cookie invalidation via /api/auth/logout.
 * 8. Zero cross-domain redirect leakage to dashboard.boontrack.com.
 */

import { NextRequest } from 'next/server';
import { POST as loginHandler } from '../../workforce-web/app/api/auth/login/route';
import { GET as meHandler } from '../../workforce-web/app/api/auth/me/route';
import { POST as refreshHandler } from '../../workforce-web/app/api/auth/refresh/route';
import { POST as logoutHandler } from '../../workforce-web/app/api/auth/logout/route';
import { GET as callbackHandler } from '../../workforce-web/app/api/auth/callback/route';
import { middleware } from '../../workforce-web/middleware';

describe('BWM Gate E6: Auth Flow & Tenant Resolution Regression Suite', () => {
  const TENANT_SLUG = 'satya';

  // ─── 1. Three Independent Demo Accounts ──────────────────────────────────
  describe('1. Three Independent Demo Accounts Resolution', () => {
    it('authenticates Demo Personel (Cindy Aurini) with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: '248.0112.28',
          pin: '123456',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('field_personnel');
      expect(data.session.name).toBe('Cindy Aurini');
      expect(data.session.nik).toBe('248.0112.28');
      expect(data.session.site).toBe('Gudang Wuling Soreang');

      // Verify cookies
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('bwm_session_token=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader?.toLowerCase()).toContain('samesite=lax');
      expect(cookieHeader).toContain('bwm_csrf_token=');
    });

    it('authenticates Demo Supervisor (Bambang Prakoso) with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: '248.0101.05',
          pin: '901105',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('supervisor');
      expect(data.session.name).toBe('Bambang Prakoso');
      expect(data.session.nik).toBe('248.0101.05');
      expect(data.session.branch).toBe('Bandung Raya');
    });

    it('authenticates Demo Master Reseller (Hendra Ops) with exact profile', async () => {
      const req = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: TENANT_SLUG,
          nik: 'hendra.ops@satya.id',
          pin: '998877',
        }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.session.role).toBe('master_reseller');
      expect(data.session.name).toBe('Hendra Ops');
      expect(data.session.nik).toBe('hendra.ops@satya.id');
      expect(data.session.agency_name).toBe('PT Satya Garda Perkasa');
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
          nik: '12',
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
      // First log in as supervisor
      const loginReq = new NextRequest('https://workforce.boontrack.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://workforce.boontrack.com',
          'Host': 'workforce.boontrack.com',
        },
        body: JSON.stringify({
          slug: 'garda-nusantara',
          nik: '248.0101.05',
          pin: '901105',
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
      expect(meData.session.agency_slug).toBe('garda-nusantara');
      expect(meData.session.name).toBe('Bambang Prakoso');
      expect(meData.session.role).toBe('supervisor');
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
          slug: TENANT_SLUG,
          nik: 'hendra.ops@satya.id',
          pin: '998877',
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
      expect(refreshData.session.agency_slug).toBe(TENANT_SLUG);
      expect(refreshData.session.role).toBe('master_reseller');

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
