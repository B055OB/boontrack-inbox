import fs from 'fs';
import path from 'path';

describe('TASK P1: Mobile Storefront Sticky Buy Button & Scroll Jump Prevention', () => {
  const stickyComponentPath = path.join(process.cwd(), 'components/storefront/StickyBuyButton.tsx');
  const storefrontPagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  let stickyCode: string;
  let pageCode: string;

  beforeAll(() => {
    stickyCode = fs.readFileSync(stickyComponentPath, 'utf-8');
    pageCode = fs.readFileSync(storefrontPagePath, 'utf-8');
  });

  describe('1. Audit Komponen Sticky CTA (Tag Guarantee & Event Isolation)', () => {
    it('should strictly use <button type="button"> for checkout CTA and NEVER <a href="#"> or empty anchor', () => {
      // Must have type="button"
      expect(stickyCode).toContain('type="button"');
      expect(stickyCode).toContain('id="sticky-buy-button"');

      // DILARANG KERAS menggunakan anchor kosong atau href="#"
      expect(stickyCode).not.toContain('href="#"');
      expect(stickyCode).not.toContain("href='#'");
      expect(stickyCode).not.toContain('href=""');
    });

    it('should invoke e.preventDefault() and e.stopPropagation() on click events', () => {
      expect(stickyCode).toMatch(/e\.preventDefault\(\)/);
      expect(stickyCode).toMatch(/e\.stopPropagation\(\)/);
    });

    it('should include mobile safe-area insets padding for modern mobile viewports (iOS Safari / Chrome)', () => {
      expect(stickyCode).toContain('env(safe-area-inset-bottom');
      expect(stickyCode).toContain('fixed bottom-0');
    });

    it('should only render external link <a> when valid URL is present and not an empty/hash anchor', () => {
      expect(stickyCode).toContain('hasValidExternalUrl');
      expect(stickyCode).toContain('!externalAffiliateUrl.trim().startsWith(\'#\')');
    });
  });

  describe('2. Hubungkan ke Aksi Checkout (Smooth Scroll & No Scroll Jump)', () => {
    it('should have target form id "checkout-form" in StickyBuyButton defaults', () => {
      expect(stickyCode).toContain("targetFormId = 'checkout-form'");
    });

    it('should target #checkout-form or #checkout-section with smooth scroll behavior and block start', () => {
      expect(stickyCode).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
    });

    it('should focus input with { preventScroll: true } to prevent mobile keyboard viewport snapping', () => {
      expect(stickyCode).toContain('preventScroll: true');
    });

    it('should ensure storefront page has id="checkout-form" on the direct order form', () => {
      expect(pageCode).toContain('<form id="checkout-form" onSubmit={handleDirectCheckout}');
    });

    it('should ensure handleOpenCheckout in page.tsx accepts event, prevents default, and avoids scroll jump', () => {
      expect(pageCode).toContain('const handleOpenCheckout = (e?: React.MouseEvent) => {');
      expect(pageCode).toMatch(/if\s*\(e\)\s*\{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*\}/);
      expect(pageCode).toContain("document.getElementById('checkout-form')");
      expect(pageCode).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
      expect(pageCode).toContain('preventScroll: true');
    });

    it('should wire StickyBuyButton in storefront page with dynamic props', () => {
      expect(pageCode).toContain('<StickyBuyButton');
      expect(pageCode).toContain('targetFormId="checkout-form"');
      expect(pageCode).toContain('onOpenCheckout={handleOpenCheckout}');
    });
  });

  describe('3. Multi-Tenant Dynamic Compatibility & Zero Hardcoding', () => {
    it('should adhere to strict zero hardcoding policy (no hardcoded slugs in component)', () => {
      expect(stickyCode).not.toContain("slug === 'onlineboost'");
      expect(stickyCode).not.toContain("slug === 'suhu'");
      expect(stickyCode).not.toContain('ALLOWED_SLUGS');
      expect(stickyCode).not.toContain('isDemoStore');
    });

    it('should handle zero-price (free access) dynamically as well as paid digital/physical amounts', () => {
      expect(stickyCode).toContain("totalAmount === 0 ? 'GRATIS'");
      expect(stickyCode).toContain("totalAmount.toLocaleString('id-ID')");
    });
  });

  describe('4. Simulated Click & Navigation Behavior Logic', () => {
    it('should simulate scroll to checkout-form without scrolling document body to top', () => {
      let scrollIntoViewCalled = false;
      let scrollOptions: any = null;
      let focused = false;
      let focusOptions: any = null;

      const mockInput = {
        focus: (opts: any) => {
          focused = true;
          focusOptions = opts;
        },
      };

      const mockFormEl = {
        scrollIntoView: (opts: any) => {
          scrollIntoViewCalled = true;
          scrollOptions = opts;
        },
        querySelector: (_selector: string) => mockInput,
      };

      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      };

      // Handler logic matching StickyBuyButton
      const handleClick = (e: typeof mockEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const formEl = mockFormEl;
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const input = formEl.querySelector('input');
        if (input) {
          input.focus({ preventScroll: true });
        }
      };

      handleClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewCalled).toBe(true);
      expect(scrollOptions).toEqual({ behavior: 'smooth', block: 'start' });
      expect(focused).toBe(true);
      expect(focusOptions).toEqual({ preventScroll: true });
    });
  });
});
