import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';

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
function parseExplicitAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    if (val > 0 && val < 1000 && !Number.isInteger(val)) {
      const s = val.toString();
      const parts = s.split('.');
      if (parts[1] && parts[1].length === 3) {
        return Math.round(val * 1000);
      }
    }
    return Math.round(val);
  }
  const str = String(val).trim();
  if (!str) return 0;
  const parsed = extractAmountFromText(str);
  if (parsed && parsed > 0) return parsed;
  const clean = str.replace(/[.,]00$/, '').replace(/[,.]-$/, '').replace(/\D/g, '');
  const num = parseInt(clean, 10);
  return !isNaN(num) && num > 0 ? num : 0;
}

function extractAmountFromText(rawText: string): number | null {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Regex Rp / IDR dengan pemisah ribuan titik atau koma
  // e.g. "Pembayaran Masuk - Rp1.281 diterima DANA Bisnis." -> 1281
  const rpRegex = /(?:rp\.?|idr)\s*([\d.,]+)/i;
  const matchRp = rawText.match(rpRegex);
  if (matchRp && matchRp[1]) {
    let numStr = matchRp[1].trim();
    // Hilangkan tanda baca penutup jika ada di akhir (misal: "Rp1.281.")
    numStr = numStr.replace(/[.,]+$/, '');
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
    numStr = numStr.replace(/[.,]+$/, '');
    numStr = numStr.replace(/[,.]-$/, '');
    numStr = numStr.replace(/[,.]00$/, '');
    const cleanDigits = numStr.replace(/\D/g, '');
    const parsed = parseInt(cleanDigits, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 3. Format angka ribuan standar Indonesia (e.g. 1.615 atau 1,615 atau 1.615.000 atau 50.000)
  const thousandMatch = rawText.match(/\b([1-9]\d{0,2}(?:[.,]\d{3})+)(?:[.,]00|-)?\b/);
  if (thousandMatch && thousandMatch[1]) {
    const cleanDigits = thousandMatch[1].replace(/[.,]/g, '');
    const parsed = parseInt(cleanDigits, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 4. Fallback: Angka bulat 3-9 digit yang berdiri sendiri
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

    // Resolusi Tenant Slug (tanpa hardcode fallback agar tidak mengunci ke tenant tertentu)
    const rawTenantInput = String(
      body.tenant_slug ||
      body.tenant ||
      body.tenant_id ||
      req.headers.get('x-tenant-slug') ||
      req.headers.get('x-tenant-id') ||
      searchParams.get('tenant_slug') ||
      searchParams.get('tenant') ||
      searchParams.get('tenant_id') ||
      ''
    ).trim();

    // Kumpulkan semua tenant slugs yang terhubung dari payload multi-store Android
    const candidateTenantSlugs: string[] = [];
    if (Array.isArray(body.tenants)) {
      for (const t of body.tenants) {
        const s = typeof t === 'string' ? t.trim() : (t?.tenant_slug || t?.slug || '').trim();
        if (s && !candidateTenantSlugs.includes(s)) {
          candidateTenantSlugs.push(s);
        }
      }
    }
    if (rawTenantInput && !candidateTenantSlugs.includes(rawTenantInput)) {
      candidateTenantSlugs.unshift(rawTenantInput);
    }

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

    // Ekstraksi nominal uang dengan support format angka desimal/ribuan Indonesia
    const explicitAmount = parseExplicitAmount(
      body.amount ?? body.nominal ?? body.parsed_amount ?? body.gross_amount ?? null
    );

    const parsedAmount = explicitAmount > 0 ? explicitAmount : extractAmountFromText(combinedText);

    console.log(`[BoonTrack Reader Webhook] Extracted: candidateTenants=[${candidateTenantSlugs.join(', ')}], amount=${parsedAmount}, text='${combinedText.slice(0, 100)}'`);

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

    // Resolusi UUID ke slug jika tenant_id dikirim dalam format UUID
    const resolvedTenantSlugs: string[] = [];
    for (const item of candidateTenantSlugs) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)) {
        try {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('slug')
            .eq('id', item)
            .maybeSingle();
          if (tRow?.slug && !resolvedTenantSlugs.includes(tRow.slug)) {
            resolvedTenantSlugs.push(tRow.slug);
          }
        } catch (tResolveErr) {
          console.debug('[BoonTrack Reader Webhook] Tenant resolve note:', tResolveErr);
        }
      } else if (!resolvedTenantSlugs.includes(item)) {
        resolvedTenantSlugs.push(item);
      }
    }

    const PENDING_STATUSES = [
      'PENDING', 'WAITING_PAYMENT', 'PENDING_PAYMENT', 'UNPAID',
      'pending', 'waiting_payment', 'pending_payment', 'unpaid'
    ];

    // 2. Cari baris di tabel orders Supabase dengan toleransi timing / race condition
    // Jika frontend checkout terlambat menyimpan order, lakukan buffer retry (3x jeda 1.5 detik)
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;

    let pendingOrders: any[] = [];
    let matchStrategy = 'none';

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      // JALUR 1: Jika tenant slug(s) tersedia dari reader HP, cari di daftar toko yang terpasang di reader
      if (resolvedTenantSlugs.length > 0) {
        let tenantQuery = supabase
          .from('orders')
          .select('*')
          .eq('gross_amount', parsedAmount)
          .in('status', PENDING_STATUSES)
          .order('created_at', { ascending: false })
          .limit(10);

        if (resolvedTenantSlugs.length === 1) {
          tenantQuery = tenantQuery.eq('tenant_slug', resolvedTenantSlugs[0]);
        } else {
          tenantQuery = tenantQuery.in('tenant_slug', resolvedTenantSlugs);
        }

        const { data: tenantOrders, error: tErr } = await tenantQuery;
        if (!tErr && tenantOrders && tenantOrders.length > 0) {
          pendingOrders = tenantOrders;
          matchStrategy = 'paired_tenants_exact_gross_amount';
        }
      }

      // JALUR 2 (GLOBAL MULTI-TENANT FALLBACK 24 JAM): Jika belum cocok, cari order pending di SELURUH tenant
      // dalam 24 jam terakhir dengan exact gross_amount.
      // Fitur: 1 HP Reader bisa melayani banyak toko sekaligus tanpa unpair.
      if (pendingOrders.length === 0) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: globalOrders, error: gErr } = await supabase
          .from('orders')
          .select('*')
          .eq('gross_amount', parsedAmount)
          .in('status', PENDING_STATUSES)
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!gErr && globalOrders && globalOrders.length > 0) {
          pendingOrders = globalOrders;
          matchStrategy = 'global_multi_tenant_exact';
        }
      }

      // JALUR 3 (GLOBAL ANYTIME EXACT): Jika masih belum ketemu (misal order dibuat lebih lama)
      if (pendingOrders.length === 0) {
        const { data: anytimeOrders, error: aErr } = await supabase
          .from('orders')
          .select('*')
          .eq('gross_amount', parsedAmount)
          .in('status', PENDING_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!aErr && anytimeOrders && anytimeOrders.length > 0) {
          pendingOrders = anytimeOrders;
          matchStrategy = 'global_anytime_exact';
        }
      }

      // JALUR 4 (TOLERANSI KODE UNIK 1-999, MULTI-TENANT, 24 JAM):
      // Jika gross_amount tersimpan sebelum potongan kode unik, toleransi selisih 1-999.
      if (pendingOrders.length === 0) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: allPending } = await supabase
          .from('orders')
          .select('*')
          .in('status', PENDING_STATUSES)
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(100);

        if (allPending && allPending.length > 0) {
          const tolMatch = allPending.find((o) => {
            const diff = Math.abs(Number(o.gross_amount) - parsedAmount);
            return diff >= 1 && diff <= 999;
          });
          if (tolMatch) {
            pendingOrders = [tolMatch];
            matchStrategy = 'global_unique_code_tolerance';
          }
        }
      }

      // Jika match ditemukan, hentikan loop retry
      if (pendingOrders.length > 0) {
        if (attempt > 1) {
          console.log(`[BoonTrack Reader Webhook] Match order ditemukan pada percobaan retry ke-${attempt - 1} (${matchStrategy})!`);
        }
        break;
      }

      // Jika belum ditemukan dan masih ada sisa percobaan, tunggu jeda buffer
      if (attempt <= MAX_RETRIES) {
        console.log(`[BoonTrack Reader Webhook] Belum ada candidate order pending Rp ${parsedAmount} (Percobaan ${attempt}/${MAX_RETRIES + 1}). Menunggu toleransi jeda ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log(`[BoonTrack Reader Webhook] Tidak ada pesanan pending dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')} setelah ${MAX_RETRIES}x retry.`);
      return NextResponse.json({
        success: true,
        matched: false,
        message: `Tidak ditemukan pesanan menunggu pembayaran dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')}.`,
        parsed_amount: parsedAmount,
        tenant_slug: resolvedTenantSlugs[0] || null,
        candidate_tenants: resolvedTenantSlugs,
        retries_attempted: MAX_RETRIES,
      });
    }

    // Pilih order paling relevan
    const matchedOrder = pendingOrders[0];
    const paidAt = new Date().toISOString();
    const primaryTenantSlug = resolvedTenantSlugs[0] || 'default';
    const effectiveTenantSlug = matchedOrder.tenant_slug || primaryTenantSlug;

    // Log multi-tenant redirect: jika order ditemukan di toko berbeda dari sender
    const isMultiTenantMatch = resolvedTenantSlugs.length > 0 &&
      matchedOrder.tenant_slug &&
      !resolvedTenantSlugs.includes(matchedOrder.tenant_slug);

    if (isMultiTenantMatch) {
      console.log(`[Multi-Tenant Match] Mutasi dari device (tenants: [${resolvedTenantSlugs.join(', ')}]) dialihkan ke toko: '${matchedOrder.tenant_slug}' | Order #${matchedOrder.id} Rp ${matchedOrder.gross_amount}`);
    }

    console.log(`[BoonTrack Reader Webhook] MATCH FOUND: Order #${matchedOrder.id} (${matchedOrder.customer_name || 'Customer'}) Rp ${matchedOrder.gross_amount} via ${matchStrategy}${isMultiTenantMatch ? ` [→ toko: ${matchedOrder.tenant_slug}]` : ''}. Mengupdate ke PAID...`);

    // 3. Update kolom status = 'PAID', payment_status = 'PAID', order_status = 'PAID', paid_at
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        order_status: 'PAID',
        paid_at: paidAt,
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

    // 1b. Perbarui Heartbeat Status HP Reader di tenant metadata
    try {
      const { data: tenantForHeartbeat } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', effectiveTenantSlug)
        .maybeSingle();

      if (tenantForHeartbeat?.id) {
        const existingDevice = tenantForHeartbeat.metadata?.reader_device || {};
        const deviceName = body.device_name || body.device || existingDevice.device_name || 'BoonTrack Reader Android';
        const updatedMeta = {
          ...(tenantForHeartbeat.metadata || {}),
          reader_device: {
            ...existingDevice,
            is_connected: true,
            status: 'CONNECTED',
            device_name: deviceName,
            last_active_at: paidAt,
          },
        };
        await supabase
          .from('tenants')
          .update({ metadata: updatedMeta })
          .eq('id', tenantForHeartbeat.id);
      }
    } catch (heartbeatErr) {
      console.debug('[BoonTrack Reader Webhook] Heartbeat note:', heartbeatErr);
    }

    console.log(`[BoonTrack Reader Webhook] SUCCESS: Order #${matchedOrder.id} status berhasil diubah ke PAID!`);

    // Dispatch Affiliate & AM Commission Alert (Non-blocking)
    sendOrderCommissionAlert({
      orderId: String(matchedOrder.id),
      tenantSlug: effectiveTenantSlug,
      tenantId: matchedOrder.tenant_id,
      productTitle: matchedOrder.product_title || matchedOrder.product_name || 'Pesanan Produk',
      grossAmount: Number(matchedOrder.gross_amount) || 0,
      customerName: matchedOrder.customer_name || matchedOrder.buyer_name,
      customerPhone: matchedOrder.customer_phone || matchedOrder.phone,
      customerEmail: matchedOrder.customer_email,
      affiliateCode: matchedOrder.affiliate_code || matchedOrder.metadata?.affiliate_code || null,
      directCommission: Number(matchedOrder.affiliate_commission) || undefined,
    }).catch((notifErr) => {
      console.warn('[BoonTrack Reader Webhook] Non-fatal affiliate commission alert error:', notifErr);
    });

    return NextResponse.json({
      success: true,
      matched: true,
      order_id: matchedOrder.id,
      gross_amount: matchedOrder.gross_amount,
      tenant_slug: effectiveTenantSlug,
      paid_at: paidAt,
      match_strategy: matchStrategy,
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
