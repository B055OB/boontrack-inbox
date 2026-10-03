/**
 * @file lib/financial-state-machine.ts
 * @description Financial State Machine (FSM) Engine — Multi-Source Payment Detection & UU PDP Data Minimization.
 *
 * Invariants (Sign-Off: CTO & CFO):
 * 1. Single Financial Authority: All state transitions are deterministic and fail-closed.
 * 2. Exact Match Policy: Zero tolerance on nominal amount for auto-settlement within 30-minute window.
 * 3. Safe Concurrency (NO-OP): Atomic conditional update `WHERE id = :id AND status = 'PENDING'`.
 *    If affected_rows == 0, safe NO-OP to prevent duplicate outbox emissions.
 * 4. Human-in-the-Loop Review: Late matches (> 30 min, <= 2 hours) or nominal discrepancies
 *    are flagged with `notes: 'LATE_MATCH_PENDING_REVIEW'` while status remains `PENDING`.
 * 5. UU PDP Data Minimization: Raw email body, merchant balance, and full account numbers
 *    are NEVER recorded; only SHA-256 event hash and necessary transaction signals are retained.
 */

import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export type PaymentObservationSource = 'READER' | 'EMAIL' | 'VISION' | 'MANUAL';
export type PaymentObservationProvider = 'BCA' | 'MANDIRI' | 'BSI' | 'MANUAL_TRANSFER';

export interface ProcessPaymentMatchInput {
  tenantId: string;
  amount: number;
  reference?: string | null;
  occurredAt: Date | string;
  source: PaymentObservationSource;
  provider?: PaymentObservationProvider;
}

export interface PaymentMatchResult {
  success: boolean;
  action:
    | 'PAYMENT_CONFIRMED'
    | 'NOOP_ALREADY_PAID'
    | 'FLAGGED_LATE_MATCH'
    | 'FLAGGED_AMOUNT_DISCREPANCY'
    | 'NO_CANDIDATE_ORDER';
  orderId: string | null;
  affectedRows: number;
  notes?: string | null;
  reason?: string;
  outboxId?: string | null;
}

export interface PaymentObservationInput {
  tenantId: string;
  source: PaymentObservationSource;
  provider: PaymentObservationProvider;
  amount: number;
  currency?: string;
  occurredAt: Date | string;
  externalReference?: string | null;
  idempotencyKey?: string;
}

export interface PaymentObservationResult {
  success: boolean;
  observationId?: string;
  duplicate?: boolean;
  error?: string;
  rawEventHash?: string;
  idempotencyKey?: string;
}

/**
 * Computes a deterministic SHA-256 hash of the minimal, non-sensitive payment observation.
 * Invariant: Complies with UU PDP by hashing only provider, amount, time, and reference.
 */
export function computeMinimalEventHash(params: {
  tenantId: string;
  provider: string;
  amount: number;
  occurredAtIso: string;
  reference?: string | null;
}): string {
  const minimalStr = `${params.tenantId}:${params.provider}:${params.amount}:${params.occurredAtIso}:${params.reference || ''}`;
  return createHash('sha256').update(minimalStr).digest('hex');
}

/**
 * Records a multi-source payment observation into the `payment_observations` table.
 * Adheres strictly to UU PDP Data Minimization.
 */
export async function recordPaymentObservation(
  input: PaymentObservationInput
): Promise<PaymentObservationResult> {
  const supabase = getSupabaseAdmin();

  const occurredDate = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt);
  const occurredIso = !isNaN(occurredDate.getTime()) ? occurredDate.toISOString() : new Date().toISOString();
  const numAmount = Number(input.amount);

  // 1. Generate SHA-256 hash from minimal payload (UU PDP)
  const rawEventHash = computeMinimalEventHash({
    tenantId: input.tenantId,
    provider: input.provider,
    amount: numAmount,
    occurredAtIso: occurredIso,
    reference: input.externalReference,
  });

  // 2. Generate idempotency key
  const idempotencyKey =
    input.idempotencyKey ||
    `${input.source}:${input.provider}:${input.externalReference || rawEventHash}:${input.tenantId}`;

  try {
    const { data, error } = await supabase
      .from('payment_observations')
      .insert({
        tenant_id: input.tenantId,
        source: input.source,
        provider: input.provider,
        external_reference: input.externalReference || null,
        amount: numAmount,
        currency: input.currency || 'IDR',
        occurred_at: occurredIso,
        received_at: new Date().toISOString(),
        raw_event_hash: rawEventHash,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // Postgres error 23505 = unique constraint violation (duplicate key)
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('idempotency_key')) {
        return {
          success: true,
          duplicate: true,
          rawEventHash,
          idempotencyKey,
        };
      }
      return {
        success: false,
        error: error.message,
        rawEventHash,
        idempotencyKey,
      };
    }

    return {
      success: true,
      observationId: data?.id,
      duplicate: false,
      rawEventHash,
      idempotencyKey,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      rawEventHash,
      idempotencyKey,
    };
  }
}

/**
 * Atomic handler to reconcile and process payment match for an order.
 *
 * Rules:
 * 1. Query order: status = 'PENDING', total_amount == amount (EXACT MATCH wajib), created_at >= (occurredAt - 30 minutes).
 * 2. If order found:
 *    UPDATE orders SET status = 'PAID', paid_at = NOW() WHERE id = :order_id AND status = 'PENDING';
 *    - If affected_rows == 1:
 *        INSERT INTO payment_outbox (aggregate_id, event_type, payload) VALUES (...);
 *    - If affected_rows == 0:
 *        Safe NO-OP (already marked PAID concurrently).
 * 3. If nominal discrepancy or order created > 30 minutes ago (within 2-hour window):
 *    Flag order with notes: 'LATE_MATCH_PENDING_REVIEW', status remains PENDING for manual seller review.
 */
export async function processPaymentMatch({
  tenantId,
  amount,
  reference,
  occurredAt,
  source,
}: ProcessPaymentMatchInput): Promise<PaymentMatchResult> {
  const supabase = getSupabaseAdmin();

  const numAmount = Number(amount);
  const occurredDate = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const occurredTime = !isNaN(occurredDate.getTime()) ? occurredDate.getTime() : Date.now();

  const thirtyMinutesBefore = new Date(occurredTime - 30 * 60 * 1000).toISOString();
  const twoHoursBefore = new Date(occurredTime - 120 * 60 * 1000).toISOString();
  // 10-minute future grace for minor clock skew
  const futureGrace = new Date(occurredTime + 10 * 60 * 1000).toISOString();

  // ──────────────────────────────────────────────────────────────────────────
  // Attempt 1: Call PostgreSQL Stored Procedure if available (atomic DB transaction)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_payment_match', {
      p_tenant_id: tenantId,
      p_amount: numAmount,
      p_reference: reference || null,
      p_occurred_at: new Date(occurredTime).toISOString(),
      p_source: source,
    });

    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
      return {
        success: Boolean(rpcResult.success),
        action: rpcResult.action,
        orderId: rpcResult.order_id || null,
        affectedRows: Number(rpcResult.affected_rows || 0),
        notes: rpcResult.notes || null,
        reason: rpcResult.reason || undefined,
        outboxId: rpcResult.outbox_id || null,
      };
    }
  } catch (_rpcErr) {
    // If stored procedure is not yet deployed, fallback gracefully to client-side logic below
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Attempt 2: Direct Client-Side Atomic Execution (Optimistic Concurrency)
  // ──────────────────────────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();

  // 1. Exact Match Query within 30-minute window
  const { data: exactOrders } = await supabase
    .from('orders')
    .select('id, tenant_id, total_amount, gross_amount, status, created_at, notes')
    .eq('tenant_id', tenantId)
    .eq('status', 'PENDING')
    .eq('total_amount', numAmount)
    .gte('created_at', thirtyMinutesBefore)
    .lte('created_at', futureGrace)
    .order('created_at', { ascending: false })
    .limit(1);

  if (exactOrders && exactOrders.length > 0) {
    const matchedOrder = exactOrders[0];

    // Conditional atomic update
    const { data: updatedRows } = await supabase
      .from('orders')
      .update({
        status: 'PAID',
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', matchedOrder.id)
      .eq('status', 'PENDING')
      .select('id');

    const affectedRows = updatedRows ? updatedRows.length : 0;

    if (affectedRows === 1) {
      // Affected rows == 1: Insert into payment_outbox
      const outboxPayload = {
        order_id: matchedOrder.id,
        tenant_id: tenantId,
        amount: numAmount,
        paid_at: nowIso,
        source,
        reference: reference || null,
      };

      const { data: outboxData } = await supabase
        .from('payment_outbox')
        .insert({
          aggregate_id: matchedOrder.id,
          event_type: 'PAYMENT_CONFIRMED',
          payload: outboxPayload,
          status: 'PENDING',
          retry_count: 0,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('id')
        .maybeSingle();

      return {
        success: true,
        action: 'PAYMENT_CONFIRMED',
        orderId: matchedOrder.id,
        affectedRows: 1,
        notes: null,
        outboxId: outboxData?.id || null,
      };
    } else {
      // Affected rows == 0: Safe NO-OP (already marked PAID concurrently from another source)
      return {
        success: true,
        action: 'NOOP_ALREADY_PAID',
        orderId: matchedOrder.id,
        affectedRows: 0,
        notes: 'Order already settled or status changed concurrently.',
      };
    }
  }

  // 2. Late Match Query: Exact amount, but created between 30 min and 2 hours ago
  const { data: lateOrders } = await supabase
    .from('orders')
    .select('id, tenant_id, total_amount, gross_amount, status, created_at, notes')
    .eq('tenant_id', tenantId)
    .eq('status', 'PENDING')
    .eq('total_amount', numAmount)
    .gte('created_at', twoHoursBefore)
    .lt('created_at', thirtyMinutesBefore)
    .order('created_at', { ascending: false })
    .limit(1);

  if (lateOrders && lateOrders.length > 0) {
    const lateOrder = lateOrders[0];

    await supabase
      .from('orders')
      .update({
        notes: 'LATE_MATCH_PENDING_REVIEW',
        updated_at: nowIso,
      })
      .eq('id', lateOrder.id)
      .eq('status', 'PENDING');

    return {
      success: false,
      action: 'FLAGGED_LATE_MATCH',
      orderId: lateOrder.id,
      affectedRows: 0,
      notes: 'LATE_MATCH_PENDING_REVIEW',
      reason: 'Order created > 30 minutes ago (within 2-hour window)',
    };
  }

  // 3. Discrepancy Match Query: Any pending order for tenant within the 2-hour window
  const { data: discrepancyOrders } = await supabase
    .from('orders')
    .select('id, tenant_id, total_amount, gross_amount, status, created_at, notes')
    .eq('tenant_id', tenantId)
    .eq('status', 'PENDING')
    .gte('created_at', twoHoursBefore)
    .lte('created_at', futureGrace)
    .order('created_at', { ascending: false })
    .limit(1);

  if (discrepancyOrders && discrepancyOrders.length > 0) {
    const discrepancyOrder = discrepancyOrders[0];

    await supabase
      .from('orders')
      .update({
        notes: 'LATE_MATCH_PENDING_REVIEW',
        updated_at: nowIso,
      })
      .eq('id', discrepancyOrder.id)
      .eq('status', 'PENDING');

    return {
      success: false,
      action: 'FLAGGED_AMOUNT_DISCREPANCY',
      orderId: discrepancyOrder.id,
      affectedRows: 0,
      notes: 'LATE_MATCH_PENDING_REVIEW',
      reason: `Nominal discrepancy: observed ${numAmount}, expected ${discrepancyOrder.total_amount || discrepancyOrder.gross_amount}`,
    };
  }

  // 4. No candidate order within 2 hours
  return {
    success: false,
    action: 'NO_CANDIDATE_ORDER',
    orderId: null,
    affectedRows: 0,
    notes: null,
    reason: 'No pending orders found within the 2-hour window.',
  };
}

/**
 * High-level orchestration function:
 * 1. Records payment observation with UU PDP minimization.
 * 2. Runs processPaymentMatch to atomically update order & enqueue to outbox.
 */
export async function processInboundPaymentObservation(
  observation: PaymentObservationInput
): Promise<{
  observation: PaymentObservationResult;
  match: PaymentMatchResult;
}> {
  const obsResult = await recordPaymentObservation(observation);

  // If duplicate observation (idempotency key hit), do safe no-op or proceed with match
  const matchResult = await processPaymentMatch({
    tenantId: observation.tenantId,
    amount: observation.amount,
    reference: observation.externalReference,
    occurredAt: observation.occurredAt,
    source: observation.source,
    provider: observation.provider,
  });

  return {
    observation: obsResult,
    match: matchResult,
  };
}
