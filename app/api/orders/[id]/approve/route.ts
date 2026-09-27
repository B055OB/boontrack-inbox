import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { dispatchMetaCAPIPurchaseForOrder } from '@/lib/capi.service';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';
import { sendOrderFulfillmentEmails } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawOrderId } = await params;
    const orderId = String(rawOrderId || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database client unreachable' },
        { status: 500 }
      );
    }

    // 1. Fetch current order
    let { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${orderId},order_id.eq.${orderId},invoice_no.eq.${orderId}`)
        .maybeSingle();
      if (altOrder) order = altOrder;
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found` },
        { status: 404 }
      );
    }

    const paidAt = new Date().toISOString();
    let fulfillmentMeta = order.fulfillment_metadata || {};

    // If fulfillment access_url not set, attempt to resolve from catalog
    if (!fulfillmentMeta.access_url && !order.download_url && order.product_id) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('link_digital, asset_reference, fulfillment_metadata')
          .eq('id', order.product_id)
          .maybeSingle();

        const resolvedAccess =
          prod?.fulfillment_metadata?.access_url ||
          prod?.link_digital ||
          prod?.asset_reference;

        if (resolvedAccess) {
          fulfillmentMeta = {
            ...fulfillmentMeta,
            delivery_type: 'DOWNLOAD_LINK',
            access_url: resolvedAccess,
            instructions:
              prod?.fulfillment_metadata?.instructions ||
              'Akses materi digital Anda telah aktif secara instan.',
          };
        }
      } catch {}
    }

    // 2. Update order to PAID & COMPLETED
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        order_status: 'COMPLETED',
        paid_at: paidAt,
        fulfillment_metadata: fulfillmentMeta,
        download_url: fulfillmentMeta.access_url || order.download_url || null,
        updated_at: paidAt,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[Approve Order API] Error updating status:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Gagal memperbarui status pesanan' },
        { status: 500 }
      );
    }

    const accessUrl = fulfillmentMeta.access_url || updatedOrder.download_url;
    const customerPhone = order.customer_phone || order.phone || order.whatsapp_number;
    const tenantSlug = order.tenant_slug || 'platform';

    // 3. Dispatch WhatsApp Notification (Non-blocking)
    if (customerPhone) {
      sendOrderFulfillmentNotification({
        phone: customerPhone,
        customerName: order.customer_name || 'Pelanggan Setia',
        orderId: String(orderId),
        itemsSummary: order.product_title || 'Pesanan Produk',
        totalAmount: Number(order.gross_amount || order.total_amount || 0),
        productType: order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL'),
        accessUrl: accessUrl || undefined,
        instructions: fulfillmentMeta.instructions || undefined,
        tenantId: tenantSlug,
      }).catch((waErr) => console.warn('[Approve Order] WhatsApp fulfillment dispatch note:', waErr));
    }

    // 4. Dispatch Dual Transactional Emails (Buyer Receipt + Merchant Alert)
    const emailPromise = sendOrderFulfillmentEmails({
      orderId: String(orderId),
      tenantSlug,
      tenantId: order.tenant_id,
      customerName: order.customer_name || 'Pelanggan Setia',
      customerEmail: order.customer_email || null,
      customerPhone: customerPhone || null,
      productTitle: order.product_title || 'Pesanan Produk',
      grossAmount: Number(order.gross_amount || order.total_amount || 0),
      paymentMethod: order.payment_method || 'QRIS Dinamis (Otomatis)',
      paidAt,
      accessUrl: accessUrl || undefined,
      instructions: fulfillmentMeta.instructions || undefined,
      productType: order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL'),
    }).catch((emailErr) => console.warn('[Approve Order] Email fulfillment dispatch note:', emailErr));

    // 5. Dispatch Meta CAPI Purchase & Affiliate Alerts
    dispatchMetaCAPIPurchaseForOrder(String(orderId), supabase)
      .catch((capiErr) => console.warn('[Approve Order] CAPI dispatch note:', capiErr));

    sendOrderCommissionAlert({
      orderId: String(orderId),
      tenantSlug,
      tenantId: order.tenant_id,
      productTitle: order.product_title || 'Pesanan Produk',
      grossAmount: Number(order.gross_amount) || 0,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      affiliateCode: order.affiliate_code || null,
      directCommission: Number(order.affiliate_commission) || undefined,
    }).catch(() => {});

    // Tunggu pengiriman email selesai atau timeout cepat
    const emailResult = await Promise.race([
      emailPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      email_dispatched: Boolean(emailResult),
      message: 'Pesanan berhasil disetujui (PAID) dan notifikasi multi-channel terkirim.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
