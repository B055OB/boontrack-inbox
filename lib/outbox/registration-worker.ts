/**
 * lib/outbox/registration-worker.ts
 * Decoupled Asynchronous Worker for Registration Outbox Events.
 *
 * Strict Architecture Guardrails (CTO P1 Directive):
 * 1. Race condition prevention: Atomic row claim via `claim_registration_outbox_batch`
 *    (PostgreSQL FOR UPDATE SKIP LOCKED) with conditional update fallback (`WHERE status = 'PENDING'`).
 * 2. Decoupled processing: Notifications execute strictly outside HTTP request threads.
 * 3. Fail-Closed: Notification failures MUST NOT damage or roll back already-active tenant records.
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

  let claimedEvents: any[] = [];

  // 1. Attempt Atomic Batch Claim via Postgres FOR UPDATE SKIP LOCKED RPC
  try {
    const { data: rpcClaimed, error: rpcErr } = await supabase.rpc('claim_registration_outbox_batch', {
      batch_size: limit,
    });

    if (!rpcErr && Array.isArray(rpcClaimed)) {
      claimedEvents = rpcClaimed;
    }
  } catch (rpcErr) {
    console.debug('[RegistrationOutboxWorker] RPC claim note, falling back to conditional CAS:', rpcErr);
  }

  // 2. Fallback Atomic Claim via Conditional CAS (UPDATE ... WHERE id = :id AND status = 'PENDING')
  if (claimedEvents.length === 0) {
    const { data: candidateEvents, error: fetchErr } = await supabase
      .from('outbox_events')
      .select('*')
      .eq('event_type', 'MERCHANT_REGISTERED')
      .eq('status', 'PENDING')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    if (fetchErr) {
      console.error('[RegistrationOutboxWorker] Error querying candidate events:', fetchErr);
      return { claimed: 0, completed: 0, retried: 0, failed: 0 };
    }

    if (candidateEvents && candidateEvents.length > 0) {
      for (const candidate of candidateEvents) {
        // Atomic conditional update ensuring only 1 worker claims this row
        const { data: lockedEvent, error: lockErr } = await supabase
          .from('outbox_events')
          .update({
            status: 'PROCESSING',
            locked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', candidate.id)
          .eq('status', 'PENDING')
          .select()
          .maybeSingle();

        if (!lockErr && lockedEvent) {
          claimedEvents.push(lockedEvent);
        }
      }
    }
  }

  if (claimedEvents.length === 0) {
    return { claimed: 0, completed: 0, retried: 0, failed: 0 };
  }

  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (const event of claimedEvents) {
    try {
      const payload = event.payload || {};
      const refCode = payload.referral_code;
      const storeName = payload.store_name || payload.name;
      const ownerName = payload.owner_name || payload.merchant_name || storeName;
      const email = payload.email;
      const phone = payload.phone;

      // Only dispatch notification if a referral was used
      if (refCode) {
        await sendNewAffiliateRegistrationNotification({
          affiliateName: ownerName,
          affiliateEmail: email || '',
          affiliatePhone: phone || '',
          affiliateCode: refCode,
          amCodeOrId: refCode,
        });
      }

      // Mark event as COMPLETED atomically
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
      console.warn(`[RegistrationOutboxWorker] Notification dispatch failed for event ${event.id}:`, errMsg);

      const nextRetryCount = (event.retry_count || 0) + 1;
      const maxRetries = event.max_retries || 3;

      if (nextRetryCount >= maxRetries) {
        // Escalate to FAILED / DEAD_LETTER
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
    claimed: claimedEvents.length,
    completed,
    retried,
    failed,
  };
}
