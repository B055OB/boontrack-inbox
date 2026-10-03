/**
 * @file lib/email/templates/broadcast-release.ts
 * @description Premium Enterprise Modern Broadcast Email HTML & Text Suite (BoonTrack Brand Suite).
 * Compatible with all email clients (Gmail, Apple Mail, Outlook, Yahoo) using bulletproof tables,
 * inline styles, Outlook MSO conditional markup, and responsive typography.
 */

import { BroadcastEmailPayload, BroadcastFeatureHighlight } from '../types';

/**
 * Escapes HTML entities for security
 */
function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Default feature highlights if none provided
 */
const DEFAULT_FEATURES: BroadcastFeatureHighlight[] = [
  {
    icon: '📍',
    title: 'WhatsApp Native Pinpoint Parser',
    description: 'Deteksi koordinat lintang/bujur pelanggan langsung dari pin location chat WhatsApp untuk akurasi pengiriman kurir instan.',
    badge: 'Baru',
  },
  {
    icon: '⚡',
    title: 'Kalkulasi Ongkir Kurir Instan (GoSend & Grab)',
    description: 'Hitung jarak radius kilometer dari dapur toko dan tarif flat otomatis tanpa setup manual yang rumit.',
    badge: 'Otomatis',
  },
  {
    icon: '🧾',
    title: 'Universal Storefront Invoice Viewer',
    description: 'Akses dan cetak invoice resmi pelanggan berkecepatan tinggi langsung di domain publik toko (shop.boontrack.com).',
    badge: 'Pembaruan',
  },
];

/**
 * Builds the enterprise-grade responsive HTML email for platform broadcasts and release notes.
 */
export function buildBroadcastEmailHtml(payload: BroadcastEmailPayload): string {
  const storeName = payload.storeName || (payload.tenantSlug ? payload.tenantSlug.toUpperCase() : 'BoonTrack Merchant');
  const recipientGreeting = payload.recipientName
    ? `Halo <strong>${escapeHtml(payload.recipientName)}</strong>,`
    : `Halo Rekan Merchant <strong>${escapeHtml(storeName)}</strong>,`;

  const versionBadge = escapeHtml(payload.versionBadge || 'v3.2.0 • Release');
  const platformStatus = escapeHtml(payload.platformStatus || 'SISTEM AKTIF & STABIL');
  const eyebrow = escapeHtml(payload.eyebrow || 'PEMBERITAHUAN RESMI EKOSISTEM BOONTRACK');
  const headline = escapeHtml(payload.headline || 'Pembaruan Besar Ekosistem BoonTrack Commerce');
  const subheadline = escapeHtml(
    payload.subheadline ||
      'Kami baru saja merilis rangkaian fitur baru untuk mempercepat konversi penjualan, otomatisasi CS WhatsApp, dan kemudahan pencetakan invoice toko Anda.'
  );

  const features = payload.features && payload.features.length > 0 ? payload.features : DEFAULT_FEATURES;

  const dashboardBase = payload.tenantSlug
    ? `https://shop.boontrack.com/${encodeURIComponent(payload.tenantSlug.trim())}`
    : 'https://shop.boontrack.com';

  const primaryCtaText = escapeHtml(payload.primaryCtaText || 'Buka Dashboard Toko Sekarang &rarr;').replace(/&amp;rarr;/g, '&rarr;');
  const primaryCtaUrl = payload.primaryCtaUrl || dashboardBase;

  const secondaryCtaText = payload.secondaryCtaText
    ? escapeHtml(payload.secondaryCtaText).replace(/&amp;rarr;/g, '&rarr;')
    : 'Lihat Dokumentasi Lengkap &rarr;';
  const secondaryCtaUrl = payload.secondaryCtaUrl || 'https://boontrack.com/docs';

  const unsubscribeUrl = payload.unsubscribeUrl || `${dashboardBase}?tab=settings&section=notifications`;
  const preferencesUrl = payload.preferencesUrl || `${dashboardBase}?tab=settings&section=notifications`;
  const helpDocsUrl = payload.helpDocsUrl || 'https://boontrack.com/docs';
  const termsUrl = payload.termsUrl || 'https://boontrack.com/terms';

  // Render Feature Highlight Cards
  const featuresHtml = features
    .map((feat) => {
      const icon = feat.icon || '✨';
      const title = escapeHtml(feat.title);
      const desc = escapeHtml(feat.description);
      const badge = feat.badge ? escapeHtml(feat.badge) : null;

      return `
      <tr>
        <td style="padding-bottom: 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px;">
            <tr>
              <td width="44" valign="top" style="vertical-align: top; padding-right: 14px;">
                <div style="width: 40px; height: 40px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; text-align: center; line-height: 40px; font-size: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  ${icon}
                </div>
              </td>
              <td valign="top" style="vertical-align: top;">
                <div style="margin-bottom: 4px;">
                  <span style="font-size: 15px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                    ${title}
                  </span>
                  ${
                    badge
                      ? `<span style="display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; padding: 2px 7px; border-radius: 9999px; letter-spacing: 0.04em;">
                          ${badge}
                        </span>`
                      : ''
                  }
                </div>
                <div style="font-size: 13px; color: #475569; line-height: 1.55;">
                  ${desc}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="id" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset & Client-Specific Styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    
    /* Responsive Media Queries */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .headline { font-size: 22px !important; line-height: 1.25 !important; }
      .hero-box { padding: 24px 20px !important; }
      .footer-links { display: block !important; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120;">
  <!-- PREHEADER TEXT (Invisible in email body, visible in inbox preview) -->
  <div style="display: none; font-size: 1px; color: #0b1120; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${headline} &ndash; ${subheadline}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0b1120; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 32px 12px 48px 12px;">
        <!-- MAIN CONTAINER -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.4); border: 1px solid #1e293b;">
          
          <!-- 1. HEADER (BRAND SUITE & VERSION RELEASE BADGE) -->
          <tr>
            <td style="background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); padding: 36px 32px 28px 32px; text-align: center; border-bottom: 1px solid #334155;">
              <!-- Brand Identity Logo -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 18px auto;">
                <tr>
                  <td style="background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%); border-radius: 12px; width: 40px; height: 40px; text-align: center; vertical-align: middle; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                    <span style="color: #ffffff; font-size: 22px; font-weight: 900; line-height: 40px; display: inline-block;">B</span>
                  </td>
                  <td style="padding-left: 12px; font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;">
                    BoonTrack<span style="color: #60a5fa;">.</span>
                  </td>
                </tr>
              </table>

              <!-- Release Version & Status Badges -->
              <div style="margin-top: 6px;">
                <span style="display: inline-block; background-color: rgba(59, 130, 246, 0.15); border: 1px solid rgba(96, 165, 250, 0.3); color: #93c5fd; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 14px; border-radius: 9999px; margin-right: 6px;">
                  🚀 ${versionBadge}
                </span>
                <span style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(52, 211, 153, 0.3); color: #6ee7b7; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px;">
                  ● ${platformStatus}
                </span>
              </div>
            </td>
          </tr>

          <!-- 2. HERO SECTION -->
          <tr>
            <td class="hero-box fluid-padding" style="padding: 36px 36px 24px 36px; background-color: #ffffff;">
              <!-- Eyebrow -->
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #2563eb; letter-spacing: 0.08em; margin-bottom: 8px;">
                ${eyebrow}
              </div>

              <!-- Main Headline -->
              <h1 class="headline" style="margin: 0 0 14px 0; font-size: 25px; font-weight: 900; color: #0f172a; line-height: 1.25; letter-spacing: -0.02em;">
                ${headline}
              </h1>

              <!-- Greeting & Subheadline -->
              <p style="margin: 0 0 14px 0; font-size: 14px; color: #334155; line-height: 1.6;">
                ${recipientGreeting}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                ${subheadline}
              </p>

              ${
                payload.customMessageHtml
                  ? `<div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 14px 16px; border-radius: 0 10px 10px 0; font-size: 13px; color: #334155; margin-bottom: 24px; line-height: 1.5;">
                      ${payload.customMessageHtml}
                    </div>`
                  : ''
              }

              <!-- Section Divider -->
              <div style="height: 1px; background-color: #f1f5f9; margin-bottom: 24px;"></div>

              <!-- Feature Highlights Header -->
              <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.06em; margin-bottom: 16px;">
                Sorotan Pembaruan Fitur:
              </div>

              <!-- Feature Cards Table -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${featuresHtml}
              </table>

              <!-- 3. ACTION BUTTON (CTA) -->
              <div style="text-align: center; margin: 32px 0 18px 0;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${primaryCtaUrl}" style="height:50px;v-text-anchor:middle;width:320px;" arcsize="20%" stroke="f" fillcolor="#2563eb">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">
                    ${primaryCtaText}
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${primaryCtaUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; text-decoration: none; padding: 16px 36px; border-radius: 12px; font-size: 15px; font-weight: 800; letter-spacing: 0.01em; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35); text-align: center; transition: all 0.2s ease;">
                  ${primaryCtaText}
                </a>
                <!--<![endif]-->
              </div>

              <!-- Secondary Link -->
              <div style="text-align: center; margin-bottom: 8px;">
                <a href="${secondaryCtaUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 13px; font-weight: 700; color: #475569; text-decoration: none; display: inline-block;">
                  ${secondaryCtaText}
                </a>
              </div>
            </td>
          </tr>

          <!-- 4. FOOTER EKOSISTEM -->
          <tr>
            <td class="fluid-padding" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 32px 36px; text-align: center;">
              <!-- Ecosystem Links -->
              <div style="margin-bottom: 20px; font-size: 12px; font-weight: 700;">
                <a href="${helpDocsUrl}" style="color: #64748b; text-decoration: none; margin: 0 8px;">Panduan Dokumentasi</a>
                <span style="color: #cbd5e1;">&bull;</span>
                <a href="https://wa.me/6281222222222" style="color: #64748b; text-decoration: none; margin: 0 8px;">Pusat Bantuan WhatsApp</a>
                <span style="color: #cbd5e1;">&bull;</span>
                <a href="https://status.boontrack.com" style="color: #64748b; text-decoration: none; margin: 0 8px;">Status Layanan</a>
                <span style="color: #cbd5e1;">&bull;</span>
                <a href="${termsUrl}" style="color: #64748b; text-decoration: none; margin: 0 8px;">Ketentuan Layanan</a>
              </div>

              <!-- Notification Preferences & Unsubscribe -->
              <p style="margin: 0 0 10px 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                Anda menerima siaran ini karena akun toko <strong>${escapeHtml(storeName)}</strong> aktif terdaftar pada ekosistem BoonTrack Commerce.<br>
                Ingin mengatur frekuensi pengumuman? 
                <a href="${preferencesUrl}" style="color: #2563eb; text-decoration: underline;">Kelola Preferensi Notifikasi</a>
                atau 
                <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Berhenti Berlangganan</a>.
              </p>

              <!-- Legal & Copyright -->
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; 2026 BoonTrack Platform by PT Boon Digital Omnichannel.<br>
                Gedung Cyber 2 Lantai 18, HR Rasuna Said, Jakarta Selatan, 12950.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the clean, readable plain-text email version for low-bandwidth clients and anti-spam deliverability.
 */
export function buildBroadcastEmailText(payload: BroadcastEmailPayload): string {
  const storeName = payload.storeName || (payload.tenantSlug ? payload.tenantSlug.toUpperCase() : 'BoonTrack Merchant');
  const greeting = payload.recipientName
    ? `Halo ${payload.recipientName},`
    : `Halo Rekan Merchant ${storeName},`;

  const versionBadge = payload.versionBadge || 'v3.2.0 • Release';
  const headline = payload.headline || 'Pembaruan Besar Ekosistem BoonTrack Commerce';
  const subheadline =
    payload.subheadline ||
    'Kami baru saja merilis rangkaian fitur baru untuk mempercepat konversi penjualan toko Anda.';

  const features = payload.features && payload.features.length > 0 ? payload.features : DEFAULT_FEATURES;

  const dashboardBase = payload.tenantSlug
    ? `https://shop.boontrack.com/${encodeURIComponent(payload.tenantSlug.trim())}`
    : 'https://shop.boontrack.com';

  const primaryCtaText = payload.primaryCtaText || 'Buka Dashboard Toko Sekarang';
  const primaryCtaUrl = payload.primaryCtaUrl || dashboardBase;
  const secondaryCtaUrl = payload.secondaryCtaUrl || 'https://boontrack.com/docs';
  const unsubscribeUrl = payload.unsubscribeUrl || `${dashboardBase}?tab=settings&section=notifications`;

  const lines = [
    `============================================================`,
    `BOONTRACK PLATFORM BROADCAST [${versionBadge}]`,
    `============================================================`,
    ``,
    headline.toUpperCase(),
    ``,
    greeting,
    ``,
    subheadline,
    ``,
    `------------------------------------------------------------`,
    `SOROTAN FITUR & PEMBARUAN:`,
    `------------------------------------------------------------`,
    ...features.flatMap((f) => [
      `* [${f.badge || 'UPDATE'}] ${f.title}`,
      `  ${f.description}`,
      ``,
    ]),
    `------------------------------------------------------------`,
    `${primaryCtaText.toUpperCase()}:`,
    primaryCtaUrl,
    ``,
    `Dokumentasi & Panduan Lengkap:`,
    secondaryCtaUrl,
    ``,
    `------------------------------------------------------------`,
    `PENGATURAN PREFERENSI & PANDUAN:`,
    `- Kelola notifikasi / Berhenti berlangganan: ${unsubscribeUrl}`,
    `- Pusat Bantuan: https://boontrack.com/docs`,
    ``,
    `(c) 2026 BoonTrack Platform by PT Boon Digital Omnichannel.`,
  ];

  return lines.join('\n');
}
