import {
  buildWabaStorefrontConsultationUrl,
} from '@/app/[tenant]/p/[slug]/page';
import { SinglePageConfig } from '@/lib/product-catalog';

describe('Single Page Checkout Action Mode & WhatsApp Pre-fill Draft', () => {
  describe('buildWabaStorefrontConsultationUrl with customMessage', () => {
    it('should correctly interpolate {nama_produk} variable in custom draft message', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kopi Arabika Gayo 250g',
        storeName: 'KopiKita',
        tenantSlug: 'kopikita',
        productSlug: 'kopi-arabika',
        tenantWhatsApp: '081234567890',
        customMessage: 'Halo Admin, saya tertarik dengan produk {nama_produk}. Boleh minta info lebih detail?',
      });

      expect(result.number).toBe('6281234567890');
      expect(result.text).toBe(
        'Halo Admin, saya tertarik dengan produk Kopi Arabika Gayo 250g. Boleh minta info lebih detail?'
      );
      expect(result.url).toBe(
        `https://wa.me/6281234567890?text=${encodeURIComponent(
          'Halo Admin, saya tertarik dengan produk Kopi Arabika Gayo 250g. Boleh minta info lebih detail?'
        )}`
      );
    });

    it('should interpolate {nama_toko} and case-insensitive variables', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Kelas Master Ads',
        storeName: 'Scale Akademi',
        tenantSlug: 'scaleakademi',
        productSlug: 'master-ads',
        tenantWhatsApp: '628987654321',
        customMessage: 'Halo {nama_toko}, mau tanya promo untuk {NAMA_PRODUK}',
      });

      expect(result.text).toBe('Halo Scale Akademi, mau tanya promo untuk Kelas Master Ads');
      expect(result.url).toContain('https://wa.me/628987654321?text=');
    });

    it('should fallback to standard ref tag message when customMessage is empty or omitted', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Paket Hemat',
        storeName: 'Toko Berkah',
        tenantSlug: 'tokoberkah',
        productSlug: 'paket-hemat',
        tenantWhatsApp: '081234567890',
        customMessage: '',
      });

      expect(result.text).toBe(
        'Halo Kak, saya tertarik dengan Paket Hemat. Boleh minta info lebih detail? (Ref: tokoberkah#paket-hemat)'
      );
    });
  });

  describe('SinglePageConfig Action Mode Typings', () => {
    it('should allow DIRECT, WHATSAPP, and HYBRID action modes', () => {
      const directConfig: SinglePageConfig = {
        headline: 'Test Direct',
        subheadline: 'Direct checkout order',
        banner_url: '',
        discount_coupon: '',
        enable_qris: true,
        enable_manual_transfer: true,
        affiliate_commission_rate: 0,
        checkout_action_mode: 'DIRECT',
      };
      expect(directConfig.checkout_action_mode).toBe('DIRECT');

      const waConfig: SinglePageConfig = {
        ...directConfig,
        checkout_action_mode: 'WHATSAPP',
        whatsapp_custom_message: 'Halo Admin, saya tertarik dengan produk {nama_produk}...',
      };
      expect(waConfig.checkout_action_mode).toBe('WHATSAPP');
      expect(waConfig.whatsapp_custom_message).toBe('Halo Admin, saya tertarik dengan produk {nama_produk}...');

      const hybridConfig: SinglePageConfig = {
        ...directConfig,
        checkout_action_mode: 'HYBRID',
      };
      expect(hybridConfig.checkout_action_mode).toBe('HYBRID');
    });
  });
});
