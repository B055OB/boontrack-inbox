import {
  resolveProductCtaLabel,
  resolveProductDefaultCta,
  isProductVoucherActive,
  getProductActiveVoucher,
  ProductVoucherConfig,
  SinglePageConfig
} from '@/lib/product-catalog';

describe('Universal CTA Button Text & Voucher Decoupling', () => {
  describe('Universal CTA Label Resolution', () => {
    it('uses metadata.cta_text when provided by merchant (highest priority)', () => {
      const product = {
        name: 'Masterclass Copywriting AI',
        product_type: 'DIGITAL',
        price: 299000,
        metadata: {
          cta_text: 'Amankan Kursi Sekarang'
        }
      };

      const cta = resolveProductCtaLabel(product);
      expect(cta).toBe('Amankan Kursi Sekarang');
    });

    it('falls back to "Daftar Sekarang" for digital products/courses when cta_text is empty', () => {
      const digitalProduct = {
        name: 'Kelas FB Ads Pro',
        product_type: 'DIGITAL',
        category: 'digital',
        price: 199000
      };

      expect(resolveProductDefaultCta(digitalProduct)).toBe('Daftar Sekarang');
      expect(resolveProductCtaLabel(digitalProduct)).toBe('Daftar Sekarang');
    });

    it('falls back to "Beli Sekarang" for physical/retail products', () => {
      const physicalProduct = {
        name: 'Kaos Polos Cotton Combed',
        product_type: 'PHYSICAL',
        category: 'fisik',
        price: 75000
      };

      expect(resolveProductDefaultCta(physicalProduct)).toBe('Beli Sekarang');
      expect(resolveProductCtaLabel(physicalProduct)).toBe('Beli Sekarang');
    });

    it('falls back to "Pesan Sekarang" for service/consultation products', () => {
      const serviceProduct = {
        name: 'Audit Akun Iklan & Funnel',
        product_type: 'PROFESSIONAL_SERVICE',
        category: 'jasa',
        price: 500000
      };

      expect(resolveProductDefaultCta(serviceProduct)).toBe('Pesan Sekarang');
      expect(resolveProductCtaLabel(serviceProduct)).toBe('Pesan Sekarang');
    });

    it('returns "Klaim Akses Gratis Sekarang" when product price is 0', () => {
      const freebie = {
        name: 'Ebook Gratis Panduan Bisnis',
        product_type: 'DIGITAL',
        price: 0
      };

      expect(resolveProductCtaLabel(freebie)).toBe('Klaim Akses Gratis Sekarang');
    });
  });

  describe('Decoupled Voucher & Promo State', () => {
    it('returns false for isProductVoucherActive when toggle is disabled (is_enabled: false)', () => {
      const product = {
        name: 'Produk Retail',
        price: 100000,
        metadata: {
          voucher_config: {
            is_enabled: false,
            code: 'HEMAT50',
            discount_type: 'nominal',
            discount_value: 50000
          } as ProductVoucherConfig
        }
      };

      expect(isProductVoucherActive(product)).toBe(false);
      expect(getProductActiveVoucher(product)).toBeNull();
    });

    it('returns true and resolves active voucher when toggle is enabled (is_enabled: true)', () => {
      const product = {
        name: 'Produk Retail',
        price: 100000,
        metadata: {
          voucher_config: {
            is_enabled: true,
            code: 'PROMO20',
            discount_type: 'percentage',
            discount_value: 20,
            min_spend: 50000
          } as ProductVoucherConfig
        }
      };

      expect(isProductVoucherActive(product)).toBe(true);
      const activeVoucher = getProductActiveVoucher(product);
      expect(activeVoucher).not.toBeNull();
      expect(activeVoucher?.code).toBe('PROMO20');
      expect(activeVoucher?.discount_type).toBe('percentage');
      expect(activeVoucher?.discount_value).toBe(20);
      expect(activeVoucher?.min_spend).toBe(50000);
    });

    it('correctly respects SinglePageConfig voucher.is_enabled toggle', () => {
      const singlePageConfig: Partial<SinglePageConfig> = {
        voucher: {
          code: 'FREESHIP',
          discount_type: 'nominal',
          discount_value: 15000,
          is_enabled: false
        }
      };

      const product = {
        name: 'Buku Hardcover',
        price: 120000,
        single_page_config: singlePageConfig as SinglePageConfig
      };

      expect(isProductVoucherActive(product, singlePageConfig as SinglePageConfig)).toBe(false);
      expect(getProductActiveVoucher(product, singlePageConfig as SinglePageConfig)).toBeNull();
    });
  });
});
