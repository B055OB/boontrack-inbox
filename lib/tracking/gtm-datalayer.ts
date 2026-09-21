/**
 * @file lib/tracking/gtm-datalayer.ts
 * @description Standardized Google Tag Manager DataLayer utility for BoonTrack storefronts.
 *
 * ## Entitlement Access Control
 * GTM script injection and DataLayer push is ONLY permitted for tenants on:
 *   - Ads Performance (tier: PRO_SCALE / ADS_PERFORMANCE / ADS)
 *   - Team Scale (tier: ENTERPRISE / TEAM_SCALE / SCALE)
 *
 * FORBIDDEN for:
 *   - Checkout Lite (tier: CHECKOUT_LITE / LITE) — no external GTM script
 *   - Solo / Starter (tier: STARTER / SOLO / SOLO_TRIAL) — no external GTM script
 *
 * ## Events
 * Implements GA4-compatible e-commerce standard events:
 *   - `view_item`      — buyer opens a product / catalog page
 *   - `begin_checkout` — buyer starts filling the order form
 *   - `purchase`       — payment confirmed on success page
 *
 * ## Privacy Guarantee (PII-Free DataLayer)
 * In strict compliance with Google Analytics / GTM Terms of Service:
 *   - All payloads are sanitized to ensure zero PII (Personally Identifiable Information)
 *   - Customer names, unmasked phone numbers, emails, addresses, and payment credentials
 *     are completely stripped from the DataLayer
 *   - Helper functions provide safe masking (e.g. phone: 0812***, email: b***@gmail.com)
 *
 * @architecture BATCH 2 / GTM & Tracking Engine
 */

// ---------------------------------------------------------------------------
// 1. Tier Entitlement Access Control
// ---------------------------------------------------------------------------

/** Canonical DB & frontend tier codes that grant GTM access. */
export const GTM_ALLOWED_TIERS = [
  'PRO_SCALE',
  'ADS_PERFORMANCE',
  'ENTERPRISE',
  'TEAM_SCALE',
  'ADS',
  'SCALE',
  'PRO',
  'TEAM',
  'GROWTH_PRO',
] as const;

/** Canonical DB & frontend tier codes that are strictly blocked from GTM access. */
export const GTM_BLOCKED_TIERS = [
  'CHECKOUT_LITE',
  'LITE',
  'SOLO',
  'STARTER',
  'SOLO_TRIAL',
  'FREE',
] as const;

export type GtmAllowedTier = typeof GTM_ALLOWED_TIERS[number];
export type GtmBlockedTier = typeof GTM_BLOCKED_TIERS[number];

/**
 * Determine whether a given tenant tier is allowed to use GTM.
 * Source of truth: ARCHITECTURE.md Section 3.1 Entitlement ADR.
 *
 * Entitlement Rule:
 * - 'ads' / 'Ads Performance' / 'ADS_PERFORMANCE' / 'PRO_SCALE' -> TRUE
 * - 'scale' / 'Team Scale' / 'TEAM_SCALE' / 'ENTERPRISE' -> TRUE
 * - 'lite' / 'Checkout Lite' / 'CHECKOUT_LITE' -> FALSE (Strictly Blocked)
 * - 'solo' / 'Solo' / 'SOLO' / 'STARTER' -> FALSE (Strictly Blocked)
 * - null / undefined / empty -> FALSE
 *
 * @param tier - The `tenants.tier` value or plan key.
 * @returns true if GTM is permitted for this tier.
 */
export function isTierGtmEligible(tier: string | null | undefined): boolean {
  if (!tier || typeof tier !== 'string') return false;

  const normalized = tier.trim().toUpperCase().replace(/[\s-]+/g, '_');

  // Check explicit blocklist first
  if ((GTM_BLOCKED_TIERS as readonly string[]).includes(normalized)) {
    return false;
  }

  // Check explicit allowlist
  if ((GTM_ALLOWED_TIERS as readonly string[]).includes(normalized)) {
    return true;
  }

  // Handle common compound strings (e.g. 'ADS_PERFORMANCE_TRIAL' -> eligible)
  if (
    normalized.startsWith('ADS_') ||
    normalized.startsWith('TEAM_') ||
    normalized.includes('PRO_SCALE') ||
    normalized.includes('ENTERPRISE')
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 2. TypeScript: DataLayer Types
// ---------------------------------------------------------------------------

/** A single product item in GA4 e-commerce item array format. */
export interface GtmItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  /** Optional: product category (e.g. DIGITAL, PHYSICAL, SERVICE). */
  item_category?: string;
  /** Optional: tenant store name as brand field. */
  item_brand?: string;
  /** Optional: product variant if applicable. */
  item_variant?: string;
  /** Optional: item index in a list. */
  index?: number;
}

/** Payload for `view_item` event. */
export interface ViewItemPayload {
  currency: string;
  value: number;
  items: GtmItem[];
}

/** Payload for `begin_checkout` event. */
export interface BeginCheckoutPayload {
  currency: string;
  value: number;
  coupon?: string;
  items: GtmItem[];
}

/** Payload for `purchase` event. */
export interface PurchasePayload {
  transaction_id: string;
  currency: string;
  value: number;
  coupon?: string;
  items: GtmItem[];
}

/** Union of all supported event payloads. */
export type GtmEventPayload =
  | { event: 'view_item'; ecommerce: ViewItemPayload }
  | { event: 'begin_checkout'; ecommerce: BeginCheckoutPayload }
  | { event: 'purchase'; ecommerce: PurchasePayload }
  | { event: string; ecommerce?: Record<string, unknown>; [key: string]: unknown };

// ---------------------------------------------------------------------------
// 3. Privacy & PII Sanitization Engine
// ---------------------------------------------------------------------------

/**
 * Check whether an object key represents Personally Identifiable Information (PII)
 * or sensitive credentials that must NEVER enter GTM DataLayer.
 *
 * NOTE: E-commerce keys like `item_name`, `item_brand`, `item_category` are explicitly protected.
 */
export function isPiiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  const lower = key.toLowerCase().replace(/[-_]/g, '');

  // Whitelist safe GA4 e-commerce attributes that might contain "name"
  if (
    lower === 'itemname' ||
    lower === 'itembrand' ||
    lower === 'itemcategory' ||
    lower === 'itemvariant' ||
    lower === 'storename' ||
    lower === 'productname' ||
    lower === 'eventname'
  ) {
    return false;
  }

  // Blacklist PII & sensitive attributes
  return (
    lower === 'name' ||
    lower === 'fullname' ||
    lower === 'buyername' ||
    lower === 'customername' ||
    lower.includes('buyername') ||
    lower.includes('customername') ||
    lower === 'phone' ||
    lower === 'phonenumber' ||
    lower === 'buyerphone' ||
    lower === 'customerphone' ||
    lower.includes('buyerphone') ||
    lower.includes('customerphone') ||
    lower === 'msisdn' ||
    lower === 'wanumber' ||
    lower === 'whatsapp' ||
    lower === 'email' ||
    lower === 'useremail' ||
    lower === 'buyeremail' ||
    lower === 'customeremail' ||
    lower.includes('buyeremail') ||
    lower.includes('customeremail') ||
    lower === 'address' ||
    lower === 'shippingaddress' ||
    lower === 'buyeraddress' ||
    lower === 'street' ||
    lower === 'streetaddress' ||
    lower === 'city' ||
    lower === 'postalcode' ||
    lower === 'zip' ||
    lower === 'password' ||
    lower.includes('password') ||
    lower === 'token' ||
    lower.includes('token') ||
    lower === 'secret' ||
    lower.includes('secret') ||
    lower === 'apikey' ||
    lower.includes('apikey') ||
    lower === 'rekening' ||
    lower === 'accountnumber' ||
    lower === 'bankaccount' ||
    lower === 'cardnumber' ||
    lower === 'cvv' ||
    lower === 'pin' ||
    lower === 'nik' ||
    lower === 'ktp' ||
    lower === 'ipaddress' ||
    lower === 'clientip'
  );
}

/**
 * Mask a phone number for safe non-PII logging/display.
 * Example: "08123456789" → "0812***"
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `${digits.slice(0, 4)}***` : '***';
}

/**
 * Mask an email address for safe non-PII logging/display.
 * Example: "buyer@gmail.com" → "b***@gmail.com"
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '***';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Sanitize an item object so it complies with GA4 standard schema and contains no PII.
 */
export function sanitizeItem(raw: Partial<GtmItem>): GtmItem {
  const priceNum = Number(raw.price);
  const qtyNum = Number(raw.quantity);

  return {
    item_id: String(raw.item_id ?? '').trim() || 'unknown',
    item_name: String(raw.item_name ?? '').trim() || 'unknown',
    price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0,
    quantity: Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1,
    ...(raw.item_category ? { item_category: String(raw.item_category).trim() } : {}),
    ...(raw.item_brand ? { item_brand: String(raw.item_brand).trim() } : {}),
    ...(raw.item_variant ? { item_variant: String(raw.item_variant).trim() } : {}),
    ...(typeof raw.index === 'number' ? { index: raw.index } : {}),
  };
}

/**
 * Deeply sanitize any DataLayer payload to guarantee that no PII or sensitive keys leak into GTM.
 * - Recursively removes keys identified by `isPiiKey`
 * - Sanitizes items array if present
 * - Leaves standard GA4 e-commerce fields intact
 *
 * @param payload - Arbitrary payload object
 * @returns Clean, PII-free clone of payload
 */
export function sanitizeDataLayerPayload<T>(payload: T): T {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((element) => sanitizeDataLayerPayload(element)) as unknown as T;
  }

  if (typeof payload === 'object') {
    const cleanObj: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      // Drop forbidden PII keys
      if (isPiiKey(key)) {
        continue;
      }

      // If items array, sanitize items
      if (key === 'items' && Array.isArray(value)) {
        cleanObj[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? sanitizeItem(item as Partial<GtmItem>) : item
        );
        continue;
      }

      // Recursively sanitize nested objects
      if (value !== null && typeof value === 'object') {
        cleanObj[key] = sanitizeDataLayerPayload(value);
      } else {
        cleanObj[key] = value;
      }
    }

    return cleanObj as T;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// 4. Core: DataLayer Push & Browser Detection
// ---------------------------------------------------------------------------

/** Extend the Window type to include dataLayer. */
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/**
 * Push an event to the GTM dataLayer.
 *
 * Guards:
 *   1. Only runs in browser context (silently skipped server-side).
 *   2. Ensures `window.dataLayer` is initialized.
 *   3. Automatically passes all payloads through `sanitizeDataLayerPayload`.
 *   4. Silently no-ops if window is not available — never throws.
 *
 * @param payload - Event payload to push.
 * @returns boolean indicating whether the push was executed.
 */
export function pushToDataLayer(payload: GtmEventPayload): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if (!Array.isArray(window.dataLayer)) {
      window.dataLayer = [];
    }

    // Sanitize before pushing
    const sanitizedPayload = sanitizeDataLayerPayload(payload);
    window.dataLayer.push(sanitizedPayload as unknown as Record<string, unknown>);
    return true;
  } catch (err) {
    console.warn('[GTM DataLayer] Push failed:', err);
    return false;
  }
}

/**
 * Inspect the current dataLayer contents (useful for testing and debugging).
 */
export function getDataLayer(): Record<string, unknown>[] {
  if (typeof window === 'undefined' || !Array.isArray(window.dataLayer)) {
    return [];
  }
  return window.dataLayer;
}

/**
 * Reset dataLayer array (primarily for unit testing isolation).
 */
export function resetDataLayerForTesting(): void {
  if (typeof window !== 'undefined') {
    window.dataLayer = [];
  }
}

// ---------------------------------------------------------------------------
// 5. Public API: Standard E-Commerce Event Emitters
// ---------------------------------------------------------------------------

export interface PushViewItemData {
  productId?: string;
  productName?: string;
  price?: number;
  quantity?: number;
  productType?: string;
  storeName?: string;
  currency?: string;
  value?: number;
  items?: GtmItem[];
}

/**
 * Emit `view_item` — buyer opens a product / catalog page.
 * Trigger: onMount of product detail page or product card expansion.
 *
 * ENTITLEMENT GUARD: Only fires if tenant is on an eligible tier ('ads' or 'scale').
 *
 * @param tier - Tenant's canonical tier or plan key.
 * @param data - Product information.
 * @returns boolean indicating whether event was pushed.
 */
export function pushViewItem(
  tier: string | null | undefined,
  data: PushViewItemData
): boolean {
  if (!isTierGtmEligible(tier)) {
    return false;
  }

  const items: GtmItem[] =
    data.items && data.items.length > 0
      ? data.items.map(sanitizeItem)
      : [
          sanitizeItem({
            item_id: data.productId || 'unknown',
            item_name: data.productName || 'unknown',
            price: data.price ?? 0,
            quantity: data.quantity ?? 1,
            item_category: data.productType?.toUpperCase(),
            item_brand: data.storeName,
          }),
        ];

  const totalValue =
    typeof data.value === 'number'
      ? data.value
      : items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const payload: GtmEventPayload = {
    event: 'view_item',
    ecommerce: {
      currency: data.currency || 'IDR',
      value: totalValue,
      items,
    },
  };

  return pushToDataLayer(payload);
}

export interface PushBeginCheckoutData {
  productId?: string;
  productName?: string;
  price?: number;
  quantity?: number;
  productType?: string;
  storeName?: string;
  currency?: string;
  value?: number;
  coupon?: string;
  items?: GtmItem[];
}

/**
 * Emit `begin_checkout` — buyer starts filling the order form.
 * Trigger: when the checkout modal opens / order form becomes visible.
 *
 * ENTITLEMENT GUARD: Only fires if tenant is on an eligible tier ('ads' or 'scale').
 *
 * @param tier - Tenant's canonical tier or plan key.
 * @param data - Checkout context.
 * @returns boolean indicating whether event was pushed.
 */
export function pushBeginCheckout(
  tier: string | null | undefined,
  data: PushBeginCheckoutData
): boolean {
  if (!isTierGtmEligible(tier)) {
    return false;
  }

  const items: GtmItem[] =
    data.items && data.items.length > 0
      ? data.items.map(sanitizeItem)
      : [
          sanitizeItem({
            item_id: data.productId || 'unknown',
            item_name: data.productName || 'unknown',
            price: data.price ?? 0,
            quantity: data.quantity ?? 1,
            item_category: data.productType?.toUpperCase(),
            item_brand: data.storeName,
          }),
        ];

  const totalValue =
    typeof data.value === 'number'
      ? data.value
      : items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const payload: GtmEventPayload = {
    event: 'begin_checkout',
    ecommerce: {
      currency: data.currency || 'IDR',
      value: totalValue,
      ...(data.coupon ? { coupon: data.coupon } : {}),
      items,
    },
  };

  return pushToDataLayer(payload);
}

export interface PushPurchaseData {
  transactionId: string;
  value: number;
  currency?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  productType?: string;
  storeName?: string;
  coupon?: string;
  affiliateCode?: string;
  items?: GtmItem[];
  /** Optional customer data (safely stripped from dataLayer) */
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
}

/**
 * Emit `purchase` — payment confirmed on success/thank-you page.
 * Trigger: onMount of the post-payment confirmation page.
 *
 * IMPORTANT: This is the revenue-critical event. Ensure it fires exactly
 * once per confirmed transaction (use transactionId as idempotency key in GTM).
 *
 * PII SAFETY: customer name, phone, and email are NEVER included in this payload.
 * They are stripped out to protect buyer privacy and comply with GA4 / GTM terms.
 *
 * ENTITLEMENT GUARD: Only fires if tenant is on an eligible tier ('ads' or 'scale').
 *
 * @param tier - Tenant's canonical tier or plan key.
 * @param data - Purchase confirmation data.
 * @returns boolean indicating whether event was pushed.
 */
export function pushPurchase(
  tier: string | null | undefined,
  data: PushPurchaseData
): boolean {
  if (!isTierGtmEligible(tier)) {
    return false;
  }

  const items: GtmItem[] =
    data.items && data.items.length > 0
      ? data.items.map(sanitizeItem)
      : [
          sanitizeItem({
            item_id: data.productId || 'unknown',
            item_name: data.productName || 'unknown',
            price: data.quantity && data.quantity > 0 ? data.value / data.quantity : data.value,
            quantity: data.quantity ?? 1,
            item_category: data.productType?.toUpperCase(),
            item_brand: data.storeName,
          }),
        ];

  const coupon = data.coupon || data.affiliateCode || undefined;

  const payload: GtmEventPayload = {
    event: 'purchase',
    ecommerce: {
      transaction_id: String(data.transactionId || '').trim(),
      currency: data.currency || 'IDR',
      value: Number(data.value) || 0,
      ...(coupon ? { coupon } : {}),
      items,
    },
  };

  return pushToDataLayer(payload);
}

/**
 * Push an arbitrary custom event to GTM DataLayer with automatic PII sanitization.
 *
 * @param tier - Tenant's canonical tier or plan key.
 * @param eventName - Name of custom event (e.g. 'add_to_cart', 'contact_whatsapp').
 * @param payload - Custom parameters (will be deeply sanitized).
 * @returns boolean indicating whether event was pushed.
 */
export function pushCustomEvent(
  tier: string | null | undefined,
  eventName: string,
  payload: Record<string, unknown> = {}
): boolean {
  if (!isTierGtmEligible(tier)) {
    return false;
  }

  const eventPayload: GtmEventPayload = {
    event: eventName,
    ...payload,
  };

  return pushToDataLayer(eventPayload);
}

// ---------------------------------------------------------------------------
// 6. GTM Script Injection
// ---------------------------------------------------------------------------

/**
 * Inject the GTM container script into the document `<head>`.
 * This is an idempotent injection — subsequent calls with the same
 * container ID are safe no-ops.
 *
 * ENTITLEMENT GUARD:
 * - Only injects if `isTierGtmEligible(tier)` is true (packages 'ads' and 'scale').
 * - Lite and Solo tenants NEVER load external GTM scripts (strictly blocked).
 *
 * @param containerId - The GTM container ID (format: GTM-XXXXXXX).
 * @param tier        - Tenant's canonical tier.
 * @returns boolean indicating whether injection succeeded.
 */
export function injectGtmScript(
  containerId: string | null | undefined,
  tier: string | null | undefined
): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  // 1. Entitlement Guard
  if (!isTierGtmEligible(tier)) {
    return false;
  }

  // 2. Validate Container ID
  if (!containerId || typeof containerId !== 'string') {
    return false;
  }

  const cleanId = containerId.trim().toUpperCase();
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(cleanId)) {
    console.warn(`[GTM] Invalid container ID format: "${containerId}". Expected format: GTM-XXXXXXX.`);
    return false;
  }

  // 3. Idempotency Guard: skip if already injected
  const idempotencyKey = `gtm-injected-${cleanId}`;
  if (document.getElementById(idempotencyKey)) {
    return false;
  }

  // 4. Initialize window.dataLayer
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
  }

  try {
    // 5. Inject GTM script tag
    const script = document.createElement('script');
    script.id = idempotencyKey;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${cleanId}`;
    document.head.appendChild(script);

    // 6. Inject noscript iframe (GTM standard best practice)
    const noscript = document.createElement('noscript');
    noscript.id = `${idempotencyKey}-noscript`;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${cleanId}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);

    if (document.body) {
      document.body.prepend(noscript);
    }

    return true;
  } catch (err) {
    console.warn('[GTM] Container script injection error:', err);
    return false;
  }
}
