import fs from 'fs';
import path from 'path';
import { CATEGORIES, VERTICAL_MAP, resolveCanonicalCategory } from '@/app/register/page';

describe('TASK: UNLOCK FNB VERTICAL REGISTRATION & REFACTOR TO 2-MODE FULFILLMENT', () => {
  const registerPath = path.join(process.cwd(), 'app/register/page.tsx');
  const notifyRoutePath = path.join(process.cwd(), 'app/api/v1/auth/notify-credentials/route.ts');
  const registerInitRoutePath = path.join(process.cwd(), 'app/api/auth/register-init/route.ts');
  const onboardRoutePath = path.join(process.cwd(), 'app/api/v1/tenants/onboard/route.ts');
  const productPagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
  const checkoutModalPath = path.join(process.cwd(), 'app/components/CheckoutModal.tsx');

  let registerCode: string;
  let notifyRouteCode: string;
  let registerInitCode: string;
  let onboardRouteCode: string;
  let productPageCode: string;
  let checkoutModalCode: string;

  beforeAll(() => {
    registerCode = fs.readFileSync(registerPath, 'utf-8');
    notifyRouteCode = fs.readFileSync(notifyRoutePath, 'utf-8');
    registerInitCode = fs.readFileSync(registerInitRoutePath, 'utf-8');
    onboardRouteCode = fs.readFileSync(onboardRoutePath, 'utf-8');
    productPageCode = fs.readFileSync(productPagePath, 'utf-8');
    checkoutModalCode = fs.readFileSync(checkoutModalPath, 'utf-8');
  });

  describe('1. Unlock Kategori F&B di Halaman Registrasi', () => {
    it('should have FOOD category in CATEGORIES without comingSoon flag', () => {
      const foodCategory = CATEGORIES.find((c) => c.id === 'FOOD');
      expect(foodCategory).toBeDefined();
      expect(foodCategory?.label).toBe('Food & Beverage (Kuliner)');
      expect((foodCategory as any)?.comingSoon).toBeFalsy();
    });

    it('should resolve FOOD, FNB, and KULINER to canonical category FOOD', () => {
      expect(resolveCanonicalCategory('FOOD')).toBe('FOOD');
      expect(resolveCanonicalCategory('food')).toBe('FOOD');
      expect(resolveCanonicalCategory('FNB')).toBe('FOOD');
      expect(resolveCanonicalCategory('fnb')).toBe('FOOD');
      expect(resolveCanonicalCategory('KULINER')).toBe('FOOD');
      expect(resolveCanonicalCategory('kuliner')).toBe('FOOD');
      expect(VERTICAL_MAP['FOOD']).toBe('FOOD');
      expect(VERTICAL_MAP['FNB']).toBe('FOOD');
    });

    it('should not contain Coming Soon blocker in register form', () => {
      expect(registerCode).not.toContain('Kategori Kuliner & F&B saat ini berstatus Coming Soon');
      expect(registerCode).not.toContain('cat.id === "FOOD" || cat.id === "fnb")');
    });

    it('should not block FNB or FOOD in notify-credentials API route', () => {
      expect(notifyRouteCode).not.toContain("categoryCheck === 'FNB' || categoryCheck === 'FOOD'");
      expect(notifyRouteCode).not.toContain('Kategori Kuliner & F&B (Food & Beverage) saat ini berstatus Coming Soon');
    });
  });

  describe('2. Bersihkan Opsi Makan di Meja dari Preset F&B', () => {
    it('should remove Makan di Meja and Nomor Meja Resto from product page', () => {
      expect(productPageCode).not.toContain('Makan di Meja');
      expect(productPageCode).not.toContain('Makan di Tempat');
      expect(productPageCode).not.toContain('Nomor Meja Resto');
      expect(productPageCode).not.toContain("foodDiningOption === 'DINE_IN'");
      expect(productPageCode).not.toContain("tableNumber");
      expect(productPageCode).not.toContain("table_number");
    });

    it('should remove Makan di Meja and Nomor Meja Resto from CheckoutModal', () => {
      expect(checkoutModalCode).not.toContain('Makan di Meja');
      expect(checkoutModalCode).not.toContain('Nomor Meja Resto');
      expect(checkoutModalCode).not.toContain("foodDiningOption === 'DINE_IN'");
      expect(checkoutModalCode).not.toContain("tableNumber");
      expect(checkoutModalCode).not.toContain("table_number");
    });

    it('should retain strictly 2 fulfillment modes in F&B (Kurir Instan & Self-Pickup)', () => {
      expect(productPageCode).toContain("foodDiningOption === 'INSTANT'");
      expect(productPageCode).toContain("foodDiningOption === 'PICKUP'");
      expect(productPageCode).toContain('kitchenNotes');
      expect(checkoutModalCode).toContain("foodDiningOption === 'INSTANT'");
      expect(checkoutModalCode).toContain("foodDiningOption === 'PICKUP'");
    });

    it('should route table reservation / dine-in booking needs to Service module', () => {
      expect(checkoutModalCode).toContain("rawProductType === 'reservasi'");
      expect(checkoutModalCode).toContain("rawProductType === 'service'");
      expect(checkoutModalCode).toContain("rawProductType === 'booking'");
    });
  });

  describe('3. Sambungkan Template & Konfigurasi Default Saat Tenant F&B Terdaftar', () => {
    it('should provision F&B capabilities and settings in register-init route without dine-in', () => {
      expect(registerInitCode).toContain('fnb: isFood');
      expect(registerInitCode).toContain('fnb_settings: isFood ?');
      expect(registerInitCode).toContain('instant_delivery_enabled: true');
      expect(registerInitCode).toContain('self_pickup_enabled: true');
      expect(registerInitCode).toContain('kitchen_notes_enabled: true');
      expect(registerInitCode).not.toContain('dine_in_enabled: true');
      expect(registerInitCode).toContain("template: isFood ? 'FOOD' : 'COMMERCE_TEMPLATE'");
      expect(registerInitCode).toContain('saveStoreShippingConfig');
    });

    it('should provision F&B capabilities and settings in tenants/onboard route without dine-in', () => {
      expect(onboardRouteCode).toContain('fnb: isFood');
      expect(onboardRouteCode).toContain('fnb_settings: isFood ?');
      expect(onboardRouteCode).toContain('instant_delivery_enabled: true');
      expect(onboardRouteCode).toContain('self_pickup_enabled: true');
      expect(onboardRouteCode).toContain('kitchen_notes_enabled: true');
      expect(onboardRouteCode).not.toContain('dine_in_enabled: true');
      expect(onboardRouteCode).toContain("template: isFood ? 'FOOD'");
      expect(onboardRouteCode).toContain('saveStoreShippingConfig');
    });
  });
});
