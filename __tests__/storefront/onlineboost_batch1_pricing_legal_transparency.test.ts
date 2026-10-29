/**
 * __tests__/storefront/onlineboost_batch1_pricing_legal_transparency.test.ts
 *
 * CTO DIRECTIVE VERIFICATION:
 * - Inbox Pricing UI, WhatsApp CTA & Legal Copy
 * - Canonical Product: https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale
 * - Strict Hold Enforcement & Non-Regression
 */

import fs from 'fs';
import path from 'path';
import {
  buildWabaStorefrontConsultationUrl,
  normalizeStorefrontWhatsAppNumber,
} from '@/app/[tenant]/p/[slug]/page';
import { isSection10TakeoverEligible } from '@/lib/product-catalog';
import { trackWhatsAppConsultation } from '@/lib/tracking';

const VERIFIED_WABA_NUMBER = '6288226098088';
const FOUNDER_PREFILLED_MESSAGE = 'Saya tertarik ikut kelas nya Kang';
const CANONICAL_SLUG = 'kelas-inkubasi-ctwa-batch-1-scale';
const BATCH1_SKU = 'OB-BATCH1-249K';

describe('CTO Directive — OnlineBoost Pricing UI, WhatsApp CTA & Legal Copy', () => {
  const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

  describe('Section A: Founder-Selected WhatsApp CTA', () => {
    it('normalizes verified OnlineBoost destination number to 6288226098088', () => {
      expect(normalizeStorefrontWhatsAppNumber('088226098088')).toBe('6288226098088');
      expect(normalizeStorefrontWhatsAppNumber('+62 882-2609-8088')).toBe('6288226098088');
      expect(normalizeStorefrontWhatsAppNumber('6288226098088')).toBe('6288226098088');
    });

    it('builds canonical consultation URL without invoking checkout or payment', () => {
      const res = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: CANONICAL_SLUG,
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: FOUNDER_PREFILLED_MESSAGE,
      });

      expect(res.number).toBe(VERIFIED_WABA_NUMBER);
      expect(res.text).toBe(FOUNDER_PREFILLED_MESSAGE);
      expect(res.url).toBe(`https://wa.me/${VERIFIED_WABA_NUMBER}?text=${encodeURIComponent(FOUNDER_PREFILLED_MESSAGE)}`);
    });

    it('preserves referral and reseller codes (?r=, ?reseller=, ?reseller_id=, ?ref=, ?aff=)', () => {
      const res = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: CANONICAL_SLUG,
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: `${FOUNDER_PREFILLED_MESSAGE} [r=VIP_PROMO]`,
      });

      expect(res.text).toBe('Saya tertarik ikut kelas nya Kang [r=VIP_PROMO]');
      expect(res.url).toContain('https://wa.me/6288226098088?text=');
      expect(decodeURIComponent(res.url)).toContain('Saya tertarik ikut kelas nya Kang [r=VIP_PROMO]');
    });

    it('guards handleOpenCheckout and order submission so clicking CTA never creates QRIS or orders', () => {
      expect(pageContent).toContain(
        'if (isOnlineBoostBatch1) {\n      // Fail closed: OnlineBoost Batch 1 CTAs navigate directly to WhatsApp\n      // without invoking handleOpenCheckout, creating an order, or calling a payment endpoint.\n      return;\n    }'
      );
      expect(pageContent).toContain('if (isOnlineBoostBatch1) {\n      handleWhatsAppConsultation();\n      return;\n    }');
    });

    it('ensures WhatsApp mode is strictly scoped to OnlineBoost canonical product and not global to other tenants', () => {
      expect(pageContent).toContain('const isOnlineBoostBatch1 = Boolean(isOnlineBoostTenant && isObBatch1Target);');
      expect(isSection10TakeoverEligible('onlineboost', BATCH1_SKU, CANONICAL_SLUG)).toBe(true);
      expect(isSection10TakeoverEligible('tanevfood', BATCH1_SKU, CANONICAL_SLUG)).toBe(false);
      expect(isSection10TakeoverEligible('otherstore', 'OTHER-SKU', 'other-product')).toBe(false);
    });
  });

  describe('Section B: #tools Anchor on Comparison Section', () => {
    it('attaches unique id="tools" to the cost-comparison section', () => {
      expect(pageContent).toContain("case 'comparison':");
      expect(pageContent).toContain('id="tools"');
      expect(pageContent).toContain("resolvedCustomHtml.replace(\n                  /(<section[^>]*class=[\"'][^\"']*comparison-section[^\"']*[\"'])/i,\n                  '$1 id=\"tools\"'\n                )");
    });

    it('guarantees sticky-header offset (scroll-margin-top 100px) to prevent obstruction', () => {
      expect(pageContent).toMatch(/#tools,\s*\.comparison-section\s*\{[\s\S]*?scroll-margin-top:\s*100px\s*!important;/);
    });
  });

  describe('Section C: Clean Official Price Display (Rp 249.000 Clean)', () => {
    it('removes price-proposal-strike element to display clean official price Rp 249.000', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/<div[^>]*class=[\"'][^\"']*price-proposal-strike[^\"']*[\"'][^>]*>[\\s\\S]*?<\\/div>/gi, '')");
    });

    it('preserves official Batch 1 settlement price Rp249.000', () => {
      expect(pageContent).toContain('OB-BATCH1-249K');
    });

    it('does NOT contain client-computed launch countdowns or fabricated deadlines', () => {
      // Must not fabricate arbitrary future deadlines in client code
      expect(pageContent).not.toMatch(/launchDate\s*=\\s*new\s*Date/);
      expect(pageContent).not.toMatch(/batch1Deadline\s*=\\s*new\s*Date/);
    });
  });

  describe('Section D: Pricing & Entitlement Transparency (CFO-Approved Inclusions)', () => {
    it('includes exactly 1 month of BoonTrack Shop access', () => {
      expect(pageContent).toContain('1 bulan akses platform etalase');
    });

    it('includes 200 bot LLM actions (max 1.000 tokens input, 500 tokens output)', () => {
      expect(pageContent).toContain('200 bot LLM actions');
      expect(pageContent).toContain('1.000 input &amp; 500 output token');
    });

    it('includes BoonTrack Studio Starter credits: 25 credits (~8 1080p videos @ 3 credits)', () => {
      expect(pageContent).toContain('25 kredit pembuatan video AI');
      expect(pageContent).toContain('~8 video 1080p @ 3 kredit/video');
    });

    it('contains clear transparency disclaimer regarding verified program terms and third-party spend', () => {
      expect(pageContent).toContain('Ketersediaan produk dan platform tunduk pada ketentuan program terverifikasi');
      expect(pageContent).toContain('Tidak mencakup langganan software tak terbatas di luar paket maupun anggaran belanja iklan pihak ketiga (Meta/TikTok)');
    });
  });

  describe('Section E: Legal Copy Phrasing Requirements', () => {
    it('strictly uses "Self-Funding Acquisition Engine" and forbids "negative CAC"', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/\\bnegative\\s*cac\\b/gi, 'Self-Funding Acquisition Engine')");
      expect(pageContent).not.toContain('negative CAC');
    });

    it('uses "Terverifikasi sebagai Meta Tech Provider" and avoids describing verification as "resmi"', () => {
      expect(pageContent).toContain("resolvedCustomHtml\n                  .replace(/Official Meta Tech Provider/gi, 'Terverifikasi sebagai Meta Tech Provider')\n                  .replace(/resmi sebagai Meta Tech Provider/gi, 'Terverifikasi sebagai Meta Tech Provider')");
    });

    it('uses compliant WhatsApp risk phrasing without no-ban guarantees', () => {
      expect(pageContent).toContain("resolvedCustomHtml\n                  .replace(/proteksi pemblokiran sepihak/gi, 'membantu mematuhi kebijakan Meta dan mitigasi risiko operasional')\n                  .replace(/anti[- ]banned/gi, 'membantu mematuhi kebijakan Meta dan mitigasi risiko')");
    });

    it('uses compliant payment claim: "mengintegrasikan QRIS melalui penyedia berlisensi" without claiming direct fund holding', () => {
      expect(pageContent).toContain("resolvedCustomHtml\n                  .replace(/bayar lewat QRIS resmi/gi, 'mengintegrasikan QRIS melalui penyedia berlisensi')\n                  .replace(/Dynamic QRIS resmi langsung ke rekening pribadi/gi, 'Integrasi Dynamic QRIS melalui penyedia berlisensi langsung ke rekening Anda')\n                  .replace(/Dynamic QRIS \\(dana langsung\\)/gi, 'Integrasi Dynamic QRIS melalui penyedia berlisensi')");
    });
  });

  describe('Section F: Safe Tracking & Strict Hold Preservation', () => {
    it('dispatches Contact event only on WhatsApp click, never Purchase or premature Lead', () => {
      const mockFbq = jest.fn();
      const mockTtq = { track: jest.fn() };
      (global as any).window = { fbq: mockFbq, ttq: mockTtq };

      trackWhatsAppConsultation({
        name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        price: 249000,
      });

      expect(mockFbq).toHaveBeenCalledWith('track', 'Contact', expect.objectContaining({
        content_name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        value: 249000,
        currency: 'IDR',
      }));

      const fbqEvents = mockFbq.mock.calls.map((c) => c[1]);
      expect(fbqEvents).not.toContain('Lead');
      expect(fbqEvents).not.toContain('Purchase');

      const ttqEvents = mockTtq.track.mock.calls.map((c) => c[0]);
      expect(ttqEvents).not.toContain('Lead');
      expect(ttqEvents).not.toContain('Purchase');
      expect(ttqEvents).not.toContain('CompletePayment');
    });
  });
});
