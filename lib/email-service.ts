/**
 * @file lib/email-service.ts
 * @description Centralized Transactional Email Service for Order Fulfillment & Invoice Dispatch.
 * Dispatches dual transactional emails on order payment confirmation:
 * 1. Buyer Receipt & Digital Access Invoice (Official PDF-styled HTML receipt with CTA to access digital content/Telegram group)
 * 2. Merchant Order Alert (Instant notification to store owner)
 */

import { getResendApiKey } from './boonpilot-email';
import { getSupabaseAdmin, getSupabase } from './supabaseClient';

export interface OrderFulfillmentEmailOptions {
  orderId: string;
  tenantSlug: string;
  tenantId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  productTitle?: string | null;
  grossAmount?: number | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  accessUrl?: string | null;
  instructions?: string | null;
  productType?: 'DIGITAL' | 'PHYSICAL' | 'SERVICE' | string;
  forceBuyerEmail?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  buyerEmailSent: boolean;
  merchantEmailSent: boolean;
  buyerEmailId?: string;
  merchantEmailId?: string;
  errors: string[];
}

/**
 * Format currency to IDR Rupiah
 */
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format timestamp to localized Indonesian date string
 */
function formatIndonesianDateTime(isoString?: string | null): string {
  const d = isoString ? new Date(isoString) : new Date();
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' WIB';
}

/**
 * HTML Template for Buyer Official Transaction Receipt & Digital Product Access
 */
export function buildBuyerReceiptHtml(data: {
  storeName: string;
  orderId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  productTitle: string;
  grossAmount: number;
  paymentMethod: string;
  paidAt: string;
  accessUrl?: string;
  instructions?: string;
  supportPhone?: string;
  supportEmail?: string;
}): string {
  const formattedAmount = formatRupiah(data.grossAmount);
  const formattedDate = formatIndonesianDateTime(data.paidAt);
  const hasDigitalAccess = Boolean(data.accessUrl);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bukti Pembayaran Resmi #${data.orderId}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; text-align: center; color: #ffffff; }
    .header-badge { display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; border: 1px solid rgba(52, 211, 153, 0.3); }
    .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px 28px; }
    .status-card { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; margin-bottom: 8px; }
    .amount-text { font-size: 28px; font-weight: 900; color: #0f172a; margin: 4px 0; letter-spacing: -0.02em; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    .meta-table td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .meta-label { color: #64748b; font-weight: 500; }
    .meta-value { text-align: right; color: #0f172a; font-weight: 600; }
    .order-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px; }
    .order-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .product-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .product-name { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.4; }
    .product-badge { display: inline-block; font-size: 10px; font-weight: 700; background-color: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 4px; margin-top: 4px; }
    .access-card { background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); border: 2px solid #10b981; border-radius: 14px; padding: 24px; text-align: center; margin: 28px 0; }
    .access-card h3 { margin: 0 0 8px 0; font-size: 16px; font-weight: 800; color: #065f46; }
    .access-card p { margin: 0 0 18px 0; font-size: 13px; color: #047857; line-height: 1.5; }
    .cta-button { display: inline-block; background-color: #059669; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.01em; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35); text-align: center; }
    .url-fallback { font-size: 11px; color: #64748b; word-break: break-all; margin-top: 14px; }
    .url-fallback a { color: #059669; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer p { margin: 4px 0; }
    .footer a { color: #64748b; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div style="padding: 24px 12px;">
    <div class="wrapper">
      <!-- HEADER -->
      <div class="header">
        <img src="https://dashboard.boontrack.com/logo-master.jpg" alt="BoonTrack Shop" width="120" style="display:block; margin: 0 auto 16px auto; max-height: 48px; object-fit: contain;" />
        <span class="header-badge">✓ Terverifikasi Otomatis</span>
        <h1>${data.storeName.toUpperCase()}</h1>
        <p>Bukti Transaksi &amp; Invoice Resmi Pembayaran</p>
      </div>

      <!-- BODY CONTENT -->
      <div class="content">
        <!-- STATUS CARD -->
        <div class="status-card">
          <div class="status-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            PEMBAYARAN LUNAS (PAID)
          </div>
          <div class="amount-text">${formattedAmount}</div>
          <p style="margin: 0; font-size: 12px; color: #16a34a; font-weight: 600;">Metode: ${data.paymentMethod}</p>
        </div>

        <!-- DIGITAL ACCESS SECTION (PRIORITY) -->
        ${hasDigitalAccess ? `
        <div class="access-card">
          <h3>🎉 Akses Materi Digital Anda Telah Aktif!</h3>
          <p>${data.instructions || 'Terima kasih atas pembayaran Anda. Silakan klik tombol di bawah untuk bergabung ke grup private Telegram dan mengakses materi:'}</p>
          <a href="${data.accessUrl}" class="cta-button" target="_blank" rel="noopener noreferrer">
            ${data.accessUrl?.includes('meet.google') || data.accessUrl?.includes('cal.com')
              ? 'Pilih Jadwal Konsultasi (Google Meet) 📅'
              : data.accessUrl?.includes('t.me')
              ? 'Akses Materi / Gabung Grup Telegram 🚀'
              : 'Download File / Akses Materi Digital 🚀'}
          </a>
          <div class="url-fallback">
            Atau salin tautan berikut ke browser Anda:<br>
            <a href="${data.accessUrl}">${data.accessUrl}</a>
          </div>
        </div>
        ` : ''}

        <!-- ORDER DETAIL BOX -->
        <div class="order-box">
          <div class="order-title">Rincian Pembelian</div>
          <div class="product-row">
            <div>
              <div class="product-name">${data.productTitle}</div>
              <span class="product-badge">PRODUK DIGITAL (LIFETIME ACCESS)</span>
            </div>
            <div style="font-weight: 800; font-size: 14px; color: #0f172a; text-align: right;">
              ${formattedAmount}
            </div>
          </div>
        </div>

        <!-- TRANSACTION METADATA TABLE -->
        <table class="meta-table">
          <tr>
            <td class="meta-label">Nomor Order (Order ID)</td>
            <td class="meta-value"><strong>${data.orderId}</strong></td>
          </tr>
          <tr>
            <td class="meta-label">Waktu Pembayaran</td>
            <td class="meta-value">${formattedDate}</td>
          </tr>
          <tr>
            <td class="meta-label">Nama Pelanggan</td>
            <td class="meta-value">${data.customerName}</td>
          </tr>
          ${data.customerPhone ? `
          <tr>
            <td class="meta-label">Nomor WhatsApp</td>
            <td class="meta-value">${data.customerPhone}</td>
          </tr>` : ''}
          ${data.customerEmail ? `
          <tr>
            <td class="meta-label">Email Pelanggan</td>
            <td class="meta-value">${data.customerEmail}</td>
          </tr>` : ''}
          <tr>
            <td class="meta-label">Status Transaksi</td>
            <td class="meta-value" style="color: #059669;">✓ Berhasil &amp; Sah</td>
          </tr>
        </table>

        <!-- GUARANTEE BADGE -->
        <div style="display: flex; align-items: center; gap: 12px; background-color: #f1f5f9; padding: 14px 16px; border-radius: 10px; font-size: 12px; color: #475569;">
          <span style="font-size: 18px;">🛡️</span>
          <div>
            <strong>Jaminan Transaksi Resmi BoonTrack</strong><br>
            Simpan email ini sebagai tanda terima sah dan bukti kepemilikan lisensi materi digital Anda.
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p>Butuh bantuan seputar pesanan Anda? Hubungi admin toko <strong>${data.storeName}</strong>.</p>
        <p style="margin-top: 12px;">© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi.</p>
        <p><a href="https://shop.boontrack.com">shop.boontrack.com</a> &bull; Platform Otomasi Checkout &amp; WhatsApp Marketing</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * HTML Template for Merchant Order Notification Alert
 */
export function buildMerchantAlertHtml(data: {
  storeName: string;
  orderId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  productTitle: string;
  grossAmount: number;
  paidAt: string;
  accessUrl?: string;
  dashboardUrl: string;
}): string {
  const formattedAmount = formatRupiah(data.grossAmount);
  const formattedDate = formatIndonesianDateTime(data.paidAt);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Notifikasi Pesanan Masuk #${data.orderId}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; }
    .wrapper { max-width: 580px; margin: 20px auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0f172a; padding: 24px; color: #ffffff; text-align: center; }
    .badge { background: #059669; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .content { padding: 24px; }
    .highlight { background: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 18px; margin-bottom: 20px; border-radius: 0 8px 8px 0; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
    .meta-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .btn { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 13px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://dashboard.boontrack.com/logo-master.jpg" alt="BoonTrack Shop" width="120" style="display:block; margin: 0 auto 16px auto; max-height: 48px; object-fit: contain;" />
      <span class="badge">Pesanan Baru Lunas (PAID)</span>
      <h2 style="margin: 10px 0 0 0; font-size: 20px;">Toko: ${data.storeName}</h2>
    </div>
    <div class="content">
      <div class="highlight">
        <div style="font-size: 12px; color: #047857; font-weight: 600;">PEMBAYARAN DITERIMA:</div>
        <div style="font-size: 24px; font-weight: 800; color: #065f46; margin: 4px 0;">${formattedAmount}</div>
        <div style="font-size: 12px; color: #047857;">Order ID: <strong>${data.orderId}</strong> &bull; ${formattedDate}</div>
      </div>

      <h4 style="margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Informasi Pembeli:</h4>
      <table class="meta-table">
        <tr><td>Nama Pembeli</td><td style="text-align: right; font-weight: 700;">${data.customerName}</td></tr>
        ${data.customerPhone ? `<tr><td>No. WhatsApp</td><td style="text-align: right; font-weight: 700;">${data.customerPhone}</td></tr>` : ''}
        ${data.customerEmail ? `<tr><td>Email Pembeli</td><td style="text-align: right; font-weight: 700;">${data.customerEmail}</td></tr>` : ''}
        <tr><td>Produk</td><td style="text-align: right; font-weight: 700;">${data.productTitle}</td></tr>
        <tr><td>Akses Digital</td><td style="text-align: right; color: #059669; font-weight: 700;">✓ Link Akses Terkirim</td></tr>
      </table>

      <div style="text-align: center; margin-top: 24px;">
        <a href="${data.dashboardUrl}" class="btn" target="_blank">Lihat di Dashboard Merchant &rarr;</a>
      </div>
    </div>
    <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      Notifikasi otomatis sistem BoonTrack Commerce Engine
    </div>
  </div>
</body>
</html>`;
}

/**
 * Universal Resend Email Sender with automatic fallback senders
 */
async function dispatchResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY tidak terkonfigurasi di server.' };
  }

  // Verified BoonTrack senders with automatic fallback
  const senders = [
    process.env.RESEND_FROM || 'BoonTrack Official <orders@boontrack.com>',
    'BoonTrack Orders <billing@boontrack.com>',
    'BoonTrack <pilot@boontrack.com>',
    'BoonTrack Onboarding <onboarding@boontrack.com>',
    'onboarding@resend.dev',
  ];

  let lastError = '';

  for (const sender of senders) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'BoonTrack-Email-Worker/1.0',
        },
        body: JSON.stringify({
          from: sender,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          ...(params.text ? { text: params.text } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        return { success: true, id: data.id };
      }

      lastError = data.message || `HTTP ${res.status}`;
      console.warn(`[EmailService] Sender '${sender}' failed: ${lastError}. Trying next...`);
    } catch (networkErr: unknown) {
      lastError = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.warn(`[EmailService] Network warning for sender '${sender}': ${lastError}`);
    }
  }

  return { success: false, error: lastError || 'All Resend senders exhausted.' };
}

/**
 * Main Orchestrator: Dual Email Confirmation & Invoice Dispatch on Order Fulfillment
 * Non-blocking: Errors are captured and never throw to ensure payment reconciliation stays intact.
 */
export async function sendOrderFulfillmentEmails(
  options: OrderFulfillmentEmailOptions
): Promise<SendEmailResult> {
  const result: SendEmailResult = {
    success: false,
    buyerEmailSent: false,
    merchantEmailSent: false,
    errors: [],
  };

  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      result.errors.push('Database Supabase client unreachable.');
      return result;
    }

    // 1. Resolve Tenant & Merchant Information
    let storeName = options.tenantSlug;
    let merchantEmail = '';
    let supportPhone = options.customerPhone || '';
    let resolvedAccessUrl = options.accessUrl || '';
    let resolvedInstructions = options.instructions || '';

    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name, metadata')
        .eq('slug', options.tenantSlug)
        .maybeSingle();

      if (tenantData) {
        storeName =
          tenantData.metadata?.business_profile?.store_name ||
          tenantData.metadata?.store_name ||
          tenantData.name ||
          options.tenantSlug;

        merchantEmail =
          tenantData.metadata?.email ||
          tenantData.metadata?.owner_email ||
          tenantData.metadata?.business_profile?.email ||
          '';

        supportPhone =
          tenantData.metadata?.business_profile?.phone ||
          tenantData.metadata?.phone ||
          supportPhone;

        // Resolve access link from catalog if not already provided
        if (!resolvedAccessUrl && Array.isArray(tenantData.metadata?.products)) {
          const matchedProd = tenantData.metadata.products.find(
            (p: any) =>
              p.id === 'c7ba0001-7de7-4888-9999-000000000001' ||
              p.title?.toLowerCase().includes('ctwa') ||
              p.id === options.orderId
          );
          if (matchedProd) {
            resolvedAccessUrl =
              matchedProd.link_digital ||
              matchedProd.fulfillment_metadata?.access_url ||
              matchedProd.download_url ||
              matchedProd.asset_reference ||
              '';
            resolvedInstructions =
              matchedProd.fulfillment_metadata?.instructions ||
              resolvedInstructions;
          }
        }
      }
    } catch (tErr) {
      console.warn('[EmailService] Tenant metadata note:', tErr);
    }

    // Hard fallback for 7-Day Sprint CTWA Mastery digital access if still empty
    if (!resolvedAccessUrl && options.productTitle?.toLowerCase().includes('ctwa')) {
      resolvedAccessUrl = 'https://t.me/+zhWxgGbzZxhmMjU1';
      resolvedInstructions = 'Akses materi full digital (video modul & panduan) melalui grup private Telegram:';
    }

    const effectivePaidAt = options.paidAt || new Date().toISOString();
    const effectiveAmount = options.grossAmount || 0;
    const effectiveProduct = options.productTitle || '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)';
    const effectiveCustomer = options.customerName || 'Pelanggan Setia';
    const effectivePaymentMethod = options.paymentMethod || 'QRIS Dinamis (Otomatis)';

    // 2. Dispatch Email to Buyer (if email is available or forceBuyerEmail set)
    const targetBuyerEmail = options.forceBuyerEmail || options.customerEmail;
    if (targetBuyerEmail && targetBuyerEmail.includes('@')) {
      const buyerHtml = buildBuyerReceiptHtml({
        storeName,
        orderId: options.orderId,
        customerName: effectiveCustomer,
        customerEmail: targetBuyerEmail,
        customerPhone: options.customerPhone || undefined,
        productTitle: effectiveProduct,
        grossAmount: effectiveAmount,
        paymentMethod: effectivePaymentMethod,
        paidAt: effectivePaidAt,
        accessUrl: resolvedAccessUrl || undefined,
        instructions: resolvedInstructions || undefined,
        supportPhone: supportPhone || undefined,
      });

      const isDigitalOrder = Boolean(
        resolvedAccessUrl ||
        options.accessUrl ||
        options.productType === 'DIGITAL' ||
        options.instructions ||
        effectiveProduct.toLowerCase().includes('digital') ||
        effectiveProduct.toLowerCase().includes('ctwa') ||
        effectiveProduct.toLowerCase().includes('kelas') ||
        effectiveProduct.toLowerCase().includes('kursus')
      );

      const buyerSubject = isDigitalOrder
        ? `[Akses Produk] Link Pesanan Kakak Sudah Siap! - Order #${options.orderId}`
        : `[LUNAS] Bukti Pembayaran Resmi #${options.orderId} - ${effectiveProduct}`;
      const buyerRes = await dispatchResendEmail({
        to: targetBuyerEmail,
        subject: buyerSubject,
        html: buyerHtml,
      });

      if (buyerRes.success) {
        result.buyerEmailSent = true;
        result.buyerEmailId = buyerRes.id;
        console.log(`[EmailService] Buyer invoice successfully sent to ${targetBuyerEmail} (ID: ${buyerRes.id})`);
      } else {
        result.errors.push(`Buyer email failed: ${buyerRes.error}`);
      }
    } else {
      console.log(`[EmailService] Skipping buyer email: customer_email is not present for order #${options.orderId}`);
    }

    // 3. Dispatch Email to Merchant
    if (merchantEmail && merchantEmail.includes('@')) {
      const dashboardUrl = `https://dashboard.boontrack.com/${encodeURIComponent(options.tenantSlug)}`;
      const merchantHtml = buildMerchantAlertHtml({
        storeName,
        orderId: options.orderId,
        customerName: effectiveCustomer,
        customerEmail: targetBuyerEmail || undefined,
        customerPhone: options.customerPhone || undefined,
        productTitle: effectiveProduct,
        grossAmount: effectiveAmount,
        paidAt: effectivePaidAt,
        accessUrl: resolvedAccessUrl || undefined,
        dashboardUrl,
      });

      const merchantSubject = `[Pesanan Lunas] ${options.orderId} - ${effectiveCustomer} (${formatRupiah(effectiveAmount)})`;
      const merchantRes = await dispatchResendEmail({
        to: merchantEmail,
        subject: merchantSubject,
        html: merchantHtml,
      });

      if (merchantRes.success) {
        result.merchantEmailSent = true;
        result.merchantEmailId = merchantRes.id;
        console.log(`[EmailService] Merchant order alert sent to ${merchantEmail} (ID: ${merchantRes.id})`);
      } else {
        result.errors.push(`Merchant alert failed: ${merchantRes.error}`);
      }
    }

    // 4. Update status order di tabel orders Supabase (email_sent & email_sent_at)
    if (result.buyerEmailSent || result.merchantEmailSent) {
      result.success = true;
      try {
        await supabase
          .from('orders')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          })
          .eq('id', options.orderId);
      } catch (dbErr) {
        console.warn('[EmailService] Note updating email_sent status in DB:', dbErr);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EmailService] Unexpected execution error:', msg);
    result.errors.push(msg);
  }

  return result;
}

export interface PaymentProofAlertOptions {
  orderId: string;
  tenantSlug: string;
  tenantId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  productTitle?: string | null;
  grossAmount?: number | null;
  uniqueCode?: number | null;
  paymentProofUrl: string;
  notes?: string | null;
}

/**
 * HTML Template for Merchant Alert when Buyer uploads Payment Proof
 */
export function buildSellerProofAlertHtml(data: {
  storeName: string;
  orderId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  productTitle: string;
  grossAmount: number;
  uniqueCode?: number;
  paymentProofUrl: string;
  notes?: string;
  dashboardUrl: string;
}): string {
  const formattedAmount = formatRupiah(data.grossAmount);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Bukti Transfer Masuk #${data.orderId}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; }
    .wrapper { max-width: 580px; margin: 20px auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0f172a; padding: 24px; color: #ffffff; text-align: center; }
    .badge { background: #f59e0b; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .content { padding: 24px; }
    .highlight { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; margin-bottom: 20px; border-radius: 0 8px 8px 0; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
    .meta-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .btn { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 13px; margin-top: 16px; }
    .proof-img { max-width: 100%; height: auto; max-height: 380px; border-radius: 8px; border: 1px solid #cbd5e1; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://dashboard.boontrack.com/logo-master.jpg" alt="BoonTrack Shop" width="120" style="display:block; margin: 0 auto 16px auto; max-height: 48px; object-fit: contain;" />
      <span class="badge">Perlu Verifikasi Seller</span>
      <h2 style="margin: 8px 0 0 0; font-size: 18px;">Bukti Transfer Pembayaran Masuk</h2>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">${data.storeName.toUpperCase()} &bull; Order #${data.orderId}</p>
    </div>
    <div class="content">
      <div class="highlight">
        <p style="margin: 0; font-size: 13px; color: #b45309; font-weight: 600;">
          Pelanggan telah mengunggah bukti transfer bank. Harap periksa mutasi rekening Anda dan setujui transaksi untuk mengaktifkan akses/pengiriman.
        </p>
      </div>

      <table class="meta-table">
        <tr><td style="color: #64748b;">Nomor Order</td><td><strong>#${data.orderId}</strong></td></tr>
        <tr><td style="color: #64748b;">Nama Pembeli</td><td><strong>${data.customerName}</strong></td></tr>
        ${data.customerPhone ? `<tr><td style="color: #64748b;">WhatsApp</td><td><a href="https://wa.me/${data.customerPhone.replace(/[^0-9]/g, '')}">${data.customerPhone}</a></td></tr>` : ''}
        ${data.customerEmail ? `<tr><td style="color: #64748b;">Email</td><td>${data.customerEmail}</td></tr>` : ''}
        <tr><td style="color: #64748b;">Produk</td><td>${data.productTitle}</td></tr>
        <tr><td style="color: #64748b;">Total Nominal</td><td style="font-weight: 800; color: #0f172a; font-size: 15px;">${formattedAmount}</td></tr>
        ${data.uniqueCode ? `<tr><td style="color: #64748b;">Kode Unik</td><td><span style="font-family: monospace; font-weight: 700; color: #0284c7;">+${data.uniqueCode}</span></td></tr>` : ''}
        <tr><td style="color: #64748b;">Status Saat Ini</td><td><span style="color: #d97706; font-weight: 700;">WAITING_CONFIRMATION</span></td></tr>
      </table>

      ${data.paymentProofUrl ? `
        <div style="margin: 18px 0;">
          <strong style="font-size: 12px; color: #475569; display: block; margin-bottom: 6px;">Lampiran Bukti Transfer:</strong>
          <a href="${data.paymentProofUrl}" target="_blank" rel="noopener noreferrer">
            <img src="${data.paymentProofUrl}" alt="Bukti Transfer Order #${data.orderId}" class="proof-img" />
          </a>
          <div style="margin-top: 6px;">
            <a href="${data.paymentProofUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #2563eb;">
              Buka gambar resolusi penuh &rarr;
            </a>
          </div>
        </div>
      ` : ''}

      <div style="text-align: center; margin-top: 24px;">
        <a href="${data.dashboardUrl}" class="btn" target="_blank">
          Buka Dashboard &amp; Verifikasi Transaksi
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Dispatch Seller Notification Alert when Buyer uploads Payment Proof
 */
export async function sendPaymentProofAlertToSeller(
  options: PaymentProofAlertOptions
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return { success: false, error: 'Database Supabase client unreachable.' };
    }

    let storeName = options.tenantSlug;
    let merchantEmail = '';

    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name, metadata')
        .eq('slug', options.tenantSlug)
        .maybeSingle();

      if (tenantData) {
        storeName =
          tenantData.metadata?.business_profile?.store_name ||
          tenantData.metadata?.store_name ||
          tenantData.name ||
          options.tenantSlug;

        merchantEmail =
          tenantData.metadata?.email ||
          tenantData.metadata?.owner_email ||
          tenantData.metadata?.business_profile?.email ||
          '';
      }
    } catch (tErr) {
      console.warn('[sendPaymentProofAlertToSeller] Tenant metadata error:', tErr);
    }

    if (!merchantEmail || !merchantEmail.includes('@')) {
      console.log(`[sendPaymentProofAlertToSeller] No valid merchant email for tenant ${options.tenantSlug}`);
      return { success: false, error: 'Merchant email not configured.' };
    }

    const dashboardUrl = `https://dashboard.boontrack.com/${encodeURIComponent(options.tenantSlug)}?tab=orders&orderId=${encodeURIComponent(options.orderId)}`;
    const subject = `Bukti Transfer Masuk - Segera verifikasi mutasi untuk Order #${options.orderId}`;

    const html = buildSellerProofAlertHtml({
      storeName,
      orderId: options.orderId,
      customerName: options.customerName || 'Pelanggan',
      customerPhone: options.customerPhone || undefined,
      customerEmail: options.customerEmail || undefined,
      productTitle: options.productTitle || 'Pesanan Produk',
      grossAmount: options.grossAmount || 0,
      uniqueCode: options.uniqueCode || undefined,
      paymentProofUrl: options.paymentProofUrl,
      notes: options.notes || undefined,
      dashboardUrl,
    });

    const res = await dispatchResendEmail({
      to: merchantEmail,
      subject,
      html,
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sendPaymentProofAlertToSeller] Error:', msg);
    return { success: false, error: msg };
  }
}

