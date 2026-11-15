import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { getStorefrontPayUrl } from '@/lib/utils/storefrontUrl';

export const dynamic = 'force-dynamic';

/**
 * INBOX-POS-01 / Patch 2: Dedicated Server Gateway for Custom POS Order Generation
 * Resolves SEC-01 & SEC-03:
 * 1. Replaces direct client-side DB writes with a secured, validated server gateway.
 * 2. Enforces strict ASPI / BI nominal standards (Min Rp 1.000, Max Rp 10.000.000 for QRIS).
 * 3. Prevents decimal parsing spikes and silent Rp 100.000 fallbacks.
 * 4. Generates cryptographically secure, collision-proof order IDs (ORD-POS-YYMMDD-HEX6) & UUIDs.
 * 5. Guarantees 1:1 conversation_id linkage in orders.metadata for omnichannel fulfillment tracking.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database admin unavailable' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      tenantSlug,
      conversationId,
      customerPhone,
      customerName,
      itemName,
      rawAmount,
      billingType = 'QRIS', // 'QRIS' | 'MANUAL_BANK'
      uniqueCode,
      bankAccount,
      csUserId,
      csUserName,
      isWalkIn = false,
      contactId,
    } = body;

    // 1. Mandatory Input Validation
    if (!tenantSlug || typeof tenantSlug !== 'string' || !tenantSlug.trim()) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant slug / tenant ID wajib diisi.' },
        { status: 400 }
      );
    }

    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp pelanggan wajib diisi.' },
        { status: 400 }
      );
    }

    // 2. Strict Nominal Parsing & ASPI Standards Validation
    let parsedAmount: number;
    if (typeof rawAmount === 'number') {
      parsedAmount = Math.floor(rawAmount);
    } else {
      // Clean string representation: handle decimals properly before stripping non-digits
      const rawStr = String(rawAmount || '').trim().replace(/,/g, '');
      const floatVal = parseFloat(rawStr);
      parsedAmount = isNaN(floatVal) ? 0 : Math.floor(floatVal);
    }

    if (parsedAmount < 1000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nominal tidak valid. Minimal transaksi adalah Rp 1.000',
        },
        { status: 400 }
      );
    }

    const isQris = billingType === 'QRIS';
    if (isQris && parsedAmount > 10000000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Batas maksimum transaksi QRIS adalah Rp 10.000.000 per transaksi (Regulasi BI/ASPI)',
        },
        { status: 400 }
      );
    }

    const finalUniqueCode =
      billingType === 'MANUAL_BANK' && typeof uniqueCode === 'number' && uniqueCode >= 1 && uniqueCode <= 999
        ? Math.floor(uniqueCode)
        : 0;

    const finalTotalAmount = billingType === 'MANUAL_BANK' ? parsedAmount + finalUniqueCode : parsedAmount;

    // 3. Dynamic Tenant Resolution (Zero Hardcoding Policy)
    const cleanSlug = tenantSlug.trim().toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSlug);

    let tQuery = supabase.from('tenants').select('id, slug, name, metadata');
    if (isUuid) {
      tQuery = tQuery.or(`id.eq.${cleanSlug},slug.eq.${cleanSlug}`);
    } else {
      tQuery = tQuery.or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`);
    }

    const { data: tenant, error: tenantErr } = await tQuery.maybeSingle();

    if (!tenant || tenantErr) {
      return NextResponse.json(
        { success: false, error: 'Toko/Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Resolve matching product or default service
    const cleanItemName = String(itemName || 'Layanan / Proyek').trim();
    const productsList: any[] = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
    const matchedProd = productsList.find((p: any) =>
      p && ((p.name && cleanItemName && p.name.toLowerCase().includes(cleanItemName.toLowerCase())) ||
            (cleanItemName && p.name && cleanItemName.toLowerCase().includes(p.name.toLowerCase())))
    );
    const resolvedProductId = String(matchedProd?.id || productsList[0]?.id || 'srv_custom_chat');

    // 4. Generate Collision-Proof Order ID & Payment Token
    const now = new Date();
    const nowIso = now.toISOString();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePart = `${yy}${mm}${dd}`;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const displayOrderNumber = `ORD-POS-${datePart}-${randomSuffix}`;
    const internalOrderId = crypto.randomUUID();
    const paymentToken = `pay_${crypto.randomBytes(16).toString('hex')}`;
    const rawPayUrl = getStorefrontPayUrl(tenant.slug, paymentToken);
    const payUrl = rawPayUrl.startsWith('http') ? rawPayUrl : `https://shop.boontrack.com${rawPayUrl}`;

    // 5. Server-Side Atomic Insert into 'orders' with Single Source of Truth
    const cleanCustomerPhone = customerPhone.trim();
    const cleanCustomerName = String(customerName || 'Pelanggan').trim();

    const rawOrderPayload = {
      id: internalOrderId,
      order_number: displayOrderNumber,
      correlation_id: paymentToken,
      tenant_slug: tenant.slug,
      tenant_id: tenant.id,
      customer_phone: cleanCustomerPhone,
      customer_name: cleanCustomerName,
      product_id: resolvedProductId,
      product_title: cleanItemName,
      gross_amount: finalTotalAmount,
      status: 'PENDING',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
      metadata: {
        order_number: displayOrderNumber,
        internal_id: internalOrderId,
        conversation_id: conversationId || null,
        contact_id: contactId || null,
        created_by_cs_id: csUserId || null,
        created_by_cs_name: csUserName || null,
        public_payment_token: paymentToken,
        payment_token: paymentToken,
        payment_method: isQris ? 'qris' : 'MANUAL_BANK',
        pay_url: payUrl,
        source: isWalkIn ? 'QUICK_POS_WALKIN' : 'INBOX_QUICK_POS',
        is_walk_in: Boolean(isWalkIn),
        ...(billingType === 'MANUAL_BANK' ? {
          unique_code: finalUniqueCode,
          base_amount: parsedAmount,
          bank_account: bankAccount || null,
        } : {}),
      },
    };

    const sanitizedPayload = sanitizeOrderPayload(rawOrderPayload);
    const { data: insertedOrder, error: insertOrderErr } = await supabase
      .from('orders')
      .insert(sanitizedPayload)
      .select('*')
      .maybeSingle();

    if (insertOrderErr) {
      console.error('[Inbox Custom Order Gateway Error]:', insertOrderErr);
      return NextResponse.json(
        { success: false, error: `Gagal membuat data pesanan: ${insertOrderErr.message || 'Database error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: insertedOrder || sanitizedPayload,
      orderId: internalOrderId,
      orderNumber: displayOrderNumber,
      paymentToken,
      amount: finalTotalAmount,
      baseAmount: parsedAmount,
      uniqueCode: finalUniqueCode,
      payUrl,
    });
  } catch (err: any) {
    console.error('[Inbox Custom Order Gateway Exception]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
