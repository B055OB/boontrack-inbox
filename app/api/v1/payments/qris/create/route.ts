import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      external_id,
      amount,
      total_amount,
      tenant_slug,
      tenant_id,
      customer_phone,
      customer_name,
      customer_email,
      product_name,
      product_id,
      metadata
    } = body;

    const orderId = String(
      external_id ||
      body.order_id ||
      body.orderId ||
      body.id ||
      `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    ).trim();

    const cleanSlug = String(tenant_slug || body.tenantSlug || body.slug || '').trim().toLowerCase();

    // a. Hitung total transfer (Harga Produk + Kode Unik 3 digit)
    const uniqueCode = Number(
      body.unique_code ??
      body.uniqueCode ??
      metadata?.unique_code ??
      Math.floor(100 + Math.random() * 900)
    );

    let numAmount = Number(total_amount ?? amount ?? body.gross_amount ?? 0);
    if (!numAmount && (body.base_price || metadata?.base_price)) {
      const base = Number(body.base_price || metadata?.base_price);
      numAmount = Math.max(1000, base - uniqueCode);
    }
    if (!numAmount) {
      numAmount = 1000;
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    let resolvedTenantId: string | null = tenant_id || metadata?.tenant_id || null;
    let targetTenantSlug = cleanSlug;

    // Resolusi data tenant & tenant_id dari Supabase
    if (supabase && cleanSlug) {
      try {
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        let tQuery = supabase.from('tenants').select('id, slug, metadata');
        if (isUuid(cleanSlug)) {
          tQuery = tQuery.or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`);
        } else {
          tQuery = tQuery.eq('slug', cleanSlug);
        }
        const { data: tenantData } = await tQuery.maybeSingle();
        if (tenantData) {
          resolvedTenantId = tenantData.id || resolvedTenantId;
          targetTenantSlug = tenantData.slug || targetTenantSlug;
        }
      } catch (tErr) {
        console.warn('[Payments API] Supabase tenant resolution note:', tErr);
      }
    }

    // 1. Coba delegasikan ke Backend Core Railway / Production jika aktif
    let qrString = '';
    let qrCodeUrl = '';

    try {
      const coreEndpoint = getBackendApiUrl('/api/v1/payments/qris/create');
      const coreRes = await fetch(coreEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': targetTenantSlug || 'default'
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
        // Hindari mock LinkAja dari gateway sandbox eksternal
        if (candidateQr && !candidateQr.includes('ID.LINKAJA.WWW')) {
          qrString = candidateQr;
          qrCodeUrl = coreData.qr_code_url || (qrString ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M` : '');
        }
      }
    } catch (coreErr) {
      console.warn('[Payments API] Core backend QRIS forwarding note:', coreErr);
    }

    // 2. Dynamic EMVCo QRIS Payload Generator dari Merchant Supabase (Single Source of Truth)
    // Sesuai ARCHITECTURE.md Bagian 14
    if (!qrString && supabase && targetTenantSlug) {
      try {
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        let tQuery = supabase.from('tenants').select('*');
        if (isUuid(targetTenantSlug)) {
          tQuery = tQuery.or(`slug.eq.${targetTenantSlug},id.eq.${targetTenantSlug}`);
        } else {
          tQuery = tQuery.eq('slug', targetTenantSlug);
        }
        const { data: tenantData } = await tQuery.maybeSingle();

        const pcfg = tenantData?.metadata?.payment_config;
        const tenantStaticQris =
          tenantData?.metadata?.payment_settings?.qris_raw ||
          tenantData?.metadata?.payment_settings?.raw_qris_string ||
          tenantData?.metadata?.qris_raw ||
          tenantData?.metadata?.raw_qris_string ||
          (tenantData as any)?.qris_content ||
          (tenantData as any)?.qris_payload ||
          (tenantData as any)?.qris_static_string ||
          tenantData?.metadata?.qris_content ||
          tenantData?.metadata?.qris_payload ||
          tenantData?.metadata?.qris_static_string ||
          tenantData?.metadata?.qris?.static_qr ||
          pcfg?.qris_content ||
          pcfg?.raw_qris_string ||
          pcfg?.static_qris_payload ||
          tenantData?.metadata?.static_qris_payload ||
          '';

        if (tenantStaticQris && tenantStaticQris.startsWith('000201')) {
          qrString = generateDynamicQRIS(tenantStaticQris, numAmount);
        } else {
          const tenantQrisImageUrl =
            tenantData?.metadata?.payment_settings?.qris ||
            (tenantData as any)?.qris_image_url ||
            (tenantData as any)?.qris_url ||
            (tenantData as any)?.qris_image ||
            tenantData?.metadata?.qris_image_url ||
            tenantData?.metadata?.qris_url ||
            tenantData?.metadata?.qris_image ||
            pcfg?.qris_image_url ||
            pcfg?.manual_config?.qris_image_url ||
            '';
          if (tenantQrisImageUrl) {
            qrString = tenantQrisImageUrl;
          }
        }
      } catch (dbErr) {
        console.warn('[Payments API] Supabase tenant QRIS resolution note:', dbErr);
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

    // b. Lakukan INSERT / PRE-CREATION ke tabel orders Supabase/Postgres dengan status PENDING
    const now = new Date().toISOString();
    const finalCustomerName = String(customer_name || body.customerName || 'Pelanggan').trim();
    const finalCustomerPhone = String(customer_phone || body.customerPhone || '').trim();
    const finalCustomerEmail = String(customer_email || body.customerEmail || metadata?.customer_email || '').trim();
    const finalProductId = String(product_id || body.productId || metadata?.product_id || 'prod_default');
    const finalProductTitle = String(product_name || body.productTitle || metadata?.product_name || 'Pesanan Produk');

    if (supabase) {
      try {
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id, payment_status, status, order_status')
          .eq('id', orderId)
          .maybeSingle();

        const isAlreadyPaid = existingOrder && ['PAID', 'SETTLED', 'COMPLETED'].includes(
          String(existingOrder.payment_status || existingOrder.status || existingOrder.order_status || '').toUpperCase()
        );

        if (existingOrder) {
          if (!isAlreadyPaid) {
            await supabase
              .from('orders')
              .update({
                qr_string: qrString || null,
                qr_code_url: qrCodeUrl || null,
                gross_amount: numAmount,
                total_amount: numAmount,
                unique_code: uniqueCode,
                payment_method: 'QRIS',
                payment_status: 'PENDING',
                order_status: 'PENDING',
                status: 'PENDING',
                updated_at: now,
              })
              .eq('id', orderId);
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
            customer_email: finalCustomerEmail,
            total_amount: numAmount,
            gross_amount: numAmount,
            amount: numAmount,
            unique_code: uniqueCode,
            payment_method: 'QRIS',
            payment_status: 'PENDING',
            order_status: 'PENDING',
            status: 'PENDING',
            qr_string: qrString || null,
            qr_code_url: qrCodeUrl || null,
            metadata: {
              ...(metadata || {}),
              tracking_context: metadata?.tracking_context || {},
              source: 'qris_pre_creation',
            },
            created_at: now,
            updated_at: now,
          };

          let { error: insertErr } = await supabase.from('orders').insert(insertPayload);
          if (insertErr && (insertErr.code === '42703' || insertErr.message?.includes('amount') || insertErr.message?.includes('order_status'))) {
            const { amount: _a, order_status: _os, total_amount: _ta, ...cleanPayload } = insertPayload;
            const retryRes = await supabase.from('orders').insert({
              ...cleanPayload,
              gross_amount: numAmount,
              payment_status: 'PENDING',
              status: 'PENDING',
            });
            insertErr = retryRes.error;
          }

          if (insertErr) {
            console.error('[Payments API] Pre-creation order insert error:', insertErr);
          } else {
            console.log(`[Payments API] Pre-created PENDING order #${orderId} for tenant '${targetTenantSlug}' (Rp ${numAmount})`);
          }
        }
      } catch (dbErr) {
        console.warn('[Payments API] DB pre-creation order exception:', dbErr);
      }
    }

    // c. Ambil order.id yang baru dibuat dan kembalikan ke frontend bersama string/payload QRIS
    return NextResponse.json({
      success: true,
      order_id: orderId,
      external_id: orderId,
      id: orderId,
      amount: numAmount,
      total_amount: numAmount,
      unique_code: uniqueCode,
      payment_method: 'QRIS',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      tenant_slug: targetTenantSlug,
      tenant_id: resolvedTenantId,
      qr_string: qrString,
      qr_code_url: qrCodeUrl,
      invoice_url: `/checkout/${orderId}`,
      source: 'dynamic_generator'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generating dynamic QRIS';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
