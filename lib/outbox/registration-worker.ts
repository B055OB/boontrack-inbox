/**
 * lib/outbox/registration-worker.ts
 * Decoupled Asynchronous Worker for Registration Outbox Events.
 *
 * Strict Architecture Guardrails (Clearance P1 CTO):
 * - Notifications MUST NOT be executed synchronously inside HTTP request threads before DB commit.
 * - Outbox events with status 'PENDING' are consumed asynchronously.
 * - Network failures or email/WhatsApp errors during notification dispatch MUST NOT damage
 *   or roll back the already-registered tenant record (status: ACTIVE).
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sendNewAffiliateRegistrationNotification } from '@/lib/affiliate-notification-service';

export interface RegistrationWorkerResult {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
}

export async function processRegistrationOutboxEvents(options?: {
  limit?: number;
}): Promise<RegistrationWorkerResult> {
  const limit = options?.limit ?? 10;
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1. Claim pending events
  const { data: events, error: fetchErr } = await supabase
    .from('outbox_events')
    .select('*')
    .eq('event_type', 'MERCHANT_REGISTERED')
    .eq('status', 'PENDING')
    .lte('scheduled_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchErr) {
    console.error('[RegistrationOutboxWorker] Error claiming events:', fetchErr);
    return { claimed: 0, completed: 0, retried: 0, failed: 0 };
  }

  if (!events || events.length === 0) {
    return { claimed: 0, completed: 0, retried: 0, failed: 0 };
  }

  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (const event of events) {
    // Mark as PROCESSING to avoid concurrent duplicate worker processing
    await supabase
      .from('outbox_events')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', event.id);

    try {
      const payload = event.payload || {};
      const refCode = payload.referral_code;
      const storeName = payload.store_name || payload.name;
      const ownerName = payload.owner_name || payload.merchant_name || storeName;
      const email = payload.email;
      const phone = payload.phone;

      // Only dispatch notification if a referral code exists
      if (refCode) {
        await sendNewAffiliateRegistrationNotification({
          affiliateName: ownerName,
          affiliateEmail: email || '',
          affiliatePhone: phone || '',
          affiliateCode: refCode,
          amCodeOrId: refCode,
        });
      }

      // Mark event as COMPLETED
      await supabase
        .from('outbox_events')
        .update({
          status: 'COMPLETED',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', event.id);

      completed++;
    } catch (dispatchErr: any) {
      const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
      console.warn(`[RegistrationOutboxWorker] Failed to dispatch event ${event.id}:`, errMsg);

      const nextRetryCount = (event.retry_count || 0) + 1;
      const maxRetries = event.max_retries || 3;

      if (nextRetryCount >= maxRetries) {
        // Mark as DEAD_LETTER or FAILED
        await supabase
          .from('outbox_events')
          .update({
            status: 'FAILED',
            retry_count: nextRetryCount,
            last_error: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);
        failed++;
      } else {
        // Exponential backoff retry: 30s, 60s, 120s...
        const backoffSeconds = Math.pow(2, nextRetryCount) * 15;
        const nextScheduled = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await supabase
          .from('outbox_events')
          .update({
            status: 'PENDING',
            retry_count: nextRetryCount,
            last_error: errMsg,
            scheduled_at: nextScheduled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);
        retried++;
      }
    }
  }

  return {
    claimed: events.length,
    completed,
    retried,
    failed,
  };
}
