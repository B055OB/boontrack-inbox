/**
 * __tests__/middleware/routing_hardening_phase2.test.ts
 *
 * Phase 2 Test-First Hardening Suite:
 * 1. Exact desk.boontrack.com root redirects to https://dashboard.boontrack.com/login with HTTP 301.
 * 2. Legacy dashboard subpaths preserve path and query parameters.
 * 3. Unrelated domains are not redirected by a loose desk hostname match.
 * 4. Unknown Shop tenant slugs fail closed to /404-store-not-found.
 * 5. Inactive or non-commerce tenants cannot access the commerce storefront.
 * 6. Missing Supabase environment variables never trigger hardcoded project/key fallback or authorize a tenant.
 * 7. Existing valid Shop, Studio, Creator, Dashboard, and custom-domain routing remains intact.
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('Phase 2: Middleware Routing & Hardening Regression Suite (B1-B6)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Behavior 1: Exact desk.boontrack.com root redirect ──────────────────────
  it('1. Exact desk.boontrack.com root redirects to https://dashboard.boontrack.com/login with HTTP 301', async () => {
    const req = new NextRequest('https://desk.boontrack.com/', {
      headers: { host: 'desk.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/login');
  });

  // ── Behavior 2: Legacy dashboard subpaths preserve path and query ───────────
  it('2. Legacy desk.boontrack.com subpaths preserve path and query parameters', async () => {
    const req = new NextRequest('https://desk.boontrack.com/onlineboost/settings?tab=general&ref=test', {
      headers: { host: 'desk.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://dashboard.boontrack.com/onlineboost/settings?tab=general&ref=test');
  });

  // ── Behavior 3: Unrelated domains with loose "desk" prefix are not redirected ─
  it('3. Unrelated domains (e.g. desktop.example.com) are not redirected by a loose desk hostname match', async () => {
    const req = new NextRequest('https://desktop.example.com/', {
      headers: { host: 'desktop.example.com' },
    });

    const res = await middleware(req);
    // desktop.example.com is an unrecognized custom domain, should NOT redirect to dashboard.boontrack.com/login
    const location = res.headers.get('location');
    expect(location).toBeNull();
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).not.toContain('dashboard.boontrack.com');
  });

  // ── Behavior 4: Unknown Shop tenant slugs fail closed to /404-store-not-found ─
  it('4. Unknown Shop tenant slugs fail closed to /404-store-not-found without tenant fallback headers', async () => {
    const req = new NextRequest('https://shop.boontrack.com/unregistered-ghost-tenant-xyz', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    // Must rewrite to /404-store-not-found, never pass through to page router
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404-store-not-found');
    // Must NOT substitute tenantSlug for authoritative tenant ID
    expect(res.headers.get('x-tenant-id')).toBeNull();
  });

  // ── Behavior 5: Inactive or non-commerce tenants cannot access commerce storefront
  it('5. Inactive or non-commerce tenants cannot access the commerce storefront (rewrite to /404-store-not-found)', async () => {
    // margasari is a known non-commerce public service tenant
    const req = new NextRequest('https://shop.boontrack.com/margasari', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404-store-not-found');
  });

  // ── Behavior 6: Missing Supabase env variables fail closed without fallback ─
  it('6. Missing Supabase environment variables fail closed without using hardcoded project fallback', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = new NextRequest('https://shop.boontrack.com/arbitrary-tenant-no-env', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    // Without configuration, it must fail closed to /404-store-not-found, not authorize a tenant
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404-store-not-found');
    expect(res.headers.get('x-tenant-id')).toBeNull();
  });

  // ── Behavior 7: Existing valid routing remains intact ────────────────────────
  it('7. Existing valid routing remains intact (shop root, dashboard, studio, creator)', async () => {
    // 7a. Shop root pass-through
    const shopRootReq = new NextRequest('https://shop.boontrack.com/', {
      headers: { host: 'shop.boontrack.com' },
    });
    const shopRootRes = await middleware(shopRootReq);
    expect(shopRootRes.status).toBe(200);
    expect(shopRootRes.headers.get('location')).toBeNull();

    // 7b. Dashboard root rewrite to login
    const dashReq = new NextRequest('https://dashboard.boontrack.com/', {
      headers: { host: 'dashboard.boontrack.com' },
    });
    const dashRes = await middleware(dashReq);
    expect(dashRes.status).toBe(200);
    expect(dashRes.headers.get('x-middleware-rewrite')).toContain('/login');

    // 7c. Studio root rewrite to /studio
    const studioReq = new NextRequest('https://studio.boontrack.com/', {
      headers: { host: 'studio.boontrack.com' },
    });
    const studioRes = await middleware(studioReq);
    expect(studioRes.status).toBe(200);
    expect(studioRes.headers.get('x-middleware-rewrite')).toContain('/studio');

    // 7d. Creator profile rewrite
    const creatorReq = new NextRequest('https://creator.boontrack.com/@demo', {
      headers: { host: 'creator.boontrack.com' },
    });
    const creatorRes = await middleware(creatorReq);
    expect(creatorRes.status).toBe(200);
    expect(creatorRes.headers.get('x-middleware-rewrite')).toContain('/creator/demo');
  });

  // ── Behavior 8: Canonical OnlineBoost storefront route pass-through ──────────
  it('8. Canonical OnlineBoost landing route passes through with authoritative tenant headers', async () => {
    const req = new NextRequest(
      'https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale',
      {
        headers: { host: 'shop.boontrack.com' },
      }
    );

    const res = await middleware(req);
    expect(res.status).toBe(200);

    // Must NOT rewrite to /404-store-not-found or redirect
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).not.toContain('/404-store-not-found');
    expect(res.headers.get('location')).toBeNull();

    // Must attach authoritative tenant headers
    expect(res.headers.get('x-tenant-slug')).toBe('onlineboost');
    const tenantId = res.headers.get('x-tenant-id');
    expect(tenantId).toBeTruthy();
    expect(tenantId).toBe('52967979-4760-4cea-b686-cdbdb389c0e1');
    expect(res.headers.get('cache-tag')).toBe('tenant-onlineboost');
  });

  // ── Behavior 9: Dynamic B2B valid tenant subdomain rewrite with authoritative headers ──
  it('9. Dynamic B2B valid tenant subdomain (tokoberkah.boontrack.com) rewrites with authoritative headers', async () => {
    const req = new NextRequest('https://tokoberkah.boontrack.com/', {
      headers: { host: 'tokoberkah.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);

    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/tokoberkah');
    expect(rewriteHeader).not.toContain('/404-store-not-found');
    expect(res.headers.get('x-tenant-slug')).toBe('tokoberkah');
    expect(res.headers.get('x-tenant-id')).toBeTruthy();
    expect(res.headers.get('cache-tag')).toBe('tenant-tokoberkah');
  });

  // ── Behavior 10: Dynamic B2B unknown subdomain fails closed to /404-store-not-found ──
  it('10. Dynamic B2B unknown subdomain (ghost-tenant.boontrack.com) fails closed to /404-store-not-found', async () => {
    const req = new NextRequest('https://ghost-tenant.boontrack.com/', {
      headers: { host: 'ghost-tenant.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404-store-not-found');
    expect(res.headers.get('x-tenant-id')).toBeNull();
  });

  // ── Behavior 11: Dynamic B2B inactive/suspended tenant subdomain fails closed ──
  it('11. Dynamic B2B inactive/suspended tenant subdomain fails closed to /404-store-not-found', async () => {
    const req = new NextRequest('https://suspended-tenant.boontrack.com/', {
      headers: { host: 'suspended-tenant.boontrack.com' },
    });

    const res = await middleware(req);
    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/404-store-not-found');
  });

  // ── Behavior 12: Dynamic B2B preserves deep paths and query parameters ──
  it('12. Dynamic B2B preserves deep paths and query parameters on valid tenant rewrite', async () => {
    const req = new NextRequest('https://tokoberkah.boontrack.com/inbox?tab=unread&ref=lead_123', {
      headers: { host: 'tokoberkah.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);

    const rewriteHeader = res.headers.get('x-middleware-rewrite') || '';
    expect(rewriteHeader).toContain('/tokoberkah/dashboard');
    expect(rewriteHeader).toContain('tab=unread');
    expect(rewriteHeader).toContain('ref=lead_123');
  });

  // ── Behavior 13: Inbound tenant header spoofing is strictly overwritten ──
  it('13. Inbound client-supplied x-tenant-id is overwritten with authoritative tenant identity', async () => {
    const req = new NextRequest('https://tokoberkah.boontrack.com/', {
      headers: {
        host: 'tokoberkah.boontrack.com',
        'x-tenant-id': 'malicious-spoofed-tenant-uuid',
        'x-tenant-slug': 'evil-tenant',
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);

    // Overwritten by authoritative values
    expect(res.headers.get('x-tenant-slug')).toBe('tokoberkah');
    expect(res.headers.get('x-tenant-id')).not.toBe('malicious-spoofed-tenant-uuid');
    expect(res.headers.get('x-tenant-id')).toBe('mock-tenant-id-tokoberkah');
  });

  // ── Behavior 14: Cache purge header invalidates memory cache correctly ──
  it('14. Cache purge header x-purge-cache clears memory cache without error', async () => {
    const purgeReq = new NextRequest('https://shop.boontrack.com/', {
      headers: {
        host: 'shop.boontrack.com',
        'x-purge-cache': '1',
      },
    });

    const res = await middleware(purgeReq);
    expect(res.status).toBe(200);
  });
});

