/**
 * @file lib/lifecycle/event-bus.ts
 * @description Asynchronous, Non-Blocking Lifecycle Event Bus.
 * Guarantees zero latency overhead on checkout, payment webhooks, or booking flows.
 */

import { IngestLifecycleEventInput, LifecycleOutcome } from './types';
import { scheduleLifecycleEvent } from './scheduler';
import { getSupabase } from '@/lib/supabaseClient';

class LifecycleEventBus {
  /**
   * Publishes a lifecycle event asynchronously without blocking the caller.
   */
  public publish(input: IngestLifecycleEventInput): void {
    // Non-blocking tick: execute on next loop cycle so caller response returns immediately
    setTimeout(async () => {
      try {
        let tenantId = input.tenant_id;

        // If tenant_id is not a UUID but a slug was provided, resolve tenant_id from database
        if (!tenantId || tenantId.length !== 36) {
          const slug = input.tenant_slug || tenantId;
          if (slug) {
            const supabase = getSupabase();
            if (supabase) {
              const { data: t } = await supabase
                .from('tenants')
                .select('id')
                .eq('slug', slug)
                .maybeSingle();
              if (t?.id) {
                tenantId = t.id;
              }
            }
          }
        }

        if (!tenantId) {
          console.warn('[LifecycleEventBus] Cannot resolve tenantId for input:', input);
          return;
        }

        console.log(`[LifecycleEventBus] Ingesting event '${input.event_type}' for ${input.customer_phone} (Tenant: ${tenantId})`);

        await scheduleLifecycleEvent({
          ...input,
          tenant_id: tenantId,
        });
      } catch (err) {
        console.error('[LifecycleEventBus] Error processing lifecycle event:', err);
      }
    }, 0);
  }

  /**
   * Synchronous / Promise-wrapped version for testing or background workers where awaiting is required.
   */
  public async publishAsync(
    input: IngestLifecycleEventInput
  ): Promise<{ scheduledCount: number; outcomes: LifecycleOutcome[] }> {
    let tenantId = input.tenant_id;
    if (!tenantId || tenantId.length !== 36) {
      const slug = input.tenant_slug || tenantId;
      if (slug) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: t } = await supabase
            .from('tenants')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();
          if (t?.id) {
            tenantId = t.id;
          }
        }
      }
    }

    return scheduleLifecycleEvent({
      ...input,
      tenant_id: tenantId || input.tenant_id,
    });
  }
}

export const lifecycleEventBus = new LifecycleEventBus();
