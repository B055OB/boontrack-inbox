/**
 * @file lib/payment/payment-event-service.ts
 * @description Provider-neutral payment event service.
 *
 * Responsibilities:
 *   1. Record raw payment events to the `payment_events` table (fire-and-forget).
 *   2. Emit the domain event `PAYMENT_CONFIRMED` via registered callbacks.
 *
 * Boundaries:
 *   - This service MUST NOT mutate the `orders` table directly.
 *   - Order state transitions happen exclusively inside callbacks registered
 *     via `onPaymentConfirmed()`, preserving the domain event pattern.
 *   - If the `payment_events` table does not yet exist in Supabase,
 *     the DB write silently fails (non-blocking), ensuring backward compatibility
 *     during the migration window.
 *
 * @architecture BATCH 1 / Ticket 1.1
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import type { PaymentEventRecord, PaymentConfirmationResult } from './payment-contracts';

// ---------------------------------------------------------------------------
// Domain Event Types
// ---------------------------------------------------------------------------

/** Domain event emitted when a payment is confirmed (status: 'payment.success'). */
export interface PaymentConfirmedEvent {
  eventId: string;
  tenantId: string;
  orderId: string | null;
  amount: number;
  providerEventId: string;
  provider: string;
  detectedApp?: string | null;
  confirmedAt: string;
  /** The full event record that was (or would be) persisted. */
  paymentEventRecord: PaymentEventRecord;
}

/** Callback signature for PAYMENT_CONFIRMED domain event subscribers. */
export type PaymentConfirmedCallback = (event: PaymentConfirmedEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// PaymentEventService
// ---------------------------------------------------------------------------

class PaymentEventService {
  private readonly confirmedCallbacks: PaymentConfirmedCallback[] = [];

  /**
   * Register a callback to be invoked when a PAYMENT_CONFIRMED domain event fires.
   * Callbacks are invoked sequentially; errors in callbacks are caught and logged
   * but do NOT prevent other callbacks from running.
   */
  onPaymentConfirmed(callback: PaymentConfirmedCallback): void {
    this.confirmedCallbacks.push(callback);
  }

  /**
   * Record a raw payment confirmation into the `payment_events` table and
   * emit the `PAYMENT_CONFIRMED` domain event to all registered callbacks.
   *
   * @param result     - Normalized `PaymentConfirmationResult` from an adapter.
   * @param tenantId   - Resolved tenant UUID.
   * @param orderId    - Matched order UUID (null if not yet matched).
   * @returns The persisted `PaymentEventRecord` (or the in-memory record if DB write fails).
   */
  async recordEvent(
    result: PaymentConfirmationResult,
    tenantId: string,
    orderId: string | null
  ): Promise<PaymentEventRecord> {
    const eventId = randomUUID();
    const now = new Date().toISOString();

    const record: PaymentEventRecord = {
      id: eventId,
      tenant_id: tenantId,
      order_id: orderId,
      provider: result.rawPayload['_provider'] as string ?? 'reader',
      provider_event_id: result.providerEventId,
      event_type: result.eventType,
      amount: result.amount ?? 0,
      raw_payload: result.rawPayload,
      created_at: now,
    };

    // --- Fire-and-forget DB write ---
    // Non-blocking: if the table doesn't exist yet (migration pending),
    // the error is caught and logged without interrupting the main flow.
    this.persistEventAsync(record);

    // --- Emit PAYMENT_CONFIRMED domain event ---
    if (result.isConfirmed) {
      const domainEvent: PaymentConfirmedEvent = {
        eventId,
        tenantId,
        orderId,
        amount: result.amount ?? 0,
        providerEventId: result.providerEventId,
        provider: record.provider,
        detectedApp: result.detectedApp,
        confirmedAt: now,
        paymentEventRecord: record,
      };
      await this.emitPaymentConfirmed(domainEvent);
    }

    return record;
  }

  /**
   * Persist the event record to `payment_events` asynchronously.
   * Errors are swallowed and logged — never propagated to the caller.
   */
  private persistEventAsync(record: PaymentEventRecord): void {
    const supabase = getSupabaseAdmin() ?? getSupabase();
    if (!supabase) return;

    Promise.resolve(
      supabase
        .from('payment_events')
        .insert(record)
        .then(({ error }) => {
          if (error) {
            // Table may not exist yet — non-fatal during migration window
            console.warn('[PaymentEventService] Non-fatal: Could not persist payment_event:', {
              eventId: record.id,
              error: error.message,
              code: error.code,
            });
          } else {
            console.log('[PaymentEventService] Event persisted:', {
              eventId: record.id,
              provider: record.provider,
              eventType: record.event_type,
              amount: record.amount,
            });
          }
        })
    ).catch((err: unknown) => {
      console.warn('[PaymentEventService] Unexpected error persisting event:', err);
    });
  }

  /**
   * Invoke all registered PAYMENT_CONFIRMED callbacks sequentially.
   * Each callback error is isolated — one failure does not prevent others.
   */
  private async emitPaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
    for (const callback of this.confirmedCallbacks) {
      try {
        await callback(event);
      } catch (err) {
        console.error('[PaymentEventService] Error in PAYMENT_CONFIRMED callback:', err);
      }
    }
  }
}

/** Singleton event service shared across the application. */
export const paymentEventService = new PaymentEventService();
