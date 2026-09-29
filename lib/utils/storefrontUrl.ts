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
