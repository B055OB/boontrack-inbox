import {
  buildWabaStorefrontConsultationUrl,
  normalizeStorefrontWhatsAppNumber,
  WABA_HOLDING_NUMBER,
  WABA_OFFICIAL_NUMBER,
} from '@/app/[tenant]/p/[slug]/page';
import fs from 'fs';
import path from 'path';

describe('Storefront Floating CTA - Tenant WhatsApp Isolation', () => {
  it('should lock holding number 6285181830080 for platform enterprise concierge', () => {
    expect(WABA_HOLDING_NUMBER).toBe('6285181830080');
    expect(WABA_OFFICIAL_NUMBER).toBe('6285181830080');
  });

  describe('normalizeStorefrontWhatsAppNumber', () => {
    it('should normalize Indonesian local numbers (08... or +62...) to E.164 format (628...)', () => {
      expect(normalizeStorefrontWhatsAppNumber('081234567890')).toBe('6281234567890');
      expect(normalizeStorefrontWhatsAppNumber('+62 812-3456-7890')).toBe('6281234567890');
      expect(normalizeStorefrontWhatsAppNumber('81234567890')).toBe('6281234567890');
      expect(normalizeStorefrontWhatsAppNumber('6281234567890')).toBe('6281234567890');
    });

    it('should strictly reject and isolate holding WABA number (zero-holding fallback)', () => {
      // Dilarang keras fallback ke holding concierge
      expect(normalizeStorefrontWhatsAppNumber('6285181830080')).toBe('');
      expect(normalizeStorefrontWhatsAppNumber('085181830080')).toBe('');
      expect(normalizeStorefrontWhatsAppNumber('+62 851-8183-0080')).toBe('');
    });

    it('should return empty string for null, undefined, or empty phone numbers', () => {
      expect(normalizeStorefrontWhatsAppNumber('')).toBe('');
      expect(normalizeStorefrontWhatsAppNumber(null)).toBe('');
      expect(normalizeStorefrontWhatsAppNumber(undefined)).toBe('');
      expect(normalizeStorefrontWhatsAppNumber('---')).toBe('');
    });
  });

  describe('buildWabaStorefrontConsultationUrl', () => {
    it('should build consultation URL to tenant WhatsApp with standardized ref tag and prefilled message', () => {
      const result = buildWabaStorefrontConsultationUrl({
        productName: 'Modul CPM 24 Jam',
        storeName: 'OnlineBoost',
        tenantSlug: 'onlineboost',
        productSlug: 'cpm24',
        tenantWhatsApp: '081234567890',
      });

      expect(result.number).toBe('6281234567890');
      expect(result.text).toBe(
        'Halo Kak, saya tertarik dengan Modul CPM 24 Jam. Boleh minta info lebih detail? (Ref: onlineboost#cpm24)'
      );

      const expectedUrl = `https://wa.me/6281234567890?text=${encodeURIComponent(
        'Halo Kak, saya tertarik dengan Modul CPM 24 Jam. Boleh minta info lebih detail? (Ref: onlineboost#cpm24)'
      )}`;
      expect(result.url).toBe(expectedUrl);
    });

    it('should hide CTA (empty url & number) if tenant WhatsApp is missing without falling back to holding', () => {
      const resultWithoutNumber = buildWabaStorefrontConsultationUrl({
        productName: 'Jasa Kuras Toren',
        storeName: 'Suhu Toren',
        tenantSlug: 'suhutoren',
        productSlug: 'kuras-toren',
        tenantWhatsApp: '',
      });

      expect(resultWithoutNumber.number).toBe('');
      expect(resultWithoutNumber.url).toBe('');
      expect(resultWithoutNumber.text).toBe(
        'Halo Kak, saya tertarik dengan Jasa Kuras Toren. Boleh minta info lebih detail? (Ref: suhutoren#kuras-toren)'
      );
    });

    it('should hide CTA (empty url & number) if tenant WhatsApp is holding number 085181830080', () => {
      const resultHolding = buildWabaStorefrontConsultationUrl({
        productName: 'Jasa Kuras Toren',
        storeName: 'Suhu Toren',
        tenantSlug: 'suhutoren',
        productSlug: 'kuras-toren',
        tenantWhatsApp: '085181830080',
      });

      expect(resultHolding.number).toBe('');
      expect(resultHolding.url).toBe('');
    });

    it('should support backward compatible botNumber parameter', () => {
      const resultWithBotNumber = buildWabaStorefrontConsultationUrl({
        productName: 'Ecourse AI',
        storeName: 'EduStore',
        tenantSlug: 'edustore',
        productSlug: 'ecourse-ai',
        botNumber: '+62 878-1122-3344',
      });

      expect(resultWithBotNumber.number).toBe('6287811223344');
      expect(resultWithBotNumber.url).toBe(
        `https://wa.me/6287811223344?text=${encodeURIComponent(
          'Halo Kak, saya tertarik dengan Ecourse AI. Boleh minta info lebih detail? (Ref: edustore#ecourse-ai)'
        )}`
      );
    });
  });

  describe('Holding Configuration Integrity', () => {
    it('should ensure .env and .env.local retain NEXT_PUBLIC_META_BOT_NUMBER=6285181830080 for platform holding', () => {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        expect(envContent).toMatch(/NEXT_PUBLIC_META_BOT_NUMBER=["']?6285181830080["']?/);
      }

      const envLocalPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envLocalPath)) {
        const envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
        expect(envLocalContent).toMatch(/NEXT_PUBLIC_META_BOT_NUMBER=["']?6285181830080["']?/);
      }
    });
  });
});
