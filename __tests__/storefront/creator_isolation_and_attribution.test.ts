/**
 * Test Suite: Creator Tenant Isolation & Cross-Domain Attribution
 * 
 * Verifies:
 * 1. P0 Security: Fail-Closed Tenant Resolution in /api/creator/profile (no fallback to first tenant).
 * 2. Cross-domain cookie sharing on middleware for creator.boontrack.com.
 * 3. enrichOutboundLink helper: automatically enriches internal shop links with ?ref=${handle}&r=${handle}
 *    while preserving third-party external URLs (Shopee, Tokopedia, wa.me).
 * 4. buildWabaStorefrontConsultationUrl (and alias buildStorefrontWaUrl):
 *    injects activeRef token into default consultation and order templates without breaking custom copy.
 */

import { enrichOutboundLink } from '@/app/creator/[handle]/page';
import {
  buildWabaStorefrontConsultationUrl,
  buildStorefrontWaUrl,
} from '@/app/[tenant]/p/[slug]/page';
import fs from 'fs';
import path from 'path';

describe('Creator Tenant Isolation & Attribution Architecture Contracts', () => {
  describe('1. P0 Security: Fail-Closed Tenant Resolution in app/api/creator/profile/route.ts', () => {
    const routePath = path.resolve(__dirname, '../../app/api/creator/profile/route.ts');
    const routeCode = fs.readFileSync(routePath, 'utf-8');

    it('must NOT contain the dangerous fallback `.limit(1)` in resolveTenantUuid', () => {
      // Must not fall back to whatever tenant happens to be first in the database
      expect(routeCode).not.toContain("fallbackTenant");
      expect(routeCode).not.toContain(".from('tenants').select('id').limit(1)");
    });

    it('must return 404 with TENANT_NOT_FOUND when tenant resolution fails', () => {
      expect(routeCode).toContain("error: 'TENANT_NOT_FOUND'");
      expect(routeCode).toContain("Tenant not found / invalid tenant scope.");
    });

    it('must enforce tenant parameter requirement in POST with 400 TENANT_REQUIRED', () => {
      expect(routeCode).toContain("error: 'TENANT_REQUIRED'");
    });

    it('must enforce tenant isolation on profile updates (eq tenant_id)', () => {
      expect(routeCode).toContain(".eq('tenant_id', resolvedTenantId)");
    });

    it('must reject cross-tenant handle hijacking with 409 HANDLE_CONFLICT', () => {
      expect(routeCode).toContain("error: 'HANDLE_CONFLICT'");
    });
  });

  describe('2. enrichOutboundLink - Auto-Enrichment for Internal Storefront Links', () => {
    it('enriches internal shop.boontrack.com URL with ?ref=${handle}&r=${handle}', () => {
      const original = 'https://shop.boontrack.com/warungkreatif/p/serum-glow';
      const enriched = enrichOutboundLink(original, 'suzieray');
      expect(enriched).toBe('https://shop.boontrack.com/warungkreatif/p/serum-glow?ref=suzieray&r=suzieray');
    });

    it('preserves existing query parameters when enriching internal URL', () => {
      const original = 'https://shop.boontrack.com/warungkreatif/p/serum-glow?voucher=HEMAT20&utm_source=tiktok';
      const enriched = enrichOutboundLink(original, 'suzieray');
      expect(enriched).toContain('voucher=HEMAT20');
      expect(enriched).toContain('utm_source=tiktok');
      expect(enriched).toContain('ref=suzieray');
      expect(enriched).toContain('r=suzieray');
    });

    it('enriches relative path URLs (internal storefront routes)', () => {
      const original = '/warungkreatif/p/serum-glow';
      const enriched = enrichOutboundLink(original, 'suzieray');
      expect(enriched).toBe('/warungkreatif/p/serum-glow?ref=suzieray&r=suzieray');
    });

    it('strips leading @ from handle when enriching', () => {
      const original = 'https://shop.boontrack.com/toko/p/baju';
      const enriched = enrichOutboundLink(original, '@suzieray');
      expect(enriched).toBe('https://shop.boontrack.com/toko/p/baju?ref=suzieray&r=suzieray');
    });

    it('leaves Shopee affiliate and direct links completely untouched', () => {
      const shopeeUrl = 'https://shopee.co.id/product/12345/67890';
      const shopeEeUrl = 'https://shope.ee/direct-spill-suzie';
      expect(enrichOutboundLink(shopeeUrl, 'suzieray')).toBe(shopeeUrl);
      expect(enrichOutboundLink(shopeEeUrl, 'suzieray')).toBe(shopeEeUrl);
    });

    it('leaves Tokopedia links completely untouched', () => {
      const topedUrl = 'https://www.tokopedia.com/toko/baju-gamis';
      expect(enrichOutboundLink(topedUrl, 'suzieray')).toBe(topedUrl);
    });

    it('leaves WhatsApp wa.me links completely untouched', () => {
      const waUrl = 'https://wa.me/6281234567890?text=Halo%20Endorse';
      expect(enrichOutboundLink(waUrl, 'suzieray')).toBe(waUrl);
    });

    it('leaves social media links (Instagram, TikTok, YouTube) untouched', () => {
      const igUrl = 'https://instagram.com/suzieray';
      const tiktokUrl = 'https://tiktok.com/@suzieray';
      expect(enrichOutboundLink(igUrl, 'suzieray')).toBe(igUrl);
      expect(enrichOutboundLink(tiktokUrl, 'suzieray')).toBe(tiktokUrl);
    });

    it('handles empty, null, or invalid URLs gracefully', () => {
      expect(enrichOutboundLink('', 'suzieray')).toBe('');
      expect(enrichOutboundLink('invalid-url-string', 'suzieray')).toBe('invalid-url-string');
    });
  });

  describe('3. CTWA WhatsApp Message Attribution Injection', () => {
    it('provides buildStorefrontWaUrl alias pointing to buildWabaStorefrontConsultationUrl', () => {
      expect(buildStorefrontWaUrl).toBe(buildWabaStorefrontConsultationUrl);
    });

    it('injects activeRef token into default consultation message when provided', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Krim Malam Glowing',
        tenantSlug: 'glowingstore',
        productSlug: 'krim-malam',
        tenantWhatsApp: '081234567890',
        activeRef: 'suzieray',
      });

      expect(result.text).toBe(
        'Halo Kak, saya tertarik dengan Krim Malam Glowing. Boleh minta info lebih detail? (Ref: glowingstore#krim-malam | RefBy: suzieray)'
      );
      expect(result.url).toContain(encodeURIComponent(' | RefBy: suzieray'));
    });

    it('injects "-" when activeRef is passed as "-" or empty string', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Krim Malam Glowing',
        tenantSlug: 'glowingstore',
        productSlug: 'krim-malam',
        tenantWhatsApp: '081234567890',
        activeRef: '-',
      });

      expect(result.text).toBe(
        'Halo Kak, saya tertarik dengan Krim Malam Glowing. Boleh minta info lebih detail? (Ref: glowingstore#krim-malam | RefBy: -)'
      );
    });

    it('preserves backward compatibility when activeRef is omitted (clean legacy format)', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Krim Malam Glowing',
        tenantSlug: 'glowingstore',
        productSlug: 'krim-malam',
        tenantWhatsApp: '081234567890',
      });

      expect(result.text).toBe(
        'Halo Kak, saya tertarik dengan Krim Malam Glowing. Boleh minta info lebih detail? (Ref: glowingstore#krim-malam)'
      );
    });

    it('injects referral into order confirmation template with referenceToken', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Krim Malam Glowing',
        tenantSlug: 'glowingstore',
        productSlug: 'krim-malam',
        tenantWhatsApp: '081234567890',
        referenceToken: 'BT-9821',
        buyerName: 'Rina',
        buyerPhone: '081999888777',
        activeRef: 'suzieray',
      });

      expect(result.text).toContain('[Ref: BT-9821]');
      expect(result.text).toContain('- Referral: suzieray');
    });

    it('preserves custom message and interpolates {ref_by} / {referral} variable', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Krim Malam',
        tenantSlug: 'glowingstore',
        productSlug: 'krim-malam',
        tenantWhatsApp: '081234567890',
        customMessage: 'Halo Admin {nama_toko}, saya mau order {nama_produk} dari rujukan {ref_by}.',
        storeName: 'Glowing Store',
        activeRef: 'suzieray',
      });

      expect(result.text).toBe('Halo Admin Glowing Store, saya mau order Krim Malam dari rujukan suzieray.');
    });
  });

  describe('4. Cross-Domain Cookie Sharing in middleware.ts', () => {
    const middlewarePath = path.resolve(__dirname, '../../middleware.ts');
    const middlewareCode = fs.readFileSync(middlewarePath, 'utf-8');

    it('must invoke setReferralCookies inside isCreatorHost routing block', () => {
      expect(middlewareCode).toContain('isCreatorHost');
      // Must call setReferralCookies in the creator subdomain handler
      const creatorBlock = middlewareCode.slice(
        middlewareCode.indexOf('if (isCreatorHost)'),
        middlewareCode.indexOf('// SUBDOMAIN STUDIO')
      );
      expect(creatorBlock).toContain('setReferralCookies(');
    });

    it('must set cookies with domain root .boontrack.com for cross-subdomain sharing', () => {
      expect(middlewareCode).toContain("cookieOptions.domain = '.boontrack.com'");
      expect(middlewareCode).toContain("res.cookies.set('boontrack_referral_code'");
    });
  });
});
