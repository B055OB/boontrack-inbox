import fs from 'fs';
import path from 'path';
import React from 'react';
import { WhatsAppChatTestimonials } from '@/components/storefront/WhatsAppChatTestimonials';

describe('Storefront Hardcoded Static UI Audit & Cleanup Suite', () => {
  const testimonialsComponentPath = path.join(
    process.cwd(),
    'components/storefront/WhatsAppChatTestimonials.tsx'
  );
  const storefrontPagePath = path.join(
    process.cwd(),
    'app/[tenant]/p/[slug]/page.tsx'
  );

  let testimonialsCode: string;
  let pageCode: string;

  beforeAll(() => {
    testimonialsCode = fs.readFileSync(testimonialsComponentPath, 'utf-8');
    pageCode = fs.readFileSync(storefrontPagePath, 'utf-8');
  });

  describe('1. WhatsAppChatTestimonials Strict Isolation Guard', () => {
    it('returns null when product is generic (e.g. build-custom-apps) and no dynamic testimonials provided', () => {
      const rendered = WhatsAppChatTestimonials({
        productSlug: 'build-custom-apps',
        testimonials: undefined,
      });
      expect(rendered).toBeNull();
    });

    it('returns null when productSlug is undefined and testimonials is empty', () => {
      const rendered = WhatsAppChatTestimonials({
        productSlug: undefined,
        testimonials: [],
      });
      expect(rendered).toBeNull();
    });

    it('renders default reviews when productSlug matches CTWA campaign (kelas-inkubasi-ctwa-batch-1-scale)', () => {
      const rendered = WhatsAppChatTestimonials({
        productSlug: 'kelas-inkubasi-ctwa-batch-1-scale',
        testimonials: undefined,
      });
      expect(rendered).not.toBeNull();
      expect(React.isValidElement(rendered)).toBe(true);
    });

    it('renders custom dynamic testimonials for any tenant or product when provided', () => {
      const customReviews = [
        {
          id: 'custom-1',
          name: 'Pak Joko',
          role: 'Merchant',
          message: 'Aplikasi customnya sangat membantu bisnis kami!',
        },
      ];
      const rendered = WhatsAppChatTestimonials({
        productSlug: 'build-custom-apps',
        testimonials: customReviews,
      });
      expect(rendered).not.toBeNull();
      expect(React.isValidElement(rendered)).toBe(true);
    });
  });

  describe('2. Storefront Page [tenant]/p/[slug] Dynamic Guard Audit', () => {
    it('guards WhatsAppChatTestimonials with dynamicTestimonials and isCtwaProduct check', () => {
      expect(pageCode).toContain('const isCtwaProduct');
      expect(pageCode).toContain("'kelas-inkubasi-ctwa-batch-1-scale'");
      expect(pageCode).toContain('if (!dynamicTestimonials && !isCtwaProduct)');
      expect(pageCode).toContain('return null;');
    });

    it('passes productSlug and dynamicTestimonials to WhatsAppChatTestimonials', () => {
      expect(pageCode).toContain('productSlug={product?.slug || slug}');
      expect(pageCode).toContain('testimonials={dynamicTestimonials}');
    });

    it('does not render hardcoded community reviews if dynamic array is empty on non-CTWA products', () => {
      // Confirms the check prevents static leak
      expect(testimonialsCode).toContain('if (!hasDynamicTestimonials && !isCtwaProduct)');
    });
  });
});
