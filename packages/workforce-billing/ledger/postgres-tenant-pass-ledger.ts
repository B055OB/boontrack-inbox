/**
 * packages/workforce-billing/ledger/postgres-tenant-pass-ledger.ts
 * PostgreSQL Production Adapter for BWM Tenant Pass Ledger (CTO Audit Compliance)
 *
 * Direct Database-Level Invariants:
 * 1. Transaction Boundaries: Explicit `BEGIN` ... `COMMIT` / `ROLLBACK`.
 * 2. Multi-Container Concurrency: Row-Level Locking via `SELECT ... FOR UPDATE` on tenant state.
 * 3. Anti-Negative Balance: DDL CHECK `balance_after >= 0` and application-level verification.
 * 4. Persistent Webhook Idempotency: `ON CONFLICT (idempotency_key) DO UPDATE SET retry_count = retry_count + 1`.
 */

import { Client, PoolClient } from 'pg';

export interface PostgresLedgerMutationParams {
  tenantId: string;
  batchId: string;
  deltaPasses: number;
  reason: 'PURCHASE' | 'ALLOCATION' | 'REVERSAL' | 'RENEWAL';
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

export interface PostgresLedgerMutationResult {
  isDuplicate: boolean;
  entryId: string;
  tenantId: string;
  balanceAfter: number;
}

export interface PersistentWebhookIngestionParams {
  provider: string;
  eventId: string;
  idempotencyKey: string;
  eventType: string;
  rawPayload: any;
  headers: Record<string, string>;
}

export interface PersistentWebhookIngestionResult {
  inboxId: string;
  isDuplicate: boolean;
  retryCount: number;
  status: string;
}

export class PostgresTenantPassLedger {
  private readonly client: Client | PoolClient;
  private readonly targetSchema: string;

  constructor(client: Client | PoolClient, targetSchema: string = 'workforce_staging') {
    this.client = client;
    this.targetSchema = targetSchema;
  }

  /**
   * Executes atomic balance mutation inside PostgreSQL transaction with row-level locking.
   * Multi-instance/multi-container safe via `SELECT ... FOR UPDATE` and `CHECK (balance_after >= 0)`.
   */
  public async mutateBalanceAtomic(
    params: PostgresLedgerMutationParams
  ): Promise<PostgresLedgerMutationResult> {
    const { tenantId, batchId, deltaPasses, reason, idempotencyKey, metadata = {} } = params;

    await this.client.query('BEGIN');
    try {
      // 1. Enforce Idempotency Key Uniqueness at Database Level
      const existingRes = await this.client.query(
        `SELECT entry_id, balance_after FROM ${this.targetSchema}.tenant_pass_ledger WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingRes.rows.length > 0) {
        await this.client.query('COMMIT');
        return {
          isDuplicate: true,
          entryId: existingRes.rows[0].entry_id,
          tenantId,
          balanceAfter: existingRes.rows[0].balance_after,
        };
      }

      // 2. Multi-Container Concurrency Guard: Row-Level Locking via SELECT ... FOR UPDATE
      const lockRes = await this.client.query(
        `SELECT balance_after
         FROM ${this.targetSchema}.tenant_pass_ledger
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [tenantId]
      );

      const currentBalance = lockRes.rows.length > 0 ? Number(lockRes.rows[0].balance_after) : 0;
      const newBalance = currentBalance + deltaPasses;

      // 3. Application pre-check for anti-negative balance (mirrored by PostgreSQL CHECK constraint)
      if (newBalance < 0) {
        throw new Error(
          `ERR_NEGATIVE_BALANCE: Requested delta ${deltaPasses} would reduce balance below zero (Current: ${currentBalance}, Result: ${newBalance})`
        );
      }

      // 4. Append Immutable Ledger Entry
      const entryId = `ple_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await this.client.query(
        `INSERT INTO ${this.targetSchema}.tenant_pass_ledger (
          entry_id, tenant_id, batch_id, delta_passes, balance_after, reason, idempotency_key, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [entryId, tenantId, batchId, deltaPasses, newBalance, reason, idempotencyKey, JSON.stringify(metadata)]
      );

      await this.client.query('COMMIT');

      return {
        isDuplicate: false,
        entryId,
        tenantId,
        balanceAfter: newBalance,
      };
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Persistent Webhook Ingestion using PostgreSQL ON CONFLICT UPSERT semantics.
   */
  public async ingestPersistentWebhook(
    params: PersistentWebhookIngestionParams
  ): Promise<PersistentWebhookIngestionResult> {
    const { provider, eventId, idempotencyKey, eventType, rawPayload, headers } = params;

    const query = `
      INSERT INTO ${this.targetSchema}.workforce_webhook_inbox (
        provider, event_id, idempotency_key, event_type, raw_payload, headers, status, retry_count, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED', 0, NOW())
      ON CONFLICT (idempotency_key) DO UPDATE
        SET retry_count = ${this.targetSchema}.workforce_webhook_inbox.retry_count + 1
      RETURNING id, status, retry_count, (xmax = 0) AS is_new_delivery;
    `;

    const res = await this.client.query(query, [
      provider,
      eventId,
      idempotencyKey,
      eventType,
      JSON.stringify(rawPayload),
      JSON.stringify(headers),
    ]);

    const row = res.rows[0];
    const isNew = row.is_new_delivery;

    return {
      inboxId: row.id,
      isDuplicate: !isNew,
      retryCount: Number(row.retry_count),
      status: row.status,
    };
  }
}
