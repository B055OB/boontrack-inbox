import { resolveCategoryLabels, SinglePageConfig } from '@/lib/product-catalog';

describe('Multi-Category Labels & Copywriting Resolver', () => {
  describe('Default Fallbacks based on Product Category/Type', () => {
    it('resolves correct default copy for PHYSICAL products', () => {
      const labels = resolveCategoryLabels(null, 'PHYSICAL', 'retail');

      expect(labels.priceLabel).toBe('TOTAL HARGA');
      expect(labels.headerSecurityBadge).toBe('Garansi 100% Produk Original');
      expect(labels.comparisonTitle).toBe('Kenapa Memilih Produk Kami Dibanding Merk Lain?');
      expect(labels.comparisonThemLabel).toBe('Produk Pasaran / Lainnya');
      expect(labels.comparisonUsLabel).toBe('Kelebihan Produk Ini');
      expect(labels.socialProofBadge).toBe('Ulasan Pembeli Terverifikasi');
      expect(labels.testimonialsTitle).toBe('Apa Kata Pembeli Kami?');
      expect(labels.verifiedUserLabel).toBe('Pembeli Terverifikasi');
      expect(labels.verifiedStatusLabel).toBe('Pesanan Selesai');
      expect(labels.checkoutSectionTitle).toBe('Formulir Pengiriman & Pembayaran');
      expect(labels.cartCheckoutButton).toBe('Lanjut ke Pengiriman & Bayar');
    });

    it('resolves correct default copy for FOOD / CULINARY products', () => {
      const labels = resolveCategoryLabels(null, 'FOOD', 'kuliner');

      expect(labels.priceLabel).toBe('TOTAL HARGA');
      expect(labels.headerSecurityBadge).toBe('Jaminan Mutu & Higienis');
      expect(labels.comparisonTitle).toBe('Kenapa Memilih Menu Kami Dibanding Lainnya?');
      expect(labels.comparisonThemLabel).toBe('Menu Lain / Pasaran');
      expect(labels.comparisonUsLabel).toBe('Keunggulan Menu Kami');
      expect(labels.testimonialsTitle).toBe('Apa Kata Penikmat Kuliner Kami?');
      expect(labels.verifiedStatusLabel).toBe('Puas & Kenyang');
      expect(labels.ctaLabel).toBe('Pesan Menu Sekarang');
    });

    it('resolves correct default copy for SERVICE / JASA products', () => {
      const labels = resolveCategoryLabels(null, 'FIELD_SERVICE', 'jasa');

      expect(labels.priceLabel).toBe('TOTAL INVESTASI / BIAYA');
      expect(labels.headerSecurityBadge).toBe('Layanan Profesional Terverifikasi');
      expect(labels.comparisonTitle).toBe('Kenapa Memilih Layanan Kami Dibanding Cara Lain?');
      expect(labels.comparisonThemLabel).toBe('Cara Lain / Konvensional');
      expect(labels.comparisonUsLabel).toBe('Solusi Layanan Ini');
      expect(labels.socialProofBadge).toBe('Testimoni Klien Terverifikasi');
      expect(labels.testimonialsTitle).toBe('Kepuasan & Ulasan Klien Kami');
      expect(labels.verifiedUserLabel).toBe('Klien Terverifikasi');
      expect(labels.verifiedStatusLabel).toBe('Pengerjaan Tuntas');
      expect(labels.ctaLabel).toBe('Booking Jadwal Sekarang');
    });

    it('resolves correct default copy for DIGITAL / COURSE products (backward compatible)', () => {
      const labels = resolveCategoryLabels(null, 'DIGITAL', 'ecourse');

      expect(labels.priceLabel).toBe('TOTAL INVESTASI');
      expect(labels.headerSecurityBadge).toBe('Garansi Akses Resmi');
      expect(labels.comparisonTitle).toBe('Kenapa Memilih Solusi Kami Dibanding Cara Lain?');
      expect(labels.comparisonThemLabel).toBe('Cara Lain / Lama');
      expect(labels.comparisonUsLabel).toBe('Solusi Produk Ini');
      expect(labels.socialProofBadge).toBe('Hasil Nyata Member');
      expect(labels.testimonialsTitle).toBe('Bukti Nyata & Kepuasan Pengguna');
      expect(labels.verifiedUserLabel).toBe('Verified User');
      expect(labels.verifiedStatusLabel).toBe('Sukses');
      expect(labels.checkoutSectionTitle).toBe('Form Pemesanan & Pembayaran');
      expect(labels.cartCheckoutButton).toBe('Lanjut ke Checkout');
    });
  });

  describe('Merchant Custom Overrides via SinglePageConfig.labels', () => {
    it('prioritizes explicit merchant overrides over category defaults', () => {
      const customConfig: SinglePageConfig = {
        headline: 'Sneakers Premium',
        subheadline: 'Sepatu kulit handcrafted',
        banner_url: 'https://example.com/banner.jpg',
        discount_coupon: '',
        enable_qris: true,
        enable_manual_transfer: true,
        affiliate_commission_rate: 0,
        labels: {
          price_label: 'HARGA SPESIAL HARI INI',
          header_security_badge: '100% Kulit Asli Garansi Tukar Ukuran',
          comparison_title: 'Kenapa Sepatu Kami Lebih Awet?',
          comparison_them_label: 'Sepatu Kulit Pasaran (Sintetis)',
          comparison_us_label: 'Sepatu Kulit Asli Sapi Handcrafted',
          testimonials_title: 'Review Jujur Teman Sneakers',
          verified_user_label: 'Pembeli Asli',
          checkout_section_title: 'Isi Data Penerima Paket Sepatu',
          add_to_cart_label: '+ Masukkan Tas Belanja',
        },
      };

      const labels = resolveCategoryLabels(customConfig, 'PHYSICAL', 'sepatu');

      expect(labels.priceLabel).toBe('HARGA SPESIAL HARI INI');
      expect(labels.headerSecurityBadge).toBe('100% Kulit Asli Garansi Tukar Ukuran');
      expect(labels.comparisonTitle).toBe('Kenapa Sepatu Kami Lebih Awet?');
      expect(labels.comparisonThemLabel).toBe('Sepatu Kulit Pasaran (Sintetis)');
      expect(labels.comparisonUsLabel).toBe('Sepatu Kulit Asli Sapi Handcrafted');
      expect(labels.testimonialsTitle).toBe('Review Jujur Teman Sneakers');
      expect(labels.verifiedUserLabel).toBe('Pembeli Asli');
      expect(labels.checkoutSectionTitle).toBe('Isi Data Penerima Paket Sepatu');
      expect(labels.addToCartLabel).toBe('+ Masukkan Tas Belanja');

      // Unset properties should still gracefully fallback to physical defaults
      expect(labels.verifiedStatusLabel).toBe('Pesanan Selesai');
      expect(labels.cartCheckoutButton).toBe('Lanjut ke Pengiriman & Bayar');
    });
  });
});
