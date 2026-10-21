import fs from 'fs';
import path from 'path';
import {
  resolveStorefrontSections,
  isSectionActive,
} from '@/lib/resolvers/tenant-runtime-resolver';
import { ONLINEBOOST_DIGITAL_PRODUCTS } from '@/lib/services/onlineboost-seed.service';

describe('OnlineBoost Digital Product Conversion & Section 10 Custom HTML Injection', () => {
  const section10ComponentPath = path.resolve(
    process.cwd(),
    'app/[tenant]/components/Section10CustomHtml.tsx'
  );
  const micrositeTemplatePath = path.resolve(
    process.cwd(),
    'app/[tenant]/components/templates/MicrositeBioTemplate.tsx'
  );
  const storefrontTemplatePath = path.resolve(
    process.cwd(),
    'app/[tenant]/components/templates/StorefrontTemplate.tsx'
  );
  const trackingCapiRoutePath = path.resolve(
    process.cwd(),
    'app/api/tracking/capi/route.ts'
  );

  const section10Code = fs.readFileSync(section10ComponentPath, 'utf-8');
  const micrositeCode = fs.readFileSync(micrositeTemplatePath, 'utf-8');
  const storefrontCode = fs.readFileSync(storefrontTemplatePath, 'utf-8');
  const trackingCapiCode = fs.readFileSync(trackingCapiRoutePath, 'utf-8');

  describe('1. Seeding Produk Digital & Bypass Logistik 100%', () => {
    it('verifies SKU OB-TEST-1500 is configured for instant digital checkout without shipping', () => {
      const prod = ONLINEBOOST_DIGITAL_PRODUCTS.find((p) => p.sku === 'OB-TEST-1500');
      expect(prod).toBeDefined();
      expect(prod?.title).toBe('Tiket Uji Coba OnlineBoost (Smoke Test)');
      expect(prod?.price).toBe(1500);
      expect(prod?.stock).toBe(999);
      expect(prod?.is_unlimited_stock).toBe(true);
      expect(prod?.requires_shipping).toBe(false);
      expect(prod?.is_digital).toBe(true);
      expect(prod?.product_type).toBe('DIGITAL');
      expect(prod?.weight_grams).toBe(0);
    });

    it('verifies SKU OB-BATCH1-249K is configured for instant digital checkout without shipping', () => {
      const prod = ONLINEBOOST_DIGITAL_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(prod).toBeDefined();
      expect(prod?.title).toBe('Tiket Inkubasi OnlineBoost Batch 1');
      expect(prod?.price).toBe(249000);
      expect(prod?.stock).toBe(393);
      expect(prod?.is_unlimited_stock).toBe(false);
      expect(prod?.requires_shipping).toBe(false);
      expect(prod?.is_digital).toBe(true);
      expect(prod?.product_type).toBe('DIGITAL');
      expect(prod?.weight_grams).toBe(0);
    });
  });

  describe('2. Section 10 Custom HTML & Dynamic Parser Guardrails', () => {
    it('resolves section_10 properly from tenant metadata theme_config without hardcoding', () => {
      const metadata = {
        theme_config: {
          section_10: {
            is_enabled: true,
            custom_html: '<div class="ob-sec10-wrap">Test Section 10</div>',
          },
        },
      };

      const sections = resolveStorefrontSections(metadata);
      expect(sections.section_10?.is_active).toBe(true);
      expect(sections.section_10?.is_enabled).toBe(true);
      expect(sections.section_10?.custom_html).toContain('ob-sec10-wrap');
      expect(isSectionActive(sections.section_10)).toBe(true);
    });

    it('suppresses section_10 when is_enabled/is_active is false (Zero vertical placeholder leakage)', () => {
      const metadata = {
        theme_config: {
          section_10: {
            is_enabled: false,
            custom_html: '<div class="ob-sec10-wrap">Test Section 10</div>',
          },
        },
      };

      const sections = resolveStorefrontSections(metadata);
      expect(sections.section_10?.is_active).toBe(false);
      expect(sections.section_10?.is_enabled).toBe(false);
      expect(isSectionActive(sections.section_10)).toBe(false);
    });

    it('ensures Section10CustomHtml preserves <script> and <style> tags without stripping', () => {
      // Must use raw dangerouslySetInnerHTML without sanitizers stripping script tags
      expect(section10Code).toContain('dangerouslySetInnerHTML={{ __html: rawHtml }}');
      // Must dynamically re-hydrate scripts per HTML5 specification
      expect(section10Code).toContain("container.querySelectorAll('script')");
      expect(section10Code).toContain("document.createElement('script')");
      expect(section10Code).toContain("oldScript.parentNode?.replaceChild(newScript, oldScript)");
    });

    it('integrates Section10CustomHtml into MicrositeBioTemplate and StorefrontTemplate', () => {
      expect(micrositeCode).toContain('Section10CustomHtml');
      expect(micrositeCode).toContain('<Section10CustomHtml metadata={tenantMetadata} />');
      expect(storefrontCode).toContain('Section10CustomHtml');
      expect(storefrontCode).toContain('<Section10CustomHtml metadata={tenantMetadata} />');
    });

    it('provides CAPI beacon bridge at /api/tracking/capi', () => {
      expect(trackingCapiCode).toContain("rawBody.eventName || rawBody.event_name || 'InitiateCheckout'");
      expect(trackingCapiCode).toContain("v1CapiPost");
    });
  });
});
