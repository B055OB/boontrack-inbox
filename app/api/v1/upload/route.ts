import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabase } from '@/lib/supabaseClient';
import { sanitizeImageUrl } from '@/lib/image-utils';

export function cleanEnv(val?: string | null): string {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
}

/**
 * Memastikan endpoint R2 berformat murni S3 API:
 * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 * Mencegah pemakaian custom domain (assets.boontrack.com), bucket path (/boontrack-media),
 * atau subdomain berlebih yang menyebabkan TLS Handshake Failure (SSL alert number 40 / EPROTO).
 */
export function resolveR2Endpoint(rawEndpoint?: string, accountId?: string): string {
  const accId = cleanEnv(
    accountId ||
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    '56303bb13200d0980da8695adcf08550'
  );
  const pureR2Default = `https://${accId}.r2.cloudflarestorage.com`;

  const inputCandidate =
    rawEndpoint ||
    process.env.R2_ENDPOINT ||
    process.env.R2_ENDPOINT_URL ||
    process.env.S3_ENDPOINT;

  let ep = cleanEnv(inputCandidate);
  if (!ep) {
    return pureR2Default;
  }

  // Tambahkan https:// jika belum ada skema
  if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
    ep = `https://${ep}`;
  }

  try {
    const parsed = new URL(ep);
    const host = parsed.hostname.toLowerCase();

    // 1. Guard custom CDN domain: assets.boontrack.com atau *.r2.dev bukan endpoint S3 API
    if (host.includes('boontrack.com') || host.includes('r2.dev') || !host.includes('r2.cloudflarestorage.com')) {
      console.warn(`[R2 Endpoint Guard] Custom domain detected in endpoint ('${host}'). Re-routing to pure R2 S3 endpoint.`);
      return pureR2Default;
    }

    // 2. Guard bucket prefix atau format subdomain pada hostname
    // Cloudflare R2 wildcard certificate (*.r2.cloudflarestorage.com) mewajibkan tepat:
    // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    const parts = host.split('.');
    if (
      parts.length >= 4 &&
      parts[parts.length - 2] === 'cloudflarestorage' &&
      parts[parts.length - 1] === 'com' &&
      parts[parts.length - 3] === 'r2'
    ) {
      const accountPart = parts[parts.length - 4];
      const bucketName = cleanEnv(process.env.R2_BUCKET_NAME || 'boontrack-media').toLowerCase();
      if (accountPart && accountPart !== 'r2' && accountPart.toLowerCase() !== bucketName) {
        return `https://${accountPart}.r2.cloudflarestorage.com`;
      }
      return pureR2Default;
    }

    return `https://${host}`;
  } catch {
    return pureR2Default;
  }
}

/**
 * Format pesan error upload agar user-friendly dan tidak memuntahkan stack trace EPROTO mentah
 */
export function formatUploadError(err: any): string {
  const rawMsg = String(err?.message || '');
  const code = String(err?.code || err?.name || '');

  if (
    rawMsg.includes('EPROTO') ||
    rawMsg.includes('handshake failure') ||
    rawMsg.includes('SSL alert') ||
    rawMsg.includes('tls') ||
    rawMsg.includes('CERT_') ||
    code === 'EPROTO'
  ) {
    return 'Gagal mengunggah foto produk ke cloud storage karena kendala koneksi aman (TLS/SSL Handshake). Silakan refresh halaman dan coba kembali.';
  }

  if (
    rawMsg.includes('ECONNREFUSED') ||
    rawMsg.includes('ECONNRESET') ||
    rawMsg.includes('ETIMEDOUT') ||
    rawMsg.includes('ENOTFOUND') ||
    code === 'ETIMEDOUT'
  ) {
    return 'Koneksi ke server penyimpanan awan terputus atau timeout. Silakan periksa jaringan internet Anda dan coba lagi.';
  }

  if (
    rawMsg.includes('NoSuchBucket') ||
    rawMsg.includes('AccessDenied') ||
    rawMsg.includes('InvalidAccessKeyId')
  ) {
    return 'Autentikasi penyimpanan awan belum terkonfigurasi dengan benar. Hubungi tim teknis BoonTrack.';
  }

  if (rawMsg && rawMsg.length <= 160 && !rawMsg.includes('at ') && !rawMsg.includes('node:')) {
    return rawMsg;
  }

  return 'Gagal memproses upload media. Silakan coba beberapa saat lagi.';
}

export function getR2Client(): { client: S3Client; bucket: string; publicUrlBase: string } | null {
  const accountId = cleanEnv(
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    '56303bb13200d0980da8695adcf08550'
  );

  const endpoint = resolveR2Endpoint(
    process.env.R2_ENDPOINT ||
    process.env.R2_ENDPOINT_URL ||
    process.env.S3_ENDPOINT,
    accountId
  );

  const accessKeyId = cleanEnv(
    process.env.R2_ACCESS_KEY_ID ||
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  );

  const secretAccessKey = cleanEnv(
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  );

  const bucket = cleanEnv(process.env.R2_BUCKET_NAME || 'boontrack-media');

  const publicUrlBase = cleanEnv(
    process.env.R2_PUBLIC_URL ||
    process.env.R2_PUBLIC_DOMAIN ||
    process.env.NEXT_PUBLIC_R2_URL ||
    process.env.NEXT_PUBLIC_ASSET_DOMAIN ||
    'https://assets.boontrack.com'
  ).replace(/\/+$/, '');

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  return { client, bucket, publicUrlBase };
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
    const r2Config = getR2Client();
    if (!r2Config) {
      return NextResponse.json(
        { status: 'error', detail: 'Cloudflare R2 Client belum terkonfigurasi (R2_ACCESS_KEY_ID & R2_SECRET_ACCESS_KEY wajib diset)' },
        { status: 500 }
      );
    }

    await r2Config.client.send(
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type || (isQris ? 'image/png' : 'image/webp'),
      })
    );

    // 2. Simpan juga ke Supabase Storage (store-assets) untuk backup jika bucket siap
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
    const publicUrl = `${r2Config.publicUrlBase}/${key}`;
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
    console.error('[Upload Route Failure]:', err);
    return NextResponse.json(
      { status: 'error', detail: formatUploadError(err) },
      { status: 500 }
    );
  }
}