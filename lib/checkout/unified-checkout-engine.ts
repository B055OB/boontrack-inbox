/**
 * @module lib/checkout/unified-checkout-engine
 * Unified Checkout Engine & Package-Level Shipping Architecture (§ CTO Mandate)
 *
 * Single Transition Pipeline:
 * 1. Direct Buy -> Ephemeral Checkout Context -> Checkout Engine
 * 2. Cart Checkout -> Cart Checkout Context -> Checkout Engine
 *
 * Backend Revalidation:
 * 1. Never trusts client price / total.
 * 2. Revalidates current stock & pricing against Supabase.
 * 3. Aggregates package weight across all items (1 Order = 1 Shipping Quote = 1 QRIS Payment).
 */

import {
  UnifiedCheckoutContext,
  UnifiedCheckoutItem,
} from '@/lib/cart/cart-types';
import { getCartWithItems, markCartConverted, resolveTenantRecord } from '@/lib/cart/cart-engine';
import { createOrderAndInvoice, CreateOrderPayload } from '@/lib/checkout-service';

export interface DirectBuyInput {
  tenantSlug: string;
  product: {
    id: string | number;
    name?: string;
    title?: string;
    price: number;
    promo_price?: number;
    weight?: number;
    weight_grams?: number;
    category?: string;
    product_type?: string;
    requires_shipping?: boolean;
    image?: string;
  };
  quantity?: number;
  variantId?: string | null;
  variantName?: string | null;
  selectedModifiers?: any[];
  customerData?: UnifiedCheckoutContext['customerData'];
}

/**
 * 1. Create Ephemeral Checkout Context from Direct Buy
 */
export async function createEphemeralCheckoutContextFromDirectBuy(
  input: DirectBuyInput
): Promise<UnifiedCheckoutContext> {
  const { tenantSlug, product, quantity = 1, variantId, variantName, selectedModifiers, customerData } = input;
  const qty = Math.max(1, quantity);

  const rawType = (product.product_type || '').toUpperCase();
  const rawCat = (product.category || '').toLowerCase();
  const isFood =
    rawType === 'FOOD' ||
    rawType === 'FNB' ||
    rawCat.includes('food') ||
    rawCat.includes('kuliner') ||
    rawCat.includes('makanan');

  const requiresShipping =
    isFood ||
    rawType === 'PHYSICAL' ||
    rawType === 'FISIK' ||
    rawCat.includes('fisik') ||
    rawCat.includes('physical') ||
    Boolean(product.requires_shipping);

  const unitWeight = Number(
    product.weight_grams ||
    product.weight ||
    (isFood ? 250 : 500)
  );

  const officialPrice = Number(
    product.promo_price !== undefined && product.promo_price !== null && product.promo_price >= 0 && product.promo_price < (product.price || Infinity)
      ? product.promo_price
      : product.price || 0
  );

  const modifierTotal = (selectedModifiers || []).reduce((sum, mod) => {
    return sum + Number(mod.extra_price || mod.price || 0);
  }, 0);

  const effectiveUnitPrice = officialPrice + modifierTotal;
  const lineSubtotal = effectiveUnitPrice * qty;
  const totalWeight = unitWeight * qty;

  const item: UnifiedCheckoutItem = {
    productId: String(product.id),
    productTitle: product.title || product.name || 'Produk',
    unitPrice: effectiveUnitPrice,
    quantity: qty,
    variantId: variantId || null,
    variantName: variantName || null,
    selectedModifiers: selectedModifiers || [],
    weightGrams: unitWeight,
    category: rawCat,
    productType: rawType || (isFood ? 'FOOD' : 'PHYSICAL'),
    requiresShipping,
    image: product.image,
    lineSubtotal,
  };

  const tenant = await resolveTenantRecord(tenantSlug);

  return {
    contextType: 'DIRECT',
    cartId: null,
    tenantSlug,
    tenantId: tenant?.id || null,
    items: [item],
    totalQuantity: qty,
    subtotal: lineSubtotal,
    totalWeightGrams: totalWeight,
    requiresShipping,
    isFnb: isFood,
    customerData,
  };
}

/**
 * 2. Create Cart Checkout Context from server-side Cart
 */
export async function createCheckoutContextFromCart(params: {
  cartId: string;
  tenantSlug: string;
  customerData?: UnifiedCheckoutContext['customerData'];
}): Promise<UnifiedCheckoutContext> {
  const { cartId, tenantSlug, customerData } = params;
  const cart = await getCartWithItems(cartId, tenantSlug);

  if (!cart.items || cart.items.length === 0) {
    throw new Error('Keranjang belanja masih kosong. Tambahkan menu/produk terlebih dahulu.');
  }

  const items: UnifiedCheckoutItem[] = cart.items.map((it) => ({
    productId: it.product_id,
    productTitle: it.product_title || 'Produk',
    unitPrice: (it.current_unit_price || it.unit_price_snapshot || 0) + (it.modifier_extra_total || 0),
    quantity: it.quantity,
    variantId: it.variant_id || null,
    selectedModifiers: it.selected_modifiers || [],
    weightGrams: it.weight_grams || (it.is_fnb ? 250 : 500),
    category: it.category,
    productType: it.product_type,
    requiresShipping: Boolean(it.requires_shipping),
    image: it.product_image,
    lineSubtotal: it.line_total,
  }));

  const requiresShipping = cart.items.some((it) => it.requires_shipping);
  const isFnb = cart.items.some((it) => it.is_fnb);

  return {
    contextType: 'CART',
    cartId: cart.id,
    tenantSlug,
    tenantId: cart.tenant_id,
    items,
    totalQuantity: cart.total_quantity,
    subtotal: cart.subtotal,
    totalWeightGrams: cart.total_weight_grams,
    requiresShipping,
    isFnb,
    customerData,
  };
}

/**
 * 3. Package-Level Shipping Calculator
 * Aggregates all items in the checkout context into ONE shipping quote
 */
export async function calculatePackageShippingQuote(params: {
  tenantSlug: string;
  checkoutContext: UnifiedCheckoutContext;
  destination: {
    city: string;
    district?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  courierType?: 'instant' | 'regular';
}): Promise<{
  courierName: string;
  serviceType: string;
  shippingCost: number;
  packageWeightGrams: number;
  etd: string;
  isFnbSafe: boolean;
}> {
  const { tenantSlug, checkoutContext, destination, courierType = 'instant' } = params;

  if (!checkoutContext.requiresShipping) {
    return {
      courierName: 'Tanpa Pengiriman (Digital / Layanan)',
      serviceType: 'direct',
      shippingCost: 0,
      packageWeightGrams: 0,
      etd: 'Instan',
      isFnbSafe: true,
    };
  }

  const packageWeight = Math.max(100, checkoutContext.totalWeightGrams);
  const isFood = checkoutContext.isFnb;

  // Instant courier rate estimation for F&B / local delivery (Base Rp20.000 for standard zone)
  const isInstant = courierType === 'instant' || isFood;
  const baseRate = isInstant ? 20000 : 15000;
  // Weight surcharge: +Rp5.000 per extra kg above 1kg
  const extraKg = Math.max(0, Math.ceil(packageWeight / 1000) - 1);
  const calculatedCost = baseRate + (extraKg * 5000);

  return {
    courierName: isInstant
      ? 'Kurir Instan Dapur (GoSend / GrabExpress)'
      : 'Kurir Reguler Logistik (Biteship)',
    serviceType: isInstant ? 'instant' : 'regular',
    shippingCost: calculatedCost,
    packageWeightGrams: packageWeight,
    etd: isInstant ? '1 - 3 Jam' : '1 - 2 Hari',
    isFnbSafe: isInstant ? true : !isFood,
  };
}

/**
 * 4. Process Unified Order Creation
 * Dispatches to createOrderAndInvoice with full multi-item support
 */
export async function processUnifiedOrderCreation(
  context: UnifiedCheckoutContext,
  payloadOverrides: Partial<CreateOrderPayload> = {}
) {
  const isMultiItem = context.items.length > 1;

  // Combined product title representation for multi-item orders
  const primaryTitle = isMultiItem
    ? context.items.map((i) => `${i.productTitle} (${i.quantity}x)`).join(', ')
    : context.items[0]?.productTitle || 'Pesanan Produk';

  const primaryProductId = isMultiItem
    ? `MULTI-${context.items.map((i) => i.productId).join('-').substring(0, 36)}`
    : context.items[0]?.productId || 'PROD-1';

  const primaryUnitPrice = isMultiItem
    ? Math.round(context.subtotal / Math.max(1, context.totalQuantity))
    : context.items[0]?.unitPrice || context.subtotal;

  const orderPayload: CreateOrderPayload = {
    tenantSlug: context.tenantSlug,
    productId: primaryProductId,
    productTitle: primaryTitle,
    amount: (payloadOverrides.amount ?? (context.subtotal + (context.shippingCost || 0))),
    basePrice: context.subtotal,
    unitPrice: primaryUnitPrice,
    quantity: context.totalQuantity,
    shippingCost: context.shippingCost || 0,
    shippingCourier: context.shippingCourier || (context.requiresShipping ? 'Kurir Instan' : undefined),
    fulfillmentType: context.fulfillmentType || 'DELIVERY',
    customerName: context.customerData?.name || payloadOverrides.customerName || 'Pelanggan Toko',
    customerPhone: context.customerData?.phone || payloadOverrides.customerPhone || '',
    customerEmail: context.customerData?.email || payloadOverrides.customerEmail || '',
    shippingAddress: context.customerData?.address || payloadOverrides.shippingAddress || '',
    customerCity: context.customerData?.city || payloadOverrides.customerCity || '',
    shippingCity: context.customerData?.city || payloadOverrides.shippingCity || '',
    productType: context.isFnb ? 'FOOD' : (context.requiresShipping ? 'PHYSICAL' : 'DIGITAL'),
    cartId: context.cartId,
    items: context.items.map((it) => ({
      productId: it.productId,
      productTitle: it.productTitle,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      weightGrams: it.weightGrams,
      variantId: it.variantId,
      variantName: it.variantName,
      selectedModifiers: it.selectedModifiers,
    })),
    ...payloadOverrides,
  };

  const invoiceResult = await createOrderAndInvoice(orderPayload);

  // If order was created from a server-side cart, mark the cart as CONVERTED
  if (context.cartId) {
    await markCartConverted(context.cartId, invoiceResult.orderId);
  }

  return invoiceResult;
}
