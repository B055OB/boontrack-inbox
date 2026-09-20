import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  normalizeWhatsAppNumber,
  sendWhatsAppSessionMessage,
} from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * Meta Webhook Challenge Verification (GET)
 * Digunakan oleh Meta Developer Portal saat melakukan registrasi & verifikasi URL Webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const expectedToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      'boontrack_waba_webhook_verify_token';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[WhatsApp Webhook] Handshake verified successfully.');
      return new NextResponse(challenge || '', {
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
    const body = await req.json().catch(() => ({}));

    // Cek apakah payload merupakan webhook WhatsApp Business Account
    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (entries.length === 0) {
      return NextResponse.json({ success: true, message: 'No entries to process' });
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

          // Deteksi pola aktivasi "AKTIVASI BT-XXXX" (case-insensitive)
          const activationMatch = textBody.match(/AKTIVASI\s+([A-Za-z0-9_-]+)/i);
          if (!activationMatch) continue;

          const token = activationMatch[1].toUpperCase().trim();
          console.log(`[WhatsApp Inbound] Extracted token: "${token}" from ${senderPhone}`);

          // Cari tenant dengan token verifikasi tersebut di Supabase
          const { data: tenant, error: searchErr } = await supabase
            .from('tenants')
            .select('id, slug, name, status, tier, metadata')
            .eq('metadata->>wa_verification_token', token)
            .maybeSingle();

          if (searchErr) {
            console.error('[WhatsApp Webhook] Search tenant error:', searchErr);
            continue;
          }

          if (!tenant) {
            console.warn(`[WhatsApp Webhook] Token "${token}" tidak ditemukan di database.`);
            // Berikan balasan informatif
            await sendWhatsAppSessionMessage(
              senderPhone,
              `Halo! Kode verifikasi ${token} tidak ditemukan atau sudah kedaluwarsa. Silakan periksa kembali kode aktivasi di browser Anda.`
            );
            continue;
          }

          // Toko ditemukan: Aktifkan toko & pertahankan tier dinamis (Ads Performance Trial 7 Hari)
          const currentMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
          const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const verifiedAt = new Date().toISOString();

          // Dynamic Tier Mapping (Zero Hardcoding):
          const resolvedTier = tenant.tier || currentMeta.tier || 'ADS_PERFORMANCE';
          const resolvedPlanTier = currentMeta.plan_tier || resolvedTier;
          const resolvedPlanLabel =
            currentMeta.selected_plan ||
            (resolvedTier === 'ADS_PERFORMANCE'
              ? 'Ads Performance Trial'
              : resolvedTier === 'PRO_SCALE'
              ? 'Team Scale'
              : resolvedTier === 'CHECKOUT_LITE'
              ? 'Paket Checkout'
              : 'Paket Solo');

          const updatedMetadata = {
            ...currentMeta,
            wa_verification_status: 'verified',
            wa_verified_at: verifiedAt,
            wa_verified_phone: senderPhone,
            phone: senderPhone,
            whatsapp_number: senderPhone,
            tier: resolvedTier,
            plan_tier: resolvedPlanTier,
            selected_plan: resolvedPlanLabel,
            trial_ends_at: trialEndsAt,
          };

          const { error: updateErr } = await supabase
            .from('tenants')
            .update({
              status: 'active',
              is_active: true,
              tier: resolvedTier,
              trial_ends_at: trialEndsAt,
              metadata: updatedMetadata,
              updated_at: verifiedAt,
            })
            .eq('id', tenant.id);

          if (updateErr) {
            console.error('[WhatsApp Webhook] Failed to activate tenant:', updateErr);
            continue;
          }

          console.log(`[WhatsApp Webhook] ✅ Toko "${tenant.slug}" berhasil diaktifkan dengan nomor ${senderPhone}!`);

          // Balas otomatis via Meta Cloud API (Session Message Gratis 24 Jam)
          const replyMessage =
            'Selamat! Nomor WhatsApp Anda berhasil diverifikasi. Akun toko Anda sudah aktif. Silakan kembali ke browser untuk mulai menggunakan BoonTrack.';

          await sendWhatsAppSessionMessage(senderPhone, replyMessage);
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
