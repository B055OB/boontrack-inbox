import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/notifications/telegram-link
 *
 * Menyimpan telegram_chat_id ke profil merchant/affiliate sehingga platform
 * dapat mengirimkan notifikasi transaksi & komisi via Telegram.
 *
 * Body:
 * {
 *   slug: string;          // Slug toko merchant
 *   telegram_chat_id: string; // Chat ID yang diperoleh dari /start atau /id di @boontrack_bot
 * }
 *
 * Cara penggunaan oleh merchant:
 * 1. Buka @boontrack_bot di Telegram.
 * 2. Kirim /start atau /id.
 * 3. Salin ID yang ditampilkan oleh bot.
 * 4. Tempel ke form Pengaturan Profil Dashboard dan simpan.
 *
 * Dashboard UI memanggil endpoint ini setelah merchant menyimpan form.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, telegram_chat_id } = body || {};

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Parameter "slug" wajib diisi.' },
        { status: 400 }
      );
    }

    if (!telegram_chat_id || typeof telegram_chat_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Parameter "telegram_chat_id" wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1. Pastikan tenant ada
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant "${slug}" tidak ditemukan.` },
        { status: 404 }
      );
    }

    // 2. Merge telegram_chat_id ke metadata
    const updatedMetadata = {
      ...(tenant.metadata || {}),
      telegram_chat_id: telegram_chat_id.trim(),
    };

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('slug', slug);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    // 3. Kirim konfirmasi via Telegram (opsional, non-fatal)
    try {
      const { sendTelegramNotification } = await import('@/lib/telegram/boonpilot-telegram');
      await sendTelegramNotification(
        telegram_chat_id,
        `✅ *Notifikasi BoonTrack Aktif!*\n\n` +
        `Toko *${slug}* berhasil terhubung ke akun Telegram Anda.\n` +
        `Anda akan menerima notifikasi order & komisi secara real-time di sini.\n\n` +
        `_BoonPilot \u2014 Platform BoonTrack_`
      );
    } catch {
      // Non-fatal: konfirmasi Telegram gagal tidak menghentikan proses linking
    }

    return NextResponse.json({
      success: true,
      message: `Telegram chat_id berhasil dihubungkan ke toko "${slug}".`,
      slug,
      telegram_chat_id: telegram_chat_id.trim(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/v1/notifications/telegram-link?slug=xxx
 * Mengambil status linking Telegram untuk sebuah toko.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || '';

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Query param "slug" wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const chatId = tenant.metadata?.telegram_chat_id || null;

    return NextResponse.json({
      success: true,
      slug,
      telegram_chat_id: chatId,
      is_linked: Boolean(chatId),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
