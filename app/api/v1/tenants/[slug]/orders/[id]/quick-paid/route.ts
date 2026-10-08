import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { sendOrderPaidNotification, sendOrderFulfillmentNotification } from '@/lib/whatsapp';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';
import { dispatchMetaCAPIPurchaseForOrder } from '@/lib/capi.service';
import { sendOrderFulfillmentEmails } from '@/lib/email-service';
import { dispatchOrderTelegramAlert } from '@/lib/telegram/telegram-dispatcher';
import { recordResellerCommissionOnCanonicalEvent } from '@/lib/store-reseller';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: rawOrderId } = await params;
    const cleanRawSlug = typeof rawSlug === 'string' ? decodeURIComponent(rawSlug).trim() : '';
    const slug = normalizeTenantSlug(cleanRawSlug || '');

    const orderIdentifier = typeof rawOrderId === 'string'
      ? decodeURIComponent(rawOrderId).replace(/^#/, '').trim()
      : '';
    const orderId = orderIdentifier;

    if (!orderIdentifier) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const cleanCookie = (val?: string) => {
      if (!val) return '';
      try {
        return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
      } catch {
        return val.toLowerCase().trim();
      }
    };

    const tenantSlugFromSession =
      cleanCookie(req.cookies.get('merchant_store')?.value) ||
      cleanCookie(req.cookies.get('merchant_session')?.value) ||
      cleanCookie(req.cookies.get('bt_tenant')?.value) ||
      slug ||
      '';

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database admin client unreachable' },
        { status: 500 }
      );
    }

    // 1. Fetch current order with flexible lookup
    // Pastikan query pencarian mencari id ATAU order_number: .or(`id.eq.${orderIdentifier},order_number.eq.${orderIdentifier}`)
    let order: any = null;
    let searchErr: any = null;

    try {
      const { data: matchedOrder, error: orErr } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${orderIdentifier},order_number.eq.${orderIdentifier}`)
        .maybeSingle();

      if (matchedOrder && !orErr) {
        order = matchedOrder;
      } else if (orErr) {
        searchErr = orErr;
        console.warn('[Quick-Paid] Combined .or lookup note:', orErr);
      }
    } catch (e: any) {
      searchErr = e;
      console.warn('[Quick-Paid] Combined .or lookup exception:', e);
    }

    // Resilient Fallback 1: Direct eq('id') lookup (handles cases where .or syntax had Postgres type casting issues)
    if (!order) {
      try {
        const { data: byId, error: idErr } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderIdentifier)
          .maybeSingle();

        if (byId && !idErr) {
          order = byId;
          searchErr = null;
        }
      } catch (e: any) {
        console.warn('[Quick-Paid] Direct id lookup exception:', e);
      }
    }

    // Resilient Fallback 2: Direct eq('order_number') lookup
    if (!order) {
      try {
        const { data: byOrderNum, error: orderNumErr } = await supabase
          .from('orders')
          .select('*')
          .eq('order_number', orderIdentifier)
          .maybeSingle();

        if (byOrderNum && !orderNumErr) {
          order = byOrderNum;
          searchErr = null;
        }
      } catch (e: any) {
        console.warn('[Quick-Paid] Direct order_number lookup exception:', e);
      }
    }

    // Resilient Fallback 3: Correlation ID lookup (e.g. payment token)
    if (!order) {
      try {
        const { data: byCorrelation, error: corrErr } = await supabase
          .from('orders')
          .select('*')
          .eq('correlation_id', orderIdentifier)
          .maybeSingle();

        if (byCorrelation && !corrErr) {
          order = byCorrelation;
          searchErr = null;
        }
      } catch (e: any) {
        console.warn('[Quick-Paid] Direct correlation_id lookup exception:', e);
      }
    }

    // Secondary fallback: Scoped by tenant_slug if tenant isolation required
    if (!order && (slug || tenantSlugFromSession)) {
      const scopeSlug = slug || tenantSlugFromSession;
      try {
        const { data: bySlug } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_slug', scopeSlug)
          .or(`id.eq.${orderIdentifier},order_number.eq.${orderIdentifier}`)
          .maybeSingle();

        if (bySlug) {
          order = bySlug;
          searchErr = null;
        }
      } catch {}
    }

    // Diagnostic logging detail as required
    const orderFound = Boolean(order);
    console.log('[DEBUG QUICK-PAID]', { orderIdentifier, tenantSlugFromSession, orderFound });

    if (!order) {
      console.warn('[Quick-Paid] Order not found in database:', { orderIdentifier, tenantSlugFromSession, searchErr });
      return NextResponse.json(
        {
          success: false,
          error: `Order not found: ${orderIdentifier}${searchErr ? ' (' + (searchErr.message || searchErr) + ')' : ''}`,
        },
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

    const updateQuery = supabase
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
      .select('*');

    const { data: updateRes, error: updateErr } = typeof (updateQuery as any)?.maybeSingle === 'function'
      ? await (updateQuery as any).maybeSingle()
      : typeof (updateQuery as any)?.single === 'function'
      ? await (updateQuery as any).single()
      : await updateQuery;

    if (updateErr) {
      console.error('[Quick-Paid Error]:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Failed to update order status: ' + (updateErr.message || JSON.stringify(updateErr)) },
        { status: 500 }
      );
    }

    const updatedOrder = (Array.isArray(updateRes) ? updateRes[0] : updateRes) || null;

    const effectiveUpdatedOrder = updatedOrder || {
      ...order,
      status: 'PAID',
      payment_status: 'PAID',
      order_status: 'COMPLETED',
      paid_at: paidAt,
      fulfillment_metadata: fulfillmentMeta,
      download_url: fulfillmentMeta.access_url || order.download_url || null,
      metadata: updatedMeta,
      updated_at: paidAt,
    };

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

    // Reseller Commission Snapshot on PAYMENT_CONFIRMED (Canonical Financial Event)
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
            orderId: String(order.id || orderId),
            resellerId: resellerData.id,
            commissionBase: Number(order.net_product_price || order.gross_amount || 0),
            commissionType: resellerData.commission_type || 'PERCENTAGE',
            commissionValue: Number(resellerData.commission_value || 0),
            supabaseClient: supabase,
          });
        }
      } catch (resellerErr) {
        console.warn('[Quick-Paid] Reseller commission calculation note:', resellerErr);
      }
    }

    // Dispatch Meta CAPI Purchase (EMQ Optimization 8.0+)
    dispatchMetaCAPIPurchaseForOrder(String(order.id || orderId), supabase)
      .then((capiRes) => {
        if (capiRes.success) {
          console.log(`[Quick-Paid] Meta CAPI Purchase successfully dispatched for order #${order.id || orderId}`);
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
    const accessUrl = fulfillmentMeta.access_url || effectiveUpdatedOrder.download_url;
    const fulfillmentNotice = accessUrl
      ? `Akses materi digital Anda dapat dibuka di: ${accessUrl}`
      : 'Akses produk digital Anda sedang disiapkan oleh admin toko.';

    const linkedConversationId =
      order.metadata?.conversation_id ||
      (order.conversation_id && isValidUuid(order.conversation_id) ? order.conversation_id : null) ||
      (isValidUuid(orderId) ? orderId : null);

    try {
      await supabase.from('messages').insert({
        tenant_slug: slug,
        tenant_id: order.tenant_id,
        ...(linkedConversationId ? { conversation_id: linkedConversationId } : {}),
        sender: 'System AI',
        sender_type: 'system',
        channel: 'order_fulfillment',
        text: `Pembayaran pesanan #${orderId} (${order.product_title || 'Produk Digital'}) telah terverifikasi LUNAS (PAID). ${fulfillmentNotice}`,
        created_at: paidAt,
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
      order: effectiveUpdatedOrder,
      message: 'Pesanan berhasil ditandai LUNAS (PAID) dan akses digital diaktifkan.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
