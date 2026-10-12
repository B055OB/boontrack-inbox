import fs from 'fs';
import path from 'path';

describe('TASK: Dynamic Custom CTA Button & WhatsApp Bubble Testimonials', () => {
  const testimonialsComponentPath = path.join(
    process.cwd(),
    'components/storefront/WhatsAppChatTestimonials.tsx'
  );
  const stickyComponentPath = path.join(
    process.cwd(),
    'components/storefront/StickyBuyButton.tsx'
  );
  const storefrontPagePath = path.join(
    process.cwd(),
    'app/[tenant]/p/[slug]/page.tsx'
  );

  let testimonialsCode: string;
  let stickyCode: string;
  let pageCode: string;

  beforeAll(() => {
    testimonialsCode = fs.readFileSync(testimonialsComponentPath, 'utf-8');
    stickyCode = fs.readFileSync(stickyComponentPath, 'utf-8');
    pageCode = fs.readFileSync(storefrontPagePath, 'utf-8');
  });

  describe('1. Dynamic Custom CTA Button in Storefront Detail', () => {
    it('should read cta_mode, cta_label, cta_target_url, and cta_pixel_event from product.metadata', () => {
      expect(pageCode).toContain('product?.metadata');
      expect(pageCode).toContain('cta_mode');
      expect(pageCode).toContain('cta_target_url');
      expect(pageCode).toContain('cta_label');
      expect(pageCode).toContain('cta_pixel_event');
    });

    it('should determine isCustomLinkMode dynamically without hardcoding slug names', () => {
      expect(pageCode).toContain("ctaMode === 'custom_link'");
      expect(pageCode).toContain('isCustomLinkMode');
      // STRICT ARCHITECTURE GUARDRAILS: ZERO HARDCODING POLICY
      expect(pageCode).not.toContain("slug === 'onlineboost'");
      expect(pageCode).not.toContain("tenant === 'onlineboost'");
    });

    it('should replace standard checkout button with custom CTA button when isCustomLinkMode is true', () => {
      expect(pageCode).toContain('isCustomLinkMode ? (');
      expect(pageCode).toContain('id="custom-cta-button"');
      expect(pageCode).toContain('data-testid="custom-cta-button"');
      expect(pageCode).toContain('onClick={handleCustomCtaClick}');
    });

    it('should track Meta Pixel and dispatch CAPI with value and IDR currency on custom CTA click', () => {
      expect(pageCode).toContain('handleCustomCtaClick');
      // Browser Pixel
      expect(pageCode).toContain("currency: 'IDR'");
      expect(pageCode).toContain("fbq('track', ctaPixelEvent");
      // Server-Side CAPI
      expect(pageCode).toContain("fetch('/api/v1/tracking/capi'");
      expect(pageCode).toContain('eventName: ctaPixelEvent');
      expect(pageCode).toContain("currency: 'IDR'");
    });

    it('should open cta_target_url on click with popup blocker fallback to window.location.assign', () => {
      expect(pageCode).toContain("window.open(ctaTargetUrl, '_blank', 'noopener,noreferrer')");
      expect(pageCode).toContain('window.location.assign(ctaTargetUrl)');
    });

    it('should pass custom CTA props to StickyBuyButton', () => {
      expect(pageCode).toContain('isCustomLinkMode={isCustomLinkMode}');
      expect(pageCode).toContain('customCtaUrl={ctaTargetUrl}');
      expect(pageCode).toContain('customCtaLabel={ctaCustomLabel}');
      expect(pageCode).toContain('onCustomCtaClick={handleCustomCtaClick}');
    });

    it('should wire custom CTA in StickyBuyButton component', () => {
      expect(stickyCode).toContain('isCustomLinkMode?: boolean;');
      expect(stickyCode).toContain('customCtaUrl?: string;');
      expect(stickyCode).toContain('customCtaLabel?: string;');
      expect(stickyCode).toContain('onCustomCtaClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;');
      expect(stickyCode).toContain('id="sticky-custom-cta-button"');
    });
  });

  describe('2. Compact WhatsApp Chat Bubble Testimonials Section', () => {
    it('should render WhatsAppChatTestimonials component with correct WhatsApp theme styles', () => {
      expect(testimonialsCode).toContain('bg-[#E7FFDB]'); // WhatsApp green bubble background
      expect(testimonialsCode).toContain('#34B7F1'); // WhatsApp blue double tick color
      expect(testimonialsCode).toContain('CheckCheck'); // Blue double ticks icon
    });

    it('should render in a 2-column grid layout', () => {
      expect(testimonialsCode).toContain('grid grid-cols-1 sm:grid-cols-2');
    });

    it('should include Mas Dimas (Brand Owner) review for natural AI bot', () => {
      expect(testimonialsCode).toContain('Mas Dimas');
      expect(testimonialsCode).toContain('Brand Owner');
      expect(testimonialsCode).toMatch(/bot AI.*natural/i);
    });

    it('should include Rian Aditya (Affiliate Marketer) review for QRIS Dinamis 0% MDR fee', () => {
      expect(testimonialsCode).toContain('Rian Aditya');
      expect(testimonialsCode).toContain('Affiliate Marketer');
      expect(testimonialsCode).toContain('QRIS Dinamis 0% MDR fee');
    });

    it('should include Hendra K. (Digital Creator) review for 24-hour full automation', () => {
      expect(testimonialsCode).toContain('Hendra K.');
      expect(testimonialsCode).toContain('Digital Creator');
      expect(testimonialsCode).toMatch(/otomatis 24 jam/i);
    });

    it('should include Fikri Pratama (Media Buyer) review for Batch 1 & Whitelist (WL) accounts', () => {
      expect(testimonialsCode).toContain('Fikri Pratama');
      expect(testimonialsCode).toContain('Media Buyer');
      expect(testimonialsCode).toMatch(/Batch 1/i);
      expect(testimonialsCode).toMatch(/Whitelist/i);
    });

    it('should place WhatsAppChatTestimonials directly above checkout-section in storefront page', () => {
      expect(pageCode).toContain('<WhatsAppChatTestimonials');
      const waIndex = pageCode.indexOf('<WhatsAppChatTestimonials');
      const checkoutIndex = pageCode.indexOf('id="checkout-section"');
      expect(waIndex).toBeGreaterThan(-1);
      expect(checkoutIndex).toBeGreaterThan(-1);
      expect(waIndex).toBeLessThan(checkoutIndex);
    });
  });
});
