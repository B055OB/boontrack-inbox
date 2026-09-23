/**
 * lib/outbox/types.ts
 * Core TypeScript contracts for the Transactional Outbox pipeline.
 *
 * Architecture reference: Sprint P1 — Outbox Worker with Row-Locking & DLQ
 */

// ---------------------------------------------------------------------------
// Status Enum
// ---------------------------------------------------------------------------

export type OutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD_LETTER';

// ---------------------------------------------------------------------------
// Message Payload — mirrors JSONB contract in DB
// ---------------------------------------------------------------------------

export interface OutboxTextPayload {
  type: 'text';
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface OutboxTemplatePayload {
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
}

export interface OutboxInteractivePayload {
  type: 'interactive';
  interactive: Record<string, unknown>;
}

export type OutboxMessagePayload =
  | OutboxTextPayload
  | OutboxTemplatePayload
  | OutboxInteractivePayload
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Row shape — mirrors the message_outbox table
// ---------------------------------------------------------------------------

export interface OutboxMessage {
  id: string;
  tenant_id: string;
  channel: string;
  phone_number_id: string | null;
  recipient_phone: string;
  payload: OutboxMessagePayload;
  status: OutboxStatus;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  scheduled_at: string; // ISO 8601 string from Postgres TIMESTAMPTZ
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Provider Adapter Interface
// ---------------------------------------------------------------------------

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IProviderAdapter {
  /**
   * Send an outbox message to the underlying messaging provider.
   * Implementations must be stateless and throw-safe (return SendResult, never throw).
   */
  send(message: OutboxMessage): Promise<SendResult>;
}

// ---------------------------------------------------------------------------
// Worker Run Summary
// ---------------------------------------------------------------------------

export interface OutboxRunSummary {
  /** Total messages claimed from the batch */
  claimed: number;
  /** Messages sent successfully */
  sent: number;
  /** Messages that will be retried (transient failure) */
  retried: number;
  /** Messages escalated to DEAD_LETTER */
  dead_lettered: number;
}

// ---------------------------------------------------------------------------
// Enqueue Parameters
// ---------------------------------------------------------------------------

export interface EnqueueOutboxParams {
  tenant_id: string;
  recipient_phone: string;
  payload: OutboxMessagePayload;
  phone_number_id?: string;
  channel?: string;
  idempotency_key?: string;
  scheduled_at?: Date;
  max_retries?: number;
}
