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
