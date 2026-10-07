/**
 * @module lib/cart/cart-policy
 * Policy-Driven Cart & Checkout Behavior Evaluator (§ CTO Approved Policy Matrix)
 *
 * Rules:
 * 1. FOOD & PHYSICAL:
 *    - Storefront/Catalog: Show [+ Keranjang] & [Beli Sekarang]
 *    - Single Page (/p/[slug]): Show [Beli Sekarang] & secondary [+ Tambah ke Keranjang]
 *    - Sticky Floating Cart Bar & Drawer enabled when items > 0
 * 2. DIGITAL:
 *    - Direct Buy First (no forced cart). Cart optional for bundles.
 * 3. BOOKING / PROFESSIONAL_SERVICE / CREATOR / JASA:
 *    - Cart disabled (isCartEnabled: false). Strict single flow (Timeslot / Brief).
 */

import { CartPolicy } from './cart-types';

export interface CartPolicyInput {
  businessType?: string | null;
  productType?: string | null;
  category?: string | null;
  fulfillmentStrategy?: string | null;
  requiresShipping?: boolean;
  hasTimeslot?: boolean;
  enableCart?: boolean;
}

export function evaluateCartPolicy(input: CartPolicyInput): CartPolicy {
  // 0. Explicit Toggle Override: If enableCart is explicitly false, strictly disable cart
  if (input.enableCart === false) {
    return {
      isCartEnabled: false,
      allowDirectBuy: true,
      allowAddToCart: false,
      defaultFlow: 'DIRECT',
      showStickyCart: false,
      isDirectBuyPrimary: true,
      multiItemCheckout: false,
      reason: 'Fitur keranjang belanja dinonaktifkan oleh pengaturan produk (Direct Checkout 100%).',
    };
  }

  const normBusiness = (input.businessType || '').toUpperCase().trim();
  const normProduct = (input.productType || '').toUpperCase().trim();
  const normCat = (input.category || '').toLowerCase().trim();
  const normFulfillment = (input.fulfillmentStrategy || '').toUpperCase().trim();

  // 1. Evaluate Booking / Professional Services / Creator / Jasa -> Strictly Disabled
  const isBookingOrService =
    input.hasTimeslot ||
    normProduct === 'BOOKING' ||
    normProduct === 'SERVICE' ||
    normProduct === 'PROFESSIONAL_SERVICE' ||
    normProduct === 'CREATOR' ||
    normProduct === 'AGENCY' ||
    normProduct === 'CONSULTATION' ||
    normProduct === 'JASA' ||
    normProduct === 'RESERVASI' ||
    normCat === 'service' ||
    normCat === 'jasa' ||
    normCat === 'konsultasi' ||
    normCat === 'booking' ||
    normCat === 'reservasi' ||
    normCat === 'field_service' ||
    normCat === 'pro_service' ||
    normFulfillment === 'CONSULTATION_SESSION' ||
    normBusiness === 'SERVICES' ||
    normBusiness === 'AGENCY' ||
    normBusiness === 'CREATOR' ||
    normBusiness === 'CONSULTATION';

  if (isBookingOrService) {
    return {
      isCartEnabled: false,
      allowDirectBuy: true,
      allowAddToCart: false,
      defaultFlow: 'DIRECT',
      showStickyCart: false,
      isDirectBuyPrimary: true,
      multiItemCheckout: false,
      reason: 'Layanan konsultasi/jasa reservasi wajib menggunakan single flow pemesanan langsung.',
    };
  }

  // 2. Evaluate Food / Kuliner / F&B
  const isFood =
    normProduct === 'FOOD' ||
    normProduct === 'FNB' ||
    normCat === 'food' ||
    normCat === 'fnb' ||
    normCat === 'kuliner' ||
    normCat.includes('makanan') ||
    normCat.includes('kuliner') ||
    normBusiness === 'FNB' ||
    normBusiness === 'FOOD' ||
    normBusiness === 'KULINER';

  // 3. Evaluate Physical / Retail
  const isPhysical =
    Boolean(input.requiresShipping) ||
    normProduct === 'PHYSICAL' ||
    normProduct === 'FISIK' ||
    normCat === 'physical' ||
    normCat === 'fisik' ||
    normCat === 'retail_physical' ||
    normFulfillment === 'PHYSICAL' ||
    normBusiness === 'RETAIL';

  if (isFood || isPhysical) {
    return {
      isCartEnabled: true,
      allowDirectBuy: true,
      allowAddToCart: true,
      defaultFlow: 'DIRECT',
      showStickyCart: true,
      isDirectBuyPrimary: true,
      multiItemCheckout: true,
      reason: isFood
        ? 'Produk kuliner F&B mendukung pemesanan multi-menu melalui keranjang dan beli langsung.'
        : 'Produk fisik mendukung penggabungan paket ongkir melalui keranjang dan beli langsung.',
    };
  }

  // 4. Evaluate Digital Products
  const isDigital =
    normProduct === 'DIGITAL' ||
    normProduct === 'DIGITAL_FILE' ||
    normProduct === 'ECOURSE' ||
    normProduct === 'COURSE' ||
    normProduct === 'EBOOK' ||
    normCat === 'digital' ||
    normCat === 'digital_file' ||
    normCat === 'digital_product' ||
    normCat === 'ecourse' ||
    normCat === 'course' ||
    normCat === 'ebook' ||
    normFulfillment === 'DIGITAL' ||
    normBusiness === 'DIGITAL';

  if (isDigital) {
    return {
      isCartEnabled: false,
      allowDirectBuy: true,
      allowAddToCart: false,
      defaultFlow: 'DIRECT',
      showStickyCart: false, // Digital default direct buy first, cart optional
      isDirectBuyPrimary: true,
      multiItemCheckout: false,
      reason: 'Produk digital memprioritaskan pembelian langsung satu klik tanpa paksaan keranjang.',
    };
  }

  // Default fallback for general physical goods
  return {
    isCartEnabled: true,
    allowDirectBuy: true,
    allowAddToCart: true,
    defaultFlow: 'DIRECT',
    showStickyCart: true,
    isDirectBuyPrimary: true,
    multiItemCheckout: true,
    reason: 'Kategori default mendukung keranjang belanja dan beli langsung.',
  };
}
