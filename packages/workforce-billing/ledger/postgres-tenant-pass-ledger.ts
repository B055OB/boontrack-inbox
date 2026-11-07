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
import { verifyAndSettleAuthoritativePayment } from '../registry/persistent-payment-registry';

export class SecurityInvariantViolation extends Error {
  constructor(message: string) {
    super(`SecurityInvariantViolation: ${message}`);
    this.name = 'SecurityInvariantViolation';
  }
}

/**
 * Extracts payment or transaction reference from raw payload.
 */
export function extractPaymentReference(rawPayload: any): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;

  return (
    rawPayload.payment_reference ||
    rawPayload.paymentReference ||
    rawPayload.payment_id ||
    rawPayload.paymentId ||
    rawPayload.external_id ||
    rawPayload.externalId ||
    rawPayload.invoice_id ||
    rawPayload.invoiceId ||
    rawPayload.transaction_id ||
    rawPayload.transactionId ||
    rawPayload.data?.payment_reference ||
    rawPayload.data?.paymentReference ||
    rawPayload.data?.payment_id ||
    rawPayload.data?.id ||
    null
  );
}

/**
 * Extracts claimed tenant identifier from raw payload metadata.
 */
export function extractPayloadTenant(rawPayload: any): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;

  return (
    rawPayload.tenant_id ||
    rawPayload.tenantId ||
    rawPayload.metadata?.tenant_id ||
    rawPayload.metadata?.tenantId ||
    rawPayload.data?.metadata?.tenant_id ||
    rawPayload.data?.metadata?.tenantId ||
    rawPayload.customer?.metadata?.tenant_id ||
    rawPayload.customer?.metadata?.tenantId ||
    null
  );
}

/**
 * Tenant-binding guard pre-check.
 * NOTE: This function is a fail-closed preliminary verification guard,
 * NOT a replacement for the authoritative atomic settlement executed via verifyAndSettleAuthoritativePayment().
 *
 * Verifies authenticity of tenant ownership for payment webhook (Fail-Closed).
 * Validates that transaction reference in payload is registered and bound to authoritative tenantId
 * directly from persistent PostgreSQL registry (workforce_staging.workforce_payment_registry).
 */
export async function verifyAuthoritativePaymentTenant(
  provider: string,
  eventId: string,
  tenantId: string,
  rawPayload: any,
  client?: Client | PoolClient,
  targetSchema: string = 'workforce_staging'
): Promise<boolean> {
  if (!tenantId || tenantId.trim() === '') {
    throw new SecurityInvariantViolation("TENANT_ID_REQUIRED: Missing authoritative tenant identifier");
  }

  // 1. Explicit unverified flag defense
  if (
    rawPayload?.unverified === true ||
    rawPayload?.verified === false ||
    rawPayload?.is_unverified === true ||
    rawPayload?.unregistered === true ||
    rawPayload?.status === 'UNVERIFIED'
  ) {
    throw new SecurityInvariantViolation(
      "UNVERIFIED_PAYMENT_TENANT_MAPPING: Transaction reference does not match authoritative tenant mapping"
    );
  }

  // 2. Tenant reference check in payload (if specified, must match parameter tenantId)
  const payloadTenant = extractPayloadTenant(rawPayload);
  if (payloadTenant && payloadTenant !== tenantId) {
    throw new SecurityInvariantViolation(
      "UNVERIFIED_PAYMENT_TENANT_MAPPING: CROSS_TENANT_COLLISION - Transaction reference does not match authoritative tenant mapping"
    );
  }

  // 3. Payment / Transaction reference resolution via PostgreSQL Persistent Registry
  const paymentRef = extractPaymentReference(rawPayload);
  if (!paymentRef || paymentRef.trim() === '') {
    throw new SecurityInvariantViolation(
      "UNVERIFIED_PAYMENT_TENANT_MAPPING: UNKNOWN_PAYMENT_REFERENCE - Missing payment transaction reference for settlement"
    );
  }

  if (client) {
    const res = await client.query(
      `SELECT tenant_id, status, provider FROM ${targetSchema}.workforce_payment_registry WHERE provider_transaction_id = $1`,
      [paymentRef.trim()]
    );
    if (res.rows.length === 0) {
      throw new SecurityInvariantViolation(
        "UNVERIFIED_PAYMENT_TENANT_MAPPING: UNKNOWN_PAYMENT_REFERENCE - Transaction reference not registered in persistent registry"
      );
    }
    const row = res.rows[0];
    if (row.tenant_id !== tenantId) {
      throw new SecurityInvariantViolation(
        "UNVERIFIED_PAYMENT_TENANT_MAPPING: CROSS_TENANT_COLLISION - Transaction reference does not match authoritative tenant mapping"
      );
    }
    if (row.status !== 'BOUND') {
      throw new SecurityInvariantViolation(
        `INVALID_PAYMENT_STATUS_NOT_BOUND: Order status is ${row.status}, must be in BOUND status to settle`
      );
    }

    // Provider authenticity verification
    const normalizeProvider = (p: string) => p.toLowerCase().replace(/_payments$/, '');
    if (normalizeProvider(row.provider) !== normalizeProvider(provider)) {
      throw new SecurityInvariantViolation(
        `PROVIDER_OR_ACCOUNT_MISMATCH: Order provider ${row.provider} does not match parameter provider ${provider}`
      );
    }

    return true;
  }

  // Fail-closed: Cannot verify transaction reference without persistent client connection
  throw new SecurityInvariantViolation(
    "UNVERIFIED_PAYMENT_TENANT_MAPPING: UNKNOWN_PAYMENT_REFERENCE - Cannot verify transaction reference without persistent client connection"
  );
}

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
  tenantId: string;
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
      // 1. Transactional Advisory Lock on Tenant: Guarantees serialization even for cold-start (0 rows)
      await this.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);

      // 2. Enforce Idempotency Key Uniqueness at Database Level with Tenant Isolation
      const existingRes = await this.client.query(
        `SELECT entry_id, tenant_id, balance_after FROM ${this.targetSchema}.tenant_pass_ledger WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingRes.rows.length > 0) {
        if (existingRes.rows[0].tenant_id !== tenantId) {
          throw new SecurityInvariantViolation(
            `CROSS_TENANT_IDEMPOTENCY_MISMATCH: Ledger idempotency key ${idempotencyKey} belongs to tenant ${existingRes.rows[0].tenant_id}, attempted access by tenant ${tenantId}`
          );
        }
        await this.client.query('COMMIT');
        return {
          isDuplicate: true,
          entryId: existingRes.rows[0].entry_id,
          tenantId,
          balanceAfter: Number(existingRes.rows[0].balance_after),
        };
      }

      // 3. Multi-Container Concurrency Guard: Row-Level Locking via SELECT ... FOR UPDATE
      const lockRes = await this.client.query(
        `SELECT balance_after
         FROM ${this.targetSchema}.tenant_pass_ledger
         WHERE tenant_id = $1
         ORDER BY created_at DESC, balance_after DESC
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`,
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
   * Persistent Webhook Ingestion with strict fail-closed identity conflict checks.
   * DILARANG melakukan blind ON CONFLICT (idempotency_key) DO UPDATE.
   */
  public async ingestPersistentWebhook(
    params: PersistentWebhookIngestionParams
  ): Promise<PersistentWebhookIngestionResult> {
    const { provider, eventId, idempotencyKey, eventType, tenantId, rawPayload, headers } = params;

    if (!tenantId || tenantId.trim() === '') {
      throw new SecurityInvariantViolation(
        "TENANT_ID_REQUIRED: Cannot ingest financial webhook without authoritative tenant binding"
      );
    }

    // 1. Verify if a record with idempotencyKey already exists in DB
    const checkRes = await this.client.query(
      `SELECT id, provider, event_id, idempotency_key, tenant_id, status, retry_count
       FROM ${this.targetSchema}.workforce_webhook_inbox
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

      const updateRes = await this.client.query(
        `UPDATE ${this.targetSchema}.workforce_webhook_inbox
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
      const insertRes = await this.client.query(
        `INSERT INTO ${this.targetSchema}.workforce_webhook_inbox (
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
        const recheck = await this.client.query(
          `SELECT id, provider, event_id, idempotency_key, tenant_id, status, retry_count
           FROM ${this.targetSchema}.workforce_webhook_inbox
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
          const updateRes = await this.client.query(
            `UPDATE ${this.targetSchema}.workforce_webhook_inbox
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

  /**
   * Executes atomic binding between Webhook Inbox and Tenant Pass Ledger.
   * Single Database Transaction (BEGIN ... COMMIT):
   * 1. Transactional Advisory Lock on tenant (cold-start protection).
   * 2. Lock & update webhook_inbox record from 'RECEIVED' -> 'PROCESSING' FOR UPDATE.
   * 3. Idempotently mutate tenant pass ledger (+deltaPasses) with row-level lock & anti-negative check.
   * 4. Update webhook_inbox record -> 'PROCESSED' with processed_at = NOW().
   * If any step fails, entire transaction is cleanly ROLLBACKed.
   */
  public async processWebhookAndMutateLedgerAtomic(params: {
    provider: string;
    eventId: string;
    idempotencyKey: string;
    eventType: string;
    rawPayload: any;
    headers: Record<string, string>;
    tenantId: string;
    batchId: string;
    deltaPasses: number;
    reason?: 'PURCHASE' | 'ALLOCATION' | 'REVERSAL' | 'RENEWAL';
    metadata?: Record<string, any>;
  }): Promise<{
    isDuplicate: boolean;
    inboxId: string;
    entryId?: string;
    balanceAfter: number;
    status: 'PROCESSED' | 'DUPLICATE_ACKNOWLEDGED';
  }> {
    const {
      provider,
      eventId,
      idempotencyKey,
      eventType,
      rawPayload,
      headers,
      tenantId,
      batchId,
      deltaPasses,
      reason = 'PURCHASE',
      metadata = {},
    } = params;

    // Fail-closed initial tenant validation
    if (!tenantId || tenantId.trim() === '') {
      throw new SecurityInvariantViolation("TENANT_ID_REQUIRED: Missing authoritative tenant identifier");
    }

    await this.client.query('BEGIN');
    try {
      // 1. Transactional Advisory Lock on Tenant: Guarantees serialization across multi-connection pools
      await this.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);

      // 2. Lock & Inspect Webhook Inbox Entry FOR UPDATE by idempotency_key or (provider, event_id)
      const inboxRes = await this.client.query(
        `SELECT id, provider, event_id, idempotency_key, tenant_id, raw_payload, status, retry_count
         FROM ${this.targetSchema}.workforce_webhook_inbox
         WHERE idempotency_key = $1 OR (provider = $2 AND event_id = $3)
         FOR UPDATE`,
        [idempotencyKey, provider, eventId]
      );

      let inboxId: string;
      // Invariant 1: Reject Ambiguous Identity Lookup (Fail-Closed)
      if (inboxRes.rows.length > 1) {
        throw new SecurityInvariantViolation("AMBIGUOUS_WEBHOOK_IDENTITY: Query matched multiple distinct inbox records");
      }

      // Invariant 2: Single Record Found - Verify Complete Identity & Authoritative Tenant
      if (inboxRes.rows.length === 1) {
        const row = inboxRes.rows[0];
        inboxId = row.id;

        // Verify Identity Integrity: all identifiers must match exactly
        if (
          row.idempotency_key !== idempotencyKey ||
          row.provider !== provider ||
          row.event_id !== eventId
        ) {
          throw new SecurityInvariantViolation("IDENTITY_CONFLICT: Webhook record identity mismatch");
        }

        // Invariant 2: Verify Authoritative Tenant Ownership (Fail-Closed)
        if (!row.tenant_id || row.tenant_id.trim() === '') {
          throw new SecurityInvariantViolation(
            "LEGACY_UNBOUND_TENANT_RECORD: Cannot process financial mutation on unverified tenant row"
          );
        }
        if (row.tenant_id !== tenantId) {
          throw new SecurityInvariantViolation("CROSS_TENANT_IDEMPOTENCY_MISMATCH");
        }

        if (row.status === 'PROCESSED') {
          // Replay webhook cannot alter provider, event_id, tenant_id, or original transaction
          await this.client.query(
            `UPDATE ${this.targetSchema}.workforce_webhook_inbox SET retry_count = retry_count + 1 WHERE id = $1`,
            [inboxId]
          );
          // Strict tenant-scoped balance query
          const balRes = await this.client.query(
            `SELECT balance_after FROM ${this.targetSchema}.tenant_pass_ledger WHERE tenant_id = $1 ORDER BY created_at DESC, balance_after DESC LIMIT 1`,
            [tenantId]
          );
          const currentBal = balRes.rows.length > 0 ? Number(balRes.rows[0].balance_after) : 0;
          await this.client.query('COMMIT');
          return {
            isDuplicate: true,
            inboxId,
            balanceAfter: currentBal,
            status: 'DUPLICATE_ACKNOWLEDGED',
          };
        } else {
          // Transition status to PROCESSING
          await this.client.query(
            `UPDATE ${this.targetSchema}.workforce_webhook_inbox SET status = 'PROCESSING' WHERE id = $1`,
            [inboxId]
          );
        }
      } else {
        // Invariant 3: Initial ingestion with Authoritative tenant_id column
        const payloadToStore = typeof rawPayload === 'object' && rawPayload !== null
          ? { ...rawPayload, tenant_id: tenantId }
          : { payload: rawPayload, tenant_id: tenantId };

        const insertInboxRes = await this.client.query(
          `INSERT INTO ${this.targetSchema}.workforce_webhook_inbox (
            provider, event_id, idempotency_key, event_type, tenant_id, raw_payload, headers, status, retry_count, received_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSING', 0, NOW())
          RETURNING id`,
          [
            provider,
            eventId,
            idempotencyKey,
            eventType,
            tenantId,
            JSON.stringify(payloadToStore),
            JSON.stringify(headers),
          ]
        );
        inboxId = insertInboxRes.rows[0].id;
      }

      // 3. Fail-closed Payment Reference Validation
      const paymentRef = extractPaymentReference(rawPayload);
      if (!paymentRef || paymentRef.trim() === '') {
        throw new SecurityInvariantViolation(
          "UNVERIFIED_PAYMENT_TENANT_MAPPING: UNKNOWN_PAYMENT_REFERENCE - Missing payment transaction reference for settlement"
        );
      }

      // Explicit unverified flag defense
      if (
        rawPayload?.unverified === true ||
        rawPayload?.verified === false ||
        rawPayload?.is_unverified === true ||
        rawPayload?.unregistered === true ||
        rawPayload?.status === 'UNVERIFIED'
      ) {
        throw new SecurityInvariantViolation(
          "UNVERIFIED_PAYMENT_TENANT_MAPPING: Transaction reference does not match authoritative tenant mapping"
        );
      }

      // Tenant reference check in payload (if specified, must match parameter tenantId)
      const payloadTenant = extractPayloadTenant(rawPayload);
      if (payloadTenant && payloadTenant !== tenantId) {
        throw new SecurityInvariantViolation(
          "UNVERIFIED_PAYMENT_TENANT_MAPPING: CROSS_TENANT_COLLISION - Transaction reference does not match authoritative tenant mapping"
        );
      }

      // Mandatory explicit currency verification (fail-closed, zero USD defaulting)
      if (!rawPayload?.currency || typeof rawPayload.currency !== 'string' || !rawPayload.currency.trim()) {
        throw new SecurityInvariantViolation(
          'MISSING_REQUIRED_CURRENCY: Missing transaction currency in webhook payload'
        );
      }

      // 4. Route Settlement Exclusively through verifyAndSettleAuthoritativePayment (Single Path)
      const settlement = await verifyAndSettleAuthoritativePayment(
        this.client,
        {
          provider,
          provider_transaction_id: paymentRef,
          tenant_id: tenantId,
          currency: rawPayload.currency.trim(),
          amount: rawPayload?.amount !== undefined ? rawPayload.amount : 0,
          provider_account_id: rawPayload?.provider_account_id || rawPayload?.providerAccountId,
          delta_passes: deltaPasses,
          batch_id: batchId,
          idempotency_key: idempotencyKey,
          reason,
          metadata,
        },
        this.targetSchema,
        { inTransaction: true }
      );

      // 5. Update Webhook Inbox to PROCESSED
      await this.client.query(
        `UPDATE ${this.targetSchema}.workforce_webhook_inbox
         SET status = 'PROCESSED', processed_at = NOW()
         WHERE id = $1`,
        [inboxId]
      );

      await this.client.query('COMMIT');

      return {
        isDuplicate: false,
        inboxId,
        entryId: settlement.ledgerEntryId,
        balanceAfter: settlement.balanceAfter,
        status: 'PROCESSED',
      };
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }
}
