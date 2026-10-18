import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeImageUrl } from '@/lib/image-utils';

export const dynamic = 'force-dynamic';

function cleanEnv(val?: string | null): string {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
}

function resolveR2Endpoint(rawEndpoint?: string, accountId?: string): string {
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
  if (!ep) return pureR2Default;

  if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
    ep = `https://${ep}`;
  }

  try {
    const parsed = new URL(ep);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('boontrack.com') || host.includes('r2.dev') || !host.includes('r2.cloudflarestorage.com')) {
      return pureR2Default;
    }
    if (host === 'r2.cloudflarestorage.com') {
      return pureR2Default;
    }
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
        if (potentialAccId && potentialAccId !== 'r2') {
          return `https://${potentialAccId}.r2.cloudflarestorage.com`;
        }
      }
      return pureR2Default;
    }
    return ep;
  } catch {
    return pureR2Default;
  }
}

function getR2Client(): { client: S3Client; bucket: string; publicUrlBase: string } | null {
  let accountId = cleanEnv(
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID
  );

  if (!accountId) {
    const rawEp = cleanEnv(
      process.env.R2_ENDPOINT ||
      process.env.R2_ENDPOINT_URL ||
      process.env.S3_ENDPOINT
    );
    const match = rawEp.match(/([a-f0-9]{32})\.r2\.cloudflarestorage\.com/i);
    accountId = match ? match[1] : '56303bb13200d0980da8695adcf08550';
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
 * Upload buffer to Supabase Storage with graceful fallback across buckets
 */
async function uploadToSupabaseStorage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const bucketCandidates = ['creator-assets', 'public-qris', 'store-assets'];

  for (const bucketName of bucketCandidates) {
    try {
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(key, buffer, {
          contentType,
          upsert: true,
        });

      if (!uploadErr) {
        const { data: pubData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(key);

        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      } else {
        console.warn(`[Creator Upload] Supabase upload to '${bucketName}' failed:`, uploadErr.message);
      }
    } catch (bErr: any) {
      console.warn(`[Creator Upload] Supabase bucket '${bucketName}' error:`, bErr?.message);
    }
  }

  return null;
}

/**
 * POST /api/v1/creators/[handle]/upload
 * Upload media (khususnya barcode QRIS) untuk kreator dengan storage Cloudflare R2 & Supabase Storage.
 * Menerima multipart/form-data:
 * - file / qris / image
 * Validasi:
 * - Tipe: image/jpeg, image/png, image/webp
 * - Maksimal ukuran: 3MB
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await context.params;
    const cleanHandle = (handle || '').replace(/^@+/, '').trim().toLowerCase();

    if (!cleanHandle) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle kreator wajib disertakan.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('qris') || formData.get('image')) as File | null;

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json(
        {
          success: false,
          error: 'FILE_MISSING',
          message: 'Berkas gambar tidak ditemukan dalam form data (gunakan field file, qris, atau image).',
        },
        { status: 400 }
      );
    }

    // 1. Validasi Tipe Konten
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const mimeType = (file.type || '').toLowerCase();
    const fileName = file.name || 'qris.png';
    const lowerName = fileName.toLowerCase();

    const isAllowedExt =
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp');

    if (!allowedTypes.includes(mimeType) && !isAllowedExt) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: 'Format file tidak didukung. Harap unggah berkas gambar berformat JPG, PNG, atau WebP.',
        },
        { status: 400 }
      );
    }

    // 2. Validasi Ukuran (Maksimal 3MB)
    const MAX_SIZE = 3 * 1024 * 1024; // 3MB
    if (file.size > MAX_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        {
          success: false,
          error: 'FILE_TOO_LARGE',
          message: `Ukuran file melebihi batas maksimal 3MB (ukuran saat ini: ${sizeMB}MB).`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `creators/${cleanHandle}/qris/${Date.now()}_${sanitizedName}`;

    let uploadSuccess = false;
    let finalUrl = '';
    let storageEngine = '';

    // Engine 1: Cloudflare R2
    const r2Config = getR2Client();
    if (r2Config) {
      try {
        const s3Promise = r2Config.client.send(
          new PutObjectCommand({
            Bucket: r2Config.bucket,
            Key: storageKey,
            Body: buffer,
            ContentType: mimeType || 'image/png',
          })
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cloudflare R2 timeout (5000ms)')), 5000)
        );

        await Promise.race([s3Promise, timeoutPromise]);
        const canonicalAssetUrl = `${r2Config.publicUrlBase}/${storageKey}`;
        finalUrl = sanitizeImageUrl(canonicalAssetUrl) || canonicalAssetUrl;
        storageEngine = 'cloudflare_r2';
        uploadSuccess = true;

        // Async backup to Supabase
        uploadToSupabaseStorage(storageKey, buffer, mimeType || 'image/png').catch((sbErr) => {
          console.debug('[Creator Upload] Supabase backup sync note:', sbErr);
        });
      } catch (r2Err: any) {
        console.warn('[Creator Upload] Primary R2 upload failed, initiating Supabase failover:', r2Err?.message);
      }
    }

    // Engine 2: Supabase Storage Failover
    if (!uploadSuccess) {
      const sbUrl = await uploadToSupabaseStorage(storageKey, buffer, mimeType || 'image/png');
      if (sbUrl) {
        finalUrl = sbUrl;
        storageEngine = 'supabase_storage';
        uploadSuccess = true;
      }
    }

    if (!uploadSuccess || !finalUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'STORAGE_FAILED',
          message: 'Gagal mengunggah barcode QRIS ke cloud storage. Silakan coba beberapa saat lagi.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: finalUrl,
      public_url: finalUrl,
      qris_url: finalUrl,
      file_name: sanitizedName,
      size: file.size,
      storage: storageEngine,
    });
  } catch (err: any) {
    console.error('[Creator Upload Route Failure]:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Terjadi kesalahan sistem saat mengunggah berkas.',
      },
      { status: 500 }
    );
  }
}
