/**
 * Utility to sanitize and normalize image URLs across BoonTrack.
 * - Prevents Mixed Content by upgrading insecure http:// to https://
 * - Converts legacy http://api.boontrack.com/assets/uploads/... to secure https://
 */
export function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Upgrade legacy boontrack api assets
  if (trimmed.includes('api.boontrack.com/assets/uploads/')) {
    const filename = trimmed.split('assets/uploads/').pop()?.split('?')[0];
    if (filename) {
      return `https://api.boontrack.com/assets/uploads/${filename}`;
    }
  }

  // Upgrade any http:// to https:// to prevent mixed content blocking on HTTPS
  if (trimmed.startsWith('http://')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  return trimmed;
}
