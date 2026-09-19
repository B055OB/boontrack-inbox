import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { dispatchMetaCAPI } from '@/lib/capi.service';

// In-memory diagnostic logs ring buffer (stores up to 50 latest webhook calls)
export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  rawBody: any;
  parsedAmount?: number | null;
  detectedApp?: string | null;
  tenantSlug?: string | null;
  matchedOrderId?: string | null;
  matchStrategy?: string | null;
  resultStatus: number;
  resultBody: any;
}

const recentWebhookLogs: WebhookLogEntry[] = [];
const MAX_LOG_ENTRIES = 50;

export function addWebhookLog(entry: WebhookLogEntry) {
  recentWebhookLogs.unshift(entry);
  if (recentWebhookLogs.length > MAX_LOG_ENTRIES) {
    recentWebhookLogs.pop();
  }
}

export function getRecentWebhookLogs(): WebhookLogEntry[] {
  return recentWebhookLogs;
}

/**
 * Parser teks notifikasi mutasi DANA Bisnis, BCA, GoPay, Mandiri, BRI, dll.
 * Mendukung variasi format:
 * - "DANA Bisnis: Pembayaran diterima sebesar Rp 1.771"
 * - "QRIS: Berhasil menerima Rp 1.771"
 * - "DANA Bisnis: Pembayaran diterima sebesar Rp1.771"
 * - "DANA: Pembayaran sebesar Rp 1.771 berhasil diterima"
 * - "DANA Bisnis: Transaksi QRIS sebesar Rp1.771,00 sukses"
 * - "m-Transfer: 19/09 1771.00 ..."
 * - "GoPay Usaha: Pembayaran sebesar Rp 1.771 berhasil diterima"
 * - "Berhasil menerima Rp 1.771 dari PEMBELI"
 */
export function parsePaymentNotification(rawText: string): {
  amount: number | null;
  detectedApp: string | null;
  rawMatch?: string;
} {
  if (!rawText || typeof rawText !== 'string') {
    return { amount: null, detectedApp: null };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase();

  let detectedApp: string | null = null;
  if (lower.includes('dana')) detectedApp = 'DANA';
  else if (lower.includes('bca') || lower.includes('klikbca') || lower.includes('mybca')) detectedApp = 'BCA';
  else if (lower.includes('gopay') || lower.includes('gojek')) detectedApp = 'GOPAY';
  else if (lower.includes('mandiri') || lower.includes('livin')) detectedApp = 'MANDIRI';
  else if (lower.includes('bri') || lower.includes('brimo')) detectedApp = 'BRI';
  else if (lower.includes('shopee') || lower.includes('spay')) detectedApp = 'SHOPEEPAY';

  // Pattern 1: Rp / IDR diikuti angka dengan pemisah ribuan titik/koma
  const rpRegex = /(?:rp\.?|idr)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;

  // Pattern 2: Kata kunci penerimaan uang diikuti nominal
  const keywordRegex = /(?:sebesar|menerima|pembayaran|nominal|berhasil menerima|masuk sebesar|uang masuk|terima)\s*(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;

  let match = text.match(rpRegex);
  if (!match) {
    match = text.match(keywordRegex);
  }

  // Fallback: cari angka nominal ribuan yang berdiri sendiri (e.g. 1.771)
  if (!match) {
    const genericMatch = text.match(/\b([1-9][0-9]{0,2}(?:\.[0-9]{3})+|\b[1-9][0-9]{3,8}\b)/);
    if (genericMatch) {
      match = genericMatch;
    }
  }

  if (!match) {
    return { amount: null, detectedApp };
  }

  let numStr = match[1].trim();

  // Bersihkan format desimal/sen trailing seperti ,- atau .-
  if (numStr.endsWith(',-') || numStr.endsWith('.-')) {
    numStr = numStr.slice(0, -2);
  }
  // Bersihkan format sen seperti ,00 atau .00
  if (numStr.endsWith(',00') || numStr.endsWith('.00')) {
    numStr = numStr.slice(0, -3);
  }

  // Ambil hanya digit angka
  const cleanDigits = numStr.replace(/[^0-9]/g, '');
  const amount = parseInt(cleanDigits, 10);

  return {
    amount: isNaN(amount) || amount <= 0 ? null : amount,
    detectedApp,
    rawMatch: match[0],
  };
}

/**
 * Handle incoming webhook POST from BoonTrack Reader APK or Payment Gateway
 */
export async function handlePaymentWebhook(req: NextRequest, endpointSource = 'reader_webhook') {
  const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

  let rawBody: any = {};
  try {
    const textBody = await req.text();
    if (textBody) {
      try {
        rawBody = JSON.parse(textBody);
      } catch {
        rawBody = { text: textBody };
      }
    }
  } catch (readErr) {
    console.warn('[Webhook Reader] Error reading request body:', readErr);
  }

  const { searchParams } = new URL(req.url);

  // 1. Resolusi Tenant Slug dari berbagai variasi payload / query param / headers
  const tenantSlug =
    searchParams.get('tenant') ||
    searchParams.get('tenant_slug') ||
    searchParams.get('slug') ||
    rawBody.tenant_slug ||
    rawBody.tenant ||
    rawBody.slug ||
    rawBody.merchant_slug ||
    rawBody.store_slug ||
    headersObj['x-tenant-slug'] ||
    headersObj['x-tenant-id'] ||
    headersObj['tenant-slug'] ||
    headersObj['tenant'] ||
    null;

  // 2. Cek apakah ada Direct Order ID (dari Gateway / Payment Provider resmi)
  const directOrderId =
    rawBody.order_id ||
    rawBody.external_id ||
    rawBody.id ||
    rawBody.invoice_id ||
    rawBody.reference_id ||
    rawBody.bill_no ||
    searchParams.get('order_id');

  const rawStatus = String(
    rawBody.status ||
    rawBody.payment_status ||
    rawBody.transaction_status ||
    rawBody.event ||
    ''
  ).toUpperCase();

  const isDirectPaid =
    rawStatus === 'PAID' ||
    rawStatus === 'SETTLED' ||
    rawStatus === 'SUCCESS' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'MUTATION_MATCHED';

  // 3. Ekstraksi Notifikasi Teks (dari BoonTrack Reader APK Android)
  // FIX(2026-09-19): Ternary operator precedence bug - rawBody.title ? ... mengevaluasi
  //   seluruh chain OR sebelumnya sebagai condition, bukan hanya rawBody.title.
  //   Akibatnya jika title null tapi body/text ada -> notificationText = null -> parsedAmount = null.
  const _titlePart = String(rawBody.title || rawBody.notification_title || '').trim();
  const _bodyPart = String(
    rawBody.body ||
    rawBody.text ||
    rawBody.message ||
    rawBody.content ||
    rawBody.notification ||
    rawBody.snippet ||
    rawBody.raw_text ||
    ''
  ).trim();
  const notificationText: string | null = (_titlePart && _bodyPart)
    ? `${_titlePart} ${_bodyPart}`
    : (_bodyPart || _titlePart || null);

  // Nominal eksplisit jika Android Reader sudah mem-parsing sebelumnya
  const explicitAmount = Number(
    rawBody.amount ||
    rawBody.nominal ||
    rawBody.gross_amount ||
    rawBody.total ||
    0
  );

  let parsedAmount = explicitAmount > 0 ? explicitAmount : null;
  let detectedApp: string | null = null;

  if (notificationText) {
    const parseResult = parsePaymentNotification(notificationText);
    if (!parsedAmount && parseResult.amount) {
      parsedAmount = parseResult.amount;
    }
    detectedApp = parseResult.detectedApp;
  }

  console.log(`[Webhook Reader ${logId}] Incoming Payload:`, {
    endpoint: endpointSource,
    tenantSlug,
    directOrderId,
    parsedAmount,
    detectedApp,
    notificationText: notificationText?.slice(0, 100),
  });

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    const errorRes = { success: false, error: 'Database unreachable', logId };
    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      resultStatus: 500,
      resultBody: errorRes,
    });
    return NextResponse.json(errorRes, { status: 500 });
  }

  let matchedOrder: any = null;
  let matchStrategy = 'none';

  // JALUR 1: Pencocokan berbasis Direct Order ID (Gateway / QRIS Direct)
  if (directOrderId && isDirectPaid) {
    const { data: orderById } = await supabase
      .from('orders')
      .select('*')
      .eq('id', directOrderId)
      .maybeSingle();

    if (orderById) {
      matchedOrder = orderById;
      matchStrategy = 'direct_order_id';
    }
  }

  // JALUR 2: Pencocokan berbasis Nominal Notifikasi Reader (BoonTrack Reader APK)
  if (!matchedOrder && parsedAmount && parsedAmount > 0) {
    console.log(`[Webhook Reader ${logId}] Mencari order dengan nominal ${parsedAmount} (Tenant: ${tenantSlug || 'ALL'})...`);

    // Ambil order yang statusnya belum lunas
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .or('status.eq.WAITING_PAYMENT,status.eq.PENDING_PAYMENT,status.eq.PENDING,status.eq.UNPAID')
      .order('created_at', { ascending: false })
      .limit(50);

    if (tenantSlug) {
      ordersQuery = ordersQuery.eq('tenant_slug', tenantSlug);
    }

    const { data: pendingOrders, error: fetchErr } = await ordersQuery;

    if (fetchErr) {
      console.error(`[Webhook Reader ${logId}] Error querying pending orders:`, fetchErr);
    }

    if (pendingOrders && pendingOrders.length > 0) {
      // 2.A: Cocokkan EXACT AMOUNT (gross_amount === parsedAmount)
      const exactMatch = pendingOrders.find((o) => Number(o.gross_amount) === parsedAmount);

      if (exactMatch) {
        matchedOrder = exactMatch;
        matchStrategy = 'exact_gross_amount';
      } else {
        // 2.B: Cocokkan dengan Toleransi Kode Unik (1 s/d 999)
        // Kasus: gross_amount disimpan harga dasar (2000), transfer masuk setelah kode unik dipotong (1771)
        // |gross_amount - parsedAmount| <= 999
        const toleranceMatch = pendingOrders.find((o) => {
          const diff = Math.abs(Number(o.gross_amount) - parsedAmount);
          return diff >= 1 && diff <= 999;
        });

        if (toleranceMatch) {
          matchedOrder = toleranceMatch;
          matchStrategy = 'unique_code_tolerance';
        }
      }
    }
  }

  // Jika tidak ada order yang cocok
  if (!matchedOrder) {
    const notFoundRes = {
      success: false,
      message: parsedAmount
        ? `Tidak ditemukan pesanan dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')} untuk tenant '${tenantSlug || 'any'}'.`
        : 'Tidak ada order_id valid atau nominal yang dapat diekstraksi dari notifikasi.',
      parsed_amount: parsedAmount,
      detected_app: detectedApp,
      tenant_slug: tenantSlug,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      resultStatus: 404,
      resultBody: notFoundRes,
    });

    return NextResponse.json(notFoundRes, { status: 404 });
  }

  const orderId = matchedOrder.id || matchedOrder.order_id;
  const currentStatus = String(matchedOrder.status || matchedOrder.payment_status || '').toUpperCase();

  // IDEMPOTENCY: Jika sudah lunas sebelumnya
  if (currentStatus === 'PAID' || currentStatus === 'SETTLED' || currentStatus === 'COMPLETED') {
    const idempotentRes = {
      success: true,
      message: `Pesanan #${orderId} sudah berstatus LUNAS (PAID) sebelumnya. Idempotent skip.`,
      order_id: orderId,
      already_paid: true,
      paid_at: matchedOrder.paid_at || matchedOrder.updated_at,
      match_strategy: matchStrategy,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: orderId,
      matchStrategy,
      resultStatus: 200,
      resultBody: idempotentRes,
    });

    return NextResponse.json(idempotentRes, { status: 200 });
  }

  const paidAt = new Date().toISOString();

  // UPDATE STATUS ORDER KE 'PAID' (Single Source of Truth: orders)
  await supabase
    .from('orders')
    .update({
      status: 'PAID',
      updated_at: paidAt,
    })
    .eq('id', orderId);

  console.log(`[Webhook Reader ${logId}] SUCCESS: Order #${orderId} diupdate menjadi PAID (Strategy: ${matchStrategy}).`);

  // KIRIM WHATSAPP AUTO-FULFILLMENT
  const customerPhone =
    matchedOrder.customer_phone ||
    matchedOrder.phone ||
    matchedOrder.whatsapp_number;

  const customerName =
    matchedOrder.customer_name ||
    matchedOrder.buyer_name ||
    'Pelanggan Setia';

  const itemsSummary =
    matchedOrder.product_title ||
    matchedOrder.product_name ||
    'Pesanan Produk';

  const totalAmount = Number(
    matchedOrder.gross_amount ||
    matchedOrder.total_amount ||
    parsedAmount ||
    0
  );

  const resolvedProductType =
    matchedOrder.product_type ||
    (matchedOrder.shipping_address ? 'PHYSICAL' : 'DIGITAL');

  const resolvedAccessUrl =
    matchedOrder.fulfillment_metadata?.access_url ||
    matchedOrder.download_url ||
    matchedOrder.delivery_url ||
    '';

  const resolvedInstructions =
    matchedOrder.fulfillment_metadata?.instructions || '';

  if (customerPhone) {
    console.log(`[Webhook Reader ${logId}] Mengirim WhatsApp auto-fulfillment (${resolvedProductType}) ke ${customerPhone}`);
    sendOrderFulfillmentNotification({
      phone: customerPhone,
      customerName,
      orderId: String(orderId),
      itemsSummary,
      totalAmount,
      productType: resolvedProductType,
      accessUrl: resolvedAccessUrl,
      instructions: resolvedInstructions,
    }).catch((waErr) => {
      console.warn(`[Webhook Reader ${logId}] Error dispatching WhatsApp fulfillment (non-fatal):`, waErr);
    });
  }

  // META CAPI DISPATCH
  const targetTenantSlug = matchedOrder.tenant_slug || matchedOrder.tenant_id || tenantSlug;
  if (targetTenantSlug) {
    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, slug, tier, plan, metadata')
        .eq('slug', targetTenantSlug)
        .maybeSingle();

      const tenantTier = (tenantData?.tier || tenantData?.plan || '').toUpperCase();
      if (tenantTier === 'PRO_SCALE' || tenantTier === 'ADS_PERFORMANCE' || tenantTier === 'ENTERPRISE' || tenantTier === 'TEAM_SCALE') {
        const metaPixelId = tenantData?.metadata?.pixel_config?.meta_pixel_id || tenantData?.metadata?.meta_pixel_id;
        const metaAccessToken = tenantData?.metadata?.pixel_config?.meta_access_token || tenantData?.metadata?.meta_access_token;
        if (metaPixelId && metaAccessToken) {
          dispatchMetaCAPI(metaPixelId, metaAccessToken, {
            orderId: String(orderId),
            tenantId: tenantData.id || tenantData.slug,
            grossAmount: totalAmount,
            customerPhone,
            customerName,
          }).catch((capiErr) => console.warn(`[Webhook Reader ${logId}] Error dispatching Meta CAPI:`, capiErr));
        }
      }
    } catch (capiCheckErr) {
      console.warn(`[Webhook Reader ${logId}] Error checking CAPI:`, capiCheckErr);
    }
  }

  const successRes = {
    success: true,
    message: `Pesanan #${orderId} berhasil diverifikasi LUNAS (PAID) via BoonTrack Reader (nominal Rp ${totalAmount.toLocaleString('id-ID')}).`,
    order_id: orderId,
    gross_amount: totalAmount,
    match_strategy: matchStrategy,
    detected_app: detectedApp,
    tenant_slug: targetTenantSlug,
    paid_at: paidAt,
    log_id: logId,
  };

  addWebhookLog({
    id: logId,
    timestamp: new Date().toISOString(),
    endpoint: endpointSource,
    method: 'POST',
    headers: headersObj,
    rawBody,
    parsedAmount,
    detectedApp,
    tenantSlug: targetTenantSlug,
    matchedOrderId: orderId,
    matchStrategy,
    resultStatus: 200,
    resultBody: successRes,
  });

  return NextResponse.json(successRes, { status: 200 });
}
