import {
  SecurityInvariantViolation,
  PersistentWebhookIngestionParams,
  PersistentWebhookIngestionResult,
  verifyAuthoritativePaymentTenant,
  registerAuthoritativePayment,
  clearAuthoritativePaymentRegistry,
  extractPaymentReference,
  extractPayloadTenant,
} from '../ledger/postgres-tenant-pass-ledger';
import { Client, PoolClient } from 'pg';

export {
  verifyAuthoritativePaymentTenant,
  registerAuthoritativePayment,
  clearAuthoritativePaymentRegistry,
  extractPaymentReference,
  extractPayloadTenant,
};
/**
 * packages/workforce-billing/inbox/webhook-inbox.ts
 * Webhook Inbox, Idempotency Engine & Dead-Letter Queue (DLQ)
 *
 * Guarantees:
 * - Exactly-Once Execution
 * - Zero Side-Effect on Duplicates
 * - Replay Attack Detection & Defense
 * - Dead-Letter Isolation for Malformed Payloads
 */

import crypto from 'crypto';
import {
  PaymentProvider,
  WebhookStatus,
  WebhookInboxRecord,
  DeadLetterQueueEntry,
} from '../types';

export interface IngestionResult {
  accepted: boolean;
  isDuplicate: boolean;
  status: WebhookStatus;
  inboxId?: string;
  message: string;
}

export class WebhookInbox {
  private readonly inbox: Map<string, WebhookInboxRecord> = new Map();
  private readonly idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> inboxId
  private readonly dlq: DeadLetterQueueEntry[] = [];

  /**
   * Generates a stable deterministic idempotency key
   */
  public generateIdempotencyKey(provider: PaymentProvider, eventId: string, rawPayload: any): string {
    const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const digest = crypto.createHash('sha256').update(payloadStr).digest('hex');
    return `${provider}:${eventId}:${digest}`;
  }

  /**
   * Ingest incoming webhook with idempotency check
   */
  public ingest(params: {
    provider: PaymentProvider;
    eventId: string;
    eventType: string;
    rawPayload: any;
    headers: Record<string, string>;
  }): IngestionResult {
    const { provider, eventId, eventType, rawPayload, headers } = params;

    const idempotencyKey = this.generateIdempotencyKey(provider, eventId, rawPayload);

    // Duplicate Check 1: Idempotency Key collision
    const existingInboxId = this.idempotencyIndex.get(idempotencyKey);
    if (existingInboxId) {
      const existing = this.inbox.get(existingInboxId);
      if (existing) {
        existing.retryCount += 1;
        return {
          accepted: true,
          isDuplicate: true,
          status: existing.status,
          inboxId: existing.id,
          message: 'DUPLICATE_WEBHOOK_ACKNOWLEDGED_ZERO_SIDE_EFFECTS',
        };
      }
    }

    // Duplicate Check 2: Same provider and eventId already processed
    for (const record of this.inbox.values()) {
      if (record.provider === provider && record.eventId === eventId) {
        record.retryCount += 1;
        return {
          accepted: true,
          isDuplicate: true,
          status: record.status,
          inboxId: record.id,
          message: 'DUPLICATE_EVENT_ID_ACKNOWLEDGED_ZERO_SIDE_EFFECTS',
        };
      }
    }

    // New Event Ingestion
    const inboxId = `inb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: WebhookInboxRecord = {
      id: inboxId,
      provider,
      eventId,
      idempotencyKey,
      eventType,
      rawPayload,
      headers,
      status: 'RECEIVED',
      receivedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.inbox.set(inboxId, record);
    this.idempotencyIndex.set(idempotencyKey, inboxId);

    return {
      accepted: true,
      isDuplicate: false,
      status: 'RECEIVED',
      inboxId,
      message: 'WEBHOOK_RECEIVED_PENDING_PROCESSING',
    };
  }

  /**
   * Mark as PROCESSING during active transactional ledger mutation
   */
  public markProcessing(inboxId: string): void {
    const record = this.inbox.get(inboxId);
    if (!record) {
      throw new Error(`INBOX_RECORD_NOT_FOUND: ${inboxId}`);
    }
    record.status = 'PROCESSING';
  }

  /**
   * Mark as PROCESSED after downstream entitlement / ledger booking
   */
  public markProcessed(inboxId: string): void {
    const record = this.inbox.get(inboxId);
    if (!record) {
      throw new Error(`INBOX_RECORD_NOT_FOUND: ${inboxId}`);
    }
    record.status = 'PROCESSED';
    record.processedAt = new Date().toISOString();
  }

  /**
   * Mark as FAILED if transactional mutation aborts or rolls back
   */
  public markFailed(inboxId: string, errorMessage?: string): void {
    const record = this.inbox.get(inboxId);
    if (!record) {
      throw new Error(`INBOX_RECORD_NOT_FOUND: ${inboxId}`);
    }
    record.status = 'FAILED';
    if (errorMessage) {
      record.errorMessage = errorMessage;
    }
  }

  /**
   * Revert status on transactional rollback
   */
  public revertStatus(inboxId: string, previousStatus: WebhookStatus): void {
    const record = this.inbox.get(inboxId);
    if (!record) {
      throw new Error(`INBOX_RECORD_NOT_FOUND: ${inboxId}`);
    }
    record.status = previousStatus;
  }

  /**
   * Divert unparseable, invalid, or corrupt webhooks to Dead-Letter Queue
   */
  public divertToDeadLetterQueue(params: {
    provider: PaymentProvider;
    payload: any;
    failureReason: string;
    stackTrace?: string;
    inboxId?: string;
  }): DeadLetterQueueEntry {
    const { provider, payload, failureReason, stackTrace, inboxId } = params;

    if (inboxId) {
      const record = this.inbox.get(inboxId);
      if (record) {
        record.status = 'DEAD_LETTER';
        record.errorMessage = failureReason;
      }
    }

    const dlqEntry: DeadLetterQueueEntry = {
      id: `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      inboxId,
      provider,
      payload,
      failureReason,
      stackTrace,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    this.dlq.push(dlqEntry);
    return dlqEntry;
  }

  public getRecord(inboxId: string): WebhookInboxRecord | undefined {
    return this.inbox.get(inboxId);
  }

  public getAllRecords(): WebhookInboxRecord[] {
    return Array.from(this.inbox.values());
  }

  /**
   * Persists webhook to PostgreSQL workforce_staging.workforce_webhook_inbox with authoritative tenant binding.
   */
  public async ingestPersistentWebhook(
    client: Client | PoolClient,
    params: PersistentWebhookIngestionParams,
    targetSchema?: string
  ): Promise<PersistentWebhookIngestionResult> {
    return ingestPersistentWebhook(client, params, targetSchema);
  }

  public getDeadLetterQueue(): DeadLetterQueueEntry[] {
    return [...this.dlq];
  }
}


/**
 * Ingests persistent webhook directly to PostgreSQL workforce_staging.workforce_webhook_inbox.
 * Enforces fail-closed identity conflict verification:
 * DILARANG melakukan blind ON CONFLICT (idempotency_key) DO UPDATE.
 */
export async function ingestPersistentWebhook(
  client: Client | PoolClient,
  params: PersistentWebhookIngestionParams,
  targetSchema: string = 'workforce_staging'
): Promise<PersistentWebhookIngestionResult> {
  const { provider, eventId, idempotencyKey, eventType, tenantId, rawPayload, headers } = params;

  if (!tenantId || tenantId.trim() === '') {
    throw new SecurityInvariantViolation(
      "TENANT_ID_REQUIRED: Cannot ingest financial webhook without authoritative tenant binding"
    );
  }

  // 1. Verify if a record with idempotencyKey already exists in DB
  const checkRes = await client.query(
    `SELECT id, provider, event_id, idempotency_key, tenant_id, status, retry_count
     FROM ${targetSchema}.workforce_webhook_inbox
     WHERE idempotency_key = $1`,
    [idempotencyKey]
  );

  if (checkRes.rows.length > 0) {
    const existing = checkRes.rows[0];
    if (
      existing.tenant_id !== tenantId ||
      existing.provider !== provider ||
      existing.event_id !== eventId
    ) {
      throw new SecurityInvariantViolation(
        "IDEMPOTENCY_KEY_IDENTITY_CONFLICT: Idempotency key already claimed with different identity/tenant"
      );
    }

    const updateRes = await client.query(
      `UPDATE ${targetSchema}.workforce_webhook_inbox
       SET retry_count = retry_count + 1
       WHERE id = $1
       RETURNING id, status, retry_count`,
      [existing.id]
    );

    const updated = updateRes.rows[0];
    return {
      inboxId: updated.id,
      isDuplicate: true,
      retryCount: Number(updated.retry_count),
      status: updated.status,
    };
  }

  // 2. Insert new delivery (fail-closed if race condition occurs on idempotency_key)
  try {
    const insertRes = await client.query(
      `INSERT INTO ${targetSchema}.workforce_webhook_inbox (
        provider, event_id, idempotency_key, event_type, tenant_id, raw_payload, headers, status, retry_count, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'RECEIVED', 0, NOW())
      RETURNING id, status, retry_count`,
      [
        provider,
        eventId,
        idempotencyKey,
        eventType,
        tenantId,
        JSON.stringify(rawPayload),
        JSON.stringify(headers),
      ]
    );

    const inserted = insertRes.rows[0];
    return {
      inboxId: inserted.id,
      isDuplicate: false,
      retryCount: Number(inserted.retry_count),
      status: inserted.status,
    };
  } catch (err: any) {
    if (err.code === '23505') {
      const recheck = await client.query(
        `SELECT id, provider, event_id, idempotency_key, tenant_id, status, retry_count
         FROM ${targetSchema}.workforce_webhook_inbox
         WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (recheck.rows.length > 0) {
        const existing = recheck.rows[0];
        if (
          existing.tenant_id !== tenantId ||
          existing.provider !== provider ||
          existing.event_id !== eventId
        ) {
          throw new SecurityInvariantViolation(
            "IDEMPOTENCY_KEY_IDENTITY_CONFLICT: Idempotency key already claimed with different identity/tenant"
          );
        }
        const updateRes = await client.query(
          `UPDATE ${targetSchema}.workforce_webhook_inbox
           SET retry_count = retry_count + 1
           WHERE id = $1
           RETURNING id, status, retry_count`,
          [existing.id]
        );
        const updated = updateRes.rows[0];
        return {
          inboxId: updated.id,
          isDuplicate: true,
          retryCount: Number(updated.retry_count),
          status: updated.status,
        };
      }
    }
    throw err;
  }
}
