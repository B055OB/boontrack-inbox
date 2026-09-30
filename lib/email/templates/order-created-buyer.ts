/**
 * @file lib/email/templates/order-created-buyer.ts
 * @description Modern responsive HTML & Plain-Text template for Event 1: ORDER_CREATED (to Buyer).
 * Informs buyer of pending order, exact transfer amount (including unique suffix),
 * destination accounts / QRIS, and payment deadline.
 */

import { OrderCreatedEmailPayload, TenantBranding } from '../types';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatIndonesianDateTime(isoString?: string | null): string {
  if (!isoString) return '1 x 24 Jam';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
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

export function buildOrderCreatedBuyerHtml(
  payload: OrderCreatedEmailPayload,
  branding: TenantBranding
): string {
  const formattedTotal = formatRupiah(payload.total_amount);
  const formattedExpiry = formatIndonesianDateTime(payload.expires_at);
  const storeName = branding.store_name || payload.tenant_slug;
  const brandColor = branding.theme_color || '#0f172a';
  const actionUrl = payload.action_url || `https://shop.boontrack.com/${payload.tenant_slug}/order/${payload.order_id}`;

  const itemsHtml = payload.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
          <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${item.name || item.title || 'Produk'}</div>
          ${item.quantity && item.quantity > 1 ? `<div style="font-size: 12px; color: #64748b;">Jumlah: ${item.quantity}x</div>` : ''}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0f172a; font-size: 14px;">
          ${formatRupiah(item.total || (item.price ? (item.quantity || 1) * item.price : payload.total_amount))}
        </td>
      </tr>`
    )
    .join('');

  const bankAccountsHtml =
    payload.bank_accounts && payload.bank_accounts.length > 0
      ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 14px;">
          Rekening Tujuan Transfer:
        </div>
        ${payload.bank_accounts
          .map(
            (b) => `
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 800; font-size: 13px; color: #0f172a; text-transform: uppercase;">${b.bank_name}</span>
              <span style="font-size: 11px; color: #64748b; font-weight: 600;">a.n ${b.account_holder}</span>
            </div>
            <div style="font-family: monospace; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.05em; margin-top: 4px;">
              ${b.account_number}
            </div>
          </div>`
          )
          .join('')}
      </div>`
      : '';

  const qrisHtml = payload.qris_url
    ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 10px;">
          Pembayaran via QRIS
        </div>
        <img src="${payload.qris_url}" alt="QRIS Code" style="max-width: 220px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 8px auto;" />
        <p style="font-size: 12px; color: #64748b; margin: 8px 0 0 0;">Scan dengan aplikasi perbankan atau e-wallet apa saja (GoPay, OVO, Dana, BCA, Livin, dll).</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tagihan Pembayaran #${payload.order_id} - ${storeName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background: ${brandColor}; padding: 32px 28px; text-align: center; color: #ffffff; }
    .content { padding: 32px 28px; }
    .highlight-box { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #3b82f6; border-radius: 14px; padding: 22px; text-align: center; margin-bottom: 26px; }
    .amount { font-size: 32px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.02em; margin: 8px 0; }
    .warning-badge { display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-top: 8px; border: 1px solid #fde68a; }
    .cta-button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: 0.01em; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); text-align: center; }
    .meta-table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div style="padding: 24px 12px;">
    <div class="wrapper">
      <!-- HEADER -->
      <div class="header">
        ${branding.logo_url ? `<img src="${branding.logo_url}" alt="${storeName}" style="max-height: 44px; margin-bottom: 12px; border-radius: 6px;" /><br>` : ''}
        <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 10px;">
          Pesanan Diterima &bull; Menunggu Pembayaran
        </span>
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">${storeName.toUpperCase()}</h1>
        <p style="margin: 0; font-size: 13px; color: #cbd5e1;">Rincian Instruksi Pembayaran Tagihan #${payload.order_id}</p>
      </div>

      <!-- BODY CONTENT -->
      <div class="content">
        <!-- EXACT TRANSFER AMOUNT HIGHLIGHT -->
        <div class="highlight-box">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.05em;">
            TOTAL NOMINAL TRANSFER:
          </div>
          <div class="amount">${formattedTotal}</div>
          ${
            payload.unique_code
              ? `<div class="warning-badge">
                  ⚠️ PENTING: Mohon transfer TEPAT hingga 3 digit terakhir (<strong>${payload.unique_code}</strong>) agar diverifikasi otomatis.
                </div>`
              : `<div style="font-size: 12px; color: #475569; margin-top: 4px;">Metode: ${payload.payment_method}</div>`
          }
        </div>

        <!-- DEADLINE WARNING -->
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">⏱️</span>
          <div style="font-size: 12px; color: #92400e;">
            <strong>Batas Waktu Pembayaran:</strong> Selesaikan sebelum <strong>${formattedExpiry}</strong>. Setelah melewati batas waktu, pesanan akan kedaluwarsa secara otomatis.
          </div>
        </div>

        <!-- ITEMS TABLE -->
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px;">
          Rincian Pesanan:
        </div>
        <table class="meta-table">
          ${itemsHtml}
        </table>

        <!-- BANK ACCOUNTS / QRIS -->
        ${bankAccountsHtml}
        ${qrisHtml}

        <!-- CTA BUTTON -->
        <div style="text-align: center; margin: 32px 0 16px 0;">
          <a href="${actionUrl}" class="cta-button" target="_blank" rel="noopener noreferrer">
            Cek Status Tagihan &amp; Konfirmasi Pembayaran &rarr;
          </a>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <p>Email ini dikirim otomatis untuk pemesanan di <strong>${storeName}</strong>.</p>
        ${branding.support_email ? `<p>Email Bantuan: <a href="mailto:${branding.support_email}" style="color: #64748b;">${branding.support_email}</a></p>` : ''}
        ${branding.support_phone ? `<p>WhatsApp Bantuan: ${branding.support_phone}</p>` : ''}
        <p style="margin-top: 14px;">Powered by BoonTrack Multi-Tenant Commerce Engine</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildOrderCreatedBuyerText(
  payload: OrderCreatedEmailPayload,
  branding: TenantBranding
): string {
  const storeName = branding.store_name || payload.tenant_slug;
  const formattedTotal = formatRupiah(payload.total_amount);
  const actionUrl = payload.action_url || `https://shop.boontrack.com/${payload.tenant_slug}/order/${payload.order_id}`;

  const lines = [
    `Halo ${payload.customer_name},`,
    ``,
    `Terima kasih telah memesan di ${storeName}!`,
    `Pesanan Anda #${payload.order_id} berhasil dibuat dan saat ini berstatus MENUNGGU PEMBAYARAN.`,
    ``,
    `>>> TOTAL NOMINAL TRANSFER: ${formattedTotal}`,
    payload.unique_code
      ? `(Wajib transfer tepat hingga 3 digit terakhir: kode unik ${payload.unique_code} untuk verifikasi otomatis)`
      : '',
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

  if (payload.bank_accounts && payload.bank_accounts.length > 0) {
    lines.push(`REKENING TUJUAN TRANSFER:`);
    for (const b of payload.bank_accounts) {
      lines.push(`- ${b.bank_name}: ${b.account_number} (a.n ${b.account_holder})`);
    }
    lines.push(``);
  }

  lines.push(
    `Batas waktu pembayaran: ${payload.expires_at || '1x24 jam'}.`,
    ``,
    `Cek status pesanan atau unggah bukti transfer di tautan berikut:`,
    actionUrl,
    ``,
    `Salam,`,
    storeName
  );

  return lines.filter((l) => l !== undefined).join('\n');
}
