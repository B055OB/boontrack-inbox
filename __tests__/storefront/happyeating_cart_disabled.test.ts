import fs from 'fs';
import path from 'path';
import { evaluateCartPolicy } from '@/lib/cart/cart-policy';

describe('Verification: /tumbuh-kembang-anak/p/happyeating Direct Checkout', () => {
  it('strictly disables cart buttons and sticky cart for happyeating ecourse product', () => {
    // 1. Evaluate with DIGITAL_FILE product_type
    const policyDigitalFile = evaluateCartPolicy({
      businessType: 'SERVICES',
      productType: 'DIGITAL_FILE',
      category: 'ecourse',
      enableCart: false,
    });

    expect(policyDigitalFile.allowAddToCart).toBe(false);
    expect(policyDigitalFile.showStickyCart).toBe(false);
    expect(policyDigitalFile.isCartEnabled).toBe(false);

    // 2. Evaluate with enableCart: false regardless of inputs
    const policyExplicitFalse = evaluateCartPolicy({
      enableCart: false,
    });

    expect(policyExplicitFalse.allowAddToCart).toBe(false);
    expect(policyExplicitFalse.showStickyCart).toBe(false);
  });

  it('verifies app/[tenant]/p/[slug]/page.tsx unmounts "+ Tambah ke Keranjang Belanja" and floating cart bar when isCartDisabled', () => {
    const pagePath = path.join(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // isCartDisabled check includes enable_cart === false, DIGITAL_FILE, and SERVICE
    expect(content).toContain("product.metadata?.enable_cart === false");
    expect(content).toContain("(product as any).enable_cart === false");
    expect(content).toContain("(product.product_type as string) === 'DIGITAL_FILE'");
    expect(content).toContain("(product.product_type as string) === 'SERVICE'");

    // Button + Tambah ke Keranjang Belanja is guarded by !isCartDisabled
    expect(content).toContain("{!isCartDisabled && cartPolicy.allowAddToCart && (");
    expect(content).toContain("<span>+ Tambah ke Keranjang Belanja</span>");

    // StickyBuyButton receives allowAddToCart={!isCartDisabled && cartPolicy.allowAddToCart}
    expect(content).toContain("allowAddToCart={!isCartDisabled && cartPolicy.allowAddToCart}");

    // FloatingCartBar is guarded by !isCartDisabled
    expect(content).toContain("{!isCartDisabled && cartPolicy.showStickyCart &&");
  });

  it('verifies ProductFormModal.tsx contains enable_cart toggle and defaults', () => {
    const modalPath = path.join(process.cwd(), 'app/[tenant]/dashboard/components/ProductFormModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    expect(content).toContain("Aktifkan Fitur Keranjang Belanja");
    expect(content).toContain("isCartEnabled");
    expect(content).toContain("handleToggleEnableCart");
    expect(content).toContain("enable_cart: resolvedEnableCart");
    expect(content).toContain("enable_cart: isCartEnabled");
  });
});
