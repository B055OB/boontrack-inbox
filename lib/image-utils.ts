/**
 * Utility to sanitize and normalize image URLs across BoonTrack.
 * - Enforces single source of truth asset domain: https://assets.boontrack.com
 * - Upgrades insecure http:// to https://
 * - Converts legacy api.boontrack.com/assets/uploads/..., singular asset.boontrack.com, or dev r2 domains to canonical assets.boontrack.com
 */
export const ASSET_DOMAIN = (
  process.env.NEXT_PUBLIC_ASSET_DOMAIN || 'https://assets.boontrack.com'
).replace(/\/+$/, '');

export function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed) return '';

  // 1. Tangkap seluruh variasi domain legacy api.boontrack.com (apa pun path atau protocol-nya)
  if (trimmed.includes('api.boontrack.com')) {
    const afterDomain = trimmed.split(/api\.boontrack\.com/i)[1] || '';
    let cleanPath = afterDomain.split('?')[0].replace(/^\/+/, '');
    
    // Hapus hanya prefix mount server legacy tanpa memotong prefix folder bucket (products, media, qris, dll.)
    if (cleanPath.startsWith('api/v1/media/')) {
      cleanPath = cleanPath.replace(/^api\/v1\/media\//, '');
    } else if (cleanPath.startsWith('assets/uploads/')) {
      cleanPath = cleanPath.replace(/^assets\/uploads\//, '');
    } else if (cleanPath.startsWith('assets/')) {
      cleanPath = cleanPath.replace(/^assets\//, '');
    } else if (cleanPath.startsWith('uploads/')) {
      cleanPath = cleanPath.replace(/^uploads\//, '');
    }
    cleanPath = cleanPath.replace(/^\/+/, '');

    if (cleanPath) {
      return `${ASSET_DOMAIN}/${cleanPath}`;
    }
    return ASSET_DOMAIN;
  }

  // 2. Tangkap legacy Railway core backend assets (boontrack-core-production.up.railway.app)
  if (trimmed.includes('boontrack-core-production.up.railway.app')) {
    const afterDomain = trimmed.split(/boontrack-core-production\.up\.railway\.app/i)[1] || '';
    let cleanPath = afterDomain.split('?')[0].replace(/^\/+/, '');
    if (cleanPath.startsWith('api/v1/media/')) {
      cleanPath = cleanPath.replace(/^api\/v1\/media\//, '');
    } else if (cleanPath.startsWith('assets/uploads/')) {
      cleanPath = cleanPath.replace(/^assets\/uploads\//, '');
    } else if (cleanPath.startsWith('assets/')) {
      cleanPath = cleanPath.replace(/^assets\//, '');
    } else if (cleanPath.startsWith('uploads/')) {
      cleanPath = cleanPath.replace(/^uploads\//, '');
    }
    cleanPath = cleanPath.replace(/^\/+/, '');

    if (cleanPath) {
      return `${ASSET_DOMAIN}/${cleanPath}`;
    }
    return ASSET_DOMAIN;
  }

  // 3. Normalisasi singular domain https://asset.boontrack.com -> plural https://assets.boontrack.com
  if (trimmed.includes('asset.boontrack.com') && !trimmed.includes('assets.boontrack.com')) {
    const afterDomain = trimmed.split(/asset\.boontrack\.com/i)[1] || '';
    let cleanPath = afterDomain.split('?')[0].replace(/^\/+/, '');
    if (cleanPath.startsWith('api/v1/media/')) {
      cleanPath = cleanPath.replace(/^api\/v1\/media\//, '');
    } else if (cleanPath.startsWith('assets/uploads/')) {
      cleanPath = cleanPath.replace(/^assets\/uploads\//, '');
    }
    cleanPath = cleanPath.replace(/^\/+/, '');
    if (cleanPath) {
      return `${ASSET_DOMAIN}/${cleanPath}`;
    }
    return ASSET_DOMAIN;
  }

  // 4. Pastikan plural domain https://assets.boontrack.com terformat rapi
  if (trimmed.includes('assets.boontrack.com')) {
    const afterDomain = trimmed.split(/assets\.boontrack\.com/i)[1] || '';
    let cleanPath = afterDomain.split('?')[0].replace(/^\/+/, '');
    if (cleanPath.startsWith('api/v1/media/')) {
      cleanPath = cleanPath.replace(/^api\/v1\/media\//, '');
    } else if (cleanPath.startsWith('assets/uploads/')) {
      cleanPath = cleanPath.replace(/^assets\/uploads\//, '');
    }
    cleanPath = cleanPath.replace(/^\/+/, '');
    if (cleanPath) {
      return `${ASSET_DOMAIN}/${cleanPath}`;
    }
    return ASSET_DOMAIN;
  }

  // 5. Upgrade legacy Cloudflare R2 dev domains (*.r2.dev)
  if (trimmed.includes('r2.dev')) {
    const afterDomain = trimmed.split(/r2\.dev/i)[1] || '';
    const cleanPath = afterDomain.split('?')[0].replace(/^\/+/, '');
    if (cleanPath) {
      return `${ASSET_DOMAIN}/${cleanPath}`;
    }
  }

  // 6. Upgrade relative paths yang mengarah ke internal media proxy atau uploads
  if (trimmed.startsWith('/api/v1/media/')) {
    const sub = trimmed.replace(/^\/api\/v1\/media\//, '').split('?')[0].replace(/^\/+/, '');
    if (sub) {
      return `${ASSET_DOMAIN}/${sub}`;
    }
  }
  if (trimmed.startsWith('/assets/uploads/')) {
    const sub = trimmed.replace(/^\/assets\/uploads\//, '').split('?')[0].replace(/^\/+/, '');
    if (sub) {
      return `${ASSET_DOMAIN}/${sub}`;
    }
  }
  if (trimmed.startsWith('/products/') || trimmed.startsWith('/media/') || trimmed.startsWith('/qris/')) {
    const sub = trimmed.replace(/^\/+/, '').split('?')[0];
    if (sub) {
      return `${ASSET_DOMAIN}/${sub}`;
    }
  }

  // 7. Upgrade any insecure http:// to https://
  if (trimmed.startsWith('http://')) {
    trimmed = trimmed.replace(/^http:\/\//i, 'https://');
  }

  return trimmed;
}
