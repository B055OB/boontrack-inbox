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
  'https://assets.boontrack.com'
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
    let key = `${folder}/${Date.now()}_${sanitizedName}`;

    // 1. Direct Cloudflare R2 Upload menggunakan S3 Client (@aws-sdk/client-s3)
    const r2Client = getR2Client();
    if (!r2Client) {
      return NextResponse.json(
        { status: 'error', detail: 'Cloudflare R2 Client belum terkonfigurasi (R2_ACCESS_KEY_ID & R2_SECRET_ACCESS_KEY wajib diset)' },
        { status: 500 }
      );
    }

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || (isQris ? 'image/png' : 'image/webp'),
      })
    );

    // 2. Simpan juga ke Supabase Storage (store-assets) untuk backup
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.storage
          .from('store-assets')
          .upload(`${tenantSlug}/${key}`, buffer, {
            contentType: file.type || (isQris ? 'image/png' : 'image/webp'),
            upsert: true,
          });
      }
    } catch (sbErr) {
      console.debug('[Upload Route] Backup sync note:', sbErr);
    }

    // URL publik kanonikal dan proksi internal yang selalu sinkron dengan key penyimpanan
    const publicUrl = `${R2_PUBLIC_URL_BASE}/${key}`;
    const canonicalAssetUrl = sanitizeImageUrl(publicUrl) || publicUrl;
    const localProxyUrl = `/api/v1/media/${key}`;

    return NextResponse.json({
      status: 'success',
      url: canonicalAssetUrl,
      public_url: canonicalAssetUrl,
      r2_url: canonicalAssetUrl,
      image_url: canonicalAssetUrl,
      local_proxy_url: localProxyUrl,
      qris_url: isQris ? canonicalAssetUrl : undefined,
      path: `/${key}`,
      filename: sanitizedName,
      folder,
      is_qris: isQris,
      storage: 'cloudflare_r2',
    });
  } catch (err: any) {
    console.error('Upload route error:', err);
    return NextResponse.json(
      { status: 'error', detail: err.message || 'Gagal memproses upload media' },
      { status: 500 }
    );
  }
}