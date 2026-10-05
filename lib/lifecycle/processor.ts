/**
 * @file lib/lifecycle/processor.ts
 * @description Worker to process due lifecycle events (status = 'SCHEDULED' and scheduled_at <= now()).
 */

import { getSupabase } from '@/lib/supabaseClient';
import { LifecycleEvent, LifecycleOutcome } from './types';

export async function processDueLifecycleEvents(limit = 50): Promise<{
  processedCount: number;
  failedCount: number;
  outcomes: LifecycleOutcome[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { processedCount: 0, failedCount: 0, outcomes: [] };
  }

  const nowIso = new Date().toISOString();

  // 1. Fetch due events
  const { data: dueEvents, error: fetchErr } = await supabase
    .from('lifecycle_events')
    .select('*')
    .eq('status', 'SCHEDULED')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (fetchErr) {
    console.error('[LifecycleProcessor] Error fetching due events:', fetchErr);
    return { processedCount: 0, failedCount: 0, outcomes: [] };
  }

  if (!dueEvents || dueEvents.length === 0) {
    return { processedCount: 0, failedCount: 0, outcomes: [] };
  }

  let processedCount = 0;
  let failedCount = 0;
  const outcomes: LifecycleOutcome[] = [];

  for (const ev of dueEvents as LifecycleEvent[]) {
    try {
      const messageText = ev.payload?.rendered_message || '';

      // Mark as processed
      const { error: updateErr } = await supabase
        .from('lifecycle_events')
        .update({
          status: 'PROCESSED',
          processed_at: new Date().toISOString(),
        })
        .eq('id', ev.id);

      if (updateErr) {
        throw updateErr;
      }

      processedCount++;
      outcomes.push({
        success: true,
        event_id: ev.id,
        dispatched_text: messageText,
        recipient_phone: ev.customer_phone,
        channel: 'WHATSAPP',
      });

      console.log(`[LifecycleProcessor] Successfully processed event #${ev.id} (${ev.event_type}) for ${ev.customer_phone}`);
    } catch (err: any) {
      failedCount++;
      const errorMessage = err?.message || 'Processing error';

      await supabase
        .from('lifecycle_events')
        .update({
          status: 'FAILED',
          error_message: errorMessage,
        })
        .eq('id', ev.id);

      outcomes.push({
        success: false,
        event_id: ev.id,
        recipient_phone: ev.customer_phone,
        error: errorMessage,
      });

      console.error(`[LifecycleProcessor] Failed to process event #${ev.id}:`, err);
    }
  }

  return { processedCount, failedCount, outcomes };
}
