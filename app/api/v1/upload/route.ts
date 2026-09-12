import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabase } from '@/lib/supabaseClient';
import { sanitizeImageUrl } from '@/lib/image-utils';

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID ||
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  '56303bb13200d0980da8695adcf08550';

const R2_ENDPOINT =
  process.env.R2_ENDPOINT_URL ||
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID ||
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
  '';

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ||
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  '';

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'boontrack-media';

const R2_PUBLIC_URL_BASE = (
  process.env.R2_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_R2_URL ||
  process.env.NEXT_PUBLIC_ASSET_DOMAIN ||
  'https://asset.boontrack.com'
).replace(/\/+$/, '');

function getR2Client(): S3Client | null {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('image') || formData.get('qris')) as File | null;
    const tenantSlug =
      req.headers.get('x-tenant-slug') ||
      (formData.get('tenant_slug') as string) ||
      (formData.get('tenant_id') as string) ||
      'sandbox';
    let folder = (formData.get('folder') as string) || 'media';
    const isQris = folder === 'qris' || (file?.name && file.name.toLowerCase().includes('qris'));
    if (isQris) {
      folder = 'qris';
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json(
        { status: 'error', detail: 'File tidak ditemukan dalam form data (gunakan field file, image, atau qris)' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sanitizedName = (file.name || (isQris ? 'qris.png' : 'image.webp')).replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `${folder}/${Date.now()}_${sanitizedName}`;

    let r2Uploaded = false;
    let r2PublicUrl = `${R2_PUBLIC_URL_BASE}/${storageKey}`;

    // 1. Cloudflare R2 Upload menggunakan S3 Client (@aws-sdk/client-s3)
    const r2Client = getR2Client();
    if (r2Client) {
      try {
        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: storageKey,
            Body: buffer,
            ContentType: file.type || (isQris ? 'image/png' : 'image/webp'),
          })
        );
        r2Uploaded = true;
      } catch (r2Err: any) {
        console.warn('[Upload Route] Direct R2 upload error, continuing to resilient backup:', r2Err.message);
      }
    }

    // 2. Simpan juga ke Supabase Storage (store-assets) untuk fallback DNS bypass
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.storage
          .from('store-assets')
          .upload(`${tenantSlug}/${storageKey}`, buffer, {
            contentType: file.type || (isQris ? 'image/png' : 'image/webp'),
            upsert: true,
          });
      }
    } catch (sbErr) {
      console.debug('[Upload Route] Backup sync note:', sbErr);
    }

    // 3. Fallback ke Core Backend Railway jika R2 direct belum aktif
    if (!r2Uploaded) {
      try {
        const coreApiUrl = (
          process.env.CORE_API_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          process.env.NEXT_PUBLIC_CORE_API_URL ||
          'https://boontrack-core-production.up.railway.app'
        ).replace(/\/+$/, '');

        const backendRes = await fetch(`${coreApiUrl}/api/v1/media/upload`, {
          method: 'POST',
          headers: {
            'X-Tenant-Slug': tenantSlug,
            'X-Tenant-ID': tenantSlug,
          },
          body: formData,
        });

        if (backendRes.ok) {
          const resData = await backendRes.json();
          const candidateUrl = resData.url || resData.file_url || resData.public_url || '';
          if (candidateUrl) {
            r2PublicUrl = sanitizeImageUrl(candidateUrl);
          }
        }
      } catch (coreErr) {
        console.debug('[Upload Route] Railway media upload note:', coreErr);
      }
    }

    // URL proksi internal yang selalu aman dari blokir DNS ISP lokal
    const localProxyUrl = `/api/v1/media/${storageKey}`;
    // Kunci URL publik secara mutlak ke domain kanonikal asset.boontrack.com
    const canonicalAssetUrl = sanitizeImageUrl(r2PublicUrl) || `${R2_PUBLIC_URL_BASE}/${storageKey}`;
    const finalUrl = canonicalAssetUrl;

    return NextResponse.json({
      status: 'success',
      url: finalUrl,
      public_url: canonicalAssetUrl,
      r2_url: canonicalAssetUrl,
      image_url: finalUrl,
      local_proxy_url: localProxyUrl,
      qris_url: isQris ? finalUrl : undefined,
      path: `/${storageKey}`,
      filename: sanitizedName,
      folder,
      is_qris: isQris,
      storage: r2Uploaded ? 'cloudflare_r2' : 'hybrid_proxy',
    });
  } catch (err: any) {
    console.error('Upload route error:', err);
    return NextResponse.json(
      { status: 'error', detail: err.message || 'Gagal memproses upload media' },
      { status: 500 }
    );
  }
}