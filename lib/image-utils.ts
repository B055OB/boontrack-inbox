/**
 * Utility to sanitize and normalize image URLs across BoonTrack.
 * - Enforces single source of truth asset domain: https://asset.boontrack.com
 * - Upgrades insecure http:// to https://
 * - Converts legacy api.boontrack.com/assets/uploads/... or dev r2 domains to canonical asset.boontrack.com
 */
export const ASSET_DOMAIN = process.env.NEXT_PUBLIC_ASSET_DOMAIN || 'https://asset.boontrack.com';

export function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Upgrade legacy boontrack api assets to canonical asset.boontrack.com
  if (trimmed.includes('api.boontrack.com/assets/uploads/')) {
    const filename = trimmed.split('assets/uploads/').pop()?.split('?')[0];
    if (filename) {
      return `${ASSET_DOMAIN}/${filename}`;
    }
  }

  // Upgrade legacy r2.dev dev URLs to canonical asset.boontrack.com
  if (trimmed.includes('r2.dev/')) {
    const path = trimmed.split('r2.dev/').pop()?.split('?')[0];
    if (path) {
      return `${ASSET_DOMAIN}/${path}`;
    }
  }

  // Upgrade any http:// to https:// to prevent mixed content blocking on HTTPS
  if (trimmed.startsWith('http://')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  return trimmed;
}
