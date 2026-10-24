import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

interface RouteContext {
  params: Promise<{ key: string[] }>;
}

const CLOUDFLARE_IPS = ['104.18.50.34', '104.18.54.45'];

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

// Fetch directly from Cloudflare R2 using Cloudflare IP bypass for ISP DNS poisoning
// Fetch directly from Cloudflare R2 using Cloudflare IP bypass for ISP DNS poisoning
async function fetchFromR2Direct(joinedKey: string, r2Host: string = 'assets.boontrack.com'): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chosenIp = CLOUDFLARE_IPS[0];
    const req = https.get(
      `https://${r2Host}/${joinedKey}`,
      {
        headers: { Host: r2Host },
        lookup: (hostname, opts, cb) => {
          const callback = typeof opts === 'function' ? opts : cb;
          if (opts && typeof opts === 'object' && (opts as any).all) {
            callback(null, [{ address: chosenIp, family: 4 }] as any);
          } else {
            callback(null, chosenIp as any, 4);
          }
        },
        timeout: 5000,
      },
      (res) => {
        if (res.statusCode === 200) {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', () => resolve(null));
        } else {
          resolve(null);
        }
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  const joinedKey = (key || []).join('/');

  if (!joinedKey) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const mimeType = getMimeType(joinedKey);

  const isStaging =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.APP_ENV === 'staging';

  const configuredR2Domain = (
    process.env.R2_PUBLIC_DOMAIN ||
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_ASSET_DOMAIN ||
    ''
  ).replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();

  const r2PublicDomain = isStaging
    ? (configuredR2Domain && !configuredR2Domain.includes('assets.boontrack.com') ? configuredR2Domain : '')
    : (configuredR2Domain || 'assets.boontrack.com');

  // 1. Coba ambil dari Cloudflare R2 via Clean IP bypass (hanya jika domain valid & terisolasi di staging)
  if (r2PublicDomain) {
    try {
      const r2Buffer = await fetchFromR2Direct(joinedKey, r2PublicDomain);
      if (r2Buffer && r2Buffer.length > 0) {
        return new NextResponse(new Uint8Array(r2Buffer), {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Storage-Source': 'cloudflare-r2',
          },
        });
      }
    } catch (r2Err) {
      console.debug('[Media Proxy] R2 direct fetch note:', r2Err);
    }
  }

  // 2. Coba ambil dari Supabase Storage (hanya jika bucket eksplisit terisolasi di staging)
  const supabaseBaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co').replace(/\/+$/, '');
  const configuredSbBucket = (process.env.SUPABASE_STORAGE_BUCKET || '').trim();
  const sbBucket = isStaging
    ? (configuredSbBucket && configuredSbBucket !== 'store-assets' ? configuredSbBucket : '')
    : (configuredSbBucket || 'store-assets');

  if (sbBucket) {
    const supabasePaths = [
      `${supabaseBaseUrl}/storage/v1/object/public/${sbBucket}/${joinedKey}`,
    ];

    for (const sbUrl of supabasePaths) {
      try {
        const res = await fetch(sbUrl, { next: { revalidate: 3600 } });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': res.headers.get('content-type') || mimeType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Storage-Source': 'supabase-storage',
            },
          });
        }
      } catch (sbErr) {
        console.debug('[Media Proxy] Supabase fallback fetch note:', sbErr);
      }
    }
  }

  // 3. Coba ambil dari backend Railway (hanya non-staging)
  if (!isStaging) {
    try {
      const railwayUrl = `https://api.boontrack.com/assets/uploads/${joinedKey.split('/').pop()}`;
      const res = await fetch(railwayUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': res.headers.get('content-type') || mimeType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Storage-Source': 'railway-core',
          },
        });
      }
    } catch {}
  }

  return new NextResponse('Asset Not Found', { status: 404 });
}
