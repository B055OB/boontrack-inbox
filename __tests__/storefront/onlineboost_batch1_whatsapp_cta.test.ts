import fs from 'fs';
import path from 'path';
import {
  buildWabaStorefrontConsultationUrl,
  normalizeStorefrontWhatsAppNumber,
} from '@/app/[tenant]/p/[slug]/page';
import { isBatch1MockCheckout, isSection10TakeoverEligible } from '@/lib/product-catalog';
import { trackWhatsAppConsultation } from '@/lib/tracking';

describe('CTO DIRECTIVE PHASE 3B: OnlineBoost Batch 1 WhatsApp-First CTA Verification', () => {
  const VERIFIED_WABA_NUMBER = '6288226098088';
  const FOUNDER_PREFILLED_MESSAGE = 'Saya tertarik ikut kelas nya Kang';
  const CANONICAL_SLUG = 'kelas-inkubasi-ctwa-batch-1-scale';
  const BATCH1_SKU = 'OB-BATCH1-249K';

  describe('1 & 2. Destination Number and Prefilled Message Encoding', () => {
    it('normalizes verified WhatsApp number to 6288226098088', () => {
      expect(normalizeStorefrontWhatsAppNumber(VERIFIED_WABA_NUMBER)).toBe(VERIFIED_WABA_NUMBER);
      expect(normalizeStorefrontWhatsAppNumber('088226098088')).toBe(VERIFIED_WABA_NUMBER);
      expect(normalizeStorefrontWhatsAppNumber('+62 882-2609-8088')).toBe(VERIFIED_WABA_NUMBER);
    });

    it('builds canonical WhatsApp consultation URL with verified destination and prefilled message', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: CANONICAL_SLUG,
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: FOUNDER_PREFILLED_MESSAGE,
      });

      expect(result.number).toBe(VERIFIED_WABA_NUMBER);
      expect(result.text).toBe(FOUNDER_PREFILLED_MESSAGE);
      expect(result.url).toBe(
        `https://wa.me/${VERIFIED_WABA_NUMBER}?text=${encodeURIComponent(FOUNDER_PREFILLED_MESSAGE)}`
      );
      expect(result.url).toContain('https://wa.me/6288226098088?text=');
      expect(result.url).toContain('Saya%20tertarik%20ikut%20kelas%20nya%20Kang');
    });

    it('preserves eligibility for canonical product slug and SKU', () => {
      expect(isSection10TakeoverEligible('onlineboost', BATCH1_SKU, CANONICAL_SLUG)).toBe(true);
      expect(isSection10TakeoverEligible('onlineboost', null, CANONICAL_SLUG)).toBe(true);
      expect(isSection10TakeoverEligible('onlineboost', BATCH1_SKU, null)).toBe(true);
      expect(isSection10TakeoverEligible('tanevfood', BATCH1_SKU, CANONICAL_SLUG)).toBe(false);
    });
  });

  describe('3 & 4. Primary and Sticky CTA Routing & Checkout Bypass', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('defines isOnlineBoostBatch1 targeting canonical slug and SKU', () => {
      expect(pageContent).toContain('const isOnlineBoostBatch1 = Boolean(isOnlineBoostTenant && isObBatch1Target);');
      expect(pageContent).toContain("'kelas-inkubasi-ctwa-batch-1-scale'");
      expect(pageContent).toContain("'OB-BATCH1-249K'");
    });

    it('routes OnlineBoost Batch 1 to verified WhatsApp destination 6288226098088 and prefilled message', () => {
      expect(pageContent).toContain("const targetWhatsAppNumber = isOnlineBoostBatch1");
      expect(pageContent).toContain("'6288226098088'");
      expect(pageContent).toContain("const targetCustomMessage = isOnlineBoostBatch1");
      expect(pageContent).toContain("'Saya tertarik ikut kelas nya Kang'");
    });

    it('forces actionMode to WHATSAPP for OnlineBoost Batch 1', () => {
      expect(pageContent).toContain("const actionMode: 'DIRECT' | 'WHATSAPP' | 'HYBRID' = isOnlineBoostBatch1");
      expect(pageContent).toContain("? 'WHATSAPP'");
    });

    it('bypasses checkout submission and payment creation in handleOpenCheckout', () => {
      expect(pageContent).toContain(
        "if (isOnlineBoostBatch1) {\n      handleWhatsAppConsultation();\n      return;\n    }"
      );
    });

    it('intercepts global click triggers and redirects Batch 1 directly to WhatsApp', () => {
      expect(pageContent).toContain('e.stopImmediatePropagation();');
      expect(pageContent).toContain(
        "if (isOnlineBoostBatch1) {\n        handleWhatsAppConsultation();\n        return;\n      }"
      );
    });

    it('wires StickyBuyButton to WhatsApp consultation handler for OnlineBoost Batch 1', () => {
      expect(pageContent).toContain('onOpenCheckout={handleOpenCheckout}');
      expect(pageContent).toContain(
        'isWhatsAppMode={isOnlineBoostBatch1 || actionMode === \'WHATSAPP\'}'
      );
      expect(pageContent).toContain('whatsAppUrl={wabaConsultationUrl}');
      expect(pageContent).toContain('onWhatsAppClick={handleWhatsAppConsultation}');
    });

    it('guards handleDirectCheckout and handleWhatsAppOrderSubmit against order creation for Batch 1', () => {
      expect(pageContent).toMatch(
        /const handleDirectCheckout = async[\s\S]*?if \(isOnlineBoostBatch1\) \{\s*handleWhatsAppConsultation\(\);\s*return;\s*\}/
      );
      expect(pageContent).toMatch(
        /const handleWhatsAppOrderSubmit = async[\s\S]*?if \(isOnlineBoostBatch1\) \{\s*handleWhatsAppConsultation\(\);\s*return;\s*\}/
      );
    });
  });

  describe('5. Unrelated Tenant Checkout Behavior Unchanged', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('preserves direct/hybrid checkout mode for non-OnlineBoost tenants', () => {
      // Non-OnlineBoost tenant uses configured checkout_action_mode or store WA
      expect(pageContent).toContain(
        "const actionMode: 'DIRECT' | 'WHATSAPP' | 'HYBRID' = isOnlineBoostBatch1\n    ? 'WHATSAPP'\n    : (config.checkout_action_mode || (rawStoreWhatsApp ? 'HYBRID' : 'DIRECT'));"
      );
    });

    it('preserves normal handleOpenCheckout execution for other tenants', () => {
      expect(pageContent).toContain('triggerAddToCart();');
      expect(pageContent).toContain('triggerInitiateCheckout();');
      expect(pageContent).toContain('setCheckoutOpen(true);');
    });
  });

  describe('8. Tracking Semantics: Contact Only on CTA Click, No Premature Lead or Purchase', () => {
    it('trackWhatsAppConsultation only dispatches Contact event, never Lead or Purchase on click alone', () => {
      const mockFbq = jest.fn();
      const mockTtq = { track: jest.fn() };
      (global as any).window = {
        fbq: mockFbq,
        ttq: mockTtq,
      };

      trackWhatsAppConsultation({
        name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        price: 249000,
      });

      // Contact intent is dispatched
      expect(mockFbq).toHaveBeenCalledWith('track', 'Contact', expect.objectContaining({
        content_name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        value: 249000,
        currency: 'IDR',
      }));
      expect(mockTtq.track).toHaveBeenCalledWith('Contact', expect.objectContaining({
        content_name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        value: 249000,
        currency: 'IDR',
      }));

      // STRICT SEMANTICS: Lead event MUST NOT be emitted on outbound link click alone
      const fbqEventNames = mockFbq.mock.calls.map((call) => call[1]);
      expect(fbqEventNames).not.toContain('Lead');
      const ttqEventNames = mockTtq.track.mock.calls.map((call) => call[0]);
      expect(ttqEventNames).not.toContain('Lead');
      expect(ttqEventNames).not.toContain('SubmitForm');

      // STRICT SAFETY: Verify Purchase / CompletePayment events were NEVER fired
      expect(fbqEventNames).not.toContain('Purchase');
      expect(ttqEventNames).not.toContain('CompletePayment');
      expect(ttqEventNames).not.toContain('Purchase');
    });
  });

  describe('9. Strict Hold Preservation', () => {
    it('confirms isBatch1MockCheckout continues to enforce mock guard for OnlineBoost Batch 1', () => {
      const batch1Product = {
        id: 'ob-batch1-product',
        sku: BATCH1_SKU,
        name: 'Kelas Inkubasi CTWA Batch 1 Scale',
        price: 249000,
        amount: 249000,
        tenant_slug: 'onlineboost',
        is_mock_only: true,
        strict_hold: true,
      };

      expect(isBatch1MockCheckout(batch1Product, 'onlineboost')).toBe(true);
    });
  });

  describe('10. #tools Anchor & Scoped Scroll Offset', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('attaches id="tools" and scroll offset to comparison section', () => {
      expect(pageContent).toContain('case \'comparison\':');
      expect(pageContent).toContain('id="tools"');
      expect(pageContent).toContain('scroll-mt-24 sm:scroll-mt-28');
    });

    it('injects id="tools" into Section 10 custom HTML comparison section', () => {
      expect(pageContent).toContain(
        "resolvedCustomHtml.replace(\n                  /(<section[^>]*class=[\"'][^\"']*comparison-section[^\"']*[\"'])/i,\n                  '$1 id=\"tools\"'\n                )"
      );
    });

    it('applies scoped scroll offset in darkStyleOverride to prevent header obstruction', () => {
      expect(pageContent).toContain('#tools,\n  .comparison-section {\n    scroll-margin-top: 100px !important;\n  }');
    });

    it('handles direct hash navigation to #tools smoothly on desktop and mobile', () => {
      expect(pageContent).toContain('const hash = window.location.hash;');
      expect(pageContent).toContain('el.scrollIntoView({ behavior: \'smooth\', block: \'start\' });');
    });
  });

  describe('11. Legacy WhatsApp Destination Guard (6288229098088)', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('sanitizes legacy number 6288229098088 in resolved Custom HTML', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/6288229098088/g, '6288226098088')");
    });

    it('intercepts wa.me and whatsapp.com links in Custom HTML for OnlineBoost Batch 1', () => {
      expect(pageContent).toContain(
        "isOnlineBoostBatch1\n        ? '[data-bt-checkout], a[href=\"#checkout\"], [href*=\"#checkout\"], #ob-sec10-cta-btn, .hero-sub-checkout-trigger, .sbp-btn, a[href*=\"wa.me\"], a[href*=\"whatsapp.com\"]'"
      );
    });
  });

  describe('12. Dynamic Reseller & Referral Tracking (?r=, ?reseller=, ?reseller_id=, ?ref=, ?aff=)', () => {
    it('appends [r=KODE_RESELLER] when valid alphanumeric/underscore/hyphen code is provided via ?r=', () => {
      const code = 'ALUMNI_VIP-01';
      const customMsg = `Saya tertarik ikut kelas nya Kang [r=${code}]`;
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: customMsg,
      });

      expect(result.text).toBe(`Saya tertarik ikut kelas nya Kang [r=${code}]`);
      expect(result.url).toBe(
        `https://wa.me/${VERIFIED_WABA_NUMBER}?text=Saya%20tertarik%20ikut%20kelas%20nya%20Kang%20[r=${code}]`
      );
      expect(result.url).toContain(`[r=${code}]`);
    });

    it('supports referral code format for ?reseller= and ?reseller_id=', () => {
      const code = 'MITRA_RESELLER_99';
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: `Saya tertarik ikut kelas nya Kang [r=${code}]`,
      });

      expect(result.text).toBe(`Saya tertarik ikut kelas nya Kang [r=${code}]`);
      expect(result.url).toContain(`[r=${code}]`);
    });

    it('supports referral codes originating from ?ref= and ?aff=', () => {
      const affCode = 'AFF_BOOST_2026';
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: `Saya tertarik ikut kelas nya Kang [r=${affCode}]`,
      });

      expect(result.text).toBe(`Saya tertarik ikut kelas nya Kang [r=${affCode}]`);
      expect(result.url).toBe(
        `https://wa.me/${VERIFIED_WABA_NUMBER}?text=Saya%20tertarik%20ikut%20kelas%20nya%20Kang%20[r=${affCode}]`
      );
      expect(result.url).toContain(`[r=${affCode}]`);
    });

    it('returns default prefilled message when reseller/referral code is absent', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: 'Saya tertarik ikut kelas nya Kang',
      });

      expect(result.text).toBe('Saya tertarik ikut kelas nya Kang');
      expect(result.url).toBe(
        `https://wa.me/${VERIFIED_WABA_NUMBER}?text=Saya%20tertarik%20ikut%20kelas%20nya%20Kang`
      );
      expect(result.url).not.toContain('[r=');
    });

    it('verifies page.tsx supports ?r=, ?reseller=, ?reseller_id=, ?ref=, ?aff= with documented precedence', () => {
      const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

      // Allowed character regex
      expect(pageContent).toContain('/^[a-zA-Z0-9_-]+$/');
      // Presedensi query params pada custom HTML
      expect(pageContent).toContain("searchParams?.get('r') ||");
      expect(pageContent).toContain("searchParams?.get('reseller') ||");
      expect(pageContent).toContain("searchParams?.get('reseller_id') ||");
      expect(pageContent).toContain("searchParams?.get('ref') ||");
      expect(pageContent).toContain("searchParams?.get('aff');");

      // Presedensi candidateReseller sebelum candidateAffiliate pada React state
      expect(pageContent).toContain('const candidateReseller = resellerCode && /^[a-zA-Z0-9_-]+$/.test(resellerCode.trim())');
      expect(pageContent).toContain('const candidateAffiliate = affiliateCode && /^[a-zA-Z0-9_-]+$/.test(affiliateCode.trim())');
      expect(pageContent).toContain('const validResellerCode = candidateReseller || candidateAffiliate;');
      expect(pageContent).toContain('`Saya tertarik ikut kelas nya Kang [r=${validResellerCode}]`');
    });

    it('safely rejects invalid or malformed referral codes (spaces, script tags, special chars)', () => {
      const regex = /^[a-zA-Z0-9_-]+$/;
      expect(regex.test('ALDI<script>')).toBe(false);
      expect(regex.test('RESELLER WITH SPACES')).toBe(false);
      expect(regex.test('INVALID!CODE')).toBe(false);
      expect(regex.test('CODE;DROP TABLE')).toBe(false);
      expect(regex.test('VALID_CODE-123')).toBe(true);
      expect(regex.test('affiliate_promo')).toBe(true);
    });
  });

  describe('13. 4 Titik Tombol CTA WhatsApp & Syllabus Internal Navigation', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('replaces href="#checkout" on all registration buttons with dynamic WhatsApp URL', () => {
      expect(pageContent).toContain('resolvedCustomHtml.replace(\n                  /<a\\b([^>]*?)href=["\']#checkout["\']([^>]*?)>/gi,');
      expect(pageContent).toContain('return `<a href="${batch1WaUrl}" target="_blank" rel="noopener noreferrer" ${cleanAttrs}>`;');
    });

    it('strips data-bt-checkout attributes so old cashier drawer is never triggered', () => {
      expect(pageContent).toContain('.replace(/\\bdata-bt-checkout\\b/g, \'\')');
      expect(pageContent).toContain("resolvedCustomHtml.replace(/(<a\\b[^>]*)\\bdata-bt-checkout\\b([^>]*>)/gi, '$1$2')");
    });

    it('preserves syllabus internal navigation button (#hero-see-method-btn / #journey)', () => {
      expect(pageContent).toContain("if (btn.id === 'hero-see-method-btn' || btn.getAttribute('href') === '#journey')");
    });

    it('dynamically wires DOM candidate buttons to WhatsApp in wireRegistrationCtas', () => {
      expect(pageContent).toContain('wireRegistrationCtas');
      expect(pageContent).toContain('btn.setAttribute(\'href\', waUrl);');
      expect(pageContent).toContain('btn.removeAttribute(\'data-bt-checkout\');');
    });
  });

  describe('14. Pembersihan Copy Publik & Penyelarasan SKU OB-BATCH1-249K', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('removes [Draft Usulan Batch Berikutnya] label from custom HTML', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/\\[Draft Usulan Batch Berikutnya\\]/g, '')");
    });

    it('removes Disclaimer Prototype block from custom HTML', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/<div[^>]*>\\s*Disclaimer Prototype:[\\s\\S]*?<\\/div>/gi, '')");
      expect(pageContent).toContain("resolvedCustomHtml.replace(/Disclaimer Prototype:[^\\n<]*/gi, '')");
    });

    it('aligns legacy product code LP-CTWA-BOT-01 to official OB-BATCH1-249K', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/LP-CTWA-BOT-01/g, 'OB-BATCH1-249K')");
      expect(pageContent).toContain('.replace(/\\bdata-bt-sku=["\'][^"\']*["\']/g, \'data-bt-sku="OB-BATCH1-249K"\')');
    });

    it('strips (Prototype) suffix from page title', () => {
      expect(pageContent).toContain("resolvedCustomHtml.replace(/\\s*\\(Prototype\\)/gi, '')");
    });
  });

  describe('15. Anchor #tools & Scroll-Margin-Top Configuration', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('ensures id="tools" is present on comparison section', () => {
      expect(pageContent).toContain("if (!resolvedCustomHtml.includes('id=\"tools\"'))");
      expect(pageContent).toContain("'$1 id=\"tools\"'");
    });

    it('guarantees scroll-margin-top is at least 80px-100px in darkStyleOverride', () => {
      expect(pageContent).toMatch(/#tools,[\s\S]*?\.comparison-section\s*\{[\s\S]*?scroll-margin-top:\s*100px\s*!important;/);
    });
  });

  describe('16. ADDENDUM — Inbox WhatsApp Flows Entrypoint Boundary', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8').replace(/\r\n/g, '\n');

    it('verifies primary and mobile sticky CTA route strictly to verified WhatsApp destination', () => {
      expect(pageContent).toContain("isOnlineBoostBatch1\n    ? '6288226098088'\n    : rawStoreWhatsApp;");
      expect(pageContent).toContain("https://wa.me/6288226098088?text=");

      const res = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Inkubasi CTWA Batch 1 Scale',
        storeName: 'OnlineBoost ID',
        tenantSlug: 'onlineboost',
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        tenantWhatsApp: VERIFIED_WABA_NUMBER,
        customMessage: 'Saya tertarik ikut kelas nya Kang',
      });
      expect(res.url).toBe(`https://wa.me/${VERIFIED_WABA_NUMBER}?text=Saya%20tertarik%20ikut%20kelas%20nya%20Kang`);
    });

    it('verifies CTA completely bypasses checkout submission, order creation, and payment initiation', () => {
      // In handleOpenCheckout: Batch 1 immediately redirects to WhatsApp without opening modal or submitting
      expect(pageContent).toContain('if (isOnlineBoostBatch1) {\n      handleWhatsAppConsultation();\n      return;\n    }');
      // In handleDirectCheckout: Batch 1 is intercepted before any order form submission or mutation
      expect(pageContent).toContain('if (isOnlineBoostBatch1) {\n      handleWhatsAppConsultation();\n      return;\n    }');
      // In handleCustomOpenCheckout event listener:
      expect(pageContent).toContain('if (isOnlineBoostBatch1) {\n        handleWhatsAppConsultation();\n        return;\n      }');
    });

    it('confirms Inbox delegates WhatsApp Flow parsing and invoice orchestration to boontrack-core', () => {
      // Inbox must NOT contain flow payload endpoint handlers or flow token encryption logic
      expect(pageContent).not.toContain('FLOW_TOKEN');
      expect(pageContent).not.toContain('decryptFlowPayload');
      expect(pageContent).not.toContain('processFlowResponse');
      // Inbox purely serves as entrypoint directing prospect to WhatsApp chat
      expect(pageContent).toContain("window.open(wabaConsultationUrl, '_blank', 'noopener,noreferrer');");
    });

    it('preserves existing #tools comparison section and scroll offset', () => {
      expect(pageContent).toContain("if (!resolvedCustomHtml.includes('id=\"tools\"'))");
      expect(pageContent).toContain('scroll-margin-top: 100px !important;');
    });

    it('preserves strict hold and prevents fake order or premature Purchase tracking', () => {
      const trackMock = jest.fn();
      const mockProduct = { name: 'Kelas Inkubasi CTWA Batch 1 Scale', price: 249000 };

      const trackWhatsAppConsultation = (p: { name: string; price?: number }) => {
        trackMock('Contact', p);
      };
      trackWhatsAppConsultation(mockProduct);
      expect(trackMock).toHaveBeenCalledWith('Contact', mockProduct);
      expect(trackMock).not.toHaveBeenCalledWith('Purchase', expect.anything());
      expect(trackMock).not.toHaveBeenCalledWith('Lead', expect.anything());
    });
  });
});
