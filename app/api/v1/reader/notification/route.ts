import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * Ekstraksi nominal uang dari notifikasi mutasi bank / e-wallet (DANA Bisnis, GoPay, BCA, dll).
 * Menangani format:
 * - "DANA Bisnis: Kamu menerima pembayaran sebesar Rp1.771 dari Sakti Alamsyah"
 * - "DANA Bisnis: Pembayaran QRIS diterima Rp 1.771"
 * - "Rp 1.771"
 * - "Rp1.771,-"
 * - "Rp 1.771,00"
 * - "1771"
 */
function extractAmountFromText(rawText: string): number | null {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Regex Rp / IDR dengan pemisah ribuan titik atau koma
  const rpRegex = /(?:rp\.?|idr)\s*([\d.,]+)/i;
  const matchRp = rawText.match(rpRegex);
  if (matchRp && matchRp[1]) {
    let numStr = matchRp[1].trim();
    // Hilangkan akhiran format sen seperti ,- atau .- atau ,00 atau .00
    numStr = numStr.replace(/[,.]-$/, '');
    numStr = numStr.replace(/[,.]00$/, '');
    const cleanDigits = numStr.replace(/\D/g, '');
    const parsed = parseInt(cleanDigits, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Keyword uang masuk / penerimaan
  const keywordRegex = /(?:sebesar|menerima|pembayaran|nominal|masuk sebesar|uang masuk|terima)\s*(?:rp\.?|idr)?\s*([\d.,]+)/i;
  const matchKeyword = rawText.match(keywordRegex);
  if (matchKeyword && matchKeyword[1]) {
    let numStr = matchKeyword[1].trim();
    numStr = numStr.replace(/[,.]-$/, '');
    numStr = numStr.replace(/[,.]00$/, '');
    const cleanDigits = numStr.replace(/\D/g, '');
    const parsed = parseInt(cleanDigits, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 3. Fallback: Angka bulat 3-9 digit yang berdiri sendiri
  const genericMatch = rawText.match(/\b([1-9]\d{2,8})\b/);
  if (genericMatch && genericMatch[1]) {
    const parsed = parseInt(genericMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

/**
 * POST /api/v1/reader/notification
 * Webhook handler penerima notifikasi mutasi dari aplikasi Android BoonTrack Reader di HP
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      const text = await req.text();
      body = { text };
    }

    // 1. Log payload yang masuk untuk audit
    console.log('[BoonTrack Reader Webhook] Incoming payload:', JSON.stringify(body, null, 2));

    const { searchParams } = new URL(req.url);

    // Resolusi Tenant Slug
    const tenantSlug = String(
      body.tenant_id ||
      body.tenant ||
      body.tenant_slug ||
      req.headers.get('x-tenant-id') ||
      req.headers.get('x-tenant-slug') ||
      searchParams.get('tenant') ||
      searchParams.get('tenant_id') ||
      'buzzerukm'
    ).trim();

    // Gabungkan text notifikasi dari semua kemungkinan field
    const combinedText = [
      body.title,
      body.text,
      body.message,
      body.body,
      body.content,
      body.notification,
      body.raw_text,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Ekstraksi nominal uang
    const explicitAmount = Number(
      body.amount ||
      body.nominal ||
      body.parsed_amount ||
      body.gross_amount ||
      0
    );

    const parsedAmount = explicitAmount > 0 ? explicitAmount : extractAmountFromText(combinedText);

    console.log(`[BoonTrack Reader Webhook] Extracted: tenant='${tenantSlug}', amount=${parsedAmount}, text='${combinedText.slice(0, 100)}'`);

    if (!parsedAmount || parsedAmount <= 0) {
      console.warn('[BoonTrack Reader Webhook] Gagal mengekstrak nominal uang valid.');
      return NextResponse.json({
        success: true,
        matched: false,
        message: 'Tidak dapat mengekstrak nominal uang dari notifikasi.',
      });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.error('[BoonTrack Reader Webhook] Database unreachable');
      return NextResponse.json(
        { success: false, error: 'Database unreachable' },
        { status: 500 }
      );
    }

    // 2. Cari baris di tabel orders Supabase
    // Kriteria: tenant_slug = tenantSlug, gross_amount = parsedAmount, status IN ('PENDING', 'WAITING_PAYMENT', 'PENDING_PAYMENT')
    const { data: pendingOrders, error: fetchErr } = await supabase
      .from('orders')
      .select('id, tenant_slug, gross_amount, status, payment_status, customer_name, customer_phone')
      .eq('tenant_slug', tenantSlug)
      .eq('gross_amount', parsedAmount)
      .in('status', ['PENDING', 'WAITING_PAYMENT', 'PENDING_PAYMENT', 'UNPAID'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchErr) {
      console.error('[BoonTrack Reader Webhook] Query error:', fetchErr);
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log(`[BoonTrack Reader Webhook] Tidak ada pesanan pending dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')} untuk tenant '${tenantSlug}'.`);
      return NextResponse.json({
        success: true,
        matched: false,
        message: `Tidak ditemukan pesanan menunggu pembayaran dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')} untuk tenant '${tenantSlug}'.`,
        parsed_amount: parsedAmount,
        tenant_slug: tenantSlug,
      });
    }

    // Pilih order paling relevan
    const matchedOrder = pendingOrders[0];
    const paidAt = new Date().toISOString();

    console.log(`[BoonTrack Reader Webhook] MATCH FOUND: Order #${matchedOrder.id} (${matchedOrder.customer_name || 'Customer'}) Rp ${matchedOrder.gross_amount}. Mengupdate ke PAID...`);

    // 3. Update kolom status = 'PAID', payment_status = 'PAID', updated_at
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        updated_at: paidAt,
      })
      .eq('id', matchedOrder.id);

    if (updateErr) {
      console.error('[BoonTrack Reader Webhook] Update order error:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Gagal memperbarui status order di database' },
        { status: 500 }
      );
    }

    console.log(`[BoonTrack Reader Webhook] SUCCESS: Order #${matchedOrder.id} status berhasil diubah ke PAID!`);

    return NextResponse.json({
      success: true,
      matched: true,
      order_id: matchedOrder.id,
      gross_amount: matchedOrder.gross_amount,
      tenant_slug: tenantSlug,
      paid_at: paidAt,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BoonTrack Reader Webhook] Unexpected exception:', errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/reader/notification
 * Health check & validasi endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ONLINE',
    endpoint: '/api/v1/reader/notification',
    service: 'BoonTrack Reader Android Webhook Receiver',
    timestamp: new Date().toISOString(),
  });
}
