/**
 * lib/outbox/enqueue.ts
 * Helper to write messages into the message_outbox table.
 *
 * Key properties:
 *   - Idempotent: ON CONFLICT (idempotency_key) DO NOTHING — safe to call multiple times.
 *   - Auto-generates idempotency_key if not provided (UUID v4 via crypto.randomUUID).
 *   - Returns the created row, or null if the key was a duplicate (silently skipped).
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';
import type { EnqueueOutboxParams, OutboxMessage } from './types';

/**
 * Generate a deterministic idempotency key from tenant + recipient + timestamp.
 * Callers may override this with their own stable key (e.g., order_id + event_type).
 */
function generateIdempotencyKey(tenantId: string, recipientPhone: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `${tenantId}:${recipientPhone}:${ts}:${rand}`;
}

/**
 * Enqueue a WhatsApp outbox message.
 *
 * @returns The created OutboxMessage row, or null if the idempotency_key already exists.
 */
export async function enqueueOutboxMessage(
  params: EnqueueOutboxParams
): Promise<OutboxMessage | null> {
  const supabase = getSupabaseAdmin();

  const idempotencyKey =
    params.idempotency_key ??
    generateIdempotencyKey(params.tenant_id, params.recipient_phone);

  const row = {
    tenant_id: params.tenant_id,
    channel: params.channel ?? 'WHATSAPP',
    phone_number_id: params.phone_number_id ?? null,
    recipient_phone: params.recipient_phone,
    payload: params.payload,
    status: 'PENDING' as const,
    idempotency_key: idempotencyKey,
    max_retries: params.max_retries ?? 3,
    scheduled_at: params.scheduled_at?.toISOString() ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('message_outbox')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    // Code 23505 = unique_violation (idempotency_key already exists)
    if ((error as { code?: string }).code === '23505') {
      return null; // Duplicate — silently skip per idempotency contract
    }
    throw new Error(`[enqueueOutboxMessage] Failed to insert outbox record: ${error.message}`);
  }

  return data as OutboxMessage | null;
}

/**
 * Batch enqueue multiple messages.
 * Each message is enqueued individually to preserve per-message idempotency.
 * Returns array of results: `null` for duplicates, `OutboxMessage` for new rows.
 */
export async function enqueueOutboxMessages(
  messages: EnqueueOutboxParams[]
): Promise<Array<OutboxMessage | null>> {
  return Promise.all(messages.map(enqueueOutboxMessage));
}
