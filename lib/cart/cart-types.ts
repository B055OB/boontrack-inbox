/**
 * @module lib/cart/cart-types
 * Shared Cart Engine V1 & Unified Checkout Context Contracts
 * Architected per CTO directive (Server-Side Source of Truth)
 */

export type CartStatus = 'ACTIVE' | 'ABANDONED' | 'CONVERTED';

export interface CartItemModifier {
  id?: string;
  group_id?: string;
  group_name?: string;
  name: string;
  option_name?: string;
  price?: number;
  extra_price?: number;
}

export interface CartItemRecord {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price_snapshot: number;
  selected_modifiers: CartItemModifier[];
  modifier_hash: string;
  created_at?: string;
  updated_at?: string;

  // Enriched fields from database / product revalidation
  product_title?: string;
  product_image?: string;
  weight_grams?: number;
  current_unit_price?: number;
  modifier_extra_total?: number;
  line_total?: number;
  is_fnb?: boolean;
  product_type?: string;
  category?: string;
  requires_shipping?: boolean;
}

export interface CartRecord {
  id: string;
  tenant_id: string;
  tenant_slug?: string;
  session_id: string;
  customer_id?: string | null;
  status: CartStatus;
  currency: string;
  metadata: Record<string, any>;
  expires_at: string;
  created_at: string;
  updated_at: string;
  items: CartItemRecord[];
  total_quantity: number;
  subtotal: number;
  total_weight_grams: number;
}

export interface CartPolicy {
  isCartEnabled: boolean;
  allowDirectBuy: boolean;
  allowAddToCart: boolean;
  defaultFlow: 'DIRECT' | 'CART';
  showStickyCart: boolean;
  reason?: string;
  isDirectBuyPrimary?: boolean;
  multiItemCheckout?: boolean;
}

export interface CartItemInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price_snapshot?: number;
  selected_modifiers?: CartItemModifier[];
}

export interface UnifiedCheckoutItem {
  productId: string;
  productTitle: string;
  unitPrice: number;
  quantity: number;
  variantId?: string | null;
  variantName?: string | null;
  selectedModifiers?: CartItemModifier[];
  weightGrams: number;
  category?: string;
  productType?: string;
  requiresShipping?: boolean;
  image?: string;
  lineSubtotal?: number;
}

export interface UnifiedCheckoutContext {
  contextType: 'DIRECT' | 'CART';
  cartId?: string | null;
  tenantSlug: string;
  tenantId?: string | null;
  items: UnifiedCheckoutItem[];
  totalQuantity: number;
  subtotal: number;
  totalWeightGrams: number;
  requiresShipping: boolean;
  isFnb: boolean;
  customerData?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  };
  fulfillmentType?: 'DELIVERY' | 'PICKUP';
  shippingCourier?: string;
  shippingCost?: number;
  shippingSubsidy?: number;
  netShippingCost?: number;
  voucherCode?: string;
  productDiscount?: number;
  uniqueCode?: number;
  adminFee?: number;
  grossAmount?: number;
  metadata?: Record<string, any>;
}

/**
 * Deterministically hash an array of selected modifiers.
 * Ensures items with different options (e.g. Pedas vs Tidak Pedas) produce distinct line items.
 */
export function hashModifiers(modifiers?: CartItemModifier[] | null): string {
  if (!modifiers || !Array.isArray(modifiers) || modifiers.length === 0) {
    return 'none';
  }

  const normalized = modifiers
    .map((m) => {
      const name = (m.name || m.option_name || '').trim().toLowerCase();
      const group = (m.group_name || m.group_id || '').trim().toLowerCase();
      const price = Number(m.price || m.extra_price || 0);
      return `${group}:${name}:${price}`;
    })
    .sort()
    .join('|');

  return normalized || 'none';
}
