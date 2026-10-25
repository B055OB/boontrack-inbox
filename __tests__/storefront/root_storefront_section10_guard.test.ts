import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Root Storefront Section 10 Anti-Leakage Guardrail (app/[tenant]/page.tsx)', () => {
  const rootStorefrontPath = path.resolve(process.cwd(), 'app/[tenant]/page.tsx');
  const productRoutePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  const rootCode = fs.readFileSync(rootStorefrontPath, 'utf-8');
  const productCode = fs.readFileSync(productRoutePath, 'utf-8');

  describe('1. AST & Architectural Content Guard on Root Storefront', () => {
    it('strictly forbids Section 10 component imports in root storefront', () => {
      expect(rootCode).not.toContain('Section10CustomHtml');
      expect(rootCode).not.toContain('/Section10CustomHtml');
      expect(rootCode).not.toMatch(/import\s+.*Section10/i);
    });

    it('strictly forbids Section 10 DOM elements and identifiers in root storefront', () => {
      // Must fail if root storefront renders custom HTML section or uses Section 10 IDs
      expect(rootCode).not.toContain('custom-html-section');
      expect(rootCode).not.toContain('section-custom-html');
      expect(rootCode).not.toContain('#custom-html-section');
      expect(rootCode).not.toContain('section_10');
      expect(rootCode).not.toMatch(/<[A-Za-z0-9_]*Section10/i);
    });

    it('strictly forbids Section 10 asset imports, CSS, and script references in root storefront', () => {
      expect(rootCode).not.toContain('onlineboost.css');
      expect(rootCode).not.toContain('experience-carousel');
      expect(rootCode).not.toContain('mock-checkout');
    });

    it('strictly forbids takeover button selectors and checkout triggers in root storefront', () => {
      expect(rootCode).not.toContain('#ob-sec10-cta-btn');
      expect(rootCode).not.toContain('.hero-sub-checkout-trigger');
      expect(rootCode).not.toContain('isCustomHtmlActivePage');
    });

    it('locks root storefront architecture exclusively to official frontpage templates', () => {
      expect(rootCode).toContain('PublicServicePortalTemplate');
      expect(rootCode).toContain('PersonalAuthorityTemplate');
      expect(rootCode).toContain('MicrositeBioTemplate');
      expect(rootCode).toContain('StorefrontTemplate');
    });
  });

  describe('2. Product Route Exclusivity & Strict Tenant-SKU Locking', () => {
    it('confirms Section 10 custom HTML takeover is strictly locked to isOnlineBoostTenant and OB-BATCH1-249K', () => {
      expect(productCode).toContain('isOnlineBoostTenant');
      expect(productCode).toContain("product?.sku === 'OB-BATCH1-249K'");
      expect(productCode).toContain("'ob-batch1-249k'");
      expect(productCode).toContain('section-custom-html');
      expect(productCode).toContain('isCustomHtmlActivePage');
      expect(productCode).toContain('resolveCustomHtmlTenantAssets');
    });

    it('verifies git diff against baseline origin/main confirms ZERO modified lines in app/[tenant]/page.tsx', () => {
      const gitDiffOutput = execSync('git diff origin/main...HEAD -- app/[tenant]/page.tsx', { encoding: 'utf-8' }).trim();
      expect(gitDiffOutput).toBe('');
    });
  });
});
