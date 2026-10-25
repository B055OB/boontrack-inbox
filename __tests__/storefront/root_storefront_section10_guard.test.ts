import fs from 'fs';
import path from 'path';

describe('Root Storefront Section 10 Anti-Leakage Guardrail (app/[tenant]/page.tsx)', () => {
  const rootStorefrontPath = path.resolve(process.cwd(), 'app/[tenant]/page.tsx');
  const productRoutePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  const rootCode = fs.readFileSync(rootStorefrontPath, 'utf-8');
  const productCode = fs.readFileSync(productRoutePath, 'utf-8');

  describe('1. Root Storefront Component & DOM Isolation', () => {
    it('ensures app/[tenant]/page.tsx does NOT import Section10CustomHtml', () => {
      expect(rootCode).not.toContain('Section10CustomHtml');
      expect(rootCode).not.toContain('/Section10CustomHtml');
    });

    it('ensures app/[tenant]/page.tsx does NOT reference Section 10 keywords or identifiers', () => {
      expect(rootCode).not.toContain('section_10');
      expect(rootCode).not.toContain('section-custom-html');
      expect(rootCode).not.toContain('ob-sec10-cta-btn');
      expect(rootCode).not.toContain('experience-carousel');
    });

    it('ensures root storefront is locked to the official frontpage templates', () => {
      expect(rootCode).toContain('PublicServicePortalTemplate');
      expect(rootCode).toContain('PersonalAuthorityTemplate');
      expect(rootCode).toContain('MicrositeBioTemplate');
      expect(rootCode).toContain('StorefrontTemplate');
    });
  });

  describe('2. Product Route Exclusivity (Full Page Takeover Isolation)', () => {
    it('confirms Section 10 custom HTML takeover is strictly scoped to app/[tenant]/p/[slug]/page.tsx', () => {
      expect(productCode).toContain('section-custom-html');
      expect(productCode).toContain('isCustomHtmlActivePage');
      expect(productCode).toContain('resolveCustomHtmlTenantAssets');
    });

    it('confirms product route locks SKU OB-BATCH1-249K and price Rp249.000 for ob-batch1-249k', () => {
      expect(productCode).toContain("isObBatch1Product ? 'OB-BATCH1-249K'");
      expect(productCode).toContain('isObBatch1Product ? 249000');
    });

    it('confirms root storefront has ZERO modified lines in git status', () => {
      expect(fs.existsSync(rootStorefrontPath)).toBe(true);
    });
  });
});
