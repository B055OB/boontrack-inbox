/**
 * @file lib/email/templates/payment-confirmed-buyer.ts
 * @description Modern responsive HTML & Plain-Text template for Event 2: PAYMENT_CONFIRMED (to Buyer).
 * Official Payment Receipt & Instant Digital Product Access / Google Calendar Booking Link.
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

export function buildPaymentConfirmedBuyerHtml(
  payload: PaymentConfirmedEmailPayload,
  branding: TenantBranding
): string {
  const formattedAmount = formatRupiah(payload.total_amount);
  const formattedDate = formatIndonesianDateTime(payload.paid_at);
  const storeName = branding.store_name || payload.tenant_slug;
  const brandColor = branding.theme_color || '#0f172a';
  const hasDigitalAccess = Boolean(payload.access_url);
  const hasCalendarBooking = Boolean(payload.booking_url);

  const itemsHtml = payload.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
          <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${item.name || item.title || 'Pesanan Produk'}</div>
          ${item.quantity && item.quantity > 1 ? `<div style="font-size: 12px; color: #64748b;">Jumlah: ${item.quantity}x</div>` : ''}
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0f172a; font-size: 14px;">
          ${formatRupiah(item.total || (item.price ? (item.quantity || 1) * item.price : payload.total_amount))}
        </td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bukti Pembayaran Resmi #${payload.order_id} - ${storeName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background: ${brandColor}; padding: 32px 28px; text-align: center; color: #ffffff; }
    .header-badge { display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; border: 1px solid rgba(52, 211, 153, 0.3); }
    .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px 28px; }
    .status-card { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; margin-bottom: 8px; }
    .amount-text { font-size: 28px; font-weight: 900; color: #0f172a; margin: 4px 0; letter-spacing: -0.02em; }
    .access-card { background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); border: 2px solid #10b981; border-radius: 14px; padding: 24px; text-align: center; margin: 28px 0; }
    .access-card h3 { margin: 0 0 8px 0; font-size: 16px; font-weight: 800; color: #065f46; }
    .access-card p { margin: 0 0 18px 0; font-size: 13px; color: #047857; line-height: 1.5; }
    .cta-button { display: inline-block; background-color: #059669; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.01em; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35); text-align: center; }
    .calendar-button { display: inline-block; background-color: #2563eb; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.01em; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); text-align: center; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    .meta-table td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .meta-label { color: #64748b; font-weight: 500; }
    .meta-value { text-align: right; color: #0f172a; font-weight: 600; }
    .url-fallback { font-size: 11px; color: #64748b; word-break: break-all; margin-top: 14px; }
    .url-fallback a { color: #059669; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div style="padding: 24px 12px;">
    <div class="wrapper">
      <!-- HEADER -->
      <div class="header">
        ${branding.logo_url ? `<img src="${branding.logo_url}" alt="${storeName}" style="max-height: 44px; margin-bottom: 12px; border-radius: 6px;" /><br>` : ''}
        <span class="header-badge">✓ Terverifikasi Sah</span>
        <h1>${storeName.toUpperCase()}</h1>
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
          <p style="margin: 0; font-size: 12px; color: #16a34a; font-weight: 600;">Metode: ${payload.payment_method}</p>
        </div>

        <!-- DIGITAL ACCESS SECTION (PRIORITY) -->
        ${
          hasDigitalAccess
            ? `
        <div class="access-card">
          <h3>🎉 Akses Materi Digital Anda Telah Aktif!</h3>
          <p>${payload.instructions || 'Terima kasih atas pembayaran Anda. Silakan klik tombol di bawah untuk mengakses materi atau bergabung ke grup akses:'}</p>
          <a href="${payload.access_url}" class="cta-button" target="_blank" rel="noopener noreferrer">
            Akses Materi / Gabung Grup Akses 🚀
          </a>
          <div class="url-fallback">
            Atau salin tautan berikut ke browser Anda:<br>
            <a href="${payload.access_url}">${payload.access_url}</a>
          </div>
        </div>`
            : ''
        }

        <!-- GOOGLE CALENDAR / CAL.COM BOOKING SECTION -->
        ${
          hasCalendarBooking
            ? `
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #3b82f6; border-radius: 14px; padding: 24px; text-align: center; margin: 24px 0;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 800; color: #1e40af;">📅 Jadwalkan Sesi Konsultasi Anda</h3>
          <p style="margin: 0 0 18px 0; font-size: 13px; color: #1d4ed8; line-height: 1.5;">Pilih tanggal &amp; jam konsultasi yang cocok di Google Calendar / Kalender Layanan kami:</p>
          <a href="${payload.booking_url}" class="calendar-button" target="_blank" rel="noopener noreferrer">
            Pilih Jadwal di Google Calendar / Cal.com 🗓️
          </a>
        </div>`
            : ''
        }

        <!-- ORDER DETAIL TABLE -->
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px;">
          Rincian Pembelian:
        </div>
        <table class="meta-table">
          ${itemsHtml}
        </table>

        <!-- TRANSACTION METADATA TABLE -->
        <table class="meta-table">
          <tr>
            <td class="meta-label">Nomor Order (Order ID)</td>
            <td class="meta-value"><strong>${payload.order_id}</strong></td>
          </tr>
          <tr>
            <td class="meta-label">Waktu Pembayaran</td>
            <td class="meta-value">${formattedDate}</td>
          </tr>
          <tr>
            <td class="meta-label">Nama Pelanggan</td>
            <td class="meta-value">${payload.customer_name}</td>
          </tr>
          ${payload.customerPhone ? `<tr><td class="meta-label">Nomor WhatsApp</td><td class="meta-value">${payload.customerPhone}</td></tr>` : ''}
          ${payload.customer_email ? `<tr><td class="meta-label">Email Pelanggan</td><td class="meta-value">${payload.customer_email}</td></tr>` : ''}
          <tr>
            <td class="meta-label">Status Transaksi</td>
            <td class="meta-value" style="color: #059669; font-weight: 800;">✓ Berhasil &amp; Sah</td>
          </tr>
        </table>

        <!-- GUARANTEE BADGE -->
        <div style="display: flex; align-items: center; gap: 12px; background-color: #f1f5f9; padding: 14px 16px; border-radius: 10px; font-size: 12px; color: #475569;">
          <span style="font-size: 18px;">🛡️</span>
          <div>
            <strong>Jaminan Transaksi Sah &bull; ${storeName}</strong><br>
            Simpan email ini sebagai tanda terima sah dan bukti kepemilikan lisensi materi/layanan Anda.
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p>Butuh bantuan seputar pesanan Anda? Hubungi admin toko <strong>${storeName}</strong>.</p>
        ${branding.support_email ? `<p>Email: <a href="mailto:${branding.support_email}" style="color: #64748b;">${branding.support_email}</a></p>` : ''}
        ${branding.support_phone ? `<p>WhatsApp: ${branding.support_phone}</p>` : ''}
        <p style="margin-top: 14px;">Powered by BoonTrack Multi-Tenant Commerce Engine</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildPaymentConfirmedBuyerText(
  payload: PaymentConfirmedEmailPayload,
  branding: TenantBranding
): string {
  const storeName = branding.store_name || payload.tenant_slug;
  const formattedAmount = formatRupiah(payload.total_amount);
  const formattedDate = formatIndonesianDateTime(payload.paid_at);

  const lines = [
    `Halo ${payload.customer_name},`,
    ``,
    `PEMBAYARAN ANDA TELAH LUNAS (PAID)!`,
    `Toko: ${storeName}`,
    `Nomor Order: ${payload.order_id}`,
    `Waktu: ${formattedDate}`,
    `Total: ${formattedAmount}`,
    `Metode: ${payload.payment_method}`,
    ``,
    `RINCIAN PESANAN:`,
    ...payload.items.map(
      (item) =>
        `- ${item.name || item.title} (x${item.quantity || 1}): ${formatRupiah(
          item.total || (item.price ? (item.quantity || 1) * item.price : payload.total_amount)
        )}`
    ),
    ``,
  ];

  if (payload.access_url) {
    lines.push(
      `AKSES MATERI DIGITAL:`,
      payload.instructions || 'Klik tautan di bawah untuk mengakses materi digital Anda:',
      payload.access_url,
      ``
    );
  }

  if (payload.booking_url) {
    lines.push(
      `JADWAL KONSULTASI (GOOGLE CALENDAR / CAL.COM):`,
      payload.booking_url,
      ``
    );
  }

  lines.push(
    `Terima kasih telah berbelanja di ${storeName}.`,
    `Simpan email ini sebagai bukti transaksi resmi Anda.`
  );

  return lines.join('\n');
}
