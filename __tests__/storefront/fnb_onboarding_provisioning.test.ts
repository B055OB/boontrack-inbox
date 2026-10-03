import fs from 'fs';
import path from 'path';
import { CATEGORIES, VERTICAL_MAP, resolveCanonicalCategory } from '@/app/register/page';

describe('TASK: UNLOCK FNB VERTICAL REGISTRATION & DEFAULT FOOD PROVISIONING', () => {
  const registerPath = path.join(process.cwd(), 'app/register/page.tsx');
  const notifyRoutePath = path.join(process.cwd(), 'app/api/v1/auth/notify-credentials/route.ts');
  const registerInitRoutePath = path.join(process.cwd(), 'app/api/auth/register-init/route.ts');
  const onboardRoutePath = path.join(process.cwd(), 'app/api/v1/tenants/onboard/route.ts');
  const productPagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  let registerCode: string;
  let notifyRouteCode: string;
  let registerInitCode: string;
  let onboardRouteCode: string;
  let productPageCode: string;

  beforeAll(() => {
    registerCode = fs.readFileSync(registerPath, 'utf-8');
    notifyRouteCode = fs.readFileSync(notifyRoutePath, 'utf-8');
    registerInitCode = fs.readFileSync(registerInitRoutePath, 'utf-8');
    onboardRouteCode = fs.readFileSync(onboardRoutePath, 'utf-8');
    productPageCode = fs.readFileSync(productPagePath, 'utf-8');
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

  describe('2. Sambungkan Template & Konfigurasi Default Saat Tenant F&B Terdaftar', () => {
    it('should provision F&B capabilities and settings in register-init route', () => {
      expect(registerInitCode).toContain('fnb: isFood');
      expect(registerInitCode).toContain('fnb_settings: isFood ?');
      expect(registerInitCode).toContain('dine_in_enabled: true');
      expect(registerInitCode).toContain('instant_delivery_enabled: true');
      expect(registerInitCode).toContain('self_pickup_enabled: true');
      expect(registerInitCode).toContain('kitchen_notes_enabled: true');
      expect(registerInitCode).toContain("template: isFood ? 'FOOD' : 'COMMERCE_TEMPLATE'");
      expect(registerInitCode).toContain('saveStoreShippingConfig');
    });

    it('should provision F&B capabilities and settings in tenants/onboard route', () => {
      expect(onboardRouteCode).toContain('fnb: isFood');
      expect(onboardRouteCode).toContain('fnb_settings: isFood ?');
      expect(onboardRouteCode).toContain('dine_in_enabled: true');
      expect(onboardRouteCode).toContain('instant_delivery_enabled: true');
      expect(onboardRouteCode).toContain('self_pickup_enabled: true');
      expect(onboardRouteCode).toContain('kitchen_notes_enabled: true');
      expect(onboardRouteCode).toContain("template: isFood ? 'FOOD'");
      expect(onboardRouteCode).toContain('saveStoreShippingConfig');
    });

    it('should activate isFoodPreset for tenant with FOOD template or category in storefront product page', () => {
      expect(productPageCode).toContain("tenantData?.metadata?.template === 'FOOD'");
      expect(productPageCode).toContain("(config as any)?.template === 'FOOD'");
      expect(productPageCode).toContain("foodDiningOption === 'DINE_IN'");
      expect(productPageCode).toContain("foodDiningOption === 'INSTANT'");
      expect(productPageCode).toContain("foodDiningOption === 'PICKUP'");
      expect(productPageCode).toContain('kitchenNotes');
    });
  });
});
