/**
 * lib/whatsapp/order-interceptor.ts
 * Order Transaction Interceptor (Order Gatekeeper)
 *
 * Intercepts incoming messages matching manual order patterns:
 * - "Total Nominal:"
 * - "Metode: Transfer Bank"
 * - "Mohon dicek dan aktivasi akses"
 * - "Masterclass CPM"
 *
 * Actions when pattern detected:
 * 1. Bypasses LLM / Gemini / OpenAI prompts.
 * 2. Marks session as pending verification (ORDER_PENDING_VERIFICATION).
 * 3. Sends standard store confirmation reply or holds for human CS.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export const MANUAL_ORDER_INTERCEPTOR_REGEX =
  /(?:Total\s*Nominal\s*:|Metode\s*:\s*Transfer\s*Bank|Mohon\s+dicek\s+dan\s+aktivasi\s+akses|Masterclass\s+CPM)/i;

/**
 * Checks whether an incoming message matches manual order transaction patterns.
 */
export function isManualOrderMessage(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return MANUAL_ORDER_INTERCEPTOR_REGEX.test(text);
}

/**
 * Returns a standardized store order confirmation auto-reply.
 */
export function getOrderConfirmationReply(storeName?: string): string {
  const storeLabel = storeName && storeName.trim() ? storeName.trim() : 'Admin';
  return `Halo Kak! Rincian pesanan dan bukti transaksi Kakak sudah kami terima dan langsung diteruskan ke Tim ${storeLabel} untuk verifikasi manual.\n\nPesanan / akses Kakak akan segera diaktivasi setelah pengecekan selesai ya Kak. Mohon ditunggu sebentar, terima kasih! 🙏`;
}

export interface InterceptOrderParams {
  supabase: SupabaseClient | any;
  tenantId: string;
  senderPhone: string;
  textBody: string;
  convId?: string | null;
  storeName?: string;
}

/**
 * Handles database session updates for intercepted orders.
 * Marks session as ORDER_PENDING_VERIFICATION and pauses the bot.
 */
export async function markSessionAsPendingVerification(params: InterceptOrderParams): Promise<void> {
  const { supabase, tenantId, senderPhone, textBody, convId } = params;
  if (!supabase || !tenantId || !senderPhone) return;

  const nowIso = new Date().toISOString();
  const pausedUntilIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    await supabase.from('conversation_sessions').upsert(
      {
        tenant_id: tenantId,
        session_id: `wa_${tenantId}_${senderPhone}`,
        channel: 'WHATSAPP',
        user_identifier: senderPhone,
        current_state: 'ORDER_PENDING_VERIFICATION',
        is_paused: true,
        paused_at: nowIso,
        paused_by: 'order_gatekeeper',
        paused_until: pausedUntilIso,
        metadata: {
          order_status: 'pending_verification',
          intercepted_by: 'MANUAL_ORDER_GATEKEEPER',
          paused_at: nowIso,
          trigger_text: textBody.slice(0, 300),
        },
        updated_at: nowIso,
      },
      { onConflict: 'tenant_id,user_identifier' }
    );

    if (convId) {
      await supabase
        .from('conversations')
        .update({
          bot_paused: true,
          bot_mode: 'HUMAN_ACTIVE',
          status: 'pending_verification',
          updated_at: nowIso,
        })
        .eq('id', convId);
    }
  } catch (err) {
    console.warn('[OrderInterceptor] Error marking session pending verification:', err);
  }
}

// ============================================================================
// ONLINEBOOST BATCH 1 INBOUND KEYWORD: "MAU METODE RAHASIA"
// ============================================================================

export const ONLINEBOOST_BATCH1_KEYWORD_REGEX = /^\s*MAU\s+METODE\s+RAHASIA\s*$/i;

/**
 * Detects whether incoming WhatsApp text matches the OnlineBoost Batch 1 registration keyword.
 */
export function isOnlineBoostRegistrationKeyword(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return ONLINEBOOST_BATCH1_KEYWORD_REGEX.test(text.trim());
}

/**
 * Standardized high-converting registration offer reply for OnlineBoost Batch 1.
 */
export function getOnlineBoostBatch1RegistrationReply(): string {
  return (
    `👋 *Halo! Selamat datang di Kelas Inkubasi OnlineBoost Batch 1!* 🚀\n\n` +
    `Rahasia membangun *Mesin Penjualan WhatsApp Otomatis 24 Jam* dan *Scale-Up Ads* anti-boncos siap Anda kuasai!\n\n` +
    `🎁 *Fasilitas Lengkap yang Anda Dapatkan di Batch 1:*\n` +
    `• 🤖 *Engine Bot WhatsApp & Kasir Toko Digital:* Kasir otomatis 24 jam penerbit QRIS 0% fee (Senilai Rp 450.000)\n` +
    `• 🎬 *Akses Studio Video 9-Scene:* Cetak video iklan Reels/TikTok vertikal tanpa syuting (Senilai Rp 350.000)\n` +
    `• 📊 *Ads Performance Tracker:* Pantau laba bersih & ROAS riil tanpa pusing Ads Manager (Senilai Rp 299.000)\n` +
    `• 📦 *Lisensi Produk Digital Siap Jual:* Hak jual ulang dengan margin profit 100% (Senilai Rp 200.000)\n` +
    `• 👥 *Kurikulum 10 Langkah & Forum VIP:* Mentoring praktis nol sampai pecah telur di Telegram (Senilai Rp 195.000)\n\n` +
    `⚡ *Investasi Spesial Batch 1:* ~Rp 1.490.000~ ➔ *Rp 249.000*\n` +
    `*(Kuota terbatas hanya untuk 50 peserta Batch 1 untuk menjaga kestabilan load render video & engine bot)*\n\n` +
    `👉 *Amankan Slot Pendaftaran Kakak Sekarang:*\n` +
    `https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale\n\n` +
    `_Setelah menyelesaikan pembayaran, Kakak akan otomatis menerima link invite khusus ke grup Telegram kelas!_`
  );
}

/**
 * Tags customer as 'awaiting_payment' in CRM Contacts & Contact Tags.
 */
export async function tagCustomerAwaitingPayment(params: {
  supabase: any;
  tenantId: string;
  senderPhone: string;
  senderName?: string;
  convId?: string | null;
}): Promise<any> {
  const { supabase, tenantId, senderPhone, senderName, convId } = params;
  if (!supabase || !tenantId || !senderPhone) return null;

  try {
    const { ContactService } = await import('@/lib/crm/contact.service');
    const contact = await ContactService.getOrCreateContactByPhone(
      tenantId,
      senderPhone,
      senderName || senderPhone
    );

    // Create & attach tag 'awaiting_payment'
    const tag = await ContactService.createTag(tenantId, 'awaiting_payment', '#F59E0B');
    await ContactService.addTagToContact(contact.id, tag.id);

    // Update contact metadata
    const existingTags = Array.isArray(contact.metadata?.tags) ? contact.metadata.tags : [];
    const updatedTags = Array.from(new Set([...existingTags, 'awaiting_payment']));

    await supabase
      .from('contacts')
      .update({
        lifecycle_stage: 'LEAD',
        metadata: {
          ...(contact.metadata || {}),
          tags: updatedTags,
          funnel: 'onlineboost_batch1',
          funnel_stage: 'awaiting_payment',
          last_keyword: 'MAU METODE RAHASIA',
          awaiting_payment_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);

    if (convId) {
      await supabase
        .from('conversations')
        .update({
          metadata: {
            tags: updatedTags,
            funnel_stage: 'awaiting_payment',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', convId);
    }

    return contact;
  } catch (err) {
    console.warn('[OrderInterceptor] Error tagging customer awaiting_payment:', err);
    return null;
  }
}

