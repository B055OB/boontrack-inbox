import fs from 'fs';
import path from 'path';
import { resolveFulfillmentRequirements } from '@/lib/product-catalog';
import { calculateDistanceKm } from '@/app/api/v1/shipping/rates/instant/route';

describe('TASK: BIND FOOD / INSTANT COURIER TO STOREFRONT CHECKOUT FOR TANEV-FOOD', () => {
  const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
  const ratesRoutePath = path.join(process.cwd(), 'app/api/v1/shipping/rates/route.ts');
  const instantRatesRoutePath = path.join(process.cwd(), 'app/api/v1/shipping/rates/instant/route.ts');
  const checkoutModalPath = path.join(process.cwd(), 'app/components/CheckoutModal.tsx');

  let pageCode: string;
  let ratesRouteCode: string;
  let instantRatesRouteCode: string;
  let checkoutModalCode: string;

  beforeAll(() => {
    pageCode = fs.readFileSync(pagePath, 'utf-8');
    ratesRouteCode = fs.readFileSync(ratesRoutePath, 'utf-8');
    instantRatesRouteCode = fs.readFileSync(instantRatesRoutePath, 'utf-8');
    checkoutModalCode = fs.readFileSync(checkoutModalPath, 'utf-8');
  });

  describe('1. Frontend Checkout Render Logic (Storefront Single Page)', () => {
    it('should include isExplicitShippingRequired checking product.requires_shipping, product_type PHYSICAL/FOOD, and tenantCategory FOOD', () => {
      expect(pageCode).toContain('isExplicitShippingRequired');
      expect(pageCode).toContain("product.requires_shipping === true");
      expect(pageCode).toContain("product.product_type === 'FOOD'");
      expect(pageCode).toContain("product.product_type === 'PHYSICAL'");
      expect(pageCode).toContain("tenantCategory === 'FOOD'");
    });

    it('should pass requires_shipping and is_digital into dynamicProduct', () => {
      expect(pageCode).toContain('requires_shipping: Boolean(');
      expect(pageCode).toContain('is_digital: Boolean(');
    });

    it('should merge requires_shipping from sqlProd into match', () => {
      expect(pageCode).toContain('requires_shipping: (sqlProd as any).requires_shipping ?? match?.requires_shipping');
      expect(pageCode).toContain('is_digital: (sqlProd as any).is_digital ?? match?.is_digital');
    });

    it('should activate requiresShipping and requiresAddress when isExplicitShippingRequired is true', () => {
      expect(pageCode).toContain('const requiresShipping = isExplicitShippingRequired || (isEligibleForShipping && requirements.requiresShipping);');
      expect(pageCode).toContain('const requiresAddress = isExplicitShippingRequired || requiresShipping || requirements.requiresAddress;');
    });
  });

  describe('2. Fulfillment Requirements Contract', () => {
    it('should resolve FOOD productType with strategy PHYSICAL, requiresAddress: true, requiresShipping: true', () => {
      const foodReq = resolveFulfillmentRequirements('FOOD');
      expect(foodReq.strategy).toBe('PHYSICAL');
      expect(foodReq.requiresAddress).toBe(true);
      expect(foodReq.requiresShipping).toBe(true);
      expect(foodReq.requiresWeight).toBe(true);
      expect(foodReq.requiresDeliveryPayload).toBe(false);
    });

    it('should resolve PHYSICAL productType with strategy PHYSICAL, requiresAddress: true, requiresShipping: true', () => {
      const physicalReq = resolveFulfillmentRequirements('PHYSICAL');
      expect(physicalReq.strategy).toBe('PHYSICAL');
      expect(physicalReq.requiresAddress).toBe(true);
      expect(physicalReq.requiresShipping).toBe(true);
    });
  });

  describe('3. Kitchen Origin Coordinates Resolution (-7.1171, 112.5938) & Instant Courier Engine', () => {
    it('should check fnb_settings for origin latitude and longitude in shipping rates route', () => {
      expect(ratesRouteCode).toContain('biteshipCfg?.fnb_settings || metaShipping?.fnb_settings || meta.fnb_settings');
      expect(ratesRouteCode).toContain('fnbSettings.latitude');
      expect(ratesRouteCode).toContain('fnbSettings.longitude');
    });

    it('should check fnb_settings for origin coordinates in instant shipping route', () => {
      expect(instantRatesRouteCode).toContain('fnb_settings');
      expect(instantRatesRouteCode).toContain('fnbSettings.latitude');
      expect(instantRatesRouteCode).toContain('fnbSettings.longitude');
    });

    it('should accurately calculate distance between Gresik origin (-7.1171, 112.5938) and Surabaya destination', () => {
      const gresikKitchen = { lat: -7.1171, lon: 112.5938 };
      // Surabaya Barat (e.g. Tandes ~ 15 km)
      const surabayaDest = { lat: -7.2600, lon: 112.6800 };
      const distance = calculateDistanceKm(gresikKitchen.lat, gresikKitchen.lon, surabayaDest.lat, surabayaDest.lon);
      expect(distance).toBeGreaterThan(10);
      expect(distance).toBeLessThan(30); // within 30 km instant courier radius
    });

    it('should exceed 30 km radius for distant locations (e.g. Malang)', () => {
      const gresikKitchen = { lat: -7.1171, lon: 112.5938 };
      const malangDest = { lat: -7.9800, lon: 112.6200 };
      const distance = calculateDistanceKm(gresikKitchen.lat, gresikKitchen.lon, malangDest.lat, malangDest.lon);
      expect(distance).toBeGreaterThan(30); // Instant courier ineligible
    });
  });

  describe('4. CheckoutModal Support for Food & Requires Shipping', () => {
    it('should recognize food and requires_shipping in isPhysical check', () => {
      expect(checkoutModalCode).toContain("rawProductType === 'food'");
      expect(checkoutModalCode).toContain("rawProductType === 'fnb'");
      expect(checkoutModalCode).toContain("Boolean((product as any)?.requires_shipping)");
    });
  });
});
