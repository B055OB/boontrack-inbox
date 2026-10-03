/**
 * @file lib/email/templates/flagged-manual-seller.ts
 * @description Modern responsive HTML & Plain-Text template for Event 3: FLAGGED_MANUAL / SOFT_MATCH (to Seller).
 * Alerts merchant when payment evidence requires 1-click manual verification or bank mutation soft-match.
 */

import { FlaggedManualEmailPayload, TenantBranding } from '../types';

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

export function buildFlaggedManualSellerHtml(
  payload: FlaggedManualEmailPayload,
  branding: TenantBranding
): string {
  const formattedAmount = formatRupiah(payload.total_amount);
  const formattedDate = formatIndonesianDateTime(payload.created_at);
  const storeName = branding.store_name || payload.tenant_slug;
  const approvalUrl =
    payload.approval_url ||
    `https://dashboard.boontrack.com/${payload.tenant_slug}?tab=orders&filter=pending-verification&orderId=${payload.order_id}`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Perlu Konfirmasi: Bukti Transfer #${payload.order_id}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; }
    .wrapper { max-width: 580px; margin: 20px auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #fde68a; box-shadow: 0 4px 16px rgba(217, 119, 6, 0.08); }
    .header { background: #78350f; padding: 24px; color: #ffffff; text-align: center; }
    .badge { background: #d97706; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .content { padding: 24px; }
    .alert-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 18px; margin-bottom: 22px; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
    .meta-table td { padding: 9px 0; border-bottom: 1px solid #f1f5f9; }
    .btn-approve { display: inline-block; background-color: #d97706; background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 14px; box-shadow: 0 4px 14px rgba(217, 119, 6, 0.35); text-align: center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://shop.boontrack.com/logo-horizontal.png" alt="BoonTrack" width="140" style="display:block; margin: 0 auto 16px auto; max-height: 42px; object-fit: contain;" />
      <span class="badge">⚠️ Perlu Verifikasi Bukti Transfer</span>
      <h2 style="margin: 10px 0 0 0; font-size: 20px; font-weight: 800;">Toko: ${storeName}</h2>
    </div>
    <div class="content">
      <div class="alert-box">
        <div style="font-size: 12px; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 6px;">
          ALASAN REVIEW / SOFT-MATCH:
        </div>
        <div style="font-size: 14px; color: #78350f; line-height: 1.5; font-weight: 600;">
          ${payload.reason || 'Bukti transfer bernilai di atas Rp 50.000 atau membutuhkan verifikasi manual 1-klik di dashboard.'}
        </div>
      </div>

      <table class="meta-table">
        <tr><td>Nomor Order</td><td style="text-align: right; font-weight: 700;">${payload.order_id}</td></tr>
        <tr><td>Waktu Order</td><td style="text-align: right;">${formattedDate}</td></tr>
        <tr><td>Nama Pembeli</td><td style="text-align: right; font-weight: 700;">${payload.customer_name}</td></tr>
        ${payload.customer_phone ? `<tr><td>No. WhatsApp</td><td style="text-align: right;">${payload.customer_phone}</td></tr>` : ''}
        ${payload.customer_email ? `<tr><td>Email</td><td style="text-align: right;">${payload.customer_email}</td></tr>` : ''}
        <tr><td>Nominal Tagihan</td><td style="text-align: right; font-weight: 800; color: #0f172a;">${formattedAmount}</td></tr>
        ${
          payload.detected_amount
            ? `<tr><td>Nominal Terbaca OCR</td><td style="text-align: right; font-weight: 700; color: #d97706;">${formatRupiah(payload.detected_amount)}</td></tr>`
            : ''
        }
        ${
          payload.reference_no
            ? `<tr><td>No. Referensi / RRN</td><td style="text-align: right; font-family: monospace; font-weight: 700;">${payload.reference_no}</td></tr>`
            : ''
        }
        <tr><td>Status Verifikasi</td><td style="text-align: right; font-weight: 800; color: #d97706;">${payload.status}</td></tr>
      </table>

      ${
        payload.evidence_url
          ? `
      <div style="text-align: center; margin: 20px 0; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px;">TAMPILAN BUKTI TRANSFER:</div>
        <img src="${payload.evidence_url}" alt="Bukti Transfer" style="max-width: 100%; max-height: 280px; border-radius: 6px;" />
      </div>`
          : ''
      }

      <div style="text-align: center; margin: 28px 0 12px 0;">
        <a href="${approvalUrl}" class="btn-approve" target="_blank" rel="noopener noreferrer">
          Verifikasi Sekarang di Dashboard (1-Klik) &rarr;
        </a>
      </div>
      <p style="text-align: center; font-size: 11px; color: #64748b; margin: 0;">
        Klik tombol di atas untuk menyetujui (Approve) atau menolak (Reject) pesanan ini secara instan.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 14px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      Notifikasi otomatis Anti-Fraud Guard BoonTrack Multi-Tenant Engine
    </div>
  </div>
</body>
</html>`;
}

export function buildFlaggedManualSellerText(
  payload: FlaggedManualEmailPayload,
  branding: TenantBranding
): string {
  const storeName = branding.store_name || payload.tenant_slug;
  const formattedAmount = formatRupiah(payload.total_amount);
  const approvalUrl =
    payload.approval_url ||
    `https://dashboard.boontrack.com/${payload.tenant_slug}?tab=orders&filter=pending-verification&orderId=${payload.order_id}`;

  return [
    `Halo Merchant ${storeName},`,
    ``,
    `⚠️ PERHATIAN: BUKTI TRANSFER PERLU VERIFIKASI MANUAL`,
    `Order ID: ${payload.order_id}`,
    `Total: ${formattedAmount}`,
    `Pembeli: ${payload.customer_name}`,
    payload.customer_phone ? `WhatsApp: ${payload.customer_phone}` : '',
    ``,
    `Alasan Review:`,
    payload.reason,
    ``,
    payload.reference_no ? `No. Referensi / RRN: ${payload.reference_no}` : '',
    ``,
    `Verifikasi 1-Klik di Dashboard Merchant:`,
    approvalUrl,
  ]
    .filter(Boolean)
    .join('\n');
}
