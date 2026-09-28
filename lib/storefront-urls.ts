const SHOP_BASE = process.env.NEXT_PUBLIC_SHOP_URL ?? 'https://shop.boontrack.com';

/**
 * Resolves the canonical base storefront URL for a tenant.
 * If customDomain is present, resolves to https://{customDomain}.
 * Otherwise, resolves to https://shop.boontrack.com/{tenantSlug}.
 */
export function getStorefrontUrl(tenantSlug?: string, customDomain?: string | null): string {
  if (customDomain) {
    const clean = customDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (clean) return `https://${clean}`;
  }
  if (!tenantSlug) return SHOP_BASE;
  const slug = tenantSlug.trim().toLowerCase();
  return slug ? `${SHOP_BASE}/${slug}` : SHOP_BASE;
}

/**
 * Resolves the canonical URL for a specific product landing or checkout page.
 */
export function getProductPageUrl(tenantSlug: string, productSlug: string, customDomain?: string | null): string {
  const base = getStorefrontUrl(tenantSlug, customDomain);
  const slug = productSlug.trim();
  return slug ? `${base}/p/${slug}` : base;
}

/**
 * Resolves the canonical WhatsApp rotator URL on the storefront domain.
 */
export function getRotatorUrl(tenantSlug: string): string {
  return `${SHOP_BASE}/r/${tenantSlug.trim().toLowerCase()}`;
}

/**
 * Resolves the digital delivery download / view URL on the storefront domain.
 */
export function getDigitalDeliveryUrl(orderId: string): string {
  return `${SHOP_BASE}/d/${orderId.trim()}`;
}
