import { evaluateCartPolicy } from '@/lib/cart/cart-policy';
import fs from 'fs';
import path from 'path';

describe('Cart Policy Matrix & Multi-Tenant Isolation', () => {
  it('enables cart and sticky bar for FOOD and FNB businesses', () => {
    const policyFnb = evaluateCartPolicy({ businessType: 'FNB' });
    expect(policyFnb.allowAddToCart).toBe(true);
    expect(policyFnb.showStickyCart).toBe(true);
    expect(policyFnb.multiItemCheckout).toBe(true);

    const policyFood = evaluateCartPolicy({ productType: 'FOOD' });
    expect(policyFood.allowAddToCart).toBe(true);
    expect(policyFood.showStickyCart).toBe(true);
  });

  it('enables cart and sticky bar for PHYSICAL products', () => {
    const policyPhysical = evaluateCartPolicy({ businessType: 'RETAIL', productType: 'PHYSICAL', requiresShipping: true });
    expect(policyPhysical.allowAddToCart).toBe(true);
    expect(policyPhysical.showStickyCart).toBe(true);
    expect(policyPhysical.multiItemCheckout).toBe(true);
  });

  it('defaults to Direct Buy First for DIGITAL products without cart requirement', () => {
    const policyDigital = evaluateCartPolicy({ businessType: 'DIGITAL', productType: 'DIGITAL' });
    expect(policyDigital.allowAddToCart).toBe(false);
    expect(policyDigital.isDirectBuyPrimary).toBe(true);
    expect(policyDigital.showStickyCart).toBe(false);
  });

  it('strictly disables cart for SERVICE, BOOKING, and CONSULTATION flows', () => {
    const policyService = evaluateCartPolicy({ productType: 'SERVICE' });
    expect(policyService.allowAddToCart).toBe(false);
    expect(policyService.showStickyCart).toBe(false);
    expect(policyService.multiItemCheckout).toBe(false);

    const policyBooking = evaluateCartPolicy({ category: 'reservasi' });
    expect(policyBooking.allowAddToCart).toBe(false);
    expect(policyBooking.showStickyCart).toBe(false);

    const policyCreator = evaluateCartPolicy({ businessType: 'CREATOR' });
    expect(policyCreator.allowAddToCart).toBe(false);
  });

  it('complies with ZERO HARDCODING POLICY: does not inspect static slug names', () => {
    const policyFile = fs.readFileSync(path.join(process.cwd(), 'lib/cart/cart-policy.ts'), 'utf-8');
    const forbiddenPatterns = [
      'onlineboost',
      'suhu',
      'ALLOWED_SLUGS',
      'isDemoStore',
      'DEFAULT_TENANT_CONFIGS'
    ];
    for (const pattern of forbiddenPatterns) {
      expect(policyFile).not.toContain(pattern);
    }
  });
});
