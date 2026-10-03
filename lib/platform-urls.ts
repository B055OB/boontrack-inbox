/**
 * lib/platform-urls.ts
 * Centralized Platform URL Constants for BoonTrack (ARCHITECTURE.md §21 & §25)
 *
 * SINGLE SOURCE OF TRUTH untuk semua URL platform.
 * Gunakan fungsi ini daripada hardcode URL di setiap file.
 *
 * Pemisahan Domain Resmi:
 * - Domain Merchant (Dashboard): https://dashboard.boontrack.com/{slug}
 * - Login Merchant: https://dashboard.boontrack.com/login
 * - Domain Pembeli (Storefront/Checkout): https://shop.boontrack.com/{slug}
 * - Invoice / Pay Publik: https://shop.boontrack.com/{slug}/pay/{token} atau /invoice/{order_id}
 */

/**
 * URL basis merchant dashboard (dashboard.boontrack.com).
 */
export function getDashboardBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    'https://dashboard.boontrack.com'
  );
}

/**
 * URL dashboard toko merchant.
 * Jika slug diberikan: https://dashboard.boontrack.com/{slug}
 * Jika tidak: https://dashboard.boontrack.com
 */
export function getDashboardUrl(slug?: string): string {
  const base = getDashboardBaseUrl();
  if (slug) {
    return `${base}/${encodeURIComponent(slug.trim())}`;
  }
  return base;
}

/**
 * URL login merchant resmi.
 * Contoh: https://dashboard.boontrack.com/login
 */
export function getMerchantLoginUrl(): string {
  return `${getDashboardBaseUrl()}/login`;
}

/**
 * URL basis pembeli / storefront publik (shop.boontrack.com).
 */
export function getStorefrontBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://shop.boontrack.com'
  );
}

/**
 * Alias untuk getStorefrontBaseUrl (backward-compat).
 */
export function getPlatformBaseUrl(): string {
  return getStorefrontBaseUrl();
}

/**
 * URL storefront toko pembeli.
 * Contoh: https://shop.boontrack.com/{slug}
 */
export function getStorefrontUrl(slug: string): string {
  return `${getStorefrontBaseUrl()}/${encodeURIComponent(slug.trim())}`;
}

/**
 * URL invoice / bayar publik untuk pembeli.
 * Contoh: https://shop.boontrack.com/{slug}/pay/{token}
 */
export function getPublicInvoiceUrl(slug: string, orderIdOrToken: string): string {
  return `${getStorefrontUrl(slug)}/pay/${encodeURIComponent(orderIdOrToken.trim())}`;
}

/**
 * URL halaman registrasi / daftar toko baru.
 * Contoh: https://shop.boontrack.com/register
 */
export function getRegisterUrl(): string {
  return `${getStorefrontBaseUrl()}/register`;
}

/**
 * URL halaman billing/langganan toko di dashboard merchant.
 * Contoh: https://dashboard.boontrack.com/{slug}?tab=billing
 */
export function getBillingUrl(slug: string): string {
  return `${getDashboardUrl(slug)}?tab=billing`;
}

/**
 * URL halaman orders dashboard toko di dashboard merchant.
 * Contoh: https://dashboard.boontrack.com/{slug}?tab=orders&orderId=xxx
 */
export function getOrderDashboardUrl(slug: string, orderId?: string): string {
  const base = `${getDashboardUrl(slug)}?tab=orders`;
  if (orderId) {
    return `${base}&orderId=${encodeURIComponent(orderId)}`;
  }
  return base;
}

/**
 * URL halaman pengaturan notifikasi di dashboard merchant.
 * Contoh: https://dashboard.boontrack.com/{slug}?tab=settings&section=notifications
 */
export function getNotificationSettingsUrl(slug: string): string {
  return `${getDashboardUrl(slug)}?tab=settings&section=notifications`;
}

