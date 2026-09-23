/**
 * lib/outbox/worker.ts
 * Transactional Outbox Worker Engine — Sprint P1
 *
 * Implements the full pipeline:
 *   1. Claim a batch of PENDING messages atomically via FOR UPDATE SKIP LOCKED
 *      (executed inside a Postgres function called via supabase.rpc)
 *   2. For each message: dispatch via IProviderAdapter
 *   3. On success  → mark SENT
 *   4. On failure  → jittered exponential backoff, retry or escalate to DEAD_LETTER
 *
 * Concurrency safety: Multiple worker instances can run in parallel.
 * FOR UPDATE SKIP LOCKED in claim_outbox_batch() ensures each message is
 * claimed by exactly one worker — no double-processing.
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';
import type { IProviderAdapter, OutboxMessage, OutboxRunSummary } from './types';
import { multiProviderAdapter } from './adapters/multi-provider-adapter';

// ---------------------------------------------------------------------------
// Jittered Exponential Backoff
// ---------------------------------------------------------------------------

/**
 * Calculate a jittered backoff delay in milliseconds.
 *
 * Formula: uniform random in [0, min(maxDelayMs, baseMs * 2^retryCount)]
 *
 * @param retryCount  - Current retry attempt (0-indexed)
 * @param baseMs      - Base delay in ms (default 2000)
 * @param maxDelayMs  - Cap for the delay in ms (default 30000)
 * @returns           - Delay in milliseconds (integer)
 */
export function jitteredBackoff(
  retryCount: number,
  baseMs = 2_000,
  maxDelayMs = 30_000
): number {
  const exponential = baseMs * Math.pow(2, retryCount);
  const cap = Math.min(maxDelayMs, exponential);
  return Math.floor(Math.random() * cap);
}

/**
 * OutboxDbClient defines only the RPC surface that the worker actually uses.
 * Accepting this interface instead of the full SupabaseClient type allows tests
 * to inject a plain mock object without TypeScript structural incompatibility.
 */
export interface OutboxDbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type SupabaseAdminClient = OutboxDbClient;

/**
 * Claim a batch of PENDING outbox messages atomically.
 * Delegates to the claim_outbox_batch() Postgres function which uses
 * FOR UPDATE SKIP LOCKED to prevent double-processing across parallel workers.
 */
async function claimBatch(
  db: SupabaseAdminClient,
  batchSize = 10
): Promise<OutboxMessage[]> {
  const { data, error } = await db.rpc('claim_outbox_batch', {
    batch_size: batchSize,
  });

  if (error) {
    throw new Error(`[OutboxWorker] claimBatch RPC failed: ${error.message}`);
  }

  return (data as OutboxMessage[]) ?? [];
}

/**
 * Mark a message as SENT.
 */
async function markSent(
  db: SupabaseAdminClient,
  id: string,
  messageId?: string
): Promise<void> {
  const { error } = await db.rpc('mark_outbox_sent', {
    p_id: id,
    p_message_id: messageId ?? null,
  });
  if (error) {
    console.error(`[OutboxWorker] markSent failed for id=${id}:`, error.message);
  }
}

/**
 * Mark a message for retry (or escalate to DEAD_LETTER if max retries reached).
 * The DB function handles the retry_count >= max_retries check atomically.
 */
async function markRetry(
  db: SupabaseAdminClient,
  id: string,
  errorMsg: string,
  delayMs: number
): Promise<void> {
  const { error } = await db.rpc('mark_outbox_retry', {
    p_id: id,
    p_error: errorMsg,
    p_delay_ms: delayMs,
  });
  if (error) {
    console.error(`[OutboxWorker] markRetry failed for id=${id}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Per-Message Processor
// ---------------------------------------------------------------------------

interface ProcessResult {
  outcome: 'sent' | 'retried' | 'dead_lettered';
}

/**
 * Process a single outbox message:
 *   1. Send via adapter
 *   2. On success: mark SENT
 *   3. On failure: calculate jittered backoff, then mark for retry or DLQ
 */
async function processMessage(
  db: SupabaseAdminClient,
  message: OutboxMessage,
  adapter: IProviderAdapter
): Promise<ProcessResult> {
  let sendResult;

  try {
    sendResult = await adapter.send(message);
  } catch (err: unknown) {
    // Adapter threw instead of returning SendResult — treat as transient failure
    const msg = err instanceof Error ? err.message : String(err);
    sendResult = { success: false, error: `[adapter.send] Uncaught exception: ${msg}` };
  }

  if (sendResult.success) {
    await markSent(db, message.id, sendResult.messageId);
    return { outcome: 'sent' };
  }

  // Failure path: calculate jitter delay based on *current* retry_count
  const delayMs = jitteredBackoff(message.retry_count);
  const errorText = sendResult.error ?? 'Unknown send error';

  await markRetry(db, message.id, errorText, delayMs);

  // Determine what the DB just did (retry or DLQ) for summary reporting
  const willBeDeadLetter = message.retry_count + 1 >= message.max_retries;
  return { outcome: willBeDeadLetter ? 'dead_lettered' : 'retried' };
}

// ---------------------------------------------------------------------------
// Worker Class
// ---------------------------------------------------------------------------

export class OutboxWorker {
  private readonly batchSize: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: {
    batchSize?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}) {
    this.batchSize = options.batchSize ?? 10;
    this.baseDelayMs = options.baseDelayMs ?? 2_000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
  }

  /**
   * Run one worker cycle:
   *   1. Claim a batch of PENDING messages (atomically, skip-locked)
   *   2. Process each message concurrently within the batch
   *   3. Return a summary of outcomes
   *
   * Multiple calls to runOnce() can run concurrently (different Node.js
   * processes or async tasks) — the DB-level locking guarantees isolation.
   *
   * @param adapter - Provider adapter (defaults to WabaProviderAdapter in production)
   * @param db      - Supabase admin client (injectable for testing)
   */
  async runOnce(
    adapter?: IProviderAdapter,
    db?: OutboxDbClient
  ): Promise<OutboxRunSummary> {
    const effectiveAdapter = adapter ?? multiProviderAdapter;
    const client: OutboxDbClient = db ?? (getSupabaseAdmin() as unknown as OutboxDbClient);
    const summary: OutboxRunSummary = {
      claimed: 0,
      sent: 0,
      delivered: 0,
      retried: 0,
      dead_lettered: 0,
      failed: 0,
    };

    let batch: OutboxMessage[];
    try {
      batch = await claimBatch(client, this.batchSize);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[OutboxWorker] Failed to claim batch:', msg);
      return summary;
    }

    summary.claimed = batch.length;

    if (batch.length === 0) {
      return summary;
    }

    // Process all messages in the batch concurrently
    const results = await Promise.allSettled(
      batch.map((msg) => processMessage(client, msg, effectiveAdapter))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { outcome } = result.value;
        if (outcome === 'sent') {
          summary.sent++;
          summary.delivered = (summary.delivered ?? 0) + 1;
        } else if (outcome === 'retried') {
          summary.retried++;
        } else if (outcome === 'dead_lettered') {
          summary.dead_lettered++;
          summary.failed = (summary.failed ?? 0) + 1;
        }
      } else {
        // processMessage itself should never reject, but be defensive
        console.error('[OutboxWorker] processMessage rejected:', result.reason);
        summary.retried++; // count as a failure requiring retry
      }
    }

    return summary;
  }
}

// ---------------------------------------------------------------------------
// Default singleton instance
// ---------------------------------------------------------------------------

export const outboxWorker = new OutboxWorker();

// Re-export for convenience
export { claimBatch, markSent, markRetry, processMessage };
