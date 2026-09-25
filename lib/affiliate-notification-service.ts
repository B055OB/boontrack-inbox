/**
 * BoonTrack Affiliate & AM Notification Service
 * Dedicated email delivery system for Affiliate & AM network notifications using Resend API.
 * 
 * SENDER IDENTITY CONTRACT:
 * From: "BoonTrack Affiliate" <affiliate@boontrack.com>
 * 
 * TRIGGERS COVERED:
 * 1. New Tenant / Store Registration under referral network (Direct Recruiter + Parent AM downline alert)
 * 2. Order Payment Success & Commission Alert (Direct Affiliate Commission + AM 5% Override)
 * 3. New Sub-Affiliate Registration under AM (Master AM / Upline AM notification)
 * 
 * Non-blocking: All errors are caught and logged without breaking checkout or registration flows.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { getResendApiKey } from '@/lib/boonpilot-email';

export interface SendAffiliateEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  senderUsed?: string;
}

const PRIMARY_SENDER =
  process.env.RESEND_AFFILIATE_FROM ||
  '"BoonTrack Affiliate" <affiliate@boontrack.com>';

const FALLBACK_SENDERS = [
  process.env.RESEND_FROM || '"Boon Pilot" <pilot@boontrack.com>',
  '"Boon Pilot" <affiliate@boontrack.com>',
  '"BoonTrack Support" <support@boontrack.com>',
];

/**
 * Universal Resend sender with automatic fallback across verified senders
 */
export async function sendAffiliateEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendAffiliateEmailResult> {
  const { to, subject, html, text } = options;

  if (!to || !to.includes('@')) {
    console.warn('[AffiliateEmail] Recipient email is missing or invalid:', to);
    return { success: false, error: 'Recipient email is invalid' };
  }

  const resendApiKey = getResendApiKey();
  if (!resendApiKey) {
    console.warn('[AffiliateEmail] RESEND_API_KEY is not configured.');
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  const allSenders = [PRIMARY_SENDER, ...FALLBACK_SENDERS];
  let lastError = '';

  for (const sender of allSenders) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
          'User-Agent': 'BoonTrack-Affiliate-Engine/1.0',
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.id) {
        console.log(`[AffiliateEmail] Email delivered to ${to} via (${sender}), messageId: ${data.id}`);
        return {
          success: true,
          messageId: data.id,
          senderUsed: sender,
        };
      }

      lastError = data?.message || data?.error || `${res.status} ${res.statusText}`;
      console.warn(`[AffiliateEmail] Sender (${sender}) rejected:`, lastError);
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
      console.warn(`[AffiliateEmail] Network exception with sender (${sender}):`, err);
    }
  }

  return {
    success: false,
    error: lastError || 'All Resend sender attempts failed.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML & TEXT EMAIL BUILDERS (Responsive, Bulletproof Email Design)
// ─────────────────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString('id-ID')}`;
}

/**
 * 1. Template: New Store / Tenant Registration Alert
 */
export function buildNewStoreAlertHtml(params: {
  recipientName: string;
  isParentAm: boolean;
  recruiterName?: string;
  recruiterCode?: string;
  storeName: string;
  storeSlug: string;
  planName: string;
  merchantName?: string;
  merchantPhone?: string;
  referralCode?: string;
  registeredAt: string;
}): string {
  const {
    recipientName,
    isParentAm,
    recruiterName,
    recruiterCode,
    storeName,
    storeSlug,
    planName,
    merchantName,
    merchantPhone,
    referralCode,
    registeredAt,
  } = params;

  const dashboardUrl = 'https://shop.boontrack.com/affiliate';
  const storeUrl = `https://shop.boontrack.com/${storeSlug}`;

  const headerTitle = isParentAm
    ? 'Mitra Downline Merekrut Toko Baru! 🚀'
    : 'Toko Baru Bergabung di Jaringan Anda! 🏪';

  const subtitle = isParentAm
    ? `Mitra binaan Anda (${recruiterName || 'Mitra'} - ${recruiterCode || ''}) berhasil merekrut toko baru ke platform BoonTrack.`
    : `Selamat! Calon merchant baru mendaftar menggunakan link referal Anda.`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 28px; text-align: center; border-bottom: 1px solid #334155;">
              <div style="display: inline-block; background-color: #0284c7; background: linear-gradient(90deg, #0284c7 0%, #2563eb 100%); border-radius: 9999px; padding: 6px 16px; margin-bottom: 14px;">
                <span style="font-size: 11px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
                  🤝 BOONTRACK AFFILIATE NETWORK
                </span>
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; line-height: 1.3;">
                ${headerTitle}
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                ${subtitle}
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px; background-color: #1e293b;">
              <!-- Greeting -->
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0; line-height: 1.5;">
                Halo, <strong>${recipientName}</strong>! 👋
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                Jaringan kemitraan Anda terus berkembang. Berikut rincian toko yang baru saja mendaftar:
              </p>

              <!-- Store Details Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td colspan="2" style="padding: 14px 18px; border-bottom: 1px solid #334155;">
                    <span style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">
                      📋 Rincian Toko Baru
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #94a3b8; width: 140px;">Nama Toko:</td>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 700;">${storeName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Link Toko:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #38bdf8; font-weight: 600; font-family: monospace;">
                    <a href="${storeUrl}" target="_blank" style="color: #38bdf8; text-decoration: none;">shop.boontrack.com/${storeSlug}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Paket Layanan:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #10b981; font-weight: 700;">${planName}</td>
                </tr>
                ${merchantName ? `
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Pemilik / Merchant:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 600;">${merchantName}</td>
                </tr>` : ''}
                ${merchantPhone ? `
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">WhatsApp Toko:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 600;">${merchantPhone}</td>
                </tr>` : ''}
                ${isParentAm && recruiterName ? `
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Mitra Perekrut:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f59e0b; font-weight: 700;">${recruiterName} (${recruiterCode || '-'})</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #94a3b8;">Waktu Pendaftaran:</td>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #cbd5e1;">${registeredAt}</td>
                </tr>
              </table>

              <!-- Value Note -->
              <div style="background-color: rgba(14, 165, 233, 0.08); border-left: 3px solid #0284c7; padding: 12px 16px; border-radius: 6px; margin-bottom: 28px;">
                <p style="margin: 0; font-size: 12px; color: #bae6fd; line-height: 1.5;">
                  💡 <strong>Potensi Komisi:</strong> Setiap transaksi dan pembayaran perpanjangan paket langganan dari toko ini akan otomatis mendistribusikan komisi ke dompet kemitraan Anda.
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; color: #ffffff; text-decoration: none; border-radius: 10px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border: 1px solid #3b82f6; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
                      Buka Dashboard Affiliate &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; border-top: 1px solid #334155; padding: 20px 28px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #94a3b8;">
                BoonTrack Affiliate Network &bull; PT BOONTRACK INOVASI DIGITAL
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.4;">
                Platform Otomasi WhatsApp Commerce &amp; Multi-Tier Affiliate Engine
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export function buildNewStoreAlertText(params: {
  recipientName: string;
  isParentAm: boolean;
  recruiterName?: string;
  recruiterCode?: string;
  storeName: string;
  storeSlug: string;
  planName: string;
  merchantName?: string;
  merchantPhone?: string;
  referralCode?: string;
  registeredAt: string;
}): string {
  const { recipientName, isParentAm, recruiterName, recruiterCode, storeName, storeSlug, planName, registeredAt } = params;
  return [
    `Halo, ${recipientName}!`,
    ``,
    isParentAm
      ? `Mitra downline Anda (${recruiterName || 'Mitra'} - ${recruiterCode || ''}) baru saja merekrut toko baru ke jaringan Anda!`
      : `Selamat! Toko baru berhasil mendaftar melalui link referal Anda.`,
    ``,
    `DETAIL TOKO BARU:`,
    `- Nama Toko : ${storeName}`,
    `- Alamat    : https://shop.boontrack.com/${storeSlug}`,
    `- Paket     : ${planName}`,
    isParentAm ? `- Perekrut  : ${recruiterName || '-'} (${recruiterCode || '-'})` : '',
    `- Waktu     : ${registeredAt}`,
    ``,
    `Pantau pertumbuhan jaringan dan komisi Anda di dashboard:`,
    `https://shop.boontrack.com/affiliate`,
    ``,
    `Salam sukses,`,
    `BoonTrack Affiliate Network`,
    `PT BOONTRACK INOVASI DIGITAL`,
  ].filter(Boolean).join('\n');
}

/**
 * 2. Template: Order Success & Commission Alert
 */
export function buildCommissionAlertHtml(params: {
  recipientName: string;
  isAmOverride: boolean;
  orderId: string;
  storeName: string;
  storeSlug: string;
  productTitle: string;
  grossAmount: number;
  commissionAmount: number;
  commissionRate: number;
  customerName?: string;
  paidAt: string;
}): string {
  const {
    recipientName,
    isAmOverride,
    orderId,
    storeName,
    storeSlug,
    productTitle,
    grossAmount,
    commissionAmount,
    commissionRate,
    customerName,
    paidAt,
  } = params;

  const dashboardUrl = 'https://shop.boontrack.com/affiliate';
  const headerBadge = isAmOverride ? '💰 KOMISI OVERRIDE AM (5%)' : '💰 KOMISI PESANAN LUNAS';
  const headerTitle = isAmOverride
    ? `Komisi Override Masuk: ${formatRupiah(commissionAmount)}! 📈`
    : `Komisi Baru Masuk: ${formatRupiah(commissionAmount)}! 🚀`;

  const headerDesc = isAmOverride
    ? `Pesanan pada jaringan toko downline Anda telah berhasil dibayar lunas.`
    : `Pesanan di bawah referal Anda telah berhasil dibayar lunas oleh pelanggan.`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); padding: 32px 28px; text-align: center; border-bottom: 1px solid #334155;">
              <div style="display: inline-block; background-color: #059669; border-radius: 9999px; padding: 6px 16px; margin-bottom: 14px;">
                <span style="font-size: 11px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
                  ${headerBadge}
                </span>
              </div>
              <h1 style="margin: 0; font-size: 23px; font-weight: 800; color: #34d399; letter-spacing: -0.3px; line-height: 1.3;">
                ${headerTitle}
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                ${headerDesc}
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px; background-color: #1e293b;">
              <!-- Greeting -->
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0; line-height: 1.5;">
                Halo, <strong>${recipientName}</strong>! 👏
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                Kabar gembira! Saldo komisi kemitraan Anda baru saja bertambah. Berikut rincian transaksi:
              </p>

              <!-- Commission Highlight Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: linear-gradient(135deg, rgba(5, 150, 105, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%); border: 1px solid #059669; border-radius: 12px; margin-bottom: 24px; padding: 18px 20px;">
                <tr>
                  <td style="font-size: 12px; color: #6ee7b7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    Komisi Masuk ke Dompet:
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 28px; color: #34d399; font-weight: 800; padding: 4px 0 2px 0;">
                    ${formatRupiah(commissionAmount)}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #a7f3d0;">
                    (${commissionRate}% ${isAmOverride ? 'AM Override dari Omzet Jaringan' : 'Komisi Penjualan'})
                  </td>
                </tr>
              </table>

              <!-- Order Details Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td colspan="2" style="padding: 14px 18px; border-bottom: 1px solid #334155;">
                    <span style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">
                      🧾 Rincian Pesanan
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #94a3b8; width: 140px;">Nomor Pesanan:</td>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 700; font-family: monospace;">#${orderId}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Asal Toko:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 600;">${storeName || storeSlug}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Produk:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 600;">${productTitle}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Nilai Transaksi:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 700;">${formatRupiah(grossAmount)}</td>
                </tr>
                ${customerName ? `
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Nama Pembeli:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #cbd5e1;">${customerName}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Status:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #10b981; font-weight: 700;">LUNAS (PAID)</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #94a3b8;">Waktu Bayar:</td>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #cbd5e1;">${paidAt}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; color: #ffffff; text-decoration: none; border-radius: 10px; background: linear-gradient(135deg, #059669 0%, #047857 100%); border: 1px solid #10b981; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
                      Cek Saldo di Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; border-top: 1px solid #334155; padding: 20px 28px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #94a3b8;">
                BoonTrack Affiliate Network &bull; PT BOONTRACK INOVASI DIGITAL
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.4;">
                Pemberitahuan Otomatis Distribusi Komisi Transaksional
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export function buildCommissionAlertText(params: {
  recipientName: string;
  isAmOverride: boolean;
  orderId: string;
  storeName: string;
  productTitle: string;
  grossAmount: number;
  commissionAmount: number;
  commissionRate: number;
  paidAt: string;
}): string {
  const {
    recipientName,
    isAmOverride,
    orderId,
    storeName,
    productTitle,
    grossAmount,
    commissionAmount,
    commissionRate,
    paidAt,
  } = params;

  return [
    `Halo, ${recipientName}!`,
    ``,
    isAmOverride
      ? `Selamat! Komisi AM Override sebesar ${formatRupiah(commissionAmount)} baru saja masuk dari pesanan downline.`
      : `Selamat! Komisi sebesar ${formatRupiah(commissionAmount)} baru saja masuk dari transaksi referal Anda.`,
    ``,
    `RINCIAN TRANSAKSI:`,
    `- Pesanan  : #${orderId}`,
    `- Toko     : ${storeName}`,
    `- Produk   : ${productTitle}`,
    `- Nilai    : ${formatRupiah(grossAmount)}`,
    `- Komisi   : ${formatRupiah(commissionAmount)} (${commissionRate}% ${isAmOverride ? 'AM Override' : 'Komisi Penjualan'})`,
    `- Status   : LUNAS (PAID)`,
    `- Waktu    : ${paidAt}`,
    ``,
    `Lihat saldo komisi lengkap di dashboard Anda:`,
    `https://shop.boontrack.com/affiliate`,
    ``,
    `Salam sukses,`,
    `BoonTrack Affiliate Network`,
    `PT BOONTRACK INOVASI DIGITAL`,
  ].join('\n');
}

/**
 * 3. Template: New Sub-Affiliate Joined under AM Alert
 */
export function buildNewAffiliateAlertHtml(params: {
  amName: string;
  affiliateName: string;
  affiliateCode: string;
  affiliateEmail: string;
  affiliatePhone?: string;
  region?: string;
  registeredAt: string;
}): string {
  const {
    amName,
    affiliateName,
    affiliateCode,
    affiliateEmail,
    affiliatePhone,
    region,
    registeredAt,
  } = params;

  const dashboardUrl = 'https://shop.boontrack.com/affiliate';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mitra Affiliate Baru Bergabung di Bawah Jaringan Anda! 🤝</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4338ca 0%, #0f172a 100%); padding: 32px 28px; text-align: center; border-bottom: 1px solid #334155;">
              <div style="display: inline-block; background-color: #6366f1; border-radius: 9999px; padding: 6px 16px; margin-bottom: 14px;">
                <span style="font-size: 11px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
                  🤝 DOWNLINE REKRUTAN BARU
                </span>
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; line-height: 1.3;">
                Mitra Baru Bergabung di Jaringan Anda! 🚀
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 13px; color: #c7d2fe; line-height: 1.5;">
                Seorang mitra affiliate baru telah mendaftar di bawah bimbingan Affiliate Manager Anda.
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px; background-color: #1e293b;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0; line-height: 1.5;">
                Halo, <strong>${amName}</strong>! 👋
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                Pool mitra downline Anda bertambah. Berikut profil mitra affiliate yang baru saja bergabung:
              </p>

              <!-- Profile Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td colspan="2" style="padding: 14px 18px; border-bottom: 1px solid #334155;">
                    <span style="font-size: 11px; font-weight: 800; color: #818cf8; text-transform: uppercase; letter-spacing: 0.5px;">
                      👤 Profil Mitra Baru
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #94a3b8; width: 140px;">Nama Lengkap:</td>
                  <td style="padding: 12px 18px 6px 18px; font-size: 13px; color: #f8fafc; font-weight: 700;">${affiliateName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Kode Referal:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #38bdf8; font-weight: 700; font-family: monospace;">${affiliateCode}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Alamat Email:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #cbd5e1;">${affiliateEmail}</td>
                </tr>
                ${affiliatePhone ? `
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Nomor WhatsApp:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #cbd5e1;">${affiliatePhone}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 6px 18px; font-size: 13px; color: #94a3b8;">Wilayah:</td>
                  <td style="padding: 6px 18px; font-size: 13px; color: #cbd5e1;">${region || 'ID-NATIONAL'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #94a3b8;">Waktu Bergabung:</td>
                  <td style="padding: 6px 18px 12px 18px; font-size: 13px; color: #cbd5e1;">${registeredAt}</td>
                </tr>
              </table>

              <!-- AM Benefit Highlight -->
              <div style="background-color: rgba(99, 102, 241, 0.1); border-left: 3px solid #6366f1; padding: 12px 16px; border-radius: 6px; margin-bottom: 28px;">
                <p style="margin: 0; font-size: 12px; color: #c7d2fe; line-height: 1.5;">
                  🌟 <strong>Hak Override 5%:</strong> Seluruh omzet dan toko aktif yang dihasilkan oleh mitra ini akan memberikan komisi pembinaan (AM Override) sebesar 5% untuk Anda.
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 800; color: #ffffff; text-decoration: none; border-radius: 10px; background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); border: 1px solid #6366f1; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);">
                      Pantau Jaringan Downline &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; border-top: 1px solid #334155; padding: 20px 28px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #94a3b8;">
                BoonTrack Affiliate Network &bull; PT BOONTRACK INOVASI DIGITAL
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.4;">
                Portal Kemitraan Resmi &amp; Manajemen Jaringan Affiliate Manager
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export function buildNewAffiliateAlertText(params: {
  amName: string;
  affiliateName: string;
  affiliateCode: string;
  affiliateEmail: string;
  affiliatePhone?: string;
  region?: string;
  registeredAt: string;
}): string {
  const { amName, affiliateName, affiliateCode, affiliateEmail, affiliatePhone, region, registeredAt } = params;
  return [
    `Halo, ${amName}!`,
    ``,
    `Seorang mitra affiliate baru telah bergabung di bawah jaringan pembinaan Anda:`,
    ``,
    `PROFIL MITRA BARU:`,
    `- Nama      : ${affiliateName}`,
    `- Kode Ref  : ${affiliateCode}`,
    `- Email     : ${affiliateEmail}`,
    `- WhatsApp  : ${affiliatePhone || '-'}`,
    `- Wilayah   : ${region || 'ID-NATIONAL'}`,
    `- Waktu     : ${registeredAt}`,
    ``,
    `Setiap omzet yang dihasilkan mitra ini akan memberikan hak override 5% untuk Anda.`,
    ``,
    `Pantau jaringan Anda di dashboard:`,
    `https://shop.boontrack.com/affiliate`,
    ``,
    `Salam sukses,`,
    `BoonTrack Affiliate Network`,
    `PT BOONTRACK INOVASI DIGITAL`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH TRIGGERS (Zero-Hardcoding, Dynamic Database Resolvers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TRIGGER 1: New Store / Tenant Registration under Referral Network
 * Dispatches notification to:
 * 1) Direct recruiter affiliate (if email available)
 * 2) Parent AM (if recruiter has a parent AM and parent AM email is distinct)
 */
export async function sendNewStoreReferralNotification(params: {
  storeName: string;
  slug: string;
  merchantName?: string;
  merchantPhone?: string;
  merchantEmail?: string;
  planTier?: string;
  selectedPlan?: string;
  isTrial?: boolean;
  referralCode?: string | null;
  affiliateId?: string | null;
  tenantId?: string;
}): Promise<{ success: boolean; dispatchedTo: string[] }> {
  const {
    storeName,
    slug,
    merchantName,
    merchantPhone,
    planTier,
    selectedPlan,
    isTrial,
    referralCode,
    affiliateId,
    tenantId,
  } = params;

  const dispatchedTo: string[] = [];

  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.warn('[NewStoreNotification] Supabase database unreachable');
      return { success: false, dispatchedTo };
    }

    const cleanRef = (referralCode || '').trim().toLowerCase();
    let directRecruiter: any = null;

    // 1. Resolve recruiter by affiliateId or referralCode
    if (affiliateId) {
      const { data: affById } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', affiliateId)
        .maybeSingle();
      if (affById) directRecruiter = affById;
    }

    if (!directRecruiter && cleanRef && cleanRef !== '1' && cleanRef !== 'null') {
      const { data: affByCode } = await supabase
        .from('affiliates')
        .select('*')
        .ilike('referral_code', cleanRef)
        .maybeSingle();
      if (affByCode) directRecruiter = affByCode;
    }

    // Fallback: check attributions table if tenantId provided
    if (!directRecruiter && tenantId) {
      const { data: attrRow } = await supabase
        .from('attributions')
        .select('affiliate_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (attrRow?.affiliate_id) {
        const { data: affByAttr } = await supabase
          .from('affiliates')
          .select('*')
          .eq('id', attrRow.affiliate_id)
          .maybeSingle();
        if (affByAttr) directRecruiter = affByAttr;
      }
    }

    if (!directRecruiter) {
      // Organic registration without referral code - skip notification silently
      return { success: true, dispatchedTo };
    }

    const registeredAt = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const displayPlan = selectedPlan || (isTrial ? 'Ads Performance Trial 7 Hari' : (planTier || 'Paket Toko'));

    // A. Dispatch to Direct Recruiter
    const recruiterEmail = directRecruiter.email || directRecruiter.metadata?.email;
    if (recruiterEmail && recruiterEmail.includes('@')) {
      const subject = `[BoonTrack Affiliate] 🏪 Toko Baru Bergabung di Jaringan Anda: ${storeName}`;
      const html = buildNewStoreAlertHtml({
        recipientName: directRecruiter.name || 'Mitra Affiliate',
        isParentAm: false,
        storeName,
        storeSlug: slug,
        planName: displayPlan,
        merchantName,
        merchantPhone,
        referralCode: directRecruiter.referral_code,
        registeredAt,
      });
      const text = buildNewStoreAlertText({
        recipientName: directRecruiter.name || 'Mitra Affiliate',
        isParentAm: false,
        storeName,
        storeSlug: slug,
        planName: displayPlan,
        registeredAt,
      });

      const res = await sendAffiliateEmail({ to: recruiterEmail, subject, html, text });
      if (res.success) {
        dispatchedTo.push(recruiterEmail);
      }
    }

    // B. Dispatch to Parent AM (if recruiter is a sub-affiliate with parent_am_id)
    const parentAmId = directRecruiter.parent_am_id;
    if (parentAmId && parentAmId !== directRecruiter.id) {
      const { data: parentAm } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', parentAmId)
        .maybeSingle();

      const amEmail = parentAm?.email || parentAm?.metadata?.email;
      if (amEmail && amEmail.includes('@') && amEmail !== recruiterEmail) {
        const amSubject = `[BoonTrack Affiliate] 🚀 Mitra Downline (${directRecruiter.name}) Merekrut Toko Baru: ${storeName}`;
        const amHtml = buildNewStoreAlertHtml({
          recipientName: parentAm.name || 'Affiliate Manager',
          isParentAm: true,
          recruiterName: directRecruiter.name,
          recruiterCode: directRecruiter.referral_code,
          storeName,
          storeSlug: slug,
          planName: displayPlan,
          merchantName,
          merchantPhone,
          registeredAt,
        });
        const amText = buildNewStoreAlertText({
          recipientName: parentAm.name || 'Affiliate Manager',
          isParentAm: true,
          recruiterName: directRecruiter.name,
          recruiterCode: directRecruiter.referral_code,
          storeName,
          storeSlug: slug,
          planName: displayPlan,
          registeredAt,
        });

        const amRes = await sendAffiliateEmail({ to: amEmail, subject: amSubject, html: amHtml, text: amText });
        if (amRes.success) {
          dispatchedTo.push(amEmail);
        }
      }
    }

    return { success: true, dispatchedTo };
  } catch (err) {
    console.warn('[NewStoreNotification] Non-fatal notification error:', err);
    return { success: false, dispatchedTo };
  }
}

/**
 * TRIGGER 2: Order / Transaction Success & Commission Alert
 * Dispatches notification to:
 * 1) Direct recruiter affiliate (or affiliate attached to the order)
 * 2) Parent AM (5% override alert on downline orders)
 * 3) Also records commission rows into `affiliate_commissions` table in Supabase.
 */
export async function sendOrderCommissionAlert(params: {
  orderId: string;
  tenantSlug?: string;
  tenantId?: string;
  productTitle: string;
  grossAmount: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  affiliateCode?: string | null;
  directCommission?: number;
}): Promise<{ success: boolean; dispatchedTo: string[] }> {
  const {
    orderId,
    tenantSlug,
    tenantId,
    productTitle,
    grossAmount,
    customerName,
    affiliateCode,
    directCommission,
  } = params;

  const dispatchedTo: string[] = [];

  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.warn('[OrderCommissionAlert] Supabase database unreachable');
      return { success: false, dispatchedTo };
    }

    let recruiterAffiliate: any = null;
    let resolvedTenantSlug = tenantSlug;

    // 1. Resolve by order's direct affiliate_code if available
    const cleanOrderAffCode = (affiliateCode || '').trim().toLowerCase();
    if (cleanOrderAffCode && cleanOrderAffCode !== 'null') {
      const { data: affByOrderCode } = await supabase
        .from('affiliates')
        .select('*')
        .ilike('referral_code', cleanOrderAffCode)
        .maybeSingle();
      if (affByOrderCode) recruiterAffiliate = affByOrderCode;
    }

    // 2. Resolve by tenant's attribution or metadata (Jaringan Toko Rekrutan)
    if (!recruiterAffiliate && (tenantSlug || tenantId)) {
      let tQuery = supabase.from('tenants').select('id, slug, name, metadata');
      if (tenantId) {
        tQuery = tQuery.eq('id', tenantId);
      } else if (tenantSlug) {
        tQuery = tQuery.eq('slug', tenantSlug);
      }

      const { data: tenantData } = await tQuery.maybeSingle();

      if (tenantData) {
        resolvedTenantSlug = tenantData.slug || resolvedTenantSlug;
        const meta = tenantData.metadata || {};
        const metaRefCode = (meta.referral_code || meta.ref || meta.affiliate_code || '').trim().toLowerCase();
        const metaAffId = meta.affiliate_id || meta.referrer_id;

        if (metaAffId) {
          const { data: affById } = await supabase
            .from('affiliates')
            .select('*')
            .eq('id', metaAffId)
            .maybeSingle();
          if (affById) recruiterAffiliate = affById;
        }

        if (!recruiterAffiliate && metaRefCode && metaRefCode !== '1' && metaRefCode !== 'null') {
          const { data: affByMetaRef } = await supabase
            .from('affiliates')
            .select('*')
            .ilike('referral_code', metaRefCode)
            .maybeSingle();
          if (affByMetaRef) recruiterAffiliate = affByMetaRef;
        }

        // 3. Fallback to attributions table for tenant_id
        if (!recruiterAffiliate && tenantData.id) {
          const { data: attrRow } = await supabase
            .from('attributions')
            .select('affiliate_id')
            .eq('tenant_id', tenantData.id)
            .maybeSingle();

          if (attrRow?.affiliate_id) {
            const { data: affByAttr } = await supabase
              .from('affiliates')
              .select('*')
              .eq('id', attrRow.affiliate_id)
              .maybeSingle();
            if (affByAttr) recruiterAffiliate = affByAttr;
          }
        }
      }
    }

    if (!recruiterAffiliate) {
      // Transaction is not under any affiliate network - skip silently
      return { success: true, dispatchedTo };
    }

    const paidAt = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Calculate Direct Commission
    const rawRate = Number(recruiterAffiliate.commission_rate) || 25;
    const directRatePercent = rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);
    const calculatedCommission = directCommission && directCommission > 0
      ? directCommission
      : Math.round(grossAmount * (directRatePercent / 100));

    // A. Dispatch to Direct Affiliate
    const affEmail = recruiterAffiliate.email || recruiterAffiliate.metadata?.email;
    if (affEmail && affEmail.includes('@')) {
      const subject = `[BoonTrack Affiliate] 💰 Komisi Masuk: Pesanan #${orderId} Telah Lunas (${formatRupiah(calculatedCommission)})`;
      const html = buildCommissionAlertHtml({
        recipientName: recruiterAffiliate.name || 'Mitra Affiliate',
        isAmOverride: false,
        orderId,
        storeName: resolvedTenantSlug || 'Toko Mitra',
        storeSlug: resolvedTenantSlug || '',
        productTitle,
        grossAmount,
        commissionAmount: calculatedCommission,
        commissionRate: directRatePercent,
        customerName,
        paidAt,
      });
      const text = buildCommissionAlertText({
        recipientName: recruiterAffiliate.name || 'Mitra Affiliate',
        isAmOverride: false,
        orderId,
        storeName: resolvedTenantSlug || 'Toko Mitra',
        productTitle,
        grossAmount,
        commissionAmount: calculatedCommission,
        commissionRate: directRatePercent,
        paidAt,
      });

      const res = await sendAffiliateEmail({ to: affEmail, subject, html, text });
      if (res.success) {
        dispatchedTo.push(affEmail);
      }
    }

    // Record direct commission into affiliate_commissions table
    try {
      await supabase.from('affiliate_commissions').insert({
        order_id: String(orderId),
        tenant_id: resolvedTenantSlug || tenantId || 'platform',
        affiliate_id: recruiterAffiliate.id,
        amount: calculatedCommission,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      });
    } catch (commErr) {
      console.warn('[OrderCommissionAlert] Non-fatal commission record note:', commErr);
    }

    // B. Dispatch AM 5% Override (if recruiter has a parent AM)
    const parentAmId = recruiterAffiliate.parent_am_id;
    if (parentAmId && parentAmId !== recruiterAffiliate.id) {
      const { data: parentAm } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', parentAmId)
        .maybeSingle();

      if (parentAm) {
        const amOverrideAmount = Math.round(grossAmount * 0.05); // 5% AM Override
        const amEmail = parentAm.email || parentAm.metadata?.email;

        if (amEmail && amEmail.includes('@') && amEmail !== affEmail) {
          const amSubject = `[BoonTrack Affiliate] 💰 Komisi Override AM Masuk: Pesanan #${orderId} (${formatRupiah(amOverrideAmount)})`;
          const amHtml = buildCommissionAlertHtml({
            recipientName: parentAm.name || 'Affiliate Manager',
            isAmOverride: true,
            orderId,
            storeName: resolvedTenantSlug || 'Toko Downline',
            storeSlug: resolvedTenantSlug || '',
            productTitle,
            grossAmount,
            commissionAmount: amOverrideAmount,
            commissionRate: 5,
            customerName,
            paidAt,
          });
          const amText = buildCommissionAlertText({
            recipientName: parentAm.name || 'Affiliate Manager',
            isAmOverride: true,
            orderId,
            storeName: resolvedTenantSlug || 'Toko Downline',
            productTitle,
            grossAmount,
            commissionAmount: amOverrideAmount,
            commissionRate: 5,
            paidAt,
          });

          const amRes = await sendAffiliateEmail({ to: amEmail, subject: amSubject, html: amHtml, text: amText });
          if (amRes.success) {
            dispatchedTo.push(amEmail);
          }
        }

        // Record override commission
        try {
          await supabase.from('affiliate_commissions').insert({
            order_id: String(orderId),
            tenant_id: resolvedTenantSlug || tenantId || 'platform',
            affiliate_id: parentAm.id,
            amount: amOverrideAmount,
            status: 'PENDING',
            created_at: new Date().toISOString(),
          });
        } catch (commErr) {
          console.warn('[OrderCommissionAlert] Non-fatal AM override commission record note:', commErr);
        }
      }
    }

    return { success: true, dispatchedTo };
  } catch (err) {
    console.warn('[OrderCommissionAlert] Non-fatal commission alert error:', err);
    return { success: false, dispatchedTo };
  }
}

/**
 * TRIGGER 3: New Sub-Affiliate Registered under AM
 * Dispatches notification to the upline Affiliate Manager.
 */
export async function sendNewAffiliateRegistrationNotification(params: {
  affiliateName: string;
  affiliateEmail: string;
  affiliatePhone?: string;
  affiliateCode: string;
  amCodeOrId?: string;
  parentAmId?: string;
  region?: string;
}): Promise<{ success: boolean; dispatchedTo: string[] }> {
  const {
    affiliateName,
    affiliateEmail,
    affiliatePhone,
    affiliateCode,
    amCodeOrId,
    parentAmId,
    region,
  } = params;

  const dispatchedTo: string[] = [];

  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.warn('[NewAffiliateNotification] Supabase database unreachable');
      return { success: false, dispatchedTo };
    }

    let parentAm: any = null;

    if (parentAmId) {
      const { data: amById } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', parentAmId)
        .maybeSingle();
      if (amById) parentAm = amById;
    }

    if (!parentAm && amCodeOrId) {
      const cleanAmCode = amCodeOrId.trim().toLowerCase();
      // Check by referral_code or id
      const { data: amByCode } = await supabase
        .from('affiliates')
        .select('*')
        .or(`referral_code.ilike.${cleanAmCode},id.eq.${cleanAmCode}`)
        .maybeSingle();
      if (amByCode) parentAm = amByCode;
    }

    // Default master AM fallback if nothing matched (Kang Sakti)
    if (!parentAm) {
      const { data: defaultMasterAm } = await supabase
        .from('affiliates')
        .select('*')
        .eq('role', 'am')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (defaultMasterAm) parentAm = defaultMasterAm;
    }

    if (!parentAm) {
      return { success: false, dispatchedTo };
    }

    const amEmail = parentAm.email || parentAm.metadata?.email;
    if (!amEmail || !amEmail.includes('@')) {
      console.warn(`[NewAffiliateNotification] Parent AM (${parentAm.name}) has no valid email.`);
      return { success: false, dispatchedTo };
    }

    const registeredAt = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `[BoonTrack Affiliate] 🤝 Mitra Baru Bergabung di Bawah Jaringan Anda: ${affiliateName} (${affiliateCode})`;
    const html = buildNewAffiliateAlertHtml({
      amName: parentAm.name || 'Affiliate Manager',
      affiliateName,
      affiliateCode,
      affiliateEmail,
      affiliatePhone,
      region,
      registeredAt,
    });
    const text = buildNewAffiliateAlertText({
      amName: parentAm.name || 'Affiliate Manager',
      affiliateName,
      affiliateCode,
      affiliateEmail,
      affiliatePhone,
      region,
      registeredAt,
    });

    const res = await sendAffiliateEmail({ to: amEmail, subject, html, text });
    if (res.success) {
      dispatchedTo.push(amEmail);
    }

    return { success: true, dispatchedTo };
  } catch (err) {
    console.warn('[NewAffiliateNotification] Non-fatal notification error:', err);
    return { success: false, dispatchedTo };
  }
}
