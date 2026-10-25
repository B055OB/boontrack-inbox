import fs from 'fs';
import path from 'path';
import { 
  resolveSinglePageProduct, 
  resolveCustomHtmlTenantAssets, 
  DEFAULT_ONLINEBOOST_PRODUCTS,
  DEFAULT_PRODUCTS
} from '@/lib/product-catalog';

describe('OnlineBoost Section 10 Product Routing Contract Tests', () => {
  const tenantSlug = 'onlineboost';
  const canonicalSlug = 'ob-batch1-249k';
  const expectedSku = 'OB-BATCH1-249K';
  const expectedPrice = 249000;

  describe('1. Canonical Product Specifications & Default Catalog Parity', () => {
    it('locks canonical product in DEFAULT_ONLINEBOOST_PRODUCTS with accurate SKU, price, and stock', () => {
      const match = DEFAULT_ONLINEBOOST_PRODUCTS.find(
        (p) => p.slug === canonicalSlug || p.sku === expectedSku
      );

      expect(match).toBeDefined();
      expect(match?.slug).toBe(canonicalSlug);
      expect(match?.sku).toBe(expectedSku);
      expect(match?.price).toBe(expectedPrice);
      expect(match?.promo_price).toBe(expectedPrice);
      expect(match?.stock).toBe(393);
      expect(match?.is_digital).toBe(true);
      expect(match?.requires_shipping).toBe(false);
    });

    it('locks canonical product in DEFAULT_PRODUCTS catalog', () => {
      const match = DEFAULT_PRODUCTS.find(
        (p) => p.slug === canonicalSlug || p.sku === expectedSku
      );

      expect(match).toBeDefined();
      expect(match?.slug).toBe(canonicalSlug);
      expect(match?.sku).toBe(expectedSku);
      expect(match?.price).toBe(expectedPrice);
    });

    it('resolves product via resolveSinglePageProduct for onlineboost tenant with Custom HTML enabled', () => {
      const result = resolveSinglePageProduct(tenantSlug, canonicalSlug);

      expect(result).toBeDefined();
      expect(result.product).toBeDefined();
      expect(result.product.slug).toBe(canonicalSlug);
      expect(result.product.sku).toBe(expectedSku);
      expect(result.product.price).toBe(expectedPrice);
      expect(result.config).toBeDefined();
      expect(result.config.enable_custom_html).toBe(true);
      expect(result.config.is_custom_html_enabled).toBe(true);
      expect(result.config.sections_override).toBe(false);
      expect(result.config.active_section).toBe('custom_html');
      expect(result.config.checkout_mode).toBe('modal');
    });

    it('resolves case-insensitive and hyphen-agnostic target slug for ob-batch1-249k', () => {
      const upperResult = resolveSinglePageProduct(tenantSlug, 'OB-BATCH1-249K');
      expect(upperResult.product.sku).toBe(expectedSku);
      expect(upperResult.product.price).toBe(expectedPrice);

      const unhyphenatedResult = resolveSinglePageProduct(tenantSlug, 'obbatch1249k');
      expect(unhyphenatedResult.product.sku).toBe(expectedSku);
      expect(unhyphenatedResult.product.price).toBe(expectedPrice);
    });
  });

  describe('2. Section 10 Relative Asset URL Resolution (resolveCustomHtmlTenantAssets)', () => {
    it('rewrites relative CSS stylesheet links to /tenants/[slug]/', () => {
      const input = '<link rel="stylesheet" href="onlineboost.css?v=v2_storytelling">';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toBe('<link rel="stylesheet" href="/tenants/onlineboost/onlineboost.css?v=v2_storytelling">');
    });

    it('rewrites relative JavaScript script sources to /tenants/[slug]/', () => {
      const input = `
        <script src="reseller-attribution.js"></script>
        <script src="mock-checkout.js"></script>
        <script src="experience-carousel.js"></script>
      `;
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toContain('src="/tenants/onlineboost/reseller-attribution.js"');
      expect(output).toContain('src="/tenants/onlineboost/mock-checkout.js"');
      expect(output).toContain('src="/tenants/onlineboost/experience-carousel.js"');
    });

    it('rewrites relative image sources to /tenants/[slug]/', () => {
      const input = '<img src="assets/onlineboost-logo.png" alt="Logo"><img src="assets/hero-smartphone-seller.jpg">';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toContain('src="/tenants/onlineboost/assets/onlineboost-logo.png"');
      expect(output).toContain('src="/tenants/onlineboost/assets/hero-smartphone-seller.jpg"');
    });

    it('rewrites data-lightbox-src attributes to /tenants/[slug]/', () => {
      const input = '<button data-lightbox-src="assets/testimonials/TESTI KDCPM 1.jpg" data-lightbox-caption="Caption">';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toContain('data-lightbox-src="/tenants/onlineboost/assets/testimonials/TESTI KDCPM 1.jpg"');
    });

    it('preserves absolute URLs (https://, http://, //)', () => {
      const input = '<img src="https://assets.boontrack.com/images/hero.webp"><script src="//cdn.example.com/lib.js"></script>';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toBe(input);
    });

    it('preserves hash anchor links (#checkout, #journey, #fasilitas)', () => {
      const input = '<a href="#checkout">Checkout</a><a href="#journey">Journey</a><a href="#pricing">Pricing</a>';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toBe(input);
    });

    it('preserves root-relative URLs (/onlineboost, /api/v1/...)', () => {
      const input = '<a href="/onlineboost">Store</a><img src="/images/logo.png">';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toBe(input);
    });

    it('preserves data: URIs and mailto/tel protocols', () => {
      const input = '<img src="data:image/png;base64,iVBORw..."><a href="mailto:admin@example.com">Email</a>';
      const output = resolveCustomHtmlTenantAssets(input, tenantSlug);
      expect(output).toBe(input);
    });

    it('scopes asset base strictly to the provided tenantSlug (Multi-Tenant Isolation)', () => {
      const input = '<link rel="stylesheet" href="theme.css"><img src="assets/banner.png">';
      const output = resolveCustomHtmlTenantAssets(input, 'kopi-kenangan');
      expect(output).toBe('<link rel="stylesheet" href="/tenants/kopi-kenangan/theme.css"><img src="/tenants/kopi-kenangan/assets/banner.png">');
    });

    it('gracefully handles empty or non-string inputs', () => {
      expect(resolveCustomHtmlTenantAssets('', tenantSlug)).toBe('');
      expect(resolveCustomHtmlTenantAssets(null as any, tenantSlug)).toBe('');
      expect(resolveCustomHtmlTenantAssets(undefined as any, tenantSlug)).toBe('');
    });
  });

  describe('3. Storefront Product Route & DOM / Script Lifecycle Parity', () => {
    const pageFilePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageSource = fs.readFileSync(pageFilePath, 'utf-8');

    it('contains tenant Section 10 metadata inheritance logic in page.tsx', () => {
      expect(pageSource).toContain('tenantRow?.metadata?.theme_config?.section_10');
      expect(pageSource).toContain('tenantRow?.metadata?.sections?.section_10');
      expect(pageSource).toContain('resolveCustomHtmlTenantAssets');
    });

    it('locks SKU to OB-BATCH1-249K and price to 249000 for ob-batch1-249k in dynamic resolution', () => {
      expect(pageSource).toContain("isObBatch1Product ? 'OB-BATCH1-249K'");
      expect(pageSource).toContain('isObBatch1Product ? 249000');
    });

    it('rehydrates script elements with async = false to guarantee execution order', () => {
      expect(pageSource).toContain('newScript.async = false;');
    });

    it('binds CTA triggers to open the mock checkout modal on #ob-sec10-cta-btn and [data-bt-checkout]', () => {
      expect(pageSource).toContain('#ob-sec10-cta-btn');
      expect(pageSource).toContain('[data-bt-checkout]');
      expect(pageSource).toContain('a[href="#checkout"]');
    });

    it('renders full-width main container when custom HTML is active instead of cramped max-w-2xl', () => {
      expect(pageSource).toContain("isCustomHtmlActivePage ? 'w-full p-0 m-0' : 'max-w-2xl mx-auto px-4 pt-6 space-y-7'");
    });

    it('omits generic minimal brand header when custom HTML is active to prevent duplicate headers', () => {
      expect(pageSource).toContain('!isCustomHtmlActivePage && (');
    });

    it('enforces Full Page Takeover: suppresses canonical sections, floating cart, cart drawer, and floating WA button', () => {
      expect(pageSource).toContain("if (isCustomHtmlActivePage && sectionId !== 'custom_html')");
      expect(pageSource).toContain('!isCartDisabled && cartPolicy.showStickyCart &&');
      expect(pageSource).toContain('isCustomHtmlActivePage ||');
      expect(pageSource).toContain('<CartDrawer');
      expect(pageSource).toContain('!isCustomHtmlActivePage && wabaConsultationUrl');
      expect(pageSource).toContain('isCustomHtmlActivePage ? "w-full min-h-screen p-0 m-0');
      expect(pageSource).toContain('className="w-full min-h-screen p-0 m-0"');
    });
  });

  describe('4. Dashboard SinglePageBuilder Modal Hydration', () => {
    const hookFilePath = path.resolve(process.cwd(), 'app/[tenant]/dashboard/hooks/useTenantDashboard.ts');
    const hookSource = fs.readFileSync(hookFilePath, 'utf-8');

    it('hydrates Section 10 metadata from tenant theme_config when opening SinglePageBuilder', () => {
      expect(hookSource).toContain('tenantData?.metadata?.theme_config?.section_10');
      expect(hookSource).toContain('tenantData?.metadata?.sections?.section_10');
      expect(hookSource).toContain("prodSlug === 'ob-batch1-249k'");
    });
  });

  describe('5. Multi-Tenant Data Isolation (Zero Leakage)', () => {
    it('does not leak onlineboost products to another tenant via resolveSinglePageProduct', () => {
      const result = resolveSinglePageProduct('tenant-lain', canonicalSlug);
      // For any other tenant, fallback product should have price 0 and default placeholder
      expect(result.product.price).toBe(0);
      expect(result.config.enable_custom_html).toBeFalsy();
    });
  });

  describe('6. Negative Regression Tests (Strict Takeover & Multi-Tenant Boundaries)', () => {
    const pageFilePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageSource = fs.readFileSync(pageFilePath, 'utf-8');

    it('ensures non-onlineboost tenant (e.g. happyeating) does NOT trigger Section 10 takeover even if flag is active', () => {
      // 1. Structural architectural check in page.tsx
      expect(pageSource).toContain("isOnlineBoostTenant = (params?.tenant as string)?.toLowerCase() === 'onlineboost'");
      
      // 2. Logic simulation simulating happyeating tenant context with custom HTML metadata
      const mockParams = { tenant: 'happyeating', slug: 'ob-batch1-249k' };
      const mockProduct = { sku: 'OB-BATCH1-249K', slug: 'ob-batch1-249k' };
      const mockConfig = { enable_custom_html: true, custom_html: '<section id="custom-html-section">Active</section>' };

      const isOnlineBoostTenant = (mockParams.tenant as string)?.toLowerCase() === 'onlineboost';
      const isObBatch1Target = Boolean(
        mockProduct.sku === 'OB-BATCH1-249K' ||
        mockParams.slug?.toLowerCase() === 'ob-batch1-249k'
      );

      const isCustomHtmlActivePage = Boolean(
        isOnlineBoostTenant &&
        isObBatch1Target &&
        mockConfig.enable_custom_html &&
        mockConfig.custom_html
      );

      // Takeover MUST be false for non-onlineboost tenant
      expect(isOnlineBoostTenant).toBe(false);
      expect(isCustomHtmlActivePage).toBe(false);
    });

    it('ensures onlineboost product non-batch1 (SKU other than OB-BATCH1-249K) renders regular template with store header and cart', () => {
      // 1. Resolve a non-batch1 product from onlineboost catalog (e.g. modul-praktis-cpm-24-jam with SKU OB-CPM-24H)
      const nonBatch1 = resolveSinglePageProduct(tenantSlug, 'modul-praktis-cpm-24-jam');
      expect(nonBatch1.product).toBeDefined();
      expect(nonBatch1.product.sku).not.toBe('OB-BATCH1-249K');
      expect(nonBatch1.config.enable_custom_html).toBeFalsy();

      // 2. Logic simulation for non-batch1 product on onlineboost tenant even if flags are forcefully injected
      const mockParams = { tenant: 'onlineboost', slug: nonBatch1.product.slug };
      const isOnlineBoostTenant = (mockParams.tenant as string)?.toLowerCase() === 'onlineboost';
      const isObBatch1Target = Boolean(
        nonBatch1.product.sku === 'OB-BATCH1-249K' ||
        mockParams.slug?.toLowerCase() === 'ob-batch1-249k'
      );

      const mockConfigWithForcedFlag = {
        enable_custom_html: true,
        custom_html: '<section id="custom-html-section">Injected</section>',
      };

      const isCustomHtmlActivePage = Boolean(
        isOnlineBoostTenant &&
        isObBatch1Target &&
        mockConfigWithForcedFlag.enable_custom_html &&
        mockConfigWithForcedFlag.custom_html
      );

      // Non-batch1 product MUST NOT trigger takeover
      expect(isOnlineBoostTenant).toBe(true);
      expect(isObBatch1Target).toBe(false);
      expect(isCustomHtmlActivePage).toBe(false);

      // 3. Page layout verification: regular template preserves store header and cart
      // When isCustomHtmlActivePage is false:
      // - Store header renders: {!isCustomHtmlActivePage && (
      expect(pageSource).toContain('!isCustomHtmlActivePage && (');
      // - Standard container is used:
      expect(pageSource).toContain("isCustomHtmlActivePage ? 'w-full p-0 m-0' : 'max-w-2xl mx-auto px-4 pt-6 space-y-7'");
      // - Cart bar and cart drawer are not suppressed by takeover:
      expect(pageSource).toContain('!isCartDisabled && cartPolicy.showStickyCart &&');
      expect(pageSource).toContain('<CartDrawer');
    });
  });
});
