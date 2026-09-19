import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendOrderPaidNotification, sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { dispatchMetaCAPI } from '@/lib/capi.service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Pembayaran QRIS / Mutasi Bank / Gateway
 * Menerima callback saat transaksi berhasil lunas (PAID / SETTLED),
 * mengupdate status pesanan di database Supabase, dan mengirim notifikasi WhatsApp
 * via Utility Template resmi Meta: order_notification_v1.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Ambil identifier order dari berbagai variasi payload gateway / reader
    const orderId =
      body.order_id ||
      body.external_id ||
      body.id ||
      body.invoice_id ||
      body.reference_id ||
      body.bill_no;

    const rawStatus = String(
      body.status ||
      body.payment_status ||
      body.transaction_status ||
      body.event ||
      ''
    ).toUpperCase();

    const isPaid =
      rawStatus === 'PAID' ||
      rawStatus === 'SETTLED' ||
      rawStatus === 'SUCCESS' ||
      rawStatus === 'COMPLETED' ||
      rawStatus === 'MUTATION_MATCHED';

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Parameter order_id / external_id tidak ditemukan dalam payload webhook.' },
        { status: 400 }
      );
    }

    if (!isPaid) {
      return NextResponse.json({
        success: true,
        message: `Status pesanan bukan berstatus lunas (${rawStatus}), tidak ada aksi update yang diproses.`,
      });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unreachable' }, { status: 500 });
    }

    // 1. Cari record order di Supabase
    let matchedOrder: any = null;
    let isProductOrdersTable = false;

    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderData) {
      matchedOrder = orderData;
    } else {
      const { data: pOrderData } = await supabase
        .from('product_orders')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (pOrderData) {
        matchedOrder = pOrderData;
        isProductOrdersTable = true;
      }
    }

    if (!matchedOrder) {
      console.warn(`[Payment Webhook] Pesanan dengan ID ${orderId} tidak ditemukan di database.`);
      return NextResponse.json(
        { success: false, error: `Pesanan #${orderId} tidak ditemukan.` },
        { status: 404 }
      );
    }

    // P0.5 IDEMPOTENCY CHECK: Cek apakah pesanan sudah pernah diverifikasi LUNAS (PAID) sebelumnya
    // Mencegah double callback / replay mutation / duplicate messaging
    const currentStatus = String(matchedOrder.payment_status || matchedOrder.status || '').toUpperCase();
    if (currentStatus === 'PAID' || currentStatus === 'SETTLED' || currentStatus === 'COMPLETED') {
      console.log(`[Payment Webhook] Idempotency: Pesanan #${orderId} sudah berstatus LUNAS. Skipping double-processing.`);
      return NextResponse.json({
        success: true,
        message: `Pesanan #${orderId} sudah berstatus LUNAS (PAID) sebelumnya. Idempotent skip update.`,
        order_id: orderId,
        already_paid: true,
        paid_at: matchedOrder.paid_at || matchedOrder.updated_at,
      });
    }

    const paidAt = new Date().toISOString();

    // 2. Update status ke PAID
    if (isProductOrdersTable) {
      await supabase
        .from('product_orders')
        .update({
          status: 'PAID',
          updated_at: paidAt,
        })
        .eq('order_id', orderId);
    } else {
      await supabase
        .from('orders')
        .update({
          status: 'PAID',
          payment_status: 'PAID',
          paid_at: paidAt,
          updated_at: paidAt,
        })
        .eq('id', orderId);
    }

    // 3. Dispatch WhatsApp Auto-Fulfillment (Isolasi Digital vs Fisik)
    const customerPhone =
      matchedOrder.customer_phone ||
      matchedOrder.phone ||
      matchedOrder.whatsapp_number ||
      body.customer_phone;

    const customerName =
      matchedOrder.customer_name ||
      matchedOrder.buyer_name ||
      body.customer_name ||
      'Pelanggan Setia';

    const itemsSummary =
      matchedOrder.product_title ||
      matchedOrder.product_name ||
      body.product_name ||
      'Pesanan Produk';

    const totalAmount = Number(
      matchedOrder.gross_amount ||
      matchedOrder.total_amount ||
      matchedOrder.amount ||
      body.amount ||
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
      console.log(`[Payment Webhook] Mengirim WhatsApp auto-fulfillment (${resolvedProductType}) ke ${customerPhone} untuk Order #${orderId}`);
      // PAYMENT ATOMICITY: Kegagalan pengiriman WhatsApp (timeout / no token) TIDAK membatalkan transaksi keuangan
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
        console.warn('[Payment Webhook] Error dispatching WhatsApp fulfillment (non-fatal):', waErr);
      });
    }

    // 4. CAPI Server-Side Dispatch Guard:
    // Pastikan payload backend webhook lunas TIDAK menembakkan request CAPI ke Meta/TikTok jika tenant bertier CHECKOUT_LITE
    const tenantIdentifier = matchedOrder.tenant_slug || matchedOrder.tenant_id;
    if (tenantIdentifier) {
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, slug, tier, plan, metadata')
          .or(`slug.eq.${tenantIdentifier},id.eq.${tenantIdentifier}`)
          .maybeSingle();

        const tenantTier = (tenantData?.tier || tenantData?.plan || '').toUpperCase();
        if (tenantTier === 'CHECKOUT_LITE' || tenantTier === 'SOLO' || tenantTier === 'STARTER') {
          console.log(`[Payment Webhook] Tier ${tenantTier} terdeteksi untuk Order #${orderId}. Server-Side CAPI dibypass (Murni Browser Pixel Tracking, Tanpa Server CAPI).`);
        } else if (tenantTier === 'PRO_SCALE' || tenantTier === 'ADS_PERFORMANCE' || tenantTier === 'ENTERPRISE' || tenantTier === 'TEAM_SCALE') {
          const metaPixelId = tenantData?.metadata?.pixel_config?.meta_pixel_id || tenantData?.metadata?.meta_pixel_id;
          const metaAccessToken = tenantData?.metadata?.pixel_config?.meta_access_token || tenantData?.metadata?.meta_access_token;
          if (metaPixelId && metaAccessToken) {
            dispatchMetaCAPI(metaPixelId, metaAccessToken, {
              orderId: String(orderId),
              tenantId: tenantData.id || tenantData.slug,
              grossAmount: totalAmount,
              customerPhone,
              customerName,
            }).catch((capiErr) => console.warn('[Payment Webhook] Error dispatching Meta CAPI:', capiErr));
          }
        }
      } catch (tenantErr) {
        console.warn('[Payment Webhook] Error resolving tenant CAPI guard:', tenantErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Pesanan #${orderId} berhasil diverifikasi LUNAS (PAID) dan notifikasi WhatsApp telah dipicu.`,
      order_id: orderId,
      paid_at: paidAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Payment Webhook Exception]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const GET = async () => {
  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Payment & QRIS Mutation Webhook',
    timestamp: new Date().toISOString(),
  });
};
