/**
 * @file lib/email/templates/payment-confirmed-seller.ts
 * @description Modern responsive HTML & Plain-Text template for Event 2: PAYMENT_CONFIRMED (to Seller/Merchant).
 * Notifies merchant of incoming paid transaction with customer details, gross amount, and dashboard link.
 */

import { PaymentConfirmedEmailPayload, TenantBranding } from '../types';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatIndonesianDateTime(isoString?: string | null): string {
  const d = isoString ? new Date(isoString) : new Date();
  return (
    d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' WIB'
  );
}

export function buildPaymentConfirmedSellerHtml(
  payload: PaymentConfirmedEmailPayload,
  branding: TenantBranding
): string {
  const formattedAmount = formatRupiah(payload.total_amount);
  const formattedDate = formatIndonesianDateTime(payload.paid_at);
  const storeName = branding.store_name || payload.tenant_slug;
  const dashboardUrl = payload.dashboard_url || `https://shop.boontrack.com/${payload.tenant_slug}/dashboard/orders`;

  const itemsHtml = payload.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
          <strong style="color: #0f172a;">${item.name || item.title || 'Pesanan Produk'}</strong>
          ${item.quantity && item.quantity > 1 ? `<span style="color: #64748b; font-size: 12px;"> (${item.quantity}x)</span>` : ''}
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0f172a;">
          ${formatRupiah(item.total || (item.price ? (item.quantity || 1) * item.price : payload.total_amount))}
        </td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Notifikasi Pesanan Lunas #${payload.order_id} - ${storeName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; }
    .wrapper { max-width: 580px; margin: 20px auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0f172a; padding: 24px; color: #ffffff; text-align: center; }
    .badge { background: #059669; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; }
    .content { padding: 24px; }
    .highlight { background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 20px; margin-bottom: 20px; border-radius: 0 8px 8px 0; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
    .meta-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .btn { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 13px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span class="badge">Pesanan Baru Lunas (PAID)</span>
      <h2 style="margin: 10px 0 0 0; font-size: 20px;">Toko: ${storeName}</h2>
    </div>
    <div class="content">
      <div class="highlight">
        <div style="font-size: 12px; color: #047857; font-weight: 600;">DANA MASUK DITERIMA:</div>
        <div style="font-size: 28px; font-weight: 800; color: #065f46; margin: 4px 0;">${formattedAmount}</div>
        <div style="font-size: 12px; color: #047857;">Order ID: <strong>${payload.order_id}</strong> &bull; ${formattedDate}</div>
      </div>

      <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #64748b;">Informasi Pembeli:</h4>
      <table class="meta-table">
        <tr><td>Nama Pembeli</td><td style="text-align: right; font-weight: 700;">${payload.customer_name}</td></tr>
        ${payload.customer_phone ? `<tr><td>No. WhatsApp</td><td style="text-align: right; font-weight: 700;">${payload.customer_phone}</td></tr>` : ''}
        ${payload.customer_email ? `<tr><td>Email Pembeli</td><td style="text-align: right; font-weight: 700;">${payload.customer_email}</td></tr>` : ''}
        <tr><td>Metode Pembayaran</td><td style="text-align: right; font-weight: 700;">${payload.payment_method}</td></tr>
      </table>

      <h4 style="margin: 18px 0 8px 0; font-size: 13px; text-transform: uppercase; color: #64748b;">Rincian Produk:</h4>
      <table class="meta-table">
        ${itemsHtml}
      </table>

      <div style="text-align: center; margin-top: 26px;">
        <a href="${dashboardUrl}" class="btn" target="_blank" rel="noopener noreferrer">
          Buka Pesanan di Dashboard Merchant &rarr;
        </a>
      </div>
    </div>
    <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      Notifikasi otomatis sistem BoonTrack Multi-Tenant Commerce Engine
    </div>
  </div>
</body>
</html>`;
}

export function buildPaymentConfirmedSellerText(
  payload: PaymentConfirmedEmailPayload,
  branding: TenantBranding
): string {
  const storeName = branding.store_name || payload.tenant_slug;
  const formattedAmount = formatRupiah(payload.total_amount);
  const formattedDate = formatIndonesianDateTime(payload.paid_at);
  const dashboardUrl = payload.dashboard_url || `https://shop.boontrack.com/${payload.tenant_slug}/dashboard/orders`;

  return [
    `Halo Merchant ${storeName},`,
    ``,
    `PESANAN BARU LUNAS (PAID)!`,
    `DANA MASUK DITERIMA:`,
    `Total: ${formattedAmount}`,
    `Order ID: ${payload.order_id}`,
    `Waktu: ${formattedDate}`,
    ``,
    `PEMBELI:`,
    `- Nama  : ${payload.customer_name}`,
    payload.customer_phone ? `- WA    : ${payload.customer_phone}` : '',
    payload.customer_email ? `- Email : ${payload.customer_email}` : '',
    ``,
    `PRODUK:`,
    ...payload.items.map((i) => `- ${i.name || i.title} (x${i.quantity || 1})`),
    ``,
    `Buka di dashboard merchant:`,
    dashboardUrl,
  ]
    .filter(Boolean)
    .join('\n');
}
