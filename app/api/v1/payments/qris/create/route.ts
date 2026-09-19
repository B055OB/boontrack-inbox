import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { getSupabase } from '@/lib/supabaseClient';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';

/**
 * CRC16-CCITT calculation for EMVCo standard QRIS payload
 */
function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generate dynamic EMVCo QRIS string payload
 */
function generateDynamicQrisPayload(orderId: string, amount: number, tenantName: string = 'BOONTRACK'): string {
  const cleanTenant = tenantName.replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().slice(0, 25) || 'BOONTRACK STORE';
  const cleanCity = 'BANDUNG';
  const amountStr = Math.round(amount).toString();

  // Tag 00: Format Indicator
  let raw = '000201';
  // Tag 01: Point of Initiation Method: 12 (Dynamic)
  raw += '010212';
  // Tag 26: Merchant Account Information - QRIS
  const tag26Val = `0016ID.CO.BOONTRACK.WWW01189360001000000000000215${orderId.slice(-15)}0303UMI`;
  raw += `26${String(tag26Val.length).padStart(2, '0')}${tag26Val}`;
  // Tag 51: Merchant Account Information
  const tag51Val = `0014ID.LINKAJA.WWW0215936009990000000`;
  raw += `51${String(tag51Val.length).padStart(2, '0')}${tag51Val}`;
  // Tag 52: Merchant Category Code: 5812 (Eating/Digital/Retail)
  raw += '52045812';
  // Tag 53: Transaction Currency: 360 (IDR)
  raw += '5303360';
  // Tag 54: Transaction Amount
  raw += `54${String(amountStr.length).padStart(2, '0')}${amountStr}`;
  // Tag 58: Country Code: ID
  raw += '5802ID';
  // Tag 59: Merchant Name
  raw += `59${String(cleanTenant.length).padStart(2, '0')}${cleanTenant}`;
  // Tag 60: Merchant City
  raw += `60${String(cleanCity.length).padStart(2, '0')}${cleanCity}`;
  // Tag 62: Additional Data Field (Bill/Order Reference)
  const tag62Val = `01${String(orderId.length).padStart(2, '0')}${orderId}`;
  raw += `62${String(tag62Val.length).padStart(2, '0')}${tag62Val}`;
  // Tag 63: CRC16 prefix
  raw += '6304';

  const crc = calculateCRC16(raw);
  return raw + crc;
}

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
    const tenantName = (tenant_slug || 'BOONTRACK').toUpperCase();

    // 1. Coba delegasikan ke Backend Core Railway / Production
    try {
      const coreEndpoint = getBackendApiUrl('/api/v1/payments/qris/create');
      const coreRes = await fetch(coreEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant_slug || 'default'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        const qrString = coreData.qr_string || coreData.qr_content || '';
        const qrCodeUrl = coreData.qr_code_url || (qrString ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H` : '');
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
    } catch (coreErr) {
      console.warn('[Payments API] Core backend QRIS forwarding note:', coreErr);
    }

    // 2. Dynamic EMVCo QRIS Payload Generator dari Merchant Supabase
    let qrString = '';
    try {
      const supabase = getSupabase();
      if (supabase && tenant_slug) {
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const tIdentifier = tenant_slug.trim();
        let tQuery = supabase.from('tenants').select('*');
        if (isUuid(tIdentifier)) {
          tQuery = tQuery.or(`slug.eq.${tIdentifier},id.eq.${tIdentifier}`);
        } else {
          tQuery = tQuery.eq('slug', tIdentifier);
        }
        const { data: tenantData } = await tQuery.maybeSingle();

        const pcfg = tenantData?.metadata?.payment_config;
        const tenantStaticQris =
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
          tenantData?.metadata?.raw_qris_string ||
          tenantData?.metadata?.static_qris_payload ||
          '';

        if (tenantStaticQris) {
          qrString = generateDynamicQRIS(tenantStaticQris, numAmount);
        } else {
          const tenantQrisImageUrl =
            (tenantData as any)?.qris_image_url ||
            (tenantData as any)?.qris_url ||
            (tenantData as any)?.qris_image ||
            tenantData?.metadata?.qris_image_url ||
            tenantData?.metadata?.qris_url ||
            tenantData?.metadata?.qris_image ||
            tenantData?.metadata?.payment_settings?.qris ||
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
      ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`
      : qrString;

    return NextResponse.json({
      success: true,
      external_id: orderId,
      amount: numAmount,
      tenant_slug: tenant_slug || '',
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
