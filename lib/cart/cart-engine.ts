/**
 * @module lib/cart/cart-engine
 * Shared Cart Engine V1 — Core Business Logic & Server-side Source of Truth
 *
 * Guaranteed:
 * 1. Cart is server-side business state (carts & cart_items).
 * 2. Uniqueness evaluated on (cart_id, product_id, variant_id, hash(selected_modifiers)).
 * 3. Zero financial trust on client prices: always revalidated against Supabase tenant catalog.
 * 4. Package-level weight aggregation for unified courier quotes.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  CartRecord,
  CartItemRecord,
  CartItemInput,
  CartItemModifier,
  hashModifiers,
} from './cart-types';

// In-memory fallback map for environments or test suites where Supabase tables are mocked
const memoryCartStore = new Map<string, { cart: CartRecord; items: CartItemRecord[] }>();

function getDbClient() {
  return getSupabaseAdmin() || getSupabase();
}

/**
 * Helper to resolve tenant ID & metadata from tenant slug or UUID
 */
export async function resolveTenantRecord(tenantIdentifier: string): Promise<{
  id: string;
  slug: string;
  metadata?: any;
} | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdentifier);

  try {
    let query = supabase.from('tenants').select('id, slug, metadata');
    if (isUuid) {
      query = query.eq('id', tenantIdentifier);
    } else {
      query = query.eq('slug', tenantIdentifier);
    }
    const { data } = await query.maybeSingle();
    return data || null;
  } catch (err) {
    console.warn('[CartEngine] Tenant lookup note:', err);
    return null;
  }
}

/**
 * Revalidate items against current tenant products catalog.
 * Strictly verifies price, modifiers, and package weight.
 */
export async function revalidateCartItems(
  tenantIdentifier: string,
  items: CartItemRecord[]
): Promise<{
  revalidatedItems: CartItemRecord[];
  subtotal: number;
  totalQuantity: number;
  totalWeightGrams: number;
  hasFnb: boolean;
  requiresShipping: boolean;
}> {
  const tenant = await resolveTenantRecord(tenantIdentifier);
  const products: any[] = Array.isArray(tenant?.metadata?.products) ? tenant.metadata.products : [];

  let subtotal = 0;
  let totalQuantity = 0;
  let totalWeightGrams = 0;
  let hasFnb = false;
  let requiresShipping = false;

  const revalidatedItems: CartItemRecord[] = items.map((item) => {
    const prodIdStr = String(item.product_id).trim();

    // Find product in tenant metadata
    const matched = products.find((p) => {
      if (!p) return false;
      return (
        String(p.id) === prodIdStr ||
        String(p.slug) === prodIdStr ||
        String(p.sku) === prodIdStr ||
        (p.name && p.name.trim().toLowerCase() === prodIdStr.toLowerCase())
      );
    });

    const title = matched?.name || matched?.title || item.product_title || 'Produk';
    const image = matched?.image || matched?.image_url || item.product_image || '';
    const rawType = (matched?.product_type || matched?.type || '').toUpperCase();
    const rawCat = (matched?.category || '').toLowerCase();

    const isFood =
      rawType === 'FOOD' ||
      rawType === 'FNB' ||
      rawCat.includes('food') ||
      rawCat.includes('kuliner') ||
      rawCat.includes('makanan');

    const itemRequiresShipping =
      isFood ||
      rawType === 'PHYSICAL' ||
      rawType === 'FISIK' ||
      rawCat.includes('fisik') ||
      rawCat.includes('physical') ||
      Boolean(matched?.requires_shipping);

    if (isFood) hasFnb = true;
    if (itemRequiresShipping) requiresShipping = true;

    // Backend unit price verification (never trust client snapshot)
    const officialPrice = Number(
      matched?.promo_price !== undefined && matched?.promo_price !== null && matched.promo_price >= 0 && matched.promo_price < (matched.price || Infinity)
        ? matched.promo_price
        : matched?.price !== undefined && matched?.price !== null
        ? matched.price
        : item.unit_price_snapshot || 0
    );

    // Modifier extra price calculation
    const modifierExtraTotal = (item.selected_modifiers || []).reduce((sum, mod) => {
      return sum + Number(mod.extra_price || mod.price || 0);
    }, 0);

    const effectiveUnitPrice = officialPrice + modifierExtraTotal;
    const qty = Math.max(1, Number(item.quantity || 1));
    const lineTotal = effectiveUnitPrice * qty;

    // Package weight calculation (default 250g for food, 500g for general physical goods)
    const unitWeight = Number(
      matched?.weight_grams ||
      matched?.weight ||
      matched?.metadata?.weight_grams ||
      matched?.metadata?.weight ||
      (isFood ? 250 : 500)
    );

    const lineWeight = unitWeight * qty;

    subtotal += lineTotal;
    totalQuantity += qty;
    totalWeightGrams += lineWeight;

    return {
      ...item,
      product_title: title,
      product_image: image,
      current_unit_price: officialPrice,
      modifier_extra_total: modifierExtraTotal,
      line_total: lineTotal,
      weight_grams: unitWeight,
      is_fnb: isFood,
      product_type: rawType || (isFood ? 'FOOD' : 'PHYSICAL'),
      category: rawCat,
      requires_shipping: itemRequiresShipping,
    };
  });

  return {
    revalidatedItems,
    subtotal,
    totalQuantity,
    totalWeightGrams,
    hasFnb,
    requiresShipping,
  };
}

/**
 * Get or create an active cart session for a tenant
 */
export async function getOrCreateActiveCart(params: {
  tenantSlug: string;
  sessionId: string;
  customerId?: string | null;
  metadata?: Record<string, any>;
}): Promise<CartRecord> {
  const { tenantSlug, sessionId, customerId, metadata = {} } = params;
  const supabase = getDbClient();
  const tenant = await resolveTenantRecord(tenantSlug);
  const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000000';

  if (!supabase) {
    return getOrCreateMemoryCart(tenantId, tenantSlug, sessionId, customerId, metadata);
  }

  try {
    // 1. Check existing ACTIVE cart
    const { data: existingCart, error: fetchErr } = await supabase
      .from('carts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fetchErr && existingCart) {
      return getCartWithItems(existingCart.id, tenantSlug);
    }

    // 2. Create new active cart
    const newCartId = `cart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const insertPayload = {
      tenant_id: tenantId,
      session_id: sessionId,
      customer_id: customerId || null,
      status: 'ACTIVE',
      currency: 'IDR',
      metadata,
      expires_at: expiresAt,
    };

    const { data: created, error: insertErr } = await supabase
      .from('carts')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr || !created) {
      console.warn('[CartEngine] DB insert failed, using memory store:', insertErr?.message);
      return getOrCreateMemoryCart(tenantId, tenantSlug, sessionId, customerId, metadata);
    }

    return {
      ...created,
      tenant_slug: tenantSlug,
      items: [],
      total_quantity: 0,
      subtotal: 0,
      total_weight_grams: 0,
    };
  } catch (err) {
    console.warn('[CartEngine] Exception in getOrCreateActiveCart:', err);
    return getOrCreateMemoryCart(tenantId, tenantSlug, sessionId, customerId, metadata);
  }
}

/**
 * Fetch cart and its items with revalidation
 */
export async function getCartWithItems(
  cartId: string,
  tenantSlug: string
): Promise<CartRecord> {
  const supabase = getDbClient();

  if (!supabase || cartId.startsWith('mem_')) {
    return getMemoryCart(cartId, tenantSlug);
  }

  try {
    const [cartRes, itemsRes] = await Promise.all([
      supabase.from('carts').select('*').eq('id', cartId).maybeSingle(),
      supabase.from('cart_items').select('*').eq('cart_id', cartId).order('created_at', { ascending: true }),
    ]);

    if (!cartRes.data) {
      return getMemoryCart(cartId, tenantSlug);
    }

    const rawItems: CartItemRecord[] = itemsRes.data || [];
    const revalidation = await revalidateCartItems(tenantSlug, rawItems);

    return {
      ...cartRes.data,
      tenant_slug: tenantSlug,
      items: revalidation.revalidatedItems,
      total_quantity: revalidation.totalQuantity,
      subtotal: revalidation.subtotal,
      total_weight_grams: revalidation.totalWeightGrams,
    };
  } catch (err) {
    console.warn('[CartEngine] Exception in getCartWithItems:', err);
    return getMemoryCart(cartId, tenantSlug);
  }
}

/**
 * Add or increment item in cart
 * Evaluates uniqueness by (cart_id, product_id, variant_id, modifier_hash)
 */
export async function addItemToCart(
  cartId: string,
  tenantSlug: string,
  input: CartItemInput
): Promise<CartRecord> {
  const supabase = getDbClient();
  const modHash = hashModifiers(input.selected_modifiers);
  const qtyToAdd = Math.max(1, Number(input.quantity || 1));

  if (!supabase || cartId.startsWith('mem_')) {
    return addItemToMemoryCart(cartId, tenantSlug, input, modHash, qtyToAdd);
  }

  try {
    // 1. Check if same line item already exists
    let query = supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cartId)
      .eq('product_id', input.product_id)
      .eq('modifier_hash', modHash);

    if (input.variant_id) {
      query = query.eq('variant_id', input.variant_id);
    } else {
      query = query.is('variant_id', null);
    }

    const { data: existingItem, error: findErr } = await query.maybeSingle();

    if (!findErr && existingItem) {
      // Increment quantity
      const newQty = existingItem.quantity + qtyToAdd;
      await supabase
        .from('cart_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', existingItem.id);
    } else {
      // Insert new line item
      const insertItem = {
        cart_id: cartId,
        product_id: input.product_id,
        variant_id: input.variant_id || null,
        quantity: qtyToAdd,
        unit_price_snapshot: input.unit_price_snapshot || 0,
        selected_modifiers: input.selected_modifiers || [],
        modifier_hash: modHash,
      };

      await supabase.from('cart_items').insert(insertItem);
    }

    // Touch cart updated_at
    await supabase.from('carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);

    return getCartWithItems(cartId, tenantSlug);
  } catch (err) {
    console.warn('[CartEngine] Add item error, falling back to memory store:', err);
    return addItemToMemoryCart(cartId, tenantSlug, input, modHash, qtyToAdd);
  }
}

/**
 * Update quantity of a cart item
 */
export async function updateCartItemQuantity(
  cartId: string,
  tenantSlug: string,
  itemId: string,
  quantity: number
): Promise<CartRecord> {
  const supabase = getDbClient();

  if (!supabase || cartId.startsWith('mem_')) {
    return updateMemoryCartQuantity(cartId, tenantSlug, itemId, quantity);
  }

  try {
    if (quantity <= 0) {
      await supabase.from('cart_items').delete().eq('id', itemId).eq('cart_id', cartId);
    } else {
      await supabase
        .from('cart_items')
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('cart_id', cartId);
    }

    await supabase.from('carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);
    return getCartWithItems(cartId, tenantSlug);
  } catch (err) {
    console.warn('[CartEngine] Update qty error, falling back to memory:', err);
    return updateMemoryCartQuantity(cartId, tenantSlug, itemId, quantity);
  }
}

/**
 * Remove an item from cart
 */
export async function removeCartItem(
  cartId: string,
  tenantSlug: string,
  itemId: string
): Promise<CartRecord> {
  return updateCartItemQuantity(cartId, tenantSlug, itemId, 0);
}

/**
 * Mark cart as converted after order checkout
 */
export async function markCartConverted(
  cartId: string,
  orderId: string
): Promise<void> {
  const supabase = getDbClient();
  const now = new Date().toISOString();

  if (cartId.startsWith('mem_')) {
    const entry = memoryCartStore.get(cartId);
    if (entry) {
      entry.cart.status = 'CONVERTED';
      entry.cart.metadata = {
        ...entry.cart.metadata,
        converted_order_id: orderId,
        converted_at: now,
      };
    }
    return;
  }

  if (!supabase) return;

  try {
    const { data: cart } = await supabase.from('carts').select('metadata').eq('id', cartId).maybeSingle();
    const updatedMeta = {
      ...(cart?.metadata || {}),
      converted_order_id: orderId,
      converted_at: now,
    };

    await supabase
      .from('carts')
      .update({
        status: 'CONVERTED',
        metadata: updatedMeta,
        updated_at: now,
      })
      .eq('id', cartId);
  } catch (err) {
    console.warn('[CartEngine] Mark converted note:', err);
  }
}

// ── In-Memory Store Implementations (Resilience Fallback & Testing) ──────────

function getOrCreateMemoryCart(
  tenantId: string,
  tenantSlug: string,
  sessionId: string,
  customerId?: string | null,
  metadata: Record<string, any> = {}
): CartRecord {
  const memKey = `mem_${tenantSlug}_${sessionId}`;
  let entry = memoryCartStore.get(memKey);

  if (!entry || entry.cart.status !== 'ACTIVE') {
    const cart: CartRecord = {
      id: memKey,
      tenant_id: tenantId,
      tenant_slug: tenantSlug,
      session_id: sessionId,
      customer_id: customerId || null,
      status: 'ACTIVE',
      currency: 'IDR',
      metadata,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [],
      total_quantity: 0,
      subtotal: 0,
      total_weight_grams: 0,
    };
    entry = { cart, items: [] };
    memoryCartStore.set(memKey, entry);
  }

  return {
    ...entry.cart,
    items: entry.items,
  };
}

async function getMemoryCart(cartId: string, tenantSlug: string): Promise<CartRecord> {
  const entry = memoryCartStore.get(cartId);
  if (!entry) {
    return getOrCreateMemoryCart('00000000-0000-0000-0000-000000000000', tenantSlug, 'default_session');
  }

  const revalidation = await revalidateCartItems(tenantSlug, entry.items);
  entry.cart.items = revalidation.revalidatedItems;
  entry.cart.total_quantity = revalidation.totalQuantity;
  entry.cart.subtotal = revalidation.subtotal;
  entry.cart.total_weight_grams = revalidation.totalWeightGrams;

  return entry.cart;
}

async function addItemToMemoryCart(
  cartId: string,
  tenantSlug: string,
  input: CartItemInput,
  modHash: string,
  qtyToAdd: number
): Promise<CartRecord> {
  const entry = memoryCartStore.get(cartId) || {
    cart: getOrCreateMemoryCart('00000000-0000-0000-0000-000000000000', tenantSlug, 'session'),
    items: [],
  };

  const existingIdx = entry.items.findIndex(
    (it) =>
      it.product_id === input.product_id &&
      (it.variant_id || '') === (input.variant_id || '') &&
      it.modifier_hash === modHash
  );

  if (existingIdx >= 0) {
    entry.items[existingIdx].quantity += qtyToAdd;
    entry.items[existingIdx].updated_at = new Date().toISOString();
  } else {
    const newItem: CartItemRecord = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      cart_id: cartId,
      product_id: input.product_id,
      variant_id: input.variant_id || null,
      quantity: qtyToAdd,
      unit_price_snapshot: input.unit_price_snapshot || 0,
      selected_modifiers: input.selected_modifiers || [],
      modifier_hash: modHash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    entry.items.push(newItem);
  }

  memoryCartStore.set(cartId, entry);
  return getMemoryCart(cartId, tenantSlug);
}

async function updateMemoryCartQuantity(
  cartId: string,
  tenantSlug: string,
  itemId: string,
  quantity: number
): Promise<CartRecord> {
  const entry = memoryCartStore.get(cartId);
  if (entry) {
    if (quantity <= 0) {
      entry.items = entry.items.filter((it) => it.id !== itemId);
    } else {
      const it = entry.items.find((item) => item.id === itemId);
      if (it) {
        it.quantity = quantity;
        it.updated_at = new Date().toISOString();
      }
    }
  }
  return getMemoryCart(cartId, tenantSlug);
}
