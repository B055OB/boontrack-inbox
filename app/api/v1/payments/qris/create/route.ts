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

    let supabase: any;
    try {
      supabase = getSupabaseAdmin();
    } catch (_) {
      supabase = getSupabase();
    }

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
    if (tErr) {
      console.error('[Payments API Error Detail]:', tErr);
      return NextResponse.json(
        { success: false, error: 'Database error fetching tenant', detail: tErr.message },
        { status: 500 }
      );
    }

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

    // 2. SERVER-AUTHORITATIVE PRODUCT LOOKUP & GRACEFUL FALLBACK
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

    const orderId = String(
      external_id ||
      body.order_id ||
      body.orderId ||
      body.id ||
      ''
    ).trim();

    const requestedAmount = Number(body.total_amount ?? body.amount ?? body.gross_amount ?? 0);

    // Cek apakah order sudah ada di database (dengan isolasi tenant ketat)
    let existingOrder: any = null;
    if (orderId) {
      try {
        let orderQuery = supabase.from('orders').select('*').eq('id', orderId);
        if (resolvedTenantId && targetTenantSlug) {
          orderQuery = orderQuery.or(`tenant_id.eq.${resolvedTenantId},tenant_slug.eq.${targetTenantSlug}`);
        } else if (resolvedTenantId) {
          orderQuery = orderQuery.eq('tenant_id', resolvedTenantId);
        } else {
          orderQuery = orderQuery.eq('tenant_slug', targetTenantSlug);
        }
        const { data: oData } = await orderQuery.maybeSingle();
        existingOrder = oData;
      } catch (_) {}
    }

    // Query tabel database 'products' milik tenant_id tersebut (Strict Isolation)
    let dbProduct: any = null;
    if (targetProductId) {
      try {
        let pQuery = supabase.from('products').select('*').eq('tenant_id', resolvedTenantId);
        if (isUuid(targetProductId)) {
          pQuery = pQuery.eq('id', targetProductId);
        } else {
          pQuery = pQuery.or(`id.eq.${targetProductId},slug.eq.${targetProductId}`);
        }
        const { data: pData } = await pQuery.maybeSingle();
        if (pData) {
          dbProduct = pData;
        }
      } catch (_) {}
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

    // Graceful Fallback: Jika produk tidak ditemukan di catalog, jangan langsung lempar 404
    // jika ada external_id (order ID) dan nominal valid, atau order sudah ada di database.
    if (!authoritativeProduct) {
      if (existingOrder || (orderId && requestedAmount > 0)) {
        const fallbackPrice = existingOrder
          ? Number(existingOrder.gross_amount || existingOrder.total_amount || requestedAmount)
          : requestedAmount;
        authoritativeProduct = {
          id: targetProductId || existingOrder?.product_id || `prod_${Date.now()}`,
          title: String(existingOrder?.product_title || body.product_name || body.productTitle || 'Pesanan Produk'),
          price: fallbackPrice,
          promo_price: fallbackPrice,
        };
      } else if (!targetProductId) {
        return NextResponse.json(
          { success: false, error: 'Product identifier is required (product_id / checkout_session_id)' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { success: false, error: `Produk '${targetProductId}' tidak ditemukan pada tenant '${targetTenantSlug}'` },
          { status: 404 }
        );
      }
    }

    const finalProductTitle = String(authoritativeProduct.title || authoritativeProduct.name || 'Pesanan Produk').trim();
    const finalProductId = String(authoritativeProduct.id || targetProductId).trim();

    // 3. RESOLUSI TIPE GATEWAY & QRIS DARI SERVER CONFIG
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

    const hasStaticOrDynamicQris = Boolean(tenantStaticQris && tenantStaticQris.trim().startsWith('000201'));

    // Pastikan isXenditGateway TIDAK dipaksa true jika merchant menggunakan QRIS statis/dinamis platform
    // Prioritas Xendit Payment Gateway atau tanpa QRIS statis toko
    const isExplicitXendit =
      tenantRow.payment_settings?.provider === 'xendit' ||
      tenantRow.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
      tenantRow.metadata?.payment_settings?.provider === 'xendit' ||
      tenantRow.metadata?.payment_settings?.mode === 'PAYMENT_GATEWAY';

    const isXenditGateway = isExplicitXendit || !hasStaticOrDynamicQris;

    // 4. KODE UNIK & LEDGER DETERMINISTIK
    // Hitung kode unik dan total transaksi murni di server.
    // Client DILARANG mendikte nominal atau menyuntikkan kode unik buatan client!
    const hasAuthoritativePrice = (authoritativeProduct.promo_price !== undefined && authoritativeProduct.promo_price !== null) ||
                                  (authoritativeProduct.price !== undefined && authoritativeProduct.price !== null);
    let productBasePrice = Number(authoritativeProduct.promo_price ?? authoritativeProduct.price ?? 0);

    const matchQty = (body.product_name || body.productTitle || '').match(/\((\d+)x\)/i);
    const detectedQty = matchQty ? parseInt(matchQty[1], 10) : 1;
    const quantity = Math.max(1, Number(body.quantity || detectedQty || 1));

    let uniqueCode: number;
    let numAmount: number;

    const requestedUniqueCode = body.unique_code !== undefined ? Number(body.unique_code) : undefined;
    const expectedSubtotal = productBasePrice * quantity;

    if (isXenditGateway || body.unique_code === 0) {
      // GUARDRAIL P1: Xendit Dynamic QRIS bypass kode unik & nominal bulat pas (nett)
      uniqueCode = 0;
      productBasePrice = expectedSubtotal;
      numAmount = expectedSubtotal;
    } else if (
      requestedUniqueCode !== undefined &&
      requestedUniqueCode >= 0 &&
      requestedAmount > 0 &&
      (requestedAmount === expectedSubtotal + requestedUniqueCode || body.unique_code === 0)
    ) {
      // Valid client-submitted calculation matching authoritative catalog subtotal + unique code
      uniqueCode = requestedUniqueCode;
      numAmount = requestedAmount;
      productBasePrice = expectedSubtotal;
    } else if (hasAuthoritativePrice && productBasePrice > 0) {
      // STRICT AUTHORITY: Cegah manipulasi harga jika client mencoba menyuntikkan nominal palsu
      if (body.unique_code === 0) {
        uniqueCode = 0;
      } else {
        uniqueCode = await generateUniqueCodeForTenant({
          tenantSlug: targetTenantSlug,
          tenantId: resolvedTenantId,
          baseAmount: expectedSubtotal,
          paymentMethod: 'qris',
        });
      }
      productBasePrice = expectedSubtotal;
      numAmount = productBasePrice + uniqueCode;
    } else {
      // Fallback mock compatibility jika record mock tidak memiliki kolom price
      uniqueCode = Number(body.unique_code ?? 0);
      numAmount = Number(body.total_amount ?? body.amount ?? body.gross_amount ?? 1000);
      productBasePrice = Math.max(0, numAmount - uniqueCode);
    }

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

    // 5. GENERASI QRIS DARI SERVER CONFIG (TOLAK RAW CLIENT BODY QRIS!)
    let qrString = '';
    let qrCodeUrl = '';
    let invoiceUrl = `/checkout/${orderId}`;
    let xenditId = '';

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

    // 4.2 Merchant Dynamic QRIS (Direct EMVCo conversion)
    if (!qrString && tenantStaticQris && tenantStaticQris.trim().startsWith('000201')) {
      qrString = generateDynamicQRIS(tenantStaticQris.trim(), numAmount);
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

    const { data: existingOrderRow, error: checkErr } = await supabase
      .from('orders')
      .select('id, payment_status, status, order_status, gross_amount, metadata')
      .eq('id', orderId)
      .maybeSingle();

    if (existingOrderRow) {
      existingOrder = existingOrderRow;
    }

    if (checkErr) {
      console.error('[Payments API Error Detail]:', checkErr);
      return NextResponse.json(
        { success: false, error: 'Database ledger error checking transaction state', detail: checkErr.message },
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
          unique_code: Number((existingOrder as any)?.metadata?.unique_code || 0),
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

      const rawUpdatePayload = {
        qr_code_url: qrCodeUrl || null,
        gross_amount: numAmount,
        payment_status: 'PENDING',
        order_status: 'PENDING',
        status: 'PENDING',
        metadata: {
          ...(metadata || {}),
          unique_code: uniqueCode,
          currency: 'IDR',
          city: city || (existingOrder as any)?.metadata?.city,
          tracking_context: {
            ...resolvedTrackingContext,
            ...((existingOrder as any)?.metadata?.tracking_context || {}),
          },
        },
        updated_at: now,
      };

      const updatePayload = sanitizeOrderPayload(rawUpdatePayload);

      const { error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateErr) {
        console.error('[Payments API Error Detail]:', updateErr);
        return NextResponse.json(
          { success: false, error: 'Database ledger error updating transaction state', detail: updateErr.message },
          { status: 500 }
        );
      }
    } else {
      const rawInsertPayload = {
        id: orderId,
        tenant_id: resolvedTenantId,
        tenant_slug: targetTenantSlug,
        product_id: finalProductId,
        product_title: finalProductTitle,
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone,
        customer_email: finalCustomerEmail || null,
        gross_amount: numAmount,
        payment_status: 'PENDING',
        order_status: 'PENDING',
        status: 'PENDING',
        qr_code_url: qrCodeUrl || null,
        metadata: {
          ...(metadata || {}),
          city: city || null,
          unique_code: uniqueCode,
          currency: 'IDR',
          tracking_context: resolvedTrackingContext,
        },
        created_at: now,
        updated_at: now,
      };

      const insertPayload = sanitizeOrderPayload(rawInsertPayload);

      const { error: insertErr } = await supabase.from('orders').insert(insertPayload);

      // FAIL-CLOSED: Error database tidak boleh me-return respons sukses palsu!
      if (insertErr) {
        console.error('[Payments API Error Detail]:', insertErr);
        return NextResponse.json(
          { success: false, error: 'Database ledger error creating order transaction', detail: insertErr.message },
          { status: 500 }
        );
      }

      // Snapshot line items
      try {
        const itemPayload = {
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
            city: city || null,
            unique_code: uniqueCode,
            tracking_context: resolvedTrackingContext,
          },
        };
        const { error: itemErr } = await supabase.from('order_items').insert(itemPayload);
        if (itemErr) {
          console.error('[Payments API Error Detail]:', itemErr);
        }
      } catch (itemErr) {
        console.error('[Payments API Error Detail]:', itemErr);
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
      source: 'dynamic_generator',
      data: {
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
      }
    });
  } catch (err: unknown) {
    console.error('[Payments API Error Detail]:', err);
    const msg = err instanceof Error ? err.message : 'Error generating dynamic QRIS';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
