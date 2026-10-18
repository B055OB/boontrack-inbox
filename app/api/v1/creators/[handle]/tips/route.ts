import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeImageUrl } from '@/lib/image-utils';

export const dynamic = 'force-dynamic';

function cleanEnv(val?: string | null): string {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
}

function getR2Client(): { client: S3Client; bucket: string; publicUrlBase: string } | null {
  let accountId = cleanEnv(
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    '56303bb13200d0980da8695adcf08550'
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
    'https://assets.boontrack.com'
  ).replace(/\/+$/, '');

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  return { client, bucket, publicUrlBase };
}

async function uploadProofToStorage(
  storageKey: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  // 1. Try R2
  const r2Config = getR2Client();
  if (r2Config) {
    try {
      await r2Config.client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
        })
      );
      const canonical = `${r2Config.publicUrlBase}/${storageKey}`;
      return sanitizeImageUrl(canonical) || canonical;
    } catch (r2Err) {
      console.warn('[Creator Tips API] R2 upload failed, falling back to Supabase:', r2Err);
    }
  }

  // 2. Try Supabase Storage
  const supabaseAdmin = getSupabaseAdmin();
  const bucketCandidates = ['creator-assets', 'store-assets', 'public-qris'];

  for (const bName of bucketCandidates) {
    try {
      const { error: upErr } = await supabaseAdmin.storage
        .from(bName)
        .upload(storageKey, buffer, { contentType, upsert: true });

      if (!upErr) {
        const { data: pubData } = supabaseAdmin.storage.from(bName).getPublicUrl(storageKey);
        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      }
    } catch (bErr) {
      console.warn(`[Creator Tips API] Supabase storage upload to '${bName}' note:`, bErr);
    }
  }

  return null;
}

/**
 * GET /api/v1/creators/[handle]/tips
 * Mengambil daftar bukti transfer / traktir masuk untuk kreator terkait.
 */
export async function GET(
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

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Creator
    const baseHandle = cleanHandle.replace(/_+$/, '');
    const { data: creator, error: creatorErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, tenant_id, handle, display_name, telegram_chat_id')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creatorErr || !creator) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_NOT_FOUND', message: 'Profil kreator tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Query Tips
    const { data: tips, error: tipsErr } = await supabaseAdmin
      .from('creator_tips')
      .select('*')
      .eq('creator_id', creator.tenant_id)
      .order('created_at', { ascending: false });

    if (tipsErr) {
      console.error('[Creator Tips GET] Query error:', tipsErr);
      return NextResponse.json(
        { success: false, error: tipsErr.code, message: tipsErr.message },
        { status: 500 }
      );
    }

    const allTips = tips || [];
    let totalAmount = 0;
    let unreadCount = 0;

    allTips.forEach((t: any) => {
      totalAmount += Number(t.amount || 0);
      if (t.status === 'UNREAD') {
        unreadCount += 1;
      }
    });

    return NextResponse.json({
      success: true,
      creator: {
        id: creator.id,
        handle: creator.handle,
        display_name: creator.display_name,
      },
      metrics: {
        total_amount: totalAmount,
        total_tips: allTips.length,
        unread_count: unreadCount,
      },
      tips: allTips,
    });
  } catch (err: any) {
    console.error('[Creator Tips GET Fatal]:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/creators/[handle]/tips
 * Mengirim dukungan/traktir via QRIS dengan upload bukti transfer langsung ke storage platform (privasi 100%).
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

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Creator
    const baseHandle = cleanHandle.replace(/_+$/, '');
    const { data: creator, error: creatorErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, tenant_id, handle, display_name, telegram_chat_id')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creatorErr || !creator) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_NOT_FOUND', message: 'Profil kreator tidak ditemukan.' },
        { status: 404 }
      );
    }

    let senderName = 'Anonim';
    let amount = 0;
    let message: string | null = null;
    let proofImageUrl = '';

    const contentType = req.headers.get('content-type') || '';

    // A. Multipart Form-Data (Direct File Upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      senderName = String(formData.get('sender_name') || 'Anonim').trim() || 'Anonim';
      amount = Number(formData.get('amount') || 0);
      message = formData.get('message') ? String(formData.get('message')).trim() : null;

      const file = (formData.get('proof') || formData.get('proof_image') || formData.get('file')) as File | null;
      const existingUrl = formData.get('proof_image_url') as string | null;

      if (file && typeof file.arrayBuffer === 'function') {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const fType = (file.type || '').toLowerCase();
        const fName = (file.name || 'proof.png').toLowerCase();
        const isValidExt = fName.endsWith('.jpg') || fName.endsWith('.jpeg') || fName.endsWith('.png') || fName.endsWith('.webp');

        if (!allowedTypes.includes(fType) && !isValidExt) {
          return NextResponse.json(
            { success: false, error: 'INVALID_FILE_TYPE', message: 'Format bukti transfer harus berupa gambar (JPG, PNG, atau WebP).' },
            { status: 400 }
          );
        }

        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { success: false, error: 'FILE_TOO_LARGE', message: 'Ukuran bukti transfer maksimal 5MB.' },
            { status: 400 }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `creators/${cleanHandle}/tips/${Date.now()}_${sanitized}`;

        const uploadedUrl = await uploadProofToStorage(key, buffer, file.type || 'image/png');
        if (!uploadedUrl) {
          return NextResponse.json(
            { success: false, error: 'STORAGE_FAILED', message: 'Gagal mengunggah bukti transfer ke storage.' },
            { status: 500 }
          );
        }
        proofImageUrl = uploadedUrl;
      } else if (existingUrl) {
        proofImageUrl = existingUrl.trim();
      }
    } else {
      // B. JSON Body (jika gambar sudah di-upload sebelumnya)
      const body = await req.json().catch(() => ({}));
      senderName = String(body.sender_name || 'Anonim').trim() || 'Anonim';
      amount = Number(body.amount || 0);
      message = body.message ? String(body.message).trim() : null;
      proofImageUrl = String(body.proof_image_url || '').trim();
    }

    // 2. Validasi Parameter Wajib
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_AMOUNT', message: 'Nominal traktir/dukungan harus lebih dari Rp 0.' },
        { status: 400 }
      );
    }

    if (!proofImageUrl) {
      return NextResponse.json(
        { success: false, error: 'PROOF_REQUIRED', message: 'Bukti transfer wajib diunggah sebelum mengirim dukungan.' },
        { status: 400 }
      );
    }

    // 3. Simpan ke database public.creator_tips
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('creator_tips')
      .insert({
        creator_id: creator.tenant_id,
        sender_name: senderName,
        amount,
        message,
        proof_image_url: proofImageUrl,
        status: 'UNREAD',
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      console.error('[Creator Tips POST] Insert error:', insertErr);
      return NextResponse.json(
        { success: false, error: 'INSERT_FAILED', message: insertErr?.message || 'Gagal mencatat data traktir.' },
        { status: 500 }
      );
    }

    if (creator.telegram_chat_id) {
      try {
        const { sendCreatorMessage } = await import('@/lib/telegram/boonpilot-telegram');
        const tipText =
          `🎁 *TRAKTIR TIP BARU MASUK!*\n\n` +
          `Dari: *${senderName}*\n` +
          `Nominal: *Rp${amount.toLocaleString('id-ID')}*\n` +
          (message ? `Pesan: _"${message}"_\n\n` : '\n') +
          `Status: Menunggu verifikasi di Dashboard Kreator.`;
        sendCreatorMessage(creator.telegram_chat_id, tipText, { parseMode: 'Markdown' }).catch((e) => {
          console.warn('[Creator Tip Notification Warning]:', e);
        });
      } catch (tgErr) {
        console.warn('[Creator Tip Telegram Dispatch Note]:', tgErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Terima kasih banyak atas dukungan Anda!',
      tip: inserted,
    });
  } catch (err: any) {
    console.error('[Creator Tips POST Fatal]:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
