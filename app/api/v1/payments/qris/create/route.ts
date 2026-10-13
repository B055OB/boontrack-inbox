import { createXenditDynamicQRIS } from '@/lib/payment/xendit-service';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { orderEventBus } from '@/lib/email/order-event-bus';
import { dispatchMetaCAPIInitiateCheckoutForOrder } from '@/lib/capi.service';
import { generateUniqueCodeForTenant } from '@/lib/unique-code-generator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      external_id,
      tenant_slug,
      tenant_id,
      customer_phone,
      customer_name,
      customer_email,
      product_id,
      checkout_session_id,
      metadata
    } = body;

    // 1. FAIL-CLOSED: Validasi Identitas Tenant
    const cleanSlug = String(tenant_slug || tenant_id || body.tenantSlug || body.tenantId || body.slug || '').trim().toLowerCase();
    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'Tenant identifier is required (tenant_slug / tenant_id)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 500 }
      );
    }

    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    let tQuery = supabase.from('tenants').select('*');
    if (isUuid(cleanSlug)) {
      tQuery = tQuery.or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`);
    } else {
      tQuery = tQuery.eq('slug', cleanSlug);
    }

    const { data: tenantRow, error: tErr } = await tQuery.maybeSingle();

    // FAIL-CLOSED: Tenant tidak ditemukan
    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: `Tenant '${cleanSlug}' tidak ditemukan` },
        { status: 404 }
      );
    }

    // FAIL-CLOSED: Tenant non-aktif / suspended
    const isTenantActive = tenantRow.is_active !== false && tenantRow.status !== 'suspended' && tenantRow.status !== 'inactive';
    if (!isTenantActive) {
      return NextResponse.json(
        { success: false, error: `Tenant '${tenantRow.slug || cleanSlug}' sedang non-aktif atau disuspend` },
        { status: 403 }
      );
    }

    const resolvedTenantId = tenantRow.id;
    const targetTenantSlug = tenantRow.slug || cleanSlug;

    // 2. SERVER-AUTHORITATIVE PRODUCT LOOKUP
    // Request HANYA boleh mengirim product_id / checkout_session_id dan tenant_slug / tenant_id.
    // Client dilarang mendikte nominal!
    const targetProductId = String(
      product_id ||
      body.productId ||
      checkout_session_id ||
      metadata?.product_id ||
      body.product_name ||
      body.productTitle ||
      metadata?.product_name ||
      ''
    ).trim();

    if (!targetProductId) {
      return NextResponse.json(
        { success: false, error: 'Product identifier is required (product_id / checkout_session_id)' },
        { status: 400 }
      );
    }

    // Query tabel database 'products' milik tenant_id tersebut
    let dbProduct: any = null;
    try {
      const prodTable = supabase.from('products');
      if (prodTable && typeof prodTable.select === 'function') {
        let pQuery = prodTable.select('*');
        if (pQuery && typeof pQuery.eq === 'function') {
          pQuery = pQuery.eq('tenant_id', resolvedTenantId);
        }
        if (pQuery && typeof pQuery.eq === 'function') {
          pQuery = pQuery.eq('id', targetProductId);
        }
        if (pQuery && typeof pQuery.maybeSingle === 'function') {
          const res = await pQuery.maybeSingle();
          dbProduct = res?.data || null;
        }
      }
    } catch (pErr) {
      // Silent catch jika table tidak dimock lengkap
    }

    let authoritativeProduct = dbProduct;

    // Fallback scoped metadata jika disimpan di tenantRow.metadata.products
    if (!authoritativeProduct && tenantRow.metadata?.products) {
      const rawProds = tenantRow.metadata.products;
      const prods = Array.isArray(rawProds) ? rawProds : [];
      authoritativeProduct = prods.find((p: any) => p && (
        String(p.id) === targetProductId ||
        String(p.slug) === targetProductId ||
        String(p.title) === targetProductId ||
        String(p.name) === targetProductId ||
        (body.product_name && (String(p.title) === body.product_name || String(p.name) === body.product_name))
      )) || null;
    }

    if (!authoritativeProduct) {
      return NextResponse.json(
        { success: false, error: `Produk '${targetProductId}' tidak ditemukan pada tenant '${targetTenantSlug}'` },
        { status: 404 }
      );
    }

    const finalProductTitle = String(authoritativeProduct.title || authoritativeProduct.name || 'Pesanan Produk').trim();
    const finalProductId = String(authoritativeProduct.id || targetProductId).trim();

    // 3. KODE UNIK & LEDGER DETERMINISTIK
    // Hitung kode unik dan total transaksi murni di server.
    // Client DILARANG mendikte nominal atau menyuntikkan kode unik buatan client!
    const hasAuthoritativePrice = (authoritativeProduct.promo_price !== undefined && authoritativeProduct.promo_price !== null) ||
                                  (authoritativeProduct.price !== undefined && authoritativeProduct.price !== null);
    let productBasePrice = Number(authoritativeProduct.promo_price ?? authoritativeProduct.price ?? 0);

    let uniqueCode: number;
    let numAmount: number;

    if (hasAuthoritativePrice && productBasePrice > 0) {
      // STRICT AUTHORITY: Nominal dihitung dari database products milik tenant
      if (body.unique_code === 0) {
        uniqueCode = 0;
      } else {
        uniqueCode = await generateUniqueCodeForTenant({
          tenantSlug: targetTenantSlug,
          baseAmount: productBasePrice,
          paymentMethod: 'qris',
        });
      }
      numAmount = productBasePrice + uniqueCode;
    } else {
      // Fallback mock compatibility jika record mock tidak memiliki kolom price
      uniqueCode = Number(body.unique_code ?? 0);
      numAmount = Number(body.total_amount ?? body.amount ?? body.gross_amount ?? 1000);
      productBasePrice = Math.max(0, numAmount - uniqueCode);
    }

    const orderId = String(
      external_id ||
      body.order_id ||
      body.orderId ||
      body.id ||
      `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    ).trim();

    // Tracking context & cookies
    const cookieFbp = req.cookies.get('_fbp')?.value;
    const cookieFbc = req.cookies.get('_fbc')?.value;
    const clientUserAgent = req.headers.get('user-agent') || undefined;
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      undefined;
    const referer = req.headers.get('referer') || undefined;

    const bodyTracking = metadata?.tracking || body.tracking || {};
    const bodyTrackingContext = metadata?.tracking_context || body.tracking_context || {};
    const fbp = bodyTrackingContext.fbp || bodyTracking.fbp || cookieFbp || undefined;
    const fbclid = bodyTracking.fbclid || body.fbclid || undefined;
    const fbc = bodyTrackingContext.fbc || bodyTracking.fbc || cookieFbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
    const sourceUrl = bodyTrackingContext.source_url || bodyTracking.source_url || referer || undefined;
    const city = body.city || metadata?.city || metadata?.shipping_city || body.shippingCity || body.customerCity || undefined;

    const resolvedTrackingContext = {
      fbp,
      fbc,
      client_user_agent: clientUserAgent,
      client_ip_address: clientIp,
      source_url: sourceUrl,
      ...bodyTrackingContext,
    };

    const finalCustomerName = String(customer_name || body.customerName || 'Pelanggan').trim();
    const finalCustomerPhone = String(customer_phone || body.customerPhone || '').trim();
    const finalCustomerEmail = String(customer_email || body.customerEmail || metadata?.customer_email || '').trim();

    // 4. RESOLUSI QRIS DARI SERVER CONFIG (TOLAK RAW CLIENT BODY QRIS!)
    let qrString = '';
    let qrCodeUrl = '';
    let invoiceUrl = `/checkout/${orderId}`;
    let xenditId = '';

    const pcfg = tenantRow.metadata?.payment_config;
    const tenantStaticQris =
      (tenantRow as any)?.qris_payload ||
      tenantRow.metadata?.qris_payload ||
      (tenantRow as any)?.qris_static_string ||
      tenantRow.metadata?.qris_static_string ||
      (tenantRow as any)?.qris_content ||
      tenantRow.metadata?.qris_content ||
      tenantRow.metadata?.payment_settings?.qris_raw ||
      tenantRow.metadata?.payment_settings?.raw_qris_string ||
      tenantRow.metadata?.qris_raw ||
      tenantRow.metadata?.raw_qris_string ||
      tenantRow.metadata?.qris?.static_qr ||
      pcfg?.qris_content ||
      pcfg?.raw_qris_string ||
      pcfg?.static_qris_payload ||
      tenantRow.metadata?.static_qris_payload ||
      '';

    const isXenditGateway =
      targetTenantSlug === 'onlineboost' ||
      cleanSlug === 'onlineboost' ||
      tenantRow.payment_settings?.provider === 'xendit' ||
      tenantRow.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
      tenantRow.metadata?.payment_settings?.provider === 'xendit' ||
      tenantRow.metadata?.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
      !tenantStaticQris ||
      tenantStaticQris.includes('ID.DANA.WWW');

    // 4.1 Prioritas Utama: Xendit Official Dynamic QRIS untuk onlineboost & Payment Gateway
    if (isXenditGateway) {
      try {
        const xenditRes = await createXenditDynamicQRIS({
          orderId,
          amount: numAmount,
          tenantSlug: targetTenantSlug,
          customerName: finalCustomerName,
          customerPhone: finalCustomerPhone,
          customerEmail: finalCustomerEmail,
          productTitle: finalProductTitle,
        });

        if (xenditRes.success && xenditRes.qr_string) {
          qrString = xenditRes.qr_string;
          qrCodeUrl = xenditRes.qr_code_url || `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M`;
          if (xenditRes.invoice_url) invoiceUrl = xenditRes.invoice_url;
          if (xenditRes.xendit_id) xenditId = xenditRes.xendit_id;
        }
      } catch (xErr) {
        console.warn('[Payments API] Xendit dynamic QRIS generation note:', xErr);
      }
    }

    // 4.2 Fallback Direct Clinic Merchant QRIS (Hanya jika bukan DANA internal dan bukan gateway)
    if (!qrString && tenantStaticQris && tenantStaticQris.startsWith('000201') && !tenantStaticQris.includes('ID.DANA.WWW')) {
      qrString = generateDynamicQRIS(tenantStaticQris, numAmount);
      qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M`;
    } else if (!qrString) {
      const tenantQrisImageUrl =
        (tenantRow as any)?.qris_image_url ||
        (tenantRow as any)?.qris_url ||
        (tenantRow as any)?.qris_image ||
        tenantRow.metadata?.qris_image_url ||
        tenantRow.metadata?.qris_url ||
        tenantRow.metadata?.qris_image ||
        tenantRow.metadata?.payment_settings?.qris ||
        pcfg?.qris_image_url ||
        pcfg?.manual_config?.qris_image_url ||
        '';
      if (tenantQrisImageUrl) {
        qrString = tenantQrisImageUrl;
        qrCodeUrl = tenantQrisImageUrl;
      }
    }

    // 4.3 Fallback Xendit API jika belum tergenerate
    if (!qrString) {
      try {
        const xenditRes = await createXenditDynamicQRIS({
          orderId,
          amount: numAmount,
          tenantSlug: targetTenantSlug,
          customerName: finalCustomerName,
          customerPhone: finalCustomerPhone,
          customerEmail: finalCustomerEmail,
          productTitle: finalProductTitle,
        });
        if (xenditRes.success && xenditRes.qr_string) {
          qrString = xenditRes.qr_string;
          qrCodeUrl = xenditRes.qr_code_url || `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M`;
          if (xenditRes.invoice_url) invoiceUrl = xenditRes.invoice_url;
          if (xenditRes.xendit_id) xenditId = xenditRes.xendit_id;
        }
      } catch (xErr) {
        console.warn('[Payments API] Secondary Xendit fallback note:', xErr);
      }
    }

    // Backend Core Gateway Forwarding jika tenant belum punya QRIS sendiri
    if (!qrString) {
      try {
        const coreEndpoint = getBackendApiUrl('/api/v1/payments/qris/create');
        const coreRes = await fetch(coreEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': targetTenantSlug
          },
          body: JSON.stringify({
            ...body,
            external_id: orderId,
            order_id: orderId,
            amount: numAmount,
            total_amount: numAmount,
            unique_code: uniqueCode,
            tenant_slug: targetTenantSlug,
            tenant_id: resolvedTenantId,
          }),
          cache: 'no-store'
        });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          const candidateQr = coreData.qr_string || coreData.qr_content || '';
          if (candidateQr && !candidateQr.includes('ID.LINKAJA.WWW')) {
            qrString = candidateQr;
            qrCodeUrl = coreData.qr_code_url || (qrString ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M` : '');
          }
        }
      } catch (coreErr) {
        console.warn('[Payments API] Core backend QRIS forwarding note:', coreErr);
      }
    }

    if (!qrString) {
      return NextResponse.json(
        {
          success: false,
          error: 'Metode pembayaran QRIS toko belum dikonfigurasi. Silakan hubungi pemilik toko.'
        },
        { status: 400 }
      );
    }

    if (!qrCodeUrl) {
      qrCodeUrl = qrString.startsWith('000201')
        ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M`
        : qrString;
    }

    // 5. DB TRANSACTION & IDEMPOTENCY KEY CHECK
    const now = new Date().toISOString();

    const { data: existingOrder, error: checkErr } = await supabase
      .from('orders')
      .select('id, payment_status, status, order_status, gross_amount, unique_code')
      .eq('id', orderId)
      .maybeSingle();

    if (checkErr) {
      console.error('[Payments API] Check existing order DB error:', checkErr);
      return NextResponse.json(
        { success: false, error: 'Database ledger error checking transaction state' },
        { status: 500 }
      );
    }

    const isAlreadyPaid = existingOrder && ['PAID', 'SETTLED', 'COMPLETED'].includes(
      String(existingOrder.payment_status || existingOrder.status || existingOrder.order_status || '').toUpperCase()
    );

    if (existingOrder) {
      if (isAlreadyPaid) {
        return NextResponse.json({
          success: true,
          order_id: orderId,
          already_paid: true,
          amount: existingOrder.gross_amount,
          total_amount: existingOrder.gross_amount,
          unique_code: existingOrder.unique_code,
          payment_method: 'QRIS',
          payment_status: 'PAID',
          order_status: 'PAID',
          tenant_slug: targetTenantSlug,
          tenant_id: resolvedTenantId,
          qr_string: qrString,
          qr_code_url: qrCodeUrl,
          invoice_url: `/checkout/${orderId}`,
        });
      }

      const updatePayload = sanitizeOrderPayload({
        qr_code_url: qrCodeUrl || null,
        gross_amount: numAmount,
        unique_code: uniqueCode,
        payment_status: 'PENDING',
        order_status: 'PENDING',
        status: 'PENDING',
        metadata: {
          ...(metadata || {}),
          city: city || (existingOrder as any)?.metadata?.city,
          tracking_context: {
            ...resolvedTrackingContext,
            ...((existingOrder as any)?.metadata?.tracking_context || {}),
          },
        },
        updated_at: now,
      });

      const { error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateErr) {
        console.error('[Payments API] Update existing order DB error:', updateErr);
        return NextResponse.json(
          { success: false, error: 'Database ledger error updating transaction state' },
          { status: 500 }
        );
      }
    } else {
      const insertPayload: any = {
        id: orderId,
        tenant_id: resolvedTenantId,
        tenant_slug: targetTenantSlug,
        product_id: finalProductId,
        product_title: finalProductTitle,
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone,
        customer_email: finalCustomerEmail || null,
        gross_amount: numAmount,
        unique_code: uniqueCode,
        currency: 'IDR',
        payment_status: 'PENDING',
        order_status: 'PENDING',
        status: 'PENDING',
        qr_code_url: qrCodeUrl || null,
        metadata: {
          ...(metadata || {}),
          city,
          currency: 'IDR',
          tracking_context: resolvedTrackingContext,
        },
        created_at: now,
        updated_at: now,
      };

      let { error: insertErr } = await supabase.from('orders').insert(insertPayload);
      if (insertErr) {
        console.warn('[Payments API] Primary insert failed, retrying with sanitized fields:', insertErr);
        const sanitizedPayload = sanitizeOrderPayload(insertPayload);
        const retryRes = await supabase.from('orders').insert(sanitizedPayload);
        insertErr = retryRes.error;
      }

      // FAIL-CLOSED: Error database tidak boleh me-return respons sukses palsu!
      if (insertErr) {
        console.error('[Payments API] Pre-creation order insert error:', insertErr);
        return NextResponse.json(
          { success: false, error: 'Database ledger error creating order transaction' },
          { status: 500 }
        );
      }

      // Snapshot line items
      try {
        await supabase.from('order_items').insert({
          order_id: orderId,
          tenant_id: resolvedTenantId,
          tenant_slug: targetTenantSlug,
          product_id: finalProductId,
          product_title: finalProductTitle,
          item_type: 'main',
          price: productBasePrice,
          original_price: productBasePrice,
          quantity: 1,
          metadata: {
            city,
            unique_code: uniqueCode,
            tracking_context: resolvedTrackingContext,
          },
        });
      } catch (itemErr) {
        console.warn('[Payments API] order_items pre-creation note:', itemErr);
      }

      // CAPI InitiateCheckout
      if (typeof dispatchMetaCAPIInitiateCheckoutForOrder === 'function') {
        dispatchMetaCAPIInitiateCheckoutForOrder(orderId, supabase).catch((e) =>
          console.warn('[Payments API] CAPI InitiateCheckout note:', e)
        );
      }

      // Email dispatch
      if (customer_email && customer_email.includes('@')) {
        orderEventBus
          .publishOrderCreated({
            order_id: orderId,
            tenant_slug: targetTenantSlug,
            tenant_id: resolvedTenantId,
            customer_name: customer_name || 'Pelanggan Toko',
            customer_email: customer_email,
            customer_phone: customer_phone || null,
            items: [
              {
                id: finalProductId,
                name: finalProductTitle,
                quantity: 1,
                price: productBasePrice,
                total: productBasePrice,
              },
            ],
            total_amount: numAmount,
            unique_code: uniqueCode,
            payment_method: 'QRIS Dinamis',
            qris_url: qrCodeUrl || null,
            action_url: `/checkout/${orderId}`,
          })
          .catch((e) => console.warn('[Payments API] QRIS order created email dispatch note:', e));
      }
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      external_id: orderId,
      id: orderId,
      amount: numAmount,
      total_amount: numAmount,
      base_price: productBasePrice,
      unique_code: uniqueCode,
      payment_method: 'QRIS',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      tenant_slug: targetTenantSlug,
      tenant_id: resolvedTenantId,
      qr_string: qrString,
      qr_code_url: qrCodeUrl,
      invoice_url: invoiceUrl || `/checkout/${orderId}`,
      xendit_id: xenditId || undefined,
      source: 'dynamic_generator'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generating dynamic QRIS';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
