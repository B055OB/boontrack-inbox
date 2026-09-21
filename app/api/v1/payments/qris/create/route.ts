import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabase } from '@/lib/supabaseClient';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      external_id,
      amount,
      tenant_slug,
      customer_phone,
      customer_name,
      product_name,
      metadata
    } = body;

    const orderId = external_id || `ORD-${Date.now()}`;
    const numAmount = Number(amount) || 0;
    const cleanSlug = (tenant_slug || '').trim().toLowerCase();

    // 1. Coba delegasikan ke Backend Core Railway / Production jika aktif
    try {
      const coreEndpoint = getBackendApiUrl('/api/v1/payments/qris/create');
      const coreRes = await fetch(coreEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': cleanSlug || 'default'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        const qrString = coreData.qr_string || coreData.qr_content || '';
        // Hindari mock LinkAja dari gateway sandbox eksternal
        if (qrString && !qrString.includes('ID.LINKAJA.WWW')) {
          const qrCodeUrl = coreData.qr_code_url || (qrString ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M` : '');
          return NextResponse.json({
            success: true,
            external_id: orderId,
            amount: numAmount,
            qr_string: qrString,
            qr_code_url: qrCodeUrl,
            invoice_url: coreData.invoice_url || `/checkout/${orderId}`,
            payment_url: coreData.payment_url || coreData.invoice_url || `/checkout/${orderId}`,
            source: 'core_backend'
          });
        }
      }
    } catch (coreErr) {
      console.warn('[Payments API] Core backend QRIS forwarding note:', coreErr);
    }

    // 2. Dynamic EMVCo QRIS Payload Generator dari Merchant Supabase (Single Source of Truth)
    // Sesuai ARCHITECTURE.md Bagian 14:
    // - Ambil string QRIS mentah ASLI dari database: tenants.metadata.payment_settings.qris_raw
    // - Dilarang keras pakai template mock LinkAja!
    // - Wajib pertahankan Tag 62 bawaan acquirer merchant apa adanya (tanpa menimpa / menyisipkan INV-xxx).
    let qrString = '';
    try {
      const supabase = getSupabase();
      if (supabase && cleanSlug) {
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        let tQuery = supabase.from('tenants').select('*');
        if (isUuid(cleanSlug)) {
          tQuery = tQuery.or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`);
        } else {
          tQuery = tQuery.eq('slug', cleanSlug);
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
      }
    } catch (dbErr) {
      console.warn('[Payments API] Supabase tenant QRIS resolution note:', dbErr);
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

    const qrCodeUrl = qrString.startsWith('000201')
      ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=600&margin=4&ecLevel=M`
      : qrString;

    return NextResponse.json({
      success: true,
      external_id: orderId,
      amount: numAmount,
      tenant_slug: cleanSlug,
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
