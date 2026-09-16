/**
 * Boon Pilot Email Service
 * Centralized email delivery system using Resend API with friendly Boon Pilot persona.
 */

export interface BoonPilotEmailOptions {
  to: string;
  name?: string;
  role?: 'seller' | 'merchant' | 'affiliate';
  verificationUrl: string;
  storeName?: string;
  expiresInHours?: number;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  senderUsed?: string;
}

/**
 * Build responsive HTML template with friendly Boon Pilot persona
 */
export function buildBoonPilotVerificationHtml(options: BoonPilotEmailOptions): string {
  const {
    name = 'Sahabat Merchant',
    role = 'merchant',
    verificationUrl,
    storeName,
    expiresInHours = 24,
  } = options;

  const displayName = name.trim() || 'Sahabat BoonTrack';
  const targetDesc = role === 'affiliate'
    ? 'akun kemitraan Affiliate BoonTrack'
    : `toko online ${storeName ? `<strong>${storeName}</strong>` : ''} di BoonTrack`;

  const subject = options.role === 'affiliate'
    ? 'Halo dari Boon Pilot! 🚀 Konfirmasi kemitraan affiliate BoonTrack kamu yuk'
    : 'Halo dari Boon Pilot! 🚀 Konfirmasi akun BoonTrack kamu yuk';

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center; background: linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(19, 27, 46, 0) 100%);">
              <div style="display: inline-block; background-color: #064e3b; border: 1px solid #10b981; border-radius: 9999px; padding: 6px 16px; margin-bottom: 16px;">
                <span style="font-size: 13px; font-weight: 700; color: #34d399; letter-spacing: 0.5px;">🚀 BOON PILOT AI COPILOT</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                Halo dari Boon Pilot! 🚀
              </h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 0 36px 32px 36px;">
              <!-- Persona Intro -->
              <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #f8fafc;">
                  <strong>Halo, ${displayName}!</strong> 👋
                </p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                  Aku <strong>Boon Pilot</strong>, asisten digital yang bakal nemenin kamu ngembangin ${targetDesc}.
                </p>
              </div>

              <!-- Main Instruction -->
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                Verifikasi satu klik ini diperlukan untuk mengaktifkan AI asisten dan membuka akses dashboard penuh tokomu. Yuk klik tombol di bawah untuk mulai:
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; padding: 16px 36px; border-radius: 14px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); letter-spacing: 0.3px;">
                      Aktifkan Akun &amp; Mulai Bareng Boon Pilot &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alternative Link -->
              <div style="background-color: #0f172a; border-radius: 12px; padding: 14px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b;">
                  Jika tombol di atas tidak berfungsi, salin dan buka tautan ini di browser kamu:
                </p>
                <p style="margin: 0; font-size: 11px; color: #38bdf8; word-break: break-all; font-family: monospace;">
                  <a href="${verificationUrl}" style="color: #38bdf8; text-decoration: underline;">${verificationUrl}</a>
                </p>
              </div>

              <!-- Security Notice -->
              <div style="border-top: 1px solid #1e293b; padding-top: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                  ⏱️ <em>Tautan aktivasi ini berlaku selama ${expiresInHours} jam.</em>
                </p>
                <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                  🛡️ Jika kamu tidak pernah mendaftar di BoonTrack, silakan abaikan email ini dengan aman.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #0b0f19; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #94a3b8;">
                Salam hangat, Boon Pilot 🚀
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                PT Boon Digital Ekosistem &bull; <a href="https://boontrack.com" style="color: #10b981; text-decoration: none;">boontrack.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send Boon Pilot verification email via Resend
 */
export async function sendBoonPilotVerificationEmail(
  options: BoonPilotEmailOptions
): Promise<SendEmailResult> {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim().replace(/^["']|["']$/g, '');

  if (!resendApiKey) {
    console.warn('[BoonPilotEmail] RESEND_API_KEY is not configured in environment.');
    return { success: false, error: 'RESEND_API_KEY tidak terpasang.' };
  }

  const primarySender = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Boon Pilot <pilot@boontrack.com>';
  const fallbackSender = process.env.RESEND_FROM_FALLBACK || 'Boon Pilot <affiliate@boontrack.com>';

  const subject = options.role === 'affiliate'
    ? 'Halo dari Boon Pilot! 🚀 Konfirmasi kemitraan affiliate BoonTrack kamu yuk'
    : 'Halo dari Boon Pilot! 🚀 Konfirmasi akun BoonTrack kamu yuk';
  const htmlContent = buildBoonPilotVerificationHtml(options);

  // Attempt 1: Send using Primary Sender
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: primarySender,
        to: [options.to],
        subject,
        html: htmlContent,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.id) {
      return {
        success: true,
        messageId: data.id,
        senderUsed: primarySender,
      };
    }

    console.warn('[BoonPilotEmail] Primary sender failed, attempting fallback...', data);
  } catch (err) {
    console.warn('[BoonPilotEmail] Error on primary sender attempt:', err);
  }

  // Attempt 2: Fallback sender
  try {
    const fallbackRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fallbackSender,
        to: [options.to],
        subject,
        html: htmlContent,
      }),
    });

    const fallbackData = await fallbackRes.json().catch(() => ({}));

    if (fallbackRes.ok && fallbackData?.id) {
      return {
        success: true,
        messageId: fallbackData.id,
        senderUsed: fallbackSender,
      };
    }

    console.warn('[BoonPilotEmail] Fallback sender note, trying onboarding@resend.dev...', fallbackData);
  } catch (fallbackErr) {
    console.warn('[BoonPilotEmail] Error on fallback sender attempt:', fallbackErr);
  }

  // Attempt 3: Default Resend testing sender if custom domain is not yet verified
  try {
    const devRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Boon Pilot <onboarding@resend.dev>',
        to: [options.to],
        subject,
        html: htmlContent,
      }),
    });

    const devData = await devRes.json().catch(() => ({}));

    if (devRes.ok && devData?.id) {
      return {
        success: true,
        messageId: devData.id,
        senderUsed: 'Boon Pilot <onboarding@resend.dev>',
      };
    }

    const errDetail = devData?.message || devData?.error || 'Gagal mengirim email via Resend API.';
    return {
      success: false,
      error: errDetail,
    };
  } catch (devErr: unknown) {
    const msg = devErr instanceof Error ? devErr.message : 'Kesalahan jaringan saat memanggil Resend API.';
    return {
      success: false,
      error: msg,
    };
  }
}
