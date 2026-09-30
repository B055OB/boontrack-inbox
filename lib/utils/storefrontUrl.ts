/**
 * Centralized Storefront URL Helper (BoonTrack Multi-Tenant §4)
 * Canonical format: https://boontrack.com/${slug}
 * (Replaces legacy prefix shop.boontrack.com)
 */

export const CANONICAL_DOMAIN = 'https://boontrack.com';

/**
 * Resolves the clean, canonical storefront bio link for any tenant.
 * Example: getStorefrontUrl('om-budi') -> 'https://boontrack.com/om-budi'
 */
export function getStorefrontUrl(tenantSlug?: string | null, customDomain?: string | null): string {
  if (customDomain) {
    const cleanDomain = customDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (cleanDomain) return `https://${cleanDomain}`;
  }
  if (!tenantSlug) return CANONICAL_DOMAIN;
  const cleanSlug = tenantSlug.trim().toLowerCase();
  return cleanSlug ? `${CANONICAL_DOMAIN}/${cleanSlug}` : CANONICAL_DOMAIN;
}

/**
 * Resolves the canonical URL for a specific product page.
 * Example: getProductPageUrl('om-budi', 'ebook-sales') -> 'https://boontrack.com/om-budi/p/ebook-sales'
 */
export function getProductPageUrl(
  tenantSlug: string,
  productSlug: string,
  customDomain?: string | null
): string {
  const base = getStorefrontUrl(tenantSlug, customDomain);
  const cleanProd = (productSlug || '').trim();
  return cleanProd ? `${base}/p/${cleanProd}` : base;
}

/**
 * Shortlink alias for copy-to-clipboard and share buttons in dashboard.
 */
export function getStorefrontShortlink(tenantSlug: string): string {
  return getStorefrontUrl(tenantSlug);
}

/**
 * Resolves the WhatsApp rotator URL on canonical domain.
 */
export function getRotatorUrl(tenantSlug: string): string {
  const cleanSlug = (tenantSlug || '').trim().toLowerCase();
  return `${CANONICAL_DOMAIN}/r/${cleanSlug}`;
}

/**
 * Resolves digital delivery URL on canonical domain.
 */
export function getDigitalDeliveryUrl(orderId: string): string {
  return `${CANONICAL_DOMAIN}/d/${(orderId || '').trim()}`;
}

export const STOREFRONT_DOMAIN = 'https://shop.boontrack.com';

/**
 * Resolves the public storefront shop homepage URL on shop.boontrack.com.
 * Example: getStorefrontShopUrl('tanev-food') -> 'https://shop.boontrack.com/tanev-food'
 */
export function getStorefrontShopUrl(tenantSlug?: string | null): string {
  if (!tenantSlug) return STOREFRONT_DOMAIN;
  const cleanSlug = encodeURIComponent(tenantSlug.trim());

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `/${cleanSlug}`;
    }
  }

  const base = process.env.NEXT_PUBLIC_STOREFRONT_URL
    ? process.env.NEXT_PUBLIC_STOREFRONT_URL.replace(/\/+$/, '')
    : STOREFRONT_DOMAIN;

  return `${base}/${cleanSlug}`;
}

/**
 * Resolves the public storefront invoice URL on shop.boontrack.com.
 * Example: getStorefrontInvoiceUrl('tanev-food', 'ORD-123') -> 'https://shop.boontrack.com/tanev-food/invoice/ORD-123'
 * In local development (localhost / 127.0.0.1), preserves local routing for seamless testing.
 */
export function getStorefrontInvoiceUrl(tenantSlug?: string | null, orderId?: string | null): string {
  const cleanSlug = encodeURIComponent(String(tenantSlug || 'shop').trim());
  const cleanOrderId = encodeURIComponent(String(orderId || '').replace(/^#/, '').trim());

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `/${cleanSlug}/invoice/${cleanOrderId}`;
    }
  }

  const base = process.env.NEXT_PUBLIC_STOREFRONT_URL
    ? process.env.NEXT_PUBLIC_STOREFRONT_URL.replace(/\/+$/, '')
    : STOREFRONT_DOMAIN;

  return `${base}/${cleanSlug}/invoice/${cleanOrderId}`;
}

