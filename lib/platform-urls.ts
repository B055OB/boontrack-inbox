/**
 * lib/platform-urls.ts
 * Centralized Platform URL Constants for BoonTrack
 *
 * SINGLE SOURCE OF TRUTH untuk semua URL platform.
 * Gunakan fungsi ini daripada hardcode URL di setiap file.
 *
 * Priority: NEXT_PUBLIC_APP_URL env var → default shop.boontrack.com
 */

/**
 * URL utama platform BoonTrack (aktif).
 * Contoh: https://shop.boontrack.com
 */
export function getPlatformBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://shop.boontrack.com'
  );
}

/**
 * URL dashboard toko merchant.
 * Jika slug diberikan: https://shop.boontrack.com/{slug}
 * Jika tidak: https://shop.boontrack.com
 */
export function getDashboardUrl(slug?: string): string {
  const base = getPlatformBaseUrl();
  if (slug) {
    return `${base}/${encodeURIComponent(slug.trim())}`;
  }
  return base;
}

/**
 * URL halaman registrasi / daftar toko baru.
 * Contoh: https://shop.boontrack.com/register
 */
export function getRegisterUrl(): string {
  return `${getPlatformBaseUrl()}/register`;
}

/**
 * URL halaman billing/langganan toko.
 * Contoh: https://shop.boontrack.com/{slug}?tab=billing
 */
export function getBillingUrl(slug: string): string {
  return `${getDashboardUrl(slug)}?tab=billing`;
}

/**
 * URL halaman orders dashboard toko.
 * Contoh: https://shop.boontrack.com/{slug}?tab=orders&orderId=xxx
 */
export function getOrderDashboardUrl(slug: string, orderId?: string): string {
  const base = `${getDashboardUrl(slug)}?tab=orders`;
  if (orderId) {
    return `${base}&orderId=${encodeURIComponent(orderId)}`;
  }
  return base;
}

/**
 * URL halaman pengaturan notifikasi.
 * Contoh: https://shop.boontrack.com/{slug}?tab=settings&section=notifications
 */
export function getNotificationSettingsUrl(slug: string): string {
  return `${getDashboardUrl(slug)}?tab=settings&section=notifications`;
}
