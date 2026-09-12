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

export async function optimizeImageToWebP(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<File> {
  if (typeof window === 'undefined' || !window.FileReader) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
                const webpFile = new File([blob], cleanName, { type: 'image/webp' });
                resolve(webpFile);
              } else {
                resolve(file);
              }
            },
            'image/webp',
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export interface UploadImageOptions {
  folder?: string;
  tenantSlug?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export async function uploadImageFile(
  file: File,
  options?: UploadImageOptions
): Promise<string> {
  const folder = options?.folder || 'media';
  const tenantSlug = options?.tenantSlug || 'sandbox';

  // 1. Optimize image to WebP
  let processedFile = file;
  try {
    processedFile = await optimizeImageToWebP(
      file,
      options?.maxWidth || 1200,
      options?.maxHeight || 1200,
      options?.quality || 0.85
    );
  } catch (optErr) {
    console.warn('Image optimization skipped:', optErr);
    processedFile = file;
  }

  // 2. Post to /api/v1/upload
  const formData = new FormData();
  formData.append('file', processedFile, processedFile.name);
  formData.append('image', processedFile, processedFile.name);
  formData.append('tenant_slug', tenantSlug);
  formData.append('tenant_id', tenantSlug);
  formData.append('folder', folder);

  const res = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: {
      'X-Tenant-Slug': tenantSlug,
      'X-Tenant-ID': tenantSlug,
    },
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Upload gagal (${res.status})`;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.error || errJson.message || errorDetail;
    } catch {}
    throw new Error(errorDetail);
  }

  const data = await res.json();
  const rawUrl =
    data?.public_url ||
    data?.url ||
    data?.image_url ||
    data?.r2_url ||
    (typeof data === 'string' ? data : '');

  const sanitized = sanitizeImageUrl(rawUrl);
  if (!sanitized) {
    throw new Error('Server tidak mengembalikan URL gambar yang valid.');
  }

  return sanitized;
}
