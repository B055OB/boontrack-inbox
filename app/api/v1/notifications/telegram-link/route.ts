import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isValidUuid } from '@/lib/supabaseClient';

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
    const { slug, tenant_id, telegram_chat_id } = body || {};
    const tenantRef = (slug || tenant_id || '').trim();

    if (!tenantRef) {
      return NextResponse.json(
        { success: false, error: 'Parameter "slug" atau "tenant_id" wajib diisi.' },
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

    // 1. Pastikan tenant ada (cari berdasarkan slug atau id)
    const cleanRef = tenantRef.trim();
    let tenantQuery: any = supabase
      .from('tenants')
      .select('id, name, slug, telegram_chat_id, metadata');

    if (isValidUuid(cleanRef)) {
      tenantQuery = tenantQuery.or(`id.eq.${cleanRef},slug.eq.${cleanRef}`);
    } else if (typeof tenantQuery.ilike === 'function') {
      tenantQuery = tenantQuery.ilike('slug', cleanRef);
    } else {
      tenantQuery = tenantQuery.eq('slug', cleanRef.toLowerCase());
    }

    const { data: tenant, error: fetchErr } = await tenantQuery.maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant "${tenantRef}" tidak ditemukan.` },
        { status: 404 }
      );
    }

    const cleanChatId = telegram_chat_id.trim();

    // §42.5 — Tenant Isolation: Satu grup Telegram hanya dapat terhubung ke satu tenant.
    // Jika merchant lain mencoba menghubungkan grup yang sama, tolak dengan 409 Conflict.
    if (cleanChatId.startsWith('-')) {
      const { data: conflictTenant } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('telegram_chat_id', cleanChatId)
        .neq('id', tenant.id)
        .maybeSingle();

      if (conflictTenant) {
        return NextResponse.json(
          {
            success: false,
            error: `Grup Telegram ini sudah terhubung dengan toko "${conflictTenant.name || conflictTenant.slug}". Satu grup Telegram hanya dapat terhubung ke satu toko.`,
          },
          { status: 409 }
        );
      }
    }

    // 2. Simpan telegram_chat_id ke kolom tabel & metadata JSONB
    const updatedMetadata = {
      ...(tenant.metadata || {}),
      telegram_chat_id: cleanChatId,
      ...(body.telegram_group_config !== undefined ? { telegram_group_config: body.telegram_group_config } : {}),
    };

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        telegram_chat_id: cleanChatId,
        metadata: updatedMetadata,
      })
      .eq('id', tenant.id);

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
    const tenantParam = searchParams.get('slug') || searchParams.get('tenant_id') || searchParams.get('tenant') || '';

    if (!tenantParam) {
      return NextResponse.json(
        { success: false, error: 'Query param "slug" atau "tenant_id" wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const cleanParam = tenantParam.trim();
    let query: any = supabase
      .from('tenants')
      .select('id, name, slug, telegram_chat_id, metadata');

    if (isValidUuid(cleanParam)) {
      query = query.or(`id.eq.${cleanParam},slug.eq.${cleanParam}`);
    } else if (typeof query.ilike === 'function') {
      query = query.ilike('slug', cleanParam);
    } else {
      query = query.eq('slug', cleanParam.toLowerCase());
    }

    const { data: tenant, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const chatId = tenant.telegram_chat_id || tenant.metadata?.telegram_chat_id || null;
    const groupConfig = tenant.metadata?.telegram_group_config || null;

    return NextResponse.json({
      success: true,
      tenant_id: tenant.id,
      slug: tenant.slug,
      tenant_name: tenant.name,
      telegram_chat_id: chatId,
      telegram_group_config: groupConfig,
      is_linked: Boolean(chatId),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
