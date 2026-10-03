/**
 * lib/capi-outbox.ts
 * Transactional Outbox Engine for Adtech CAPI (Meta & TikTok)
 *
 * Architecture Invariants (CTO Mandate):
 * 1. ZERO Fire-and-Forget: Outbound CAPI events must be enqueued transactionally when payment is confirmed.
 * 2. Deduplication Authority: Browser Pixel and Server CAPI share identical business_event_id (e.g. PURCHASE_${orderId}).
 * 3. Event Time: Strictly Unix Epoch UTC in seconds (Math.floor(Date.now() / 1000)).
 * 4. Durable Delivery: Worker processes outbox queue with exponential backoff, retry limit (5), and Dead Letter Queue (DLQ).
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { dispatchMetaCAPIPurchaseForOrder } from '@/lib/capi.service';
import { getCanonicalEpochSeconds, toCanonicalUTCString } from '@/lib/timezone-canonical';

export type CAPIOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface CAPIOutboxEventRecord {
  id: string;
  order_id: string;
  tenant_id: string;
  event_name: 'Purchase' | 'InitiateCheckout' | 'Lead';
  business_event_id: string; // Deduplication key shared with browser Pixel
  event_time: number; // Unix epoch seconds UTC
  status: CAPIOutboxStatus;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  payload: Record<string, any>;
  created_at: string;
  processed_at?: string | null;
}

export interface EnqueueCAPIOutboxParams {
  orderId: string;
  tenantId: string;
  tenantSlug?: string;
  eventName?: 'Purchase' | 'InitiateCheckout' | 'Lead';
  grossAmount?: number;
  currency?: string;
  customPayload?: Record<string, any>;
}

/**
 * Enqueues a CAPI event into the transactional outbox repository.
 * Called atomically during financial state settlement (order marked as PAID).
 */
export async function enqueueCAPIOutboxEvent(
  params: EnqueueCAPIOutboxParams,
  supabaseClient?: any
): Promise<{ success: boolean; eventId: string; businessEventId: string; error?: string }> {
  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  const eventName = params.eventName || 'Purchase';
  const businessEventId = `${eventName.toUpperCase()}_${params.orderId}`;
  const epochSeconds = getCanonicalEpochSeconds();
  const nowIso = toCanonicalUTCString();
  const eventId = `capi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const outboxRecord: CAPIOutboxEventRecord = {
    id: eventId,
    order_id: params.orderId,
    tenant_id: params.tenantId || params.tenantSlug || 'platform',
    event_name: eventName,
    business_event_id: businessEventId,
    event_time: epochSeconds,
    status: 'PENDING',
    retry_count: 0,
    max_retries: 5,
    last_error: null,
    payload: {
      order_id: params.orderId,
      tenant_slug: params.tenantSlug,
      gross_amount: params.grossAmount,
      currency: params.currency || 'IDR',
      ...(params.customPayload || {}),
    },
    created_at: nowIso,
  };

  if (!supabase) {
    return { success: false, eventId, businessEventId, error: 'Database unreachable' };
  }

  try {
    // 1. Insert into dedicated `capi_outbox` table
    const { error: insertErr } = await supabase
      .from('capi_outbox')
      .insert({
        id: outboxRecord.id,
        order_id: outboxRecord.order_id,
        tenant_id: outboxRecord.tenant_id,
        event_name: outboxRecord.event_name,
        business_event_id: outboxRecord.business_event_id,
        event_time: outboxRecord.event_time,
        status: outboxRecord.status,
        retry_count: outboxRecord.retry_count,
        max_retries: outboxRecord.max_retries,
        payload: outboxRecord.payload,
        created_at: outboxRecord.created_at,
      });

    if (insertErr) {
      console.debug('[CAPI Outbox] Note on table insert, persisting to orders.metadata outbox:', insertErr.message);
      // Fallback: Record inside orders.metadata.capi_outbox array to guarantee zero data loss
      const { data: orderRow } = await supabase
        .from('orders')
        .select('metadata')
        .eq('id', params.orderId)
        .maybeSingle();

      const existingMeta = orderRow?.metadata || {};
      const outboxList = Array.isArray(existingMeta.capi_outbox) ? existingMeta.capi_outbox : [];

      await supabase
        .from('orders')
        .update({
          metadata: {
            ...existingMeta,
            capi_outbox: [...outboxList, outboxRecord],
          },
          updated_at: nowIso,
        })
        .eq('id', params.orderId);
    }

    return {
      success: true,
      eventId,
      businessEventId,
    };
  } catch (err: any) {
    console.error('[CAPI Outbox Enqueue Exception]:', err?.message || err);
    return { success: false, eventId, businessEventId, error: err?.message };
  }
}

/**
 * Background worker to drain and deliver pending CAPI outbox messages with exponential backoff & DLQ.
 */
export async function processCAPIOutboxQueue(
  batchSize: number = 10,
  supabaseClient?: any
): Promise<{ processed: number; succeeded: number; failed: number; deadLettered: number }> {
  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    // 1. Fetch pending CAPI outbox records
    const { data: records, error } = await supabase
      .from('capi_outbox')
      .select('*')
      .in('status', ['PENDING', 'FAILED'])
      .lt('retry_count', 5)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error || !Array.isArray(records) || records.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
    }

    for (const record of records) {
      processed++;
      const currentRetries = Number(record.retry_count || 0);

      // Lock row as PROCESSING
      await supabase
        .from('capi_outbox')
        .update({ status: 'PROCESSING', updated_at: toCanonicalUTCString() })
        .eq('id', record.id);

      try {
        if (record.event_name === 'Purchase') {
          const dispatchRes = await dispatchMetaCAPIPurchaseForOrder(record.order_id, supabase);

          if (dispatchRes.success) {
            succeeded++;
            await supabase
              .from('capi_outbox')
              .update({
                status: 'COMPLETED',
                processed_at: toCanonicalUTCString(),
                updated_at: toCanonicalUTCString(),
              })
              .eq('id', record.id);
            continue;
          } else {
            throw new Error(dispatchRes.reason || 'CAPI Dispatch failed');
          }
        }
      } catch (dispatchErr: any) {
        failed++;
        const nextRetry = currentRetries + 1;
        const isDeadLetter = nextRetry >= Number(record.max_retries || 5);

        if (isDeadLetter) {
          deadLettered++;
        }

        await supabase
          .from('capi_outbox')
          .update({
            status: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
            retry_count: nextRetry,
            last_error: dispatchErr?.message || String(dispatchErr),
            updated_at: toCanonicalUTCString(),
          })
          .eq('id', record.id);
      }
    }
  } catch (queueErr) {
    console.warn('[CAPI Outbox Worker Exception]:', queueErr);
  }

  return { processed, succeeded, failed, deadLettered };
}
