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

    // 2. Guard bare r2.cloudflarestorage.com (tanpa account ID)
    if (host === 'r2.cloudflarestorage.com') {
      return pureR2Default;
    }

    // 3. Guard bucket prefix atau format subdomain pada hostname
    // Cloudflare R2 wildcard certificate (*.r2.cloudflarestorage.com) mewajibkan tepat:
    // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    const parts = host.split('.');
    if (
      parts.length >= 4 &&
      parts[parts.length - 2] === 'cloudflarestorage' &&
      parts[parts.length - 1] === 'com' &&
      parts[parts.length - 3] === 'r2'
    ) {
      const r2Index = parts.indexOf('r2');
      if (r2Index > 0) {
        const potentialAccId = parts[r2Index - 1];
        const bucketName = cleanEnv(process.env.R2_BUCKET_NAME || 'boontrack-media').toLowerCase();
        if (potentialAccId && potentialAccId !== 'r2' && potentialAccId.toLowerCase() !== bucketName) {
          return `https://${potentialAccId}.r2.cloudflarestorage.com`;
        }
      }
      return pureR2Default;
    }

    return pureR2Default;
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
    rawMsg.includes('timeout') ||
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
  let accountId = cleanEnv(
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID
  );

  // Jika R2_ACCOUNT_ID tidak eksplisit di env, coba ekstrak dari endpoint URL
  if (!accountId) {
    const rawEp = cleanEnv(
      process.env.R2_ENDPOINT ||
      process.env.R2_ENDPOINT_URL ||
      process.env.S3_ENDPOINT
    );
    const match = rawEp.match(/([a-f0-9]{32})\.r2\.cloudflarestorage\.com/i);
    if (match) {
      accountId = match[1];
    } else {
      accountId = '56303bb13200d0980da8695adcf08550';
    }
  }

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

/**
 * Failover resilient engine: Simpan asset ke Supabase Storage (bucket: store-assets)
 */
export async function uploadToSupabaseStorage(
  buffer: Buffer,
  key: string,
  tenantSlug: string,
  contentType: string
): Promise<{ publicUrl: string; path: string } | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[Upload Route] Supabase client unavailable for storage failover');
      return null;
    }

    // 1. Coba upload langsung dengan path standar: products/... atau media/...
    const { error: directError } = await supabase.storage
      .from('store-assets')
      .upload(key, buffer, {
        contentType,
        upsert: true,
      });

    if (!directError) {
      const { data: pubData } = supabase.storage.from('store-assets').getPublicUrl(key);
      return { publicUrl: pubData.publicUrl, path: `/${key}` };
    }

    console.warn('[Upload Route] Direct key upload note:', directError.message);

    // 2. Fallback: upload dengan prefix tenantSlug jika direktori scoped
    const tenantKey = `${tenantSlug}/${key}`;
    const { error: tenantError } = await supabase.storage
      .from('store-assets')
      .upload(tenantKey, buffer, {
        contentType,
        upsert: true,
      });

    if (!tenantError) {
      const { data: tPub } = supabase.storage.from('store-assets').getPublicUrl(tenantKey);
      return { publicUrl: tPub.publicUrl, path: `/${tenantKey}` };
    }

    console.error('[Upload Route] Supabase failover also failed:', tenantError.message);
    return null;
  } catch (sbErr: any) {
    console.error('[Upload Route] Supabase storage exception:', sbErr?.message || sbErr);
    return null;
  }
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
    const key = `${folder}/${Date.now()}_${sanitizedName}`;

    let uploadSuccess = false;
    let finalUrl = '';
    let storageEngine = '';
    let uploadErrorMsg = '';

    // Engine 1: Cloudflare R2 Upload via S3Client
    const r2Config = getR2Client();
    if (r2Config) {
      try {
        const s3Promise = r2Config.client.send(
          new PutObjectCommand({
            Bucket: r2Config.bucket,
            Key: key,
            Body: buffer,
            ContentType: file.type || (isQris ? 'image/png' : 'image/webp'),
          })
        );

        // Timeout 5 detik agar jika TLS handshake bermasalah di Vercel edge, langsung failover tanpa hang
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cloudflare R2 timeout (5000ms)')), 5000)
        );

        await Promise.race([s3Promise, timeoutPromise]);

        const rawR2Url = `${r2Config.publicUrlBase}/${key}`;
        finalUrl = sanitizeImageUrl(rawR2Url) || rawR2Url;
        storageEngine = 'cloudflare_r2';
        uploadSuccess = true;

        // Async sync ke Supabase Storage sebagai replika backup
        uploadToSupabaseStorage(
          buffer,
          key,
          tenantSlug,
          file.type || (isQris ? 'image/png' : 'image/webp')
        ).catch((sbErr) => {
          console.debug('[Upload Route] Background backup sync note:', sbErr);
        });
      } catch (r2Err: any) {
        console.warn('[Upload Route] Primary R2 upload failed, initiating Supabase Storage failover:', r2Err?.message || r2Err);
        uploadErrorMsg = formatUploadError(r2Err);
      }
    } else {
      console.warn('[Upload Route] Cloudflare R2 not configured, utilizing Supabase Storage as primary engine.');
    }

    // Engine 2: Supabase Storage Failover
    if (!uploadSuccess) {
      console.log(`[Upload Route] Executing Supabase Storage upload for tenant: ${tenantSlug}...`);
      const sbResult = await uploadToSupabaseStorage(
        buffer,
        key,
        tenantSlug,
        file.type || (isQris ? 'image/png' : 'image/webp')
      );

      if (sbResult && sbResult.publicUrl) {
        finalUrl = sbResult.publicUrl;
        storageEngine = 'supabase_storage';
        uploadSuccess = true;
      }
    }

    if (!uploadSuccess || !finalUrl) {
      return NextResponse.json(
        {
          status: 'error',
          detail: uploadErrorMsg || 'Gagal mengunggah media ke semua server cloud storage. Silakan coba beberapa saat lagi.',
        },
        { status: 500 }
      );
    }

    const localProxyUrl = `/api/v1/media/${key}`;

    return NextResponse.json({
      status: 'success',
      url: finalUrl,
      public_url: finalUrl,
      r2_url: finalUrl,
      image_url: finalUrl,
      local_proxy_url: localProxyUrl,
      qris_url: isQris ? finalUrl : undefined,
      path: `/${key}`,
      filename: sanitizedName,
      folder,
      is_qris: isQris,
      storage: storageEngine,
    });
  } catch (err: any) {
    console.error('[Upload Route Failure]:', err);
    return NextResponse.json(
      { status: 'error', detail: formatUploadError(err) },
      { status: 500 }
    );
  }
}