import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { sendOrderPaidNotification, sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';
import { dispatchMetaCAPIPurchaseForOrder } from '@/lib/capi.service';
import { sendOrderFulfillmentEmails } from '@/lib/email-service';
import { dispatchOrderTelegramAlert } from '@/lib/telegram/telegram-dispatcher';

export async function POST(
  req: NextRequest,
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database admin client unreachable' },
        { status: 500 }
      );
    }

    // 1. Fetch current order safely (checking UUID validity to avoid Postgres syntax error)
    let order: any = null;
    if (isValidUuid(orderId)) {
      const { data: byId } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();
      if (byId) order = byId;
    }

    if (!order) {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`order_id.eq.${orderId},invoice_no.eq.${orderId}`)
        .maybeSingle();
      if (altOrder) order = altOrder;
    }

    if (!order) {
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

    // 2. Update order to PAID & COMPLETED atomik
    const currentMeta = (typeof order.metadata === 'object' && order.metadata) ? order.metadata : {};
    const updatedMeta = {
      ...currentMeta,
      payment_confirmation_source: 'MANUAL_CONFIRMATION',
      payment_source: 'MANUAL_CONFIRMATION',
      paid_at: paidAt,
      fulfillment_metadata: fulfillmentMeta,
      download_url: fulfillmentMeta.access_url || order.download_url || null,
    };

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        order_status: 'COMPLETED',
        paid_at: paidAt,
        fulfillment_metadata: fulfillmentMeta,
        download_url: fulfillmentMeta.access_url || order.download_url || null,
        metadata: updatedMeta,
        updated_at: paidAt,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[Quick-Paid Error]:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Failed to update order status: ' + updateErr.message },
        { status: 500 }
      );
    }

    // 2a. Record immutable audit trail in order_audit_logs (ARCHITECTURE.md §7.3)
    try {
      const clientIp =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('cf-connecting-ip') ||
        '127.0.0.1';
      const userAgent = req.headers.get('user-agent') || 'Dashboard/Merchant';

      await supabase.from('order_audit_logs').insert({
        order_id: String(order.id || orderId),
        tenant_id: order.tenant_id ? String(order.tenant_id) : null,
        tenant_slug: slug,
        actor_id: 'merchant_admin',
        action: 'QUICK_PAID_APPROVED',
        previous_status: String(order.status || order.payment_status || 'PENDING'),
        new_status: 'PAID',
        reason: 'Konfirmasi bayar manual oleh admin toko via Quick-Paid',
        ip_address: clientIp,
        user_agent: userAgent,
        metadata: {
          invoice_no: order.invoice_no || null,
          gross_amount: order.gross_amount || order.total_amount || 0,
          paid_at: paidAt,
        },
      });
    } catch (auditErr) {
      console.warn('[Quick-Paid] Non-fatal order_audit_logs note:', auditErr);
    }

    // Dispatch Affiliate & AM Commission Alert (Non-blocking)
    sendOrderCommissionAlert({
      orderId: String(orderId),
      tenantSlug: slug,
      tenantId: order.tenant_id,
      productTitle: order.product_title || 'Pesanan Produk',
      grossAmount: Number(order.gross_amount) || 0,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      affiliateCode: order.affiliate_code || order.metadata?.affiliate_code || null,
      directCommission: Number(order.affiliate_commission) || undefined,
    }).catch((notifErr) => {
      console.warn('[Quick-Paid] Non-fatal affiliate commission alert error:', notifErr);
    });

    // Dispatch Meta CAPI Purchase (EMQ Optimization 8.0+)
    dispatchMetaCAPIPurchaseForOrder(String(orderId), supabase)
      .then((capiRes) => {
        if (capiRes.success) {
          console.log(`[Quick-Paid] Meta CAPI Purchase successfully dispatched for order #${orderId}`);
        }
      })
      .catch((capiErr) => console.warn('[Quick-Paid] CAPI purchase dispatch note:', capiErr));

    // 2b. Update Langganan Tenant ke Tier jika order bertipe subscription platform
    if (order.is_subscription === true || order.product_type === 'SUBSCRIPTION' || order.metadata?.is_subscription === true) {
      try {
        const { data: tRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', slug)
          .maybeSingle();
        const meta = tRow?.metadata || {};
        meta.tier = 'CHECKOUT_LITE';
        meta.plan_tier = 'CHECKOUT_LITE';
        meta.subscription_status = 'ACTIVE';

        await supabase
          .from('tenants')
          .update({
            status: 'active',
            metadata: meta,
          })
          .eq('slug', slug);
      } catch (tierErr) {
        console.warn('[Quick-Paid Tier Sync Note]:', tierErr);
      }
    }

    // 3. Post auto-fulfillment notification to messages table
    const accessUrl = fulfillmentMeta.access_url || updatedOrder.download_url;
    const fulfillmentNotice = accessUrl
      ? `Akses materi digital Anda dapat dibuka di: ${accessUrl}`
      : 'Akses produk digital Anda sedang disiapkan oleh admin toko.';

    try {
      await supabase.from('messages').insert({
        tenant_slug: slug,
        ...(isValidUuid(orderId) ? { conversation_id: orderId } : {}),
        sender: 'System AI',
        channel: 'order_fulfillment',
        text: `Pembayaran pesanan #${orderId} (${order.product_title || 'Produk Digital'}) telah terverifikasi LUNAS (PAID). ${fulfillmentNotice}`,
      });
    } catch { }

    // 4. Kirim notifikasi WhatsApp akses produk ke customer_phone
    const customerPhone = order.customer_phone || order.phone || order.whatsapp_number;
    if (customerPhone) {
      sendOrderFulfillmentNotification({
        phone: customerPhone,
        customerName: order.customer_name || order.buyer_name || 'Pelanggan Setia',
        orderId: String(orderId),
        itemsSummary: order.product_title || order.product_name || 'Produk Pesanan',
        totalAmount: Number(order.gross_amount || order.total_amount || order.amount || 0),
        productType: order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL'),
        accessUrl: accessUrl || undefined,
        instructions: fulfillmentMeta.instructions || undefined,
        tenantId: slug || 'platform',
      }).catch((waErr) => console.warn('[WhatsApp WABA] Order fulfillment dispatch note:', waErr));
    }

    // 5. Dual Email Confirmation & Invoice Dispatch (Buyer Invoice + Merchant Alert)
    const effectiveBuyerEmail =
      order.customer_email ||
      order.email ||
      order.buyer_email ||
      order.metadata?.customer_email ||
      order.metadata?.email ||
      order.metadata?.buyer_email ||
      fulfillmentMeta.customer_email ||
      fulfillmentMeta.email ||
      null;

    try {
      const emailResult = await sendOrderFulfillmentEmails({
        orderId: String(orderId),
        tenantSlug: slug,
        tenantId: order.tenant_id,
        customerName: order.customer_name || order.buyer_name || 'Pelanggan Setia',
        customerEmail: effectiveBuyerEmail || null,
        customerPhone: customerPhone || null,
        productTitle: order.product_title || order.product_name || 'Pesanan Produk',
        grossAmount: Number(order.gross_amount || order.total_amount || order.amount || 0),
        paymentMethod: order.payment_method || 'QRIS Dinamis (Otomatis)',
        paidAt,
        accessUrl: accessUrl || undefined,
        instructions: fulfillmentMeta.instructions || undefined,
        productType: order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL'),
        forceBuyerEmail: effectiveBuyerEmail || undefined,
      });

      console.log('[Quick-Paid Route] Email dispatch completed:', {
        orderId,
        effectiveBuyerEmail,
        success: emailResult.success,
        buyerEmailSent: emailResult.buyerEmailSent,
        merchantEmailSent: emailResult.merchantEmailSent,
      });
    } catch (emailErr) {
      console.warn('[Quick-Paid Route] Order fulfillment email dispatch error:', emailErr);
    }

    dispatchOrderTelegramAlert({
      order: {
        id: orderId,
        tenant_id: order.tenant_id,
        tenant_slug: slug,
        product_title: order.product_title || order.product_name || 'Pesanan Produk',
        gross_amount: Number(order.gross_amount || order.total_amount || order.amount || 0),
        payment_method: order.payment_method || 'QRIS Dinamis (Otomatis)',
        customer_name: order.customer_name || order.buyer_name,
        customer_phone: customerPhone,
      },
      event: 'payment_confirmed',
      supabaseClient: supabase,
    }).catch((tgErr) => {
      console.warn('[Quick-Paid Route] Telegram alert note:', tgErr);
    });

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
