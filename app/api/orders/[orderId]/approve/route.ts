import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { enqueueCAPIOutboxEvent, processCAPIOutboxQueue } from '@/lib/capi-outbox';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';
import { sendOrderFulfillmentEmails } from '@/lib/email-service';
import { dispatchOrderTelegramAlert } from '@/lib/telegram/telegram-dispatcher';
import { recordResellerCommissionOnCanonicalEvent } from '@/lib/store-reseller';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId?: string; id?: string }> }
) {
  try {
    const { orderId: paramOrderId, id: paramId } = await params;
    const orderId = String(paramOrderId || paramId || '').trim();

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

    // 1. Fetch current order with flexible lookup
    let order: any = null;
    try {
      const { data: matchedOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${orderId},order_number.eq.${orderId}`)
        .maybeSingle();
      if (matchedOrder) order = matchedOrder;
    } catch {}

    if (!order) {
      try {
        const { data: byId } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .maybeSingle();
        if (byId) order = byId;
      } catch {}
    }

    if (!order) {
      try {
        const { data: byOrderNum } = await supabase
          .from('orders')
          .select('*')
          .eq('order_number', orderId)
          .maybeSingle();
        if (byOrderNum) order = byOrderNum;
      } catch {}
    }

    if (!order) {
      try {
        const { data: byCorrelation } = await supabase
          .from('orders')
          .select('*')
          .eq('correlation_id', orderId)
          .maybeSingle();
        if (byCorrelation) order = byCorrelation;
      } catch {}
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found` },
        { status: 404 }
      );
    }

    const paidAt = new Date().toISOString();
    let fulfillmentMeta = order.fulfillment_metadata || {};

    // If fulfillment access_url not set, attempt to resolve from catalog (products table & tenant metadata)
    if (!fulfillmentMeta.access_url && !order.download_url) {
      try {
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

        // Single Source of Truth Fallback: tenants.metadata.products
        const targetSlug = order.tenant_slug || order.tenant_id;
        if (!fulfillmentMeta.access_url && targetSlug) {
          const tenantQuery = supabase.from('tenants').select('metadata');
          const { data: tenantRow } = typeof (tenantQuery as any).or === 'function'
            ? await (tenantQuery as any).or(`slug.eq.${targetSlug},id.eq.${targetSlug}`).maybeSingle()
            : await tenantQuery.eq('slug', targetSlug).maybeSingle();

          const prods = tenantRow?.metadata?.products;
          if (Array.isArray(prods)) {
            const matched = prods.find((p: any) =>
              (order.product_id && (p.id === order.product_id || p.slug === order.product_id)) ||
              (order.product_title && p.title?.toLowerCase() === order.product_title.toLowerCase()) ||
              p.title?.toLowerCase().includes('ctwa')
            );
            const tenantAccess =
              matched?.link_digital ||
              matched?.fulfillment_metadata?.access_url ||
              matched?.download_url ||
              matched?.asset_reference;

            if (tenantAccess) {
              fulfillmentMeta = {
                ...fulfillmentMeta,
                delivery_type: 'DOWNLOAD_LINK',
                access_url: tenantAccess,
                instructions:
                  matched?.fulfillment_metadata?.instructions ||
                  'Akses materi digital Anda telah aktif secara instan.',
              };
            }
          }
        }
      } catch (catErr) {
        console.warn('[Approve Order API] Catalog access resolution note:', catErr);
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
      console.error('[Approve Order API] Error updating status:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Gagal memperbarui status pesanan: ' + updateErr.message },
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

      const auditTable = supabase.from('order_audit_logs');
      if (auditTable && typeof auditTable.insert === 'function') {
        await auditTable.insert({
          order_id: String(order.id || orderId),
          tenant_id: order.tenant_id ? String(order.tenant_id) : null,
          tenant_slug: order.tenant_slug || null,
          actor_id: 'merchant_admin',
          action: 'ORDER_APPROVED_PAID',
          previous_status: String(order.status || order.payment_status || 'PENDING'),
          new_status: 'PAID',
          reason: 'Approval bukti bayar manual via API approve order',
          ip_address: clientIp,
          user_agent: userAgent,
          metadata: {
            invoice_no: order.invoice_no || null,
            gross_amount: order.gross_amount || order.total_amount || 0,
            paid_at: paidAt,
          },
        });
      }
    } catch (auditErr) {
      console.warn('[Approve Order API] Non-fatal order_audit_logs note:', auditErr);
    }

    const accessUrl = fulfillmentMeta.access_url || updatedOrder.download_url;
    const customerPhone = order.customer_phone || order.phone || order.whatsapp_number;
    const tenantSlug = order.tenant_slug || 'platform';
    const customerEmail =
      order.customer_email ||
      order.email ||
      order.buyer_email ||
      order.metadata?.customer_email ||
      order.metadata?.email ||
      order.metadata?.buyer_email ||
      fulfillmentMeta.customer_email ||
      fulfillmentMeta.email ||
      null;

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

    // 4. Deterministic Dual Transactional Emails Dispatch (Buyer Receipt + Merchant Alert)
    console.log(`[Approve Order API] Initiating deterministic email dispatch for order #${orderId}, buyer: ${customerEmail || '(no-email)'}, accessUrl: ${accessUrl ? 'available' : 'none'}`);
    let emailResult = { success: false, buyerEmailSent: false, merchantEmailSent: false, errors: [] as string[] };
    try {
      emailResult = await sendOrderFulfillmentEmails({
        orderId: String(orderId),
        tenantSlug,
        tenantId: order.tenant_id,
        customerName: order.customer_name || order.buyer_name || 'Pelanggan Setia',
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        productTitle: order.product_title || 'Pesanan Produk',
        grossAmount: Number(order.gross_amount || order.total_amount || 0),
        paymentMethod: order.payment_method || 'QRIS Dinamis (Otomatis)',
        paidAt,
        accessUrl: accessUrl || undefined,
        instructions: fulfillmentMeta.instructions || undefined,
        productType: order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL'),
        forceBuyerEmail: customerEmail || undefined,
      });

      console.log('[Approve Order API] Email dispatch completed:', {
        orderId,
        customerEmail,
        success: emailResult.success,
        buyerEmailSent: emailResult.buyerEmailSent,
        merchantEmailSent: emailResult.merchantEmailSent,
        errors: emailResult.errors,
      });
    } catch (emailErr: any) {
      console.error('[Approve Order API] Fatal exception during email fulfillment dispatch:', emailErr);
    }

    // 5. Transactional Outbox Pattern: Enqueue Adtech CAPI Purchase Event (Single Purchase Event)
    await enqueueCAPIOutboxEvent({
      orderId: String(orderId),
      tenantId: order.tenant_id || tenantSlug,
      tenantSlug,
      eventName: 'Purchase',
      grossAmount: Number(order.gross_amount || order.total_amount || 0),
      currency: 'IDR',
      customPayload: {
        customer_name: order.customer_name,
        customer_phone: customerPhone,
        customer_email: order.customer_email,
        product_title: order.product_title,
        ...(order.reseller_code ? {
          reseller_code: order.reseller_code,
          reseller_id: order.reseller_id,
          reseller_attribution_id: order.reseller_attribution_id,
        } : {}),
      },
    }, supabase);

    // 5b. Reseller Commission Snapshot on PAYMENT_CONFIRMED (Canonical Financial Event)
    const effectiveResellerCode = order.reseller_code || order.metadata?.reseller_code;
    if (effectiveResellerCode && order.tenant_id) {
      try {
        const { data: resellerData } = await supabase
          .from('store_resellers')
          .select('id, commission_type, commission_value')
          .eq('tenant_id', order.tenant_id)
          .ilike('code', effectiveResellerCode)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (resellerData) {
          await recordResellerCommissionOnCanonicalEvent({
            tenantId: order.tenant_id,
            orderId: String(orderId),
            resellerId: resellerData.id,
            commissionBase: Number(order.net_product_price || order.gross_amount || 0),
            commissionType: resellerData.commission_type || 'PERCENTAGE',
            commissionValue: Number(resellerData.commission_value || 0),
            supabaseClient: supabase,
          });
        }
      } catch (resellerErr) {
        console.warn('[Approve Order API] Reseller commission calculation note:', resellerErr);
      }
    }

    // Trigger durable background processing
    processCAPIOutboxQueue(5, supabase).catch((outboxErr) => {
      console.warn('[Approve Order] CAPI Outbox worker note:', outboxErr);
    });

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

    dispatchOrderTelegramAlert({
      order: {
        id: orderId,
        tenant_id: order.tenant_id,
        tenant_slug: tenantSlug,
        product_title: order.product_title || 'Pesanan Produk',
        gross_amount: Number(order.gross_amount) || 0,
        payment_method: order.payment_method || 'QRIS Dinamis',
        customer_name: order.customer_name || order.buyer_name,
        customer_phone: customerPhone,
      },
      event: 'payment_confirmed',
      supabaseClient: supabase,
    }).catch((tgErr) => {
      console.warn('[Approve Order API] Telegram alert note:', tgErr);
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      email_dispatched: Boolean(emailResult?.success || emailResult?.buyerEmailSent),
      message: 'Pesanan berhasil disetujui (PAID) dan notifikasi multi-channel terkirim.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
