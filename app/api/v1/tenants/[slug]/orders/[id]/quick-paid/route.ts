import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { sendOrderPaidNotification } from '@/lib/whatsapp';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: orderId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database client unreachable' },
        { status: 500 }
      );
    }

    // 1. Fetch current order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const paidAt = new Date().toISOString();
    let fulfillmentMeta = order.fulfillment_metadata || {};

    // If fulfillment access_url not set, attempt to resolve from products catalog
    if (!fulfillmentMeta.access_url && !order.download_url) {
      if (order.product_id) {
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
      }
    }

    // 2. Update order to PAID
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        paid_at: paidAt,
        fulfillment_metadata: fulfillmentMeta,
        download_url: fulfillmentMeta.access_url || order.download_url || null,
        updated_at: paidAt,
      })
      .eq('id', orderId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[Quick-Paid Error]:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // 3. Post auto-fulfillment notification to messages table
    const accessUrl = fulfillmentMeta.access_url || updatedOrder.download_url;
    const fulfillmentNotice = accessUrl
      ? `Akses materi digital Anda dapat dibuka di: ${accessUrl}`
      : 'Akses produk digital Anda sedang disiapkan oleh admin toko.';

    try {
      await supabase.from('messages').insert({
        tenant_slug: slug,
        conversation_id: orderId,
        sender: 'System AI',
        channel: 'order_fulfillment',
        text: `Pembayaran pesanan #${orderId} (${order.product_title || 'Produk Digital'}) telah terverifikasi LUNAS (PAID). ${fulfillmentNotice}`,
        message_text: `Pembayaran pesanan #${orderId} (${order.product_title || 'Produk Digital'}) telah terverifikasi LUNAS (PAID). ${fulfillmentNotice}`,
      });
    } catch {}

    // 4. Kirim notifikasi WhatsApp resmi via Meta Utility Template (order_notification_v1)
    const customerPhone = order.customer_phone || order.phone || order.whatsapp_number;
    if (customerPhone) {
      sendOrderPaidNotification({
        phone: customerPhone,
        customerName: order.customer_name || order.buyer_name || 'Pelanggan Setia',
        orderId: String(orderId),
        itemsSummary: order.product_title || order.product_name || 'Produk Pesanan',
        totalAmount: Number(order.gross_amount || order.total_amount || order.amount || 0),
      }).catch((waErr) => console.warn('[WhatsApp WABA] Order notification dispatch note:', waErr));
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: 'Pesanan berhasil ditandai LUNAS (PAID) dan akses digital diaktifkan.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
