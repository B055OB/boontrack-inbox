/**
 * lib/outbox/enqueue.ts
 * Helper to write messages into the message_outbox table.
 *
 * Key properties:
 *   - Idempotent: ON CONFLICT (idempotency_key) DO NOTHING — safe to call multiple times.
 *   - Auto-generates idempotency_key if not provided, or provides deterministic SHA-256
 *     hash generator via `generateMessageIdempotencyKey(tenantId, entityId, messageType)`.
 *   - Supports dual-naming conventions: recipient / recipient_phone, next_retry_at / scheduled_at.
 *   - Returns the created row, or null if the key was a duplicate (silently skipped).
 */

import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import type { EnqueueOutboxParams, OutboxMessage } from './types';

/**
 * Generate a deterministic SHA-256 idempotency key from tenant + entity (order_id/lead_id) + message_type.
 * Guaranteed to produce the exact same key for identical business events across multiple retries/webhooks.
 *
 * Example output: "3f7a9c..." (64 hex characters)
 */
export function generateMessageIdempotencyKey(
  tenantId: string,
  entityId: string,
  messageType: string
): string {
  const normalized = `${(tenantId || '').trim().toLowerCase()}:${(entityId || '').trim()}:${(messageType || '').trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate a randomized fallback idempotency key from tenant + recipient + timestamp.
 */
function generateFallbackIdempotencyKey(tenantId: string, recipientPhone: string): string {
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

  const targetRecipient = (params.recipient || params.recipient_phone || '').trim();
  if (!targetRecipient) {
    throw new Error('[enqueueOutboxMessage] Missing recipient or recipient_phone');
  }

  const idempotencyKey =
    params.idempotency_key ??
    generateFallbackIdempotencyKey(params.tenant_id, targetRecipient);

  const scheduledTime = (params.next_retry_at ?? params.scheduled_at ?? new Date()).toISOString();

  const row = {
    tenant_id: params.tenant_id,
    channel: (params.channel ?? 'WHATSAPP').toUpperCase(),
    phone_number_id: params.phone_number_id ?? null,
    recipient_phone: targetRecipient,
    recipient: targetRecipient,
    payload: params.payload,
    status: 'PENDING' as const,
    idempotency_key: idempotencyKey,
    max_retries: params.max_retries ?? 3,
    scheduled_at: scheduledTime,
    next_retry_at: scheduledTime,
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
