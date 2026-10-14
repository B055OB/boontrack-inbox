/**
 * @file lib/payment/xendit-service.ts
 * @description Official Xendit Dynamic QRIS & Invoice Service
 *
 * Menerbitkan Dynamic QRIS resmi berlisensi Bank Indonesia via Xendit API:
 * - POST https://api.xendit.co/qr_codes
 * - POST https://api.xendit.co/v2/invoices
 *
 * Menggantikan dan mematikan total generator string DANA/BCA statis internal.
 */

export interface CreateXenditQrisOptions {
  orderId: string;
  amount: number;
  tenantSlug: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  productTitle?: string;
}

export interface XenditQrisResponse {
  success: boolean;
  qr_string?: string;
  qr_code_url?: string;
  invoice_url?: string;
  xendit_id?: string;
  error?: string;
}

/**
 * Buat Dynamic QRIS resmi berlisensi Bank Indonesia via Xendit API.
 */
export async function createXenditDynamicQRIS(
  options: CreateXenditQrisOptions
): Promise<XenditQrisResponse> {
  const {
    orderId,
    amount,
    tenantSlug,
    customerName,
    customerPhone,
    customerEmail,
    productTitle,
  } = options;

  const xenditKey = (process.env.XENDIT_SECRET_KEY || process.env.XENDIT_API_KEY || '').trim();
  if (!xenditKey) {
    return {
      success: false,
      error: 'XENDIT_SECRET_KEY tidak dikonfigurasi di server environment.',
    };
  }

  const authHeader = `Basic ${Buffer.from(`${xenditKey}:`).toString('base64')}`;
  const apiUrl = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/$/, '');

  let generatedQrString = '';
  let generatedQrCodeUrl = '';
  let generatedInvoiceUrl = `/checkout/${orderId}`;
  let xenditId = '';

  // 1. Prioritas Utama: POST https://api.xendit.co/qr_codes (Official Dynamic QRIS)
  try {
    const qrRes = await fetch(`${apiUrl}/qr_codes`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'api-version': '2022-07-31',
      },
      body: JSON.stringify({
        reference_id: orderId,
        type: 'DYNAMIC',
        currency: 'IDR',
        amount: Math.round(amount),
        metadata: {
          tenant_slug: tenantSlug,
          order_id: orderId,
          product_title: productTitle || 'BoonTrack Order',
        },
      }),
    });

    if (qrRes.ok) {
      const qrData = await qrRes.json();
      generatedQrString = qrData.qr_string || '';
      xenditId = qrData.id || '';
      if (generatedQrString) {
        generatedQrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(generatedQrString)}&size=600&margin=4&ecLevel=M`;
      }
    } else {
      const errText = await qrRes.text();
      console.warn(`[Xendit Service] /qr_codes non-OK (${qrRes.status}):`, errText);
    }
  } catch (qrErr) {
    console.warn('[Xendit Service] /qr_codes request exception:', qrErr);
  }

  // 2. Terbitkan juga / Fallback Invoice: POST https://api.xendit.co/v2/invoices
  try {
    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://shop.boontrack.com').replace(/\/$/, '');
    const successRedirectUrl = `${appBaseUrl}/${tenantSlug}/order-success/${orderId}`;
    const failureRedirectUrl = `${appBaseUrl}/${tenantSlug}/order-failed/${orderId}`;

    const invRes = await fetch(`${apiUrl}/v2/invoices`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: orderId,
        amount: Math.round(amount),
        description: `Pembayaran Order #${orderId} - ${productTitle || tenantSlug}`,
        invoice_duration: 86400,
        currency: 'IDR',
        payment_methods: ['QRIS'],
        success_redirect_url: successRedirectUrl,
        failure_redirect_url: failureRedirectUrl,
        customer: {
          given_names: customerName || 'Pelanggan',
          mobile_number: customerPhone || undefined,
          email: customerEmail || undefined,
        },
        metadata: {
          tenant_slug: tenantSlug,
          order_id: orderId,
        },
      }),
    });

    if (invRes.ok) {
      const invData = await invRes.json();
      generatedInvoiceUrl = invData.invoice_url || invData.web_pay_url || generatedInvoiceUrl;
      if (!xenditId) xenditId = invData.id;
    } else {
      const errText = await invRes.text();
      console.warn(`[Xendit Service] /v2/invoices non-OK (${invRes.status}):`, errText);
    }
  } catch (invErr) {
    console.warn('[Xendit Service] /v2/invoices request exception:', invErr);
  }

  if (generatedQrString || generatedQrCodeUrl || generatedInvoiceUrl !== `/checkout/${orderId}`) {
    return {
      success: true,
      qr_string: generatedQrString,
      qr_code_url: generatedQrCodeUrl || generatedQrString,
      invoice_url: generatedInvoiceUrl,
      xendit_id: xenditId,
    };
  }

  return {
    success: false,
    error: 'Gagal menerbitkan QRIS resmi Xendit melalui /qr_codes maupun /v2/invoices.',
  };
}
