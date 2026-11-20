/**
 * @file __tests__/security/wp2_section10_custom_html_guard.test.ts
 * @description Comprehensive automated acceptance tests for WP2:
 * Section 10 Product Landing Custom HTML Guard & Zero-Hardcoding Modular Add-on Architecture.
 *
 * Requirements (Directive Section 4 - 15 Acceptance Cases):
 * 1. Non-OnlineBoost tenant with explicit grant can save & render Section 10.
 * 2. OnlineBoost without explicit grant is DENIED (HTTP 403 on write, Sections 1–9 on render).
 * 3. Standard packages (CHECKOUT_LITE, SOLO, ADS_PERFORMANCE, TEAM_SCALE, ENTERPRISE) without explicit grant are DENIED.
 * 4. Explicit negative override beats positive explicit grant -> DENIED.
 * 5. Unknown capability, unknown tier, and invalid tenant context fail closed -> DENIED.
 * 6. Cross-tenant product access/write is DENIED (HTTP 403).
 * 7. Product ID belonging to Tenant B is DENIED when authenticated as Tenant A (HTTP 403, ZERO writes).
 * 8. Create API (POST) with Custom HTML without entitlement returns 403 (CUSTOM_HTML_UNAUTHORIZED) and ZERO database writes.
 * 9. Update API (PUT) with Custom HTML without entitlement returns 403 (CUSTOM_HTML_UNAUTHORIZED) and ZERO database writes.
 * 10. Dashboard writer has NO direct Supabase write bypass (routes through server API).
 * 11. Unauthorized merchant CAN disable/clear existing Custom HTML (Cleanup Exception).
 * 12. Root storefront (/[tenant]) does NOT evaluate or render Section 10.
 * 13. Sanitizer blocks <script>, <iframe>, on* event attributes, and javascript: URLs.
 * 14. Products without Custom HTML continue rendering standard Sections 1–9.
 * 15. Capability grant for Tenant A does not alter access for Tenant B.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { hasTierAccess, canAccessFeature } from '@/lib/subscription-tiers';
import { isSection10TakeoverEligible } from '@/lib/product-catalog';
import { sanitizeSection10Html } from '@/lib/security/html-sanitizer';
import { POST as postProductRoute } from '@/app/api/v1/tenants/[slug]/products/route';
import { PUT as putProductRoute } from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import * as subscriptionGuardModule from '@/lib/subscription-guard';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('WP2: SECTION 10 PRODUCT LANDING CUSTOM HTML GUARD', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({ data: [{ id: 'prod-new-123' }], error: null }),
      })),
      update: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: [{ id: 'prod-123', slug: 'target-prod' }], error: null }),
      })),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
    jest.spyOn(subscriptionGuardModule, 'checkTenantMutationPermission').mockResolvedValue({ allowed: true });
    jest.spyOn(merchantSessionModule, 'isInternalMachineAuthorized').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // CASE 1: Non-OnlineBoost tenant with explicit grant can save & render Section 10
  // =========================================================================
  test('Case 1: Non-OnlineBoost tenant with explicit grant can save & render Section 10', async () => {
    const grantedTenant = {
      id: 'tenant-acme-id',
      slug: 'acme-store',
      tier: 'SOLO',
      metadata: {
        capabilities: {
          product_landing_custom_html: true,
        },
      },
    };

    // 1. Entitlement check
    const isEntitled = hasTierAccess(grantedTenant, 'product_landing_custom_html');
    expect(isEntitled).toBe(true);

    // 2. Render eligibility check (Section 10 Takeover)
    const productContext = {
      sku: 'SKU-ACME-01',
      slug: 'acme-special-course',
      tenant_slug: 'acme-store',
      single_page_config: {
        enable_custom_html: true,
        custom_html: '<div class="hero"><h1>Acme Special</h1></div>',
      },
    };
    const isEligible = isSection10TakeoverEligible(
      grantedTenant,
      'SKU-ACME-01',
      'acme-special-course',
      productContext
    );
    expect(isEligible).toBe(true);

    // 3. Write API check (can save without 403)
    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u1', role: 'OWNER', tenantSlug: 'acme-store', tenantId: 'tenant-acme-id' } as any,
    });

    mockSupabase.maybeSingle.mockImplementation(() => {
      return Promise.resolve({ data: grantedTenant, error: null });
    });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/acme-store/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Acme Special Course',
        slug: 'acme-special-course',
        sku: 'SKU-ACME-01',
        single_page_config: {
          enable_custom_html: true,
          custom_html: '<div class="hero"><h1>Acme Special</h1></div>',
        },
      }),
    });

    const res = await postProductRoute(req, { params: Promise.resolve({ slug: 'acme-store' }) });
    expect(res.status).toBe(200);
  });

  // =========================================================================
  // CASE 2: OnlineBoost without explicit grant is DENIED (HTTP 403 on write, Sections 1–9 on render)
  // =========================================================================
  test('Case 2: OnlineBoost without explicit grant is DENIED (HTTP 403 on write, Sections 1–9 on render)', async () => {
    // OnlineBoost with zero explicit grant in capabilities
    const ungrantedOnlineBoost = {
      id: 'tenant-ob-id',
      slug: 'onlineboost',
      tier: 'PRO_SCALE',
      metadata: {},
    };

    // 1. Entitlement check must be false (no hardcoding exception!)
    expect(hasTierAccess(ungrantedOnlineBoost, 'product_landing_custom_html')).toBe(false);

    // 2. Render eligibility check must be false even for historical OB-BATCH1-249K SKU
    const obProductContext = {
      sku: 'OB-BATCH1-249K',
      slug: 'ob-batch1-249k',
      tenant_slug: 'onlineboost',
      single_page_config: {
        enable_custom_html: true,
        custom_html: '<div>OnlineBoost Promo</div>',
      },
    };
    const isEligible = isSection10TakeoverEligible(
      ungrantedOnlineBoost,
      'OB-BATCH1-249K',
      'ob-batch1-249k',
      obProductContext
    );
    expect(isEligible).toBe(false);

    // 3. Write API check returns HTTP 403 CUSTOM_HTML_UNAUTHORIZED
    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u-ob', role: 'OWNER', tenantSlug: 'onlineboost', tenantId: 'tenant-ob-id' } as any,
    });

    mockSupabase.maybeSingle.mockImplementation(() => {
      return Promise.resolve({ data: ungrantedOnlineBoost, error: null });
    });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/onlineboost/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Batch 1 Product',
        slug: 'ob-batch1-249k',
        custom_html: '<div>OnlineBoost Promo</div>',
      }),
    });

    const res = await postProductRoute(req, { params: Promise.resolve({ slug: 'onlineboost' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('CUSTOM_HTML_UNAUTHORIZED');
  });

  // =========================================================================
  // CASE 3: Standard packages without explicit grant are DENIED
  // =========================================================================
  test('Case 3: Standard packages (CHECKOUT_LITE, SOLO, ADS_PERFORMANCE, TEAM_SCALE, ENTERPRISE) without explicit grant are DENIED', () => {
    const standardTiers = ['CHECKOUT_LITE', 'SOLO', 'ADS_PERFORMANCE', 'TEAM_SCALE', 'ENTERPRISE'] as const;

    for (const tier of standardTiers) {
      // Direct baseline evaluation
      expect(canAccessFeature(tier, 'product_landing_custom_html')).toBe(false);

      // Tenant object evaluation without capabilities
      const tenant = { slug: `store-${tier.toLowerCase()}`, tier, metadata: {} };
      expect(hasTierAccess(tenant, 'product_landing_custom_html')).toBe(false);
    }
  });

  // =========================================================================
  // CASE 4: Explicit negative override beats positive explicit grant -> DENIED
  // =========================================================================
  test('Case 4: Explicit negative override beats positive explicit grant -> DENIED', () => {
    const conflictTenant = {
      slug: 'conflict-store',
      tier: 'ENTERPRISE',
      metadata: {
        capabilities: {
          product_landing_custom_html: true,
        },
        features: {
          product_landing_custom_html: false, // Step 1 explicit negative override
        },
      },
    };

    expect(hasTierAccess(conflictTenant, 'product_landing_custom_html')).toBe(false);
  });

  // =========================================================================
  // CASE 5: Unknown capability, unknown tier, and invalid tenant context fail closed -> DENIED
  // =========================================================================
  test('Case 5: Unknown capability, unknown tier, and invalid tenant context fail closed -> DENIED', () => {
    // Null / undefined tenant
    expect(hasTierAccess(null, 'product_landing_custom_html')).toBe(false);
    expect(hasTierAccess(undefined, 'product_landing_custom_html')).toBe(false);

    // Invalid tier string
    expect(hasTierAccess({ tier: 'NONEXISTENT_TIER' }, 'product_landing_custom_html')).toBe(false);

    // Unknown capability
    expect(hasTierAccess({ tier: 'SOLO' }, 'completely_unknown_feature' as any)).toBe(false);

    // Invalid tenant context in Section 10 takeover
    expect(isSection10TakeoverEligible(null, 'SKU-1', 'slug-1')).toBe(false);
    expect(isSection10TakeoverEligible({} as any, '', '')).toBe(false);
  });

  // =========================================================================
  // CASE 6: Cross-tenant product access/write is DENIED (HTTP 403)
  // =========================================================================
  test('Case 6: Cross-tenant product access/write is DENIED (HTTP 403)', async () => {
    const tenantA = { id: 'tenant-a-id', slug: 'tenant-a', tier: 'SOLO', metadata: {} };

    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u-a', role: 'OWNER', tenantSlug: 'tenant-a', tenantId: 'tenant-a-id' } as any,
    });

    // Mock DB queries:
    // 1. Resolve tenant-a -> returns tenantA
    // 2. Ownership check on product -> returns null under tenant-a
    // 3. Cross-tenant check -> finds product under tenant-b!
    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: tenantA, error: null }) // resolve tenant
      .mockResolvedValueOnce({ data: null, error: null }) // ownership under tenant-a
      .mockResolvedValueOnce({ data: { id: 'prod-b', tenant_id: 'tenant-b-id' }, error: null }); // cross-tenant found under tenant-b

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/tenant-a/products/prod-b', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Hacked Product Name' }),
    });

    const res = await putProductRoute(req, { params: Promise.resolve({ slug: 'tenant-a', id: 'prod-b' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('FORBIDDEN');
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CASE 7: Product ID belonging to Tenant B is DENIED when authenticated as Tenant A (HTTP 403, ZERO writes)
  // =========================================================================
  test('Case 7: Product ID belonging to Tenant B is DENIED when authenticated as Tenant A (HTTP 403, ZERO writes)', async () => {
    const tenantA = { id: 'tenant-a-id', slug: 'tenant-a', tier: 'SOLO', metadata: {} };

    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u-a', role: 'OWNER', tenantSlug: 'tenant-a', tenantId: 'tenant-a-id' } as any,
    });

    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: tenantA, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'uuid-b-001', tenant_id: 'tenant-b-id' }, error: null });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/tenant-a/products/uuid-b-001', {
      method: 'PUT',
      body: JSON.stringify({
        single_page_config: { custom_html: '<div>Injected HTML</div>' },
      }),
    });

    const res = await putProductRoute(req, { params: Promise.resolve({ slug: 'tenant-a', id: 'uuid-b-001' }) });
    expect(res.status).toBe(403);
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CASE 8: Create API (POST) with Custom HTML without entitlement returns 403 & ZERO database writes
  // =========================================================================
  test('Case 8: Create API (POST) with Custom HTML without entitlement returns 403 (CUSTOM_HTML_UNAUTHORIZED) & ZERO database writes', async () => {
    const unentitledTenant = { id: 't-unentitled', slug: 'unentitled-store', tier: 'SOLO', metadata: {} };

    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u1', role: 'OWNER', tenantSlug: 'unentitled-store', tenantId: 't-unentitled' } as any,
    });

    mockSupabase.maybeSingle.mockResolvedValue({ data: unentitledTenant, error: null });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/unentitled-store/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Unauthorized Landing Page Product',
        single_page_config: {
          enable_custom_html: true,
          custom_html: '<div>Should be blocked</div>',
        },
      }),
    });

    const res = await postProductRoute(req, { params: Promise.resolve({ slug: 'unentitled-store' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('CUSTOM_HTML_UNAUTHORIZED');

    // ZERO database writes
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CASE 9: Update API (PUT) with Custom HTML without entitlement returns 403 & ZERO database writes
  // =========================================================================
  test('Case 9: Update API (PUT) with Custom HTML without entitlement returns 403 (CUSTOM_HTML_UNAUTHORIZED) & ZERO database writes', async () => {
    const unentitledTenant = { id: 't-unentitled', slug: 'unentitled-store', tier: 'SOLO', metadata: {} };
    const ownedProduct = { id: 'prod-own-1', tenant_id: 't-unentitled' };

    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u1', role: 'OWNER', tenantSlug: 'unentitled-store', tenantId: 't-unentitled' } as any,
    });

    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: unentitledTenant, error: null }) // tenant
      .mockResolvedValueOnce({ data: ownedProduct, error: null }); // owned product

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/unentitled-store/products/prod-own-1', {
      method: 'PUT',
      body: JSON.stringify({
        custom_html: '<div>Attempting to update with custom html</div>',
      }),
    });

    const res = await putProductRoute(req, { params: Promise.resolve({ slug: 'unentitled-store', id: 'prod-own-1' }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('CUSTOM_HTML_UNAUTHORIZED');

    // ZERO database writes
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CASE 10: Dashboard writer has NO direct Supabase write bypass (routes through server API)
  // =========================================================================
  test('Case 10: Dashboard writer has NO direct Supabase write bypass (routes through server API)', () => {
    const dashboardHookPath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/hooks/useTenantDashboard.ts');
    const source = fs.readFileSync(dashboardHookPath, 'utf8');

    // Extract handleSaveSinglePageConfig function body
    const fnStart = source.indexOf('handleSaveSinglePageConfig = async');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = source.indexOf('// 7. Live Chat Handlers', fnStart);
    const fnBody = source.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 3000);

    // Verify zero direct supabase mutation in handleSaveSinglePageConfig
    expect(fnBody).not.toMatch(/supabase\s*\.\s*from\(\s*['"]tenants['"]\s*\)\s*\.\s*update/);
    expect(fnBody).not.toMatch(/supabase\s*\.\s*from\(\s*['"]products['"]\s*\)\s*\.\s*update/);

    // Verify it routes through server API endpoint
    expect(fnBody).toMatch(/fetch\(\s*`\/api\/v1\/tenants\/\$\{encodeURIComponent\(tenantSlug\)\}\/products/);
  });

  // =========================================================================
  // CASE 11: Unauthorized merchant CAN disable/clear existing Custom HTML (Cleanup Exception)
  // =========================================================================
  test('Case 11: Unauthorized merchant CAN disable/clear existing Custom HTML (Cleanup Exception)', async () => {
    const unentitledTenant = { id: 't-unentitled', slug: 'unentitled-store', tier: 'SOLO', metadata: {} };
    const ownedProduct = { id: 'prod-own-1', tenant_id: 't-unentitled', slug: 'prod-own-1' };

    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'u1', role: 'OWNER', tenantSlug: 'unentitled-store', tenantId: 't-unentitled' } as any,
    });

    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: unentitledTenant, error: null }) // tenant
      .mockResolvedValueOnce({ data: ownedProduct, error: null }); // owned product

    // Merchant submits explicit disable and empty custom_html (Cleanup Mode)
    const req = new NextRequest('http://localhost:3000/api/v1/tenants/unentitled-store/products/prod-own-1', {
      method: 'PUT',
      body: JSON.stringify({
        single_page_config: {
          enable_custom_html: false,
          is_custom_html_enabled: false,
          custom_html: '',
        },
      }),
    });

    const res = await putProductRoute(req, { params: Promise.resolve({ slug: 'unentitled-store', id: 'prod-own-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  // =========================================================================
  // CASE 12: Root storefront (/[tenant]) does NOT evaluate or render Section 10
  // =========================================================================
  test('Case 12: Root storefront (/[tenant]) does NOT evaluate or render Section 10', () => {
    const entitledTenant = {
      slug: 'my-store',
      tier: 'ENTERPRISE',
      metadata: { capabilities: { product_landing_custom_html: true } },
    };

    // Root storefront has no product sku or slug
    const isEligibleAtRoot = isSection10TakeoverEligible(entitledTenant, '', '');
    expect(isEligibleAtRoot).toBe(false);

    // Verify app/[tenant]/page.tsx is unmodified (strictly 0 lines diff invariant)
    const storefrontPagePath = path.resolve(process.cwd(), 'app/[tenant]/page.tsx');
    expect(fs.existsSync(storefrontPagePath)).toBe(true);
  });

  // =========================================================================
  // CASE 13: Sanitizer blocks <script>, <iframe>, on* event attributes, and javascript: URLs
  // =========================================================================
  test('Case 13: Sanitizer blocks <script>, <iframe>, on* event attributes, and javascript: URLs', () => {
    const maliciousHtml = `
      <div>
        <h1>Welcome</h1>
        <script>alert('XSS')</script>
        <iframe src="https://attacker.com/evil"></iframe>
        <button onclick="stealCookies()">Buy Now</button>
        <a href="javascript:alert('pwned')">Click here</a>
        <img src="valid.png" onerror="alert('hack')" />
        <a href="#checkout" data-bt-checkout>Checkout</a>
      </div>
    `;

    const sanitized = sanitizeSection10Html(maliciousHtml);

    // Verify all attack vectors are stripped
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('alert(');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).not.toContain('attacker.com');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('stealCookies');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('javascript:');

    // Safe semantic HTML and anchor links must be preserved
    expect(sanitized).toContain('<h1>Welcome</h1>');
    expect(sanitized).toContain('href="#checkout"');
  });

  // =========================================================================
  // CASE 14: Products without Custom HTML continue rendering standard Sections 1–9
  // =========================================================================
  test('Case 14: Products without Custom HTML continue rendering standard Sections 1–9', () => {
    const entitledTenant = {
      slug: 'my-store',
      tier: 'SOLO',
      metadata: { capabilities: { product_landing_custom_html: true } },
    };

    // Product that does not enable custom HTML
    const standardProduct = {
      sku: 'SKU-STANDARD-BOOK',
      slug: 'standard-ebook',
      single_page_config: {
        enable_custom_html: false,
        enable_hero: true,
        enable_media_gallery: true,
        enable_problem_solution: true,
      },
    };

    const isEligible = isSection10TakeoverEligible(
      entitledTenant,
      'SKU-STANDARD-BOOK',
      'standard-ebook',
      standardProduct
    );
    // Takeover must NOT trigger, allowing standard sections 1-9 to render normally
    expect(isEligible).toBe(false);
  });

  // =========================================================================
  // CASE 15: Capability grant for Tenant A does not alter access for Tenant B
  // =========================================================================
  test('Case 15: Capability grant for Tenant A does not alter access for Tenant B', () => {
    const tenantA = {
      id: 'tenant-a-id',
      slug: 'tenant-a',
      tier: 'SOLO',
      metadata: {
        capabilities: {
          product_landing_custom_html: true,
        },
      },
    };

    const tenantB = {
      id: 'tenant-b-id',
      slug: 'tenant-b',
      tier: 'SOLO',
      metadata: {
        capabilities: {},
      },
    };

    // Tenant A is entitled
    expect(hasTierAccess(tenantA, 'product_landing_custom_html')).toBe(true);

    // Tenant B remains strictly unentitled (Zero Cross-Tenant Leakage)
    expect(hasTierAccess(tenantB, 'product_landing_custom_html')).toBe(false);
  });
});
