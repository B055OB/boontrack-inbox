export interface TenantDomainRecord {
  slug: string;
  custom_domain?: string | null;
}

export interface ProductLinkParams {
  id?: string | number;
  slug?: string;
}

/**
 * Dynamic Platform Domain & Checkout Link Generator
 *
 * Rules:
 * 1. If tenant has an active custom_domain, use https://{custom_domain}
 * 2. Otherwise, fall back to https://shop.boontrack.com/{tenant_slug}
 * 3. Construct checkout URL either with ?product={id} or /p/{slug}
 */
export function getTenantBaseUrl(tenant: TenantDomainRecord): string {
  const rawDomain = (tenant.custom_domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  if (rawDomain) {
    return `https://${rawDomain}`;
  }

  const cleanSlug = (tenant.slug || 'growth').trim().toLowerCase();
  return `https://shop.boontrack.com/${cleanSlug}`;
}

export function getTenantCheckoutUrl(
  tenant: TenantDomainRecord,
  product?: ProductLinkParams
): string {
  const baseUrl = getTenantBaseUrl(tenant);

  if (product?.slug) {
    return `${baseUrl}/p/${product.slug}`;
  }

  if (product?.id !== undefined && product?.id !== null && String(product.id).trim().length > 0) {
    return `${baseUrl}/checkout?product=${product.id}`;
  }

  return `${baseUrl}/checkout`;
}
