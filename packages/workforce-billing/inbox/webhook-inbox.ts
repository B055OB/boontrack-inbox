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

  public getDeadLetterQueue(): DeadLetterQueueEntry[] {
    return [...this.dlq];
  }
}

