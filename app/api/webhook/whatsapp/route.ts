import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  normalizeWhatsAppNumber,
  sendWhatsAppSessionMessage,
} from '@/lib/whatsapp';
import { extractActivationCode, processStoreActivation } from '@/lib/whatsapp/activation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from '@/lib/whatsapp/meta-webhook-normalizer';

/**
 * Meta Webhook Challenge Verification (GET)
 * Digunakan oleh Meta Developer Portal saat melakukan registrasi & verifikasi URL Webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const result = verifyMetaWebhookChallenge(searchParams);

    if (result.isValid) {
      console.log('[WhatsApp Webhook] Handshake verified successfully.');
      return new NextResponse(result.challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('[WhatsApp Webhook] Handshake failed: invalid verify_token.');
    return new NextResponse('Forbidden: Token mismatch', { status: 403 });
  } catch (err: unknown) {
    console.error('[WhatsApp Webhook GET Exception]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

/**
 * Meta Inbound Message Webhook Handler (POST)
 * Menangkap pesan inbound dari Meta Cloud API WABA, mencocokkan kode aktivasi (AKTIVASI BT-XXXX),
 * mengaktifkan status toko (Trial 7 Hari Ads Performance), dan membalas otomatis via session message gratis.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    // Delegasi jika payload berasal dari Evolution API v2
    if (body.event || body.instance || (body.data && !Array.isArray(body.entry))) {
      const { processEvolutionWebhookEvent } = await import('@/lib/whatsapp/evolution-webhook-handler');
      const evoResult = await processEvolutionWebhookEvent(body);
      return NextResponse.json(evoResult, { status: 200 });
    }

    // Cek apakah payload merupakan webhook WhatsApp Business Account
    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (entries.length === 0) {
      return NextResponse.json({ success: true, message: 'No entries to process' });
    }

    // Fail-Closed P1 Security for Meta WABA Ingress
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const appSecret = process.env.META_APP_SECRET;
    if (!signatureHeader || !appSecret || !verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret)) {
      console.warn('[SECURITY_WABA_SIGNATURE_REJECTED] Invalid or missing HMAC signature on Meta webhook ingress.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.error('[WhatsApp Webhook] Supabase client unreachable.');
      return NextResponse.json({ success: false, error: 'Database unreachable' }, { status: 500 });
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value;
        if (!value || !Array.isArray(value.messages)) continue;

        for (const message of value.messages) {
          // Hanya proses pesan teks
          if (message.type !== 'text' || !message.text?.body) continue;

          const rawSender = message.from;
          const senderPhone = normalizeWhatsAppNumber(rawSender);
          const textBody = String(message.text.body).trim();

          console.log(`[WhatsApp Inbound] From: ${senderPhone} | Text: "${textBody}"`);

          // ── A. STUDIO INBOUND ACTIVATION MATCHER: "AKTIFKAN STUDIO {TOKEN}" / "AKTIVASI {TOKEN}" ──
          const studioActivationMatch =
            textBody.match(/(?:AKTIFKAN|AKTIVASI)\s+(?:STUDIO\s+)?(ACT[A-Za-z0-9]{4,10})/i) ||
            textBody.match(/AKTIFKAN\s+STUDIO\s+([A-Za-z0-9]{4,12})/i);

          if (studioActivationMatch) {
            const studioToken = studioActivationMatch[1].toUpperCase().trim();
            console.log(`[WhatsApp Inbound Studio] Extracted token: "${studioToken}" from ${senderPhone}`);

            const { activateStudioRegistrationByToken } = await import('@/lib/studio/auth');
            const activatedStudio = await activateStudioRegistrationByToken(studioToken, senderPhone);

            if (activatedStudio) {
              await sendWhatsAppSessionMessage(
                senderPhone,
                `🎉 Selamat! Workspace BoonTrack Studio Anda (${activatedStudio.name}) telah aktif!\n\n` +
                `⚡ 1 Free Trial Render Credit siap digunakan.\n` +
                `Buka ruang kerja Anda di: https://studio.boontrack.com/desk`
              );
              return NextResponse.json({ success: true, message: 'Studio workspace activated successfully' });
            } else {
              console.warn(`[WhatsApp Webhook] Studio token "${studioToken}" tidak ditemukan.`);
              await sendWhatsAppSessionMessage(
                senderPhone,
                `Halo! Kode aktivasi Studio ${studioToken} tidak ditemukan atau sudah kedaluwarsa. Silakan periksa kembali di layar registrasi Studio Anda.`
              );
              continue;
            }
          }

          // ── A2. DAFTAR STUDIO REQUEST VIA BOT ──
          const daftarStudioMatch = textBody.match(/^(?:DAFTAR|REGISTRASI)\s+STUDIO/i);
          if (daftarStudioMatch) {
            const { initiateStudioRegistration } = await import('@/lib/studio/auth');
            const initRes = await initiateStudioRegistration({ whatsapp: senderPhone });
            await sendWhatsAppSessionMessage(
              senderPhone,
              `✨ *Aktivasi BoonTrack Studio* ✨\n\n` +
              `Halo! Kode Aktivasi Studio Anda:\n` +
              `🔑 *${initRes.token}*\n\n` +
              `Silakan balas pesan ini dengan *AKTIFKAN STUDIO ${initRes.token}* atau masukkan kode ini di https://studio.boontrack.com/register untuk mengaktifkan 1 Free Trial Video Render Credit Anda! 🎬`
            );
            return NextResponse.json({ success: true, message: 'Studio activation code dispatched' });
          }

          // Deteksi pola aktivasi toko "AKTIVASI BT-XXXX" atau kode "BT-XXXX" (case-insensitive, whitespace-trimmed)
          const activation = extractActivationCode(textBody);
          if (!activation) {
            // Delegasikan pesan non-aktivasi (order manual / chat umum) ke normalized WABA processor
            const { parseMetaWebhookPayload, processNormalizedMetaEvent } = await import(
              '@/lib/whatsapp/meta-webhook-normalizer'
            );
            const normalizedEvent = parseMetaWebhookPayload(body);
            if (normalizedEvent.phoneNumberId) {
              const metaReport = await processNormalizedMetaEvent(normalizedEvent);
              return NextResponse.json(metaReport, { status: 200 });
            }
            continue;
          }

          console.log(`[WhatsApp Inbound] Extracted token: "${activation.canonicalToken}" from ${senderPhone}`);

          // Tangkap atribusi ctwa_clid (Click-to-WhatsApp) jika ada
          const rawReferral = (message as any).referral;
          const refCtwaClid = rawReferral?.ctwa_clid || rawReferral?.click_id;
          const textCtwaMatch = textBody.match(/ctwa:([A-Za-z0-9_-]+)/i);
          const ctwaClid = refCtwaClid || (textCtwaMatch ? textCtwaMatch[1] : undefined);

          // Jalankan proses aktivasi toko secara deterministik menggunakan Service Role
          const activationRes = await processStoreActivation({
            codeOrText: textBody,
            senderPhone,
            ctwaClid,
            customSupabase: supabase,
          });

          await sendWhatsAppSessionMessage(senderPhone, activationRes.replyMessage);
        }
      }
    }

    return NextResponse.json({ success: true, processed: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[WhatsApp Webhook POST Exception]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
