/**
 * @file lib/lifecycle/scheduler.ts
 * @description Schedules and queues lifecycle events based on tenant templates.
 */

import { getSupabase } from '@/lib/supabaseClient';
import { IngestLifecycleEventInput, LifecycleTemplate, LifecycleOutcome } from './types';
import { resolveTemplateVariables } from './template-engine';

export async function scheduleLifecycleEvent(
  input: IngestLifecycleEventInput
): Promise<{ scheduledCount: number; outcomes: LifecycleOutcome[] }> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[LifecycleScheduler] Supabase client unavailable.');
    return { scheduledCount: 0, outcomes: [] };
  }

  const { tenant_id, event_type, customer_phone, payload, custom_scheduled_at } = input;
  if (!tenant_id || !event_type || !customer_phone) {
    console.warn('[LifecycleScheduler] Missing required fields for scheduling.');
    return { scheduledCount: 0, outcomes: [] };
  }

  // 1. Fetch active templates for this tenant and event trigger
  const { data: templates, error: tErr } = await supabase
    .from('lifecycle_templates')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('event_trigger', event_type)
    .eq('is_active', true);

  if (tErr) {
    console.error('[LifecycleScheduler] Error querying templates:', tErr);
    return { scheduledCount: 0, outcomes: [] };
  }

  if (!templates || templates.length === 0) {
    console.log(`[LifecycleScheduler] No active template found for tenant ${tenant_id}, trigger: ${event_type}`);
    return { scheduledCount: 0, outcomes: [] };
  }

  const outcomes: LifecycleOutcome[] = [];
  let scheduledCount = 0;

  for (const t of templates as LifecycleTemplate[]) {
    const delayMinutes = Number(t.delay_minutes || 0);
    const now = new Date();
    const scheduledAt = custom_scheduled_at
      ? new Date(custom_scheduled_at).toISOString()
      : new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();

    const isInstant = delayMinutes === 0 && !custom_scheduled_at;
    const initialStatus = isInstant ? 'PROCESSED' : 'SCHEDULED';
    const processedAt = isInstant ? now.toISOString() : null;

    // Render message body using payload
    const renderedText = resolveTemplateVariables(t.template_body, payload);

    const eventRecord = {
      tenant_id,
      customer_phone,
      event_type,
      payload: {
        ...payload,
        rendered_message: renderedText,
        template_id: t.id,
      },
      status: initialStatus,
      scheduled_at: scheduledAt,
      processed_at: processedAt,
      metadata: {
        template_id: t.id,
        delay_minutes: delayMinutes,
        vertical: t.vertical,
      },
    };

    const { data: insertedEvent, error: insertErr } = await supabase
      .from('lifecycle_events')
      .insert(eventRecord)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[LifecycleScheduler] Failed to insert lifecycle event:', insertErr);
      continue;
    }

    scheduledCount++;

    if (isInstant) {
      // Dispatched instant outcome
      outcomes.push({
        success: true,
        event_id: insertedEvent?.id,
        dispatched_text: renderedText,
        channel: 'WHATSAPP',
        recipient_phone: customer_phone,
      });

      console.log(`[LifecycleScheduler] Instant lifecycle event #${insertedEvent?.id} executed for ${customer_phone}`);
    } else {
      outcomes.push({
        success: true,
        event_id: insertedEvent?.id,
        channel: 'WHATSAPP',
        recipient_phone: customer_phone,
      });

      console.log(`[LifecycleScheduler] Scheduled lifecycle event #${insertedEvent?.id} due at ${scheduledAt}`);
    }
  }

  return { scheduledCount, outcomes };
}
