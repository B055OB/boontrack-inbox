/**
 * @file __tests__/integration/dashboard_desk_authorization.test.ts
 * @description Task A Acceptance Validation: Dashboard Desk Authorization & Anti-Spoofing Suite
 *
 * Verifies:
 * 1. Anonymous operator requests to /api/v1/tenant/me are rejected with 401 UNAUTHORIZED.
 * 2. Foreign-tenant operator requests (e.g. buzzerukm -> margasari or onlineboost) are rejected with 403 FORBIDDEN.
 * 3. Forged client-generated plaintext cookies (merchant_store, bt_tenant) are rejected with 401 UNAUTHORIZED.
 * 4. Legitimate signed tokens resolve authoritatively with canonical tenant, role, and membership status.
 * 5. Middleware edge guard consistently blocks unauthenticated and cross-tenant access to /:slug/desk.
 */

import { NextRequest } from 'next/server';
import { GET as getTenantMe } from '@/app/api/v1/tenant/me/route';
import { middleware } from '@/middleware';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('Task A: Dashboard Desk Authorization & Anti-Spoofing Suite', () => {
  const PILOT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
  const PILOT_TENANT_SLUG = 'onlineboost';

  const DESK_TENANT_ID = '00000000-0000-4000-8000-000000000099';
  const DESK_TENANT_SLUG = 'margasari';

  const ALIEN_TENANT_ID = '00000000-0000-4000-8000-000000000002';
  const ALIEN_TENANT_SLUG = 'buzzerukm';

  const createMockSupabase = () => {
    const tenantsMap: Record<string, any> = {
      [PILOT_TENANT_SLUG]: {
        id: PILOT_TENANT_ID,
        slug: PILOT_TENANT_SLUG,
        name: 'OnlineBoost Official Store',
        tier: 'PRO_SCALE',
        metadata: {},
      },
      [DESK_TENANT_SLUG]: {
        id: DESK_TENANT_ID,
        slug: DESK_TENANT_SLUG,
        name: 'Kelurahan Margasari Desk',
        tier: 'SOLO',
        metadata: { title: 'Kelurahan Margasari', lurah: 'Wahyu A. Affandi' },
      },
      [ALIEN_TENANT_SLUG]: {
        id: ALIEN_TENANT_ID,
        slug: ALIEN_TENANT_SLUG,
        name: 'Buzzer UKM Store',
        tier: 'SOLO_TRIAL',
        metadata: {},
      },
    };

    return {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              const target = String(val).toLowerCase();
              let matched = null;
              for (const t of Object.values(tenantsMap)) {
                if (col === 'id' && t.id.toLowerCase() === target) matched = t;
                if (col === 'slug' && t.slug.toLowerCase() === target) matched = t;
              }
              return {
                maybeSingle: jest.fn().mockResolvedValue({ data: matched, error: null }),
                single: jest.fn().mockResolvedValue({ data: matched, error: matched ? null : { message: 'Not found' } }),
              };
            }),
            maybeSingle: jest.fn().mockResolvedValue({ data: tenantsMap[DESK_TENANT_SLUG], error: null }),
            single: jest.fn().mockResolvedValue({ data: tenantsMap[DESK_TENANT_SLUG], error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const mockDb = createMockSupabase();
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Server-Side Desk Authorization API (/api/v1/tenant/me)', () => {
    it('rejects anonymous access to desk tenant endpoint with 401 UNAUTHORIZED', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenant/me?slug=${DESK_TENANT_SLUG}`);
      const res = await getTenantMe(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('rejects foreign-tenant token (buzzerukm -> margasari desk) with 403 FORBIDDEN', async () => {
      const alienToken = signMerchantSessionToken({
        tenantId: ALIEN_TENANT_ID,
        tenantSlug: ALIEN_TENANT_SLUG,
        role: 'OPERATOR',
      });

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenant/me?slug=${DESK_TENANT_SLUG}`, {
        headers: {
          cookie: `bt_merchant_token=${alienToken}`,
        },
      });

      const res = await getTenantMe(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it('rejects requests carrying ONLY client-generated plaintext cookies without cryptographic HMAC token', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenant/me?slug=${DESK_TENANT_SLUG}`, {
        headers: {
          cookie: `merchant_store=${DESK_TENANT_SLUG}; merchant_session=${DESK_TENANT_SLUG}; bt_tenant=${DESK_TENANT_SLUG}`,
        },
      });

      const res = await getTenantMe(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('authorizes valid operator session token and returns verified role and canonical tenant', async () => {
      const validToken = signMerchantSessionToken({
        tenantId: DESK_TENANT_ID,
        tenantSlug: DESK_TENANT_SLUG,
        role: 'OPERATOR',
      });

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenant/me?slug=${DESK_TENANT_SLUG}`, {
        headers: {
          cookie: `bt_merchant_token=${validToken}`,
        },
      });

      const res = await getTenantMe(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.role).toBe('OPERATOR');
      expect(json.membership_valid).toBe(true);
      expect(json.tenant.slug).toBe(DESK_TENANT_SLUG);
      expect(json.tenant.id).toBe(DESK_TENANT_ID);
    });

    it('authorizes OnlineBoost owner session and returns verified owner role', async () => {
      const validToken = signMerchantSessionToken({
        tenantId: PILOT_TENANT_ID,
        tenantSlug: PILOT_TENANT_SLUG,
        role: 'OWNER',
      });

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenant/me?slug=${PILOT_TENANT_SLUG}`, {
        headers: {
          cookie: `bt_merchant_token=${validToken}`,
        },
      });

      const res = await getTenantMe(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.role).toBe('OWNER');
      expect(json.tenant.slug).toBe(PILOT_TENANT_SLUG);
    });
  });

  describe('2. Middleware Edge Guard on Dashboard Desk Route (/:slug/desk)', () => {
    it('redirects anonymous operator hitting /margasari/desk to /login', async () => {
      const req = new NextRequest('https://dashboard.boontrack.com/margasari/desk', {
        headers: { host: 'dashboard.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('redirects foreign tenant token visiting /margasari/desk to /login', async () => {
      const alienToken = signMerchantSessionToken({
        tenantId: ALIEN_TENANT_ID,
        tenantSlug: ALIEN_TENANT_SLUG,
        role: 'OPERATOR',
      });

      const req = new NextRequest('https://dashboard.boontrack.com/margasari/desk', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${alienToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login?redirectTo=');
    });

    it('allows verified operator token on /margasari/desk and redirects to canonical dashboard', async () => {
      const validToken = signMerchantSessionToken({
        tenantId: DESK_TENANT_ID,
        tenantSlug: DESK_TENANT_SLUG,
        role: 'OPERATOR',
      });

      const req = new NextRequest('https://dashboard.boontrack.com/margasari/desk', {
        headers: {
          host: 'dashboard.boontrack.com',
          cookie: `bt_merchant_token=${validToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/margasari/dashboard');
    });
  });
});

