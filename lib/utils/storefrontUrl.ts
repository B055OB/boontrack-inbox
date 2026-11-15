/**
 * Centralized Storefront URL Helper (BoonTrack Multi-Tenant §4)
 * Canonical format: https://shop.boontrack.com/${slug}
 */

export const CANONICAL_DOMAIN = 'https://shop.boontrack.com';

/**
 * Helper to determine if a hostname belongs to Vercel Preview or Staging environments.
 */
export function isPreviewOrStagingDomain(hostname: string): boolean {
  if (!hostname) return false;
  const clean = hostname.split(':')[0].toLowerCase().trim();
  return (
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean.endsWith('.localhost') ||
    clean.endsWith('.vercel.app') ||
    clean === 'staging.boontrack.com' ||
    clean.endsWith('.staging.boontrack.com') ||
    clean.startsWith('staging.')
  );
}

/**
 * Resolves the clean, canonical storefront bio link for any tenant.
 * Example: getStorefrontUrl('om-budi') -> 'https://shop.boontrack.com/om-budi'
 * In Preview/Staging or local development, preserves active origin.
 */
export function getStorefrontUrl(tenantSlug?: string | null, customDomain?: string | null): string {
  if (customDomain) {
    const cleanDomain = customDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (cleanDomain) return `https://${cleanDomain}`;
  }
  const cleanSlug = tenantSlug ? tenantSlug.trim().toLowerCase() : '';
  if (typeof window !== 'undefined' && isPreviewOrStagingDomain(window.location.hostname)) {
    return cleanSlug ? `${window.location.origin}/${cleanSlug}` : window.location.origin;
  }
  if (!cleanSlug) return CANONICAL_DOMAIN;
  return `${CANONICAL_DOMAIN}/${cleanSlug}`;
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
  if (typeof window !== 'undefined' && isPreviewOrStagingDomain(window.location.hostname)) {
    return `${window.location.origin}/r/${cleanSlug}`;
  }
  return `${CANONICAL_DOMAIN}/r/${cleanSlug}`;
}

/**
 * Resolves digital delivery URL on canonical domain.
 */
export function getDigitalDeliveryUrl(orderId: string): string {
  const cleanOrderId = (orderId || '').trim();
  if (typeof window !== 'undefined' && isPreviewOrStagingDomain(window.location.hostname)) {
    return `${window.location.origin}/d/${cleanOrderId}`;
  }
  return `${CANONICAL_DOMAIN}/d/${cleanOrderId}`;
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
    if (isPreviewOrStagingDomain(host)) {
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
    if (isPreviewOrStagingDomain(host)) {
      return `/${cleanSlug}/invoice/${cleanOrderId}`;
    }
  }

  const base = process.env.NEXT_PUBLIC_STOREFRONT_URL
    ? process.env.NEXT_PUBLIC_STOREFRONT_URL.replace(/\/+$/, '')
    : STOREFRONT_DOMAIN;

  return `${base}/${cleanSlug}/invoice/${cleanOrderId}`;
}

/**
 * Resolves the dedicated public payment token URL on shop.boontrack.com.
 * Example: getStorefrontPayUrl('solusi-ads', 'pay_8k4m2n9p') -> 'https://shop.boontrack.com/solusi-ads/pay/pay_8k4m2n9p'
 * In local development (localhost / 127.0.0.1), preserves local routing for seamless testing.
 */
export function getStorefrontPayUrl(tenantSlug?: string | null, token?: string | null): string {
  const cleanSlug = encodeURIComponent(String(tenantSlug || 'shop').trim());
  const cleanToken = encodeURIComponent(String(token || '').trim());

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (isPreviewOrStagingDomain(host)) {
      return `/${cleanSlug}/pay/${cleanToken}`;
    }
  }

  const base = process.env.NEXT_PUBLIC_STOREFRONT_URL
    ? process.env.NEXT_PUBLIC_STOREFRONT_URL.replace(/\/+$/, '')
    : STOREFRONT_DOMAIN;

  return `${base}/${cleanSlug}/pay/${cleanToken}`;
}

