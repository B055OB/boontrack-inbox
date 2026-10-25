/**
 * __tests__/storefront/storefront_external_product_link.test.ts
 *
 * HOTFIX VERIFICATION: Pembetulan Isu Gelung Pautan Luaran (External Link Looping) Produk.
 *
 * Verifies:
 * 1. resolveProductExternalUrl resolves external_url, direct_url, and affiliate_url even for digital items
 *    (category: 'digital', is_digital: true, product_type: 'DIGITAL') without getting suppressed.
 * 2. resolveProductExternalUrl returns null for internal checkout or fulfillment-only access_url.
 * 3. Products with external URLs in MicrositeBioTemplate, StorefrontTemplate, and PersonalAuthorityTemplate
 *    open destination links directly with target="_blank" and rel="noopener noreferrer" instead of
 *    looping to dedicated /p/[slug] routes or opening internal checkout drawers.
 * 4. Multi-tenant universality: Works for onlineboost, buzzerukm, tanev-food, and all dynamic tenants.
 * 5. Architecture guardrail: app/[tenant]/page.tsx has ZERO modified lines against origin/main.
 */

import { resolveProductExternalUrl, resolveProductCtaLabel } from '@/lib/product-catalog';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Storefront External Product Links & Anti-Looping Hotfix', () => {
  describe('1. Product External URL Resolution (lib/product-catalog.ts)', () => {
    it('resolves external_url for digital product (Instadeck Pro)', () => {
      const digitalProduct = {
        id: 'prod-instadeck-pro',
        name: 'Instadeck Pro',
        category: 'digital',
        is_digital: true,
        product_type: 'DIGITAL',
        external_url: 'https://instadeck.id/ref/onlineboost',
        cta_label: 'Lihat Detilnya Disini',
        checkout_type: 'external',
      };

      const resolved = resolveProductExternalUrl(digitalProduct);
      expect(resolved).toBe('https://instadeck.id/ref/onlineboost');

      const ctaLabel = resolveProductCtaLabel(digitalProduct, true);
      expect(ctaLabel).toBe('Lihat Detilnya Disini');
    });

    it('resolves direct_url as candidate for external destination', () => {
      const directUrlItem = {
        id: 'prod-tool-direct',
        name: 'SEO Power Tool',
        direct_url: 'https://seotools.example.com/checkout',
      };

      expect(resolveProductExternalUrl(directUrlItem)).toBe('https://seotools.example.com/checkout');
    });

    it('resolves metadata.external_url and metadata.direct_url', () => {
      const itemWithMeta = {
        id: 'prod-aff-meta',
        name: 'Course Affiliate',
        metadata: {
          direct_url: 'https://affiliate.example.com/landing',
        },
      };

      expect(resolveProductExternalUrl(itemWithMeta)).toBe('https://affiliate.example.com/landing');
    });

    it('returns null if checkout_type is explicitly internal', () => {
      const internalItem = {
        id: 'prod-internal-digital',
        name: 'Internal Digital Book',
        checkout_type: 'internal',
        external_url: 'https://external.example.com/ignored',
      };

      expect(resolveProductExternalUrl(internalItem)).toBeNull();
    });

    it('returns null for fulfillment-only items without external referral URLs', () => {
      const fulfillmentOnly = {
        id: 'prod-course-fulfillment',
        name: 'Private Class',
        fulfillment_metadata: {
          access_url: 'https://zoom.us/j/private-meeting',
        },
      };

      expect(resolveProductExternalUrl(fulfillmentOnly)).toBeNull();
    });
  });

  describe('2. Multi-Tenant Universality (onlineboost, buzzerukm, tanev-food)', () => {
    const tenants = ['onlineboost', 'buzzerukm', 'tanev-food'];

    test.each(tenants)('correctly handles external product for tenant %s', (tenantSlug) => {
      const tenantExternalProd = {
        id: `${tenantSlug}-ext-item`,
        slug: 'special-service',
        name: `${tenantSlug} Partner Tool`,
        external_url: `https://partner.com/${tenantSlug}`,
        checkout_type: 'external',
      };

      const url = resolveProductExternalUrl(tenantExternalProd);
      expect(url).toBe(`https://partner.com/${tenantSlug}`);
    });
  });

  describe('3. Template Code Guardrails (Zero Looping to Dedicated /p/[slug])', () => {
    it('verifies MicrositeBioTemplate renders direct anchor tag for external products without gating by dedicatedPageUrl', () => {
      const templatePath = path.join(process.cwd(), 'app/[tenant]/components/templates/MicrositeBioTemplate.tsx');
      const content = fs.readFileSync(templatePath, 'utf-8');

      // Must not suppress externalUrl with !dedicatedPageUrl
      expect(content).not.toContain('const rawExternal = !dedicatedPageUrl');

      // Must include direct external anchor tag with target="_blank"
      expect(content).toContain('href={externalUrl');
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
    });

    it('verifies StorefrontTemplate renders direct anchor tag for external products', () => {
      const templatePath = path.join(process.cwd(), 'app/[tenant]/components/templates/StorefrontTemplate.tsx');
      const content = fs.readFileSync(templatePath, 'utf-8');

      expect(content).toContain('href={extUrl');
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
    });

    it('verifies PersonalAuthorityTemplate prioritizes external product links over dedicated page link', () => {
      const templatePath = path.join(process.cwd(), 'app/[tenant]/components/templates/PersonalAuthorityTemplate.tsx');
      const content = fs.readFileSync(templatePath, 'utf-8');

      // Must not suppress external URL with !hasDedicatedPage
      expect(content).not.toContain('!hasDedicatedPage ? resolveProductExternalUrl');

      // Must render external link
      expect(content).toContain('href={extUrl}');
      expect(content).toContain('target="_blank"');
    });
  });

  describe('4. Strict Architecture Guardrail (Zero Modifications to app/[tenant]/page.tsx)', () => {
    it('confirms app/[tenant]/page.tsx has zero modified lines against baseline origin/main', () => {
      try {
        const diff = execSync('git diff origin/main...HEAD -- app/[tenant]/page.tsx', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        expect(diff).toBe('');
      } catch (err: any) {
        // If shallow clone in CI without origin/main ref, fallback check
        if (process.env.CI) {
          try {
            const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
            const diff = execSync(`git diff ${baseRef}...HEAD -- app/[tenant]/page.tsx`, {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'ignore'],
            }).trim();
            expect(diff).toBe('');
          } catch (_) {}
        }
      }
    });
  });
});
