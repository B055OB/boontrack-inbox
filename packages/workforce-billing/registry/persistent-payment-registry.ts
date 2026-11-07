/**
 * packages/workforce-billing/registry/persistent-payment-registry.ts
 * BWM Persistent Transaction Registry & Authoritative Settlement Engine
 *
 * Directives (CTO Gate 1 Mandate):
 * 1. Zero in-memory Map fallback — all transaction lookups query PostgreSQL workforce_staging.workforce_payment_registry.
 * 2. Zero bypass flags — rawPayload.authoritative_verified is strictly purged.
 * 3. Pre-checkout order registration with (tenant_id, internal_order_id) uniqueness.
 * 4. Atomic transaction binding (INITIATED -> BOUND) with partial unique index on provider_transaction_id.
 * 5. Fail-closed settlement with atomic ledger mutation (BEGIN ... COMMIT with row-level locks).
 */

import { Client, PoolClient } from 'pg';
import { SecurityInvariantViolation } from '../ledger/postgres-tenant-pass-ledger';

export interface PreCheckoutOrderParams {
  tenant_id: string;
  internal_order_id: string;
  provider: string; // 'xendit' | 'dodo' | 'XENDIT' | 'DODO_PAYMENTS'
  currency: string; // 'IDR' | 'USD'
  expected_amount: number | bigint;
  provider_account_id?: string;
  metadata?: Record<string, any>;
}

export interface PreCheckoutOrderRecord {
  id: string;
  tenant_id: string;
  internal_order_id: string;
  provider: string;
  provider_account_id?: string | null;
  provider_transaction_id?: string | null;
  currency: string;
  expected_amount: string; // bigint as string from pg
  status: 'INITIATED' | 'BOUND' | 'SETTLED' | 'FAILED' | 'EXPIRED';
  authoritative_verified_at?: Date | null;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface BindProviderTransactionParams {
  tenant_id: string;
  internal_order_id: string;
  provider_transaction_id: string;
  provider_account_id?: string;
}

export interface AuthoritativePaymentWebhookPayload {
  provider: string;
  provider_transaction_id?: string | null;
  payment_reference?: string | null;
  tenant_id: string;
  currency?: string;
  amount: number | bigint | string;
  provider_account_id?: string;
  batch_id?: string;
  delta_passes?: number;
  reason?: 'PURCHASE' | 'ALLOCATION' | 'REVERSAL' | 'RENEWAL';
  idempotency_key?: string;
  metadata?: Record<string, any>;
}

export interface SettlePaymentOptions {
  inTransaction?: boolean;
}

export interface AuthoritativeSettlementResult {
  settled: boolean;
  orderId: string;
  internalOrderId: string;
  providerTransactionId: string;
  tenantId: string;
  status: 'SETTLED';
  ledgerEntryId: string;
  balanceAfter: number;
  settledAt: string;
}

/**
 * 1. registerOrderPreCheckout:
 * Registers internal order to persistent database before checkout invocation.
 */
export async function registerOrderPreCheckout(
  client: Client | PoolClient,
  params: PreCheckoutOrderParams,
  targetSchema: string = 'workforce_staging'
): Promise<PreCheckoutOrderRecord> {
  const { tenant_id, internal_order_id, provider, currency, expected_amount, provider_account_id, metadata = {} } = params;

  if (!tenant_id || tenant_id.trim() === '') {
    throw new SecurityInvariantViolation('TENANT_ID_REQUIRED: Missing authoritative tenant identifier');
  }
  if (!internal_order_id || internal_order_id.trim() === '') {
    throw new SecurityInvariantViolation('INTERNAL_ORDER_ID_REQUIRED: Missing internal order identifier');
  }
  if (!provider || provider.trim() === '') {
    throw new SecurityInvariantViolation('PROVIDER_REQUIRED: Missing payment provider');
  }
  if (!currency || currency.trim() === '') {
    throw new SecurityInvariantViolation('CURRENCY_REQUIRED: Missing transaction currency');
  }
  const amountBigInt = BigInt(expected_amount);
  if (amountBigInt < BigInt(0)) {
    throw new SecurityInvariantViolation('INVALID_AMOUNT: Expected amount cannot be negative');
  }

  const query = `
    INSERT INTO ${targetSchema}.workforce_payment_registry (
      tenant_id, internal_order_id, provider, provider_account_id, currency, expected_amount, status, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'INITIATED', $7, NOW(), NOW())
    RETURNING id, tenant_id, internal_order_id, provider, provider_account_id, provider_transaction_id, currency, expected_amount, status, authoritative_verified_at, metadata, created_at, updated_at
  `;

  const res = await client.query(query, [
    tenant_id.trim(),
    internal_order_id.trim(),
    provider.trim(),
    provider_account_id ? provider_account_id.trim() : null,
    currency.trim().toUpperCase(),
    amountBigInt.toString(),
    JSON.stringify(metadata),
  ]);

  return res.rows[0];
}

/**
 * 2. bindProviderTransaction:
 * Updates provider_transaction_id and transitions status to 'BOUND' atomically.
 */
export async function bindProviderTransaction(
  client: Client | PoolClient,
  params: BindProviderTransactionParams,
  targetSchema: string = 'workforce_staging'
): Promise<PreCheckoutOrderRecord> {
  const { tenant_id, internal_order_id, provider_transaction_id, provider_account_id } = params;

  if (!tenant_id || tenant_id.trim() === '') {
    throw new SecurityInvariantViolation('TENANT_ID_REQUIRED: Missing authoritative tenant identifier');
  }
  if (!internal_order_id || internal_order_id.trim() === '') {
    throw new SecurityInvariantViolation('INTERNAL_ORDER_ID_REQUIRED: Missing internal order identifier');
  }
  if (!provider_transaction_id || provider_transaction_id.trim() === '') {
    throw new SecurityInvariantViolation('PROVIDER_TRANSACTION_ID_REQUIRED: Missing provider transaction identifier');
  }

  const query = `
    UPDATE ${targetSchema}.workforce_payment_registry
    SET provider_transaction_id = $1,
        provider_account_id = COALESCE($2, provider_account_id),
        status = 'BOUND',
        updated_at = NOW()
    WHERE tenant_id = $3 AND internal_order_id = $4 AND status = 'INITIATED'
    RETURNING id, tenant_id, internal_order_id, provider, provider_account_id, provider_transaction_id, currency, expected_amount, status, authoritative_verified_at, metadata, created_at, updated_at
  `;

  const res = await client.query(query, [
    provider_transaction_id.trim(),
    provider_account_id ? provider_account_id.trim() : null,
    tenant_id.trim(),
    internal_order_id.trim(),
  ]);

  if (res.rows.length === 0) {
    const checkRes = await client.query(
      `SELECT status FROM ${targetSchema}.workforce_payment_registry WHERE tenant_id = $1 AND internal_order_id = $2`,
      [tenant_id.trim(), internal_order_id.trim()]
    );
    if (checkRes.rows.length === 0) {
      throw new SecurityInvariantViolation(`ORDER_NOT_FOUND: Order ${internal_order_id} not found for tenant ${tenant_id}`);
    } else {
      throw new SecurityInvariantViolation(`INVALID_ORDER_STATUS: Order ${internal_order_id} is in status ${checkRes.rows[0].status}, cannot bind`);
    }
  }

  return res.rows[0];
}

/**
 * 3. verifyAndSettleAuthoritativePayment:
 * Searches order by provider_transaction_id on persistent table.
 * Enforces strict fail-closed validations:
 * - Empty / unknown payment reference -> UNKNOWN_PAYMENT_REFERENCE
 * - Cross-tenant attempt -> CROSS_TENANT_COLLISION
 * - Nominal / currency mismatch -> AMOUNT_OR_CURRENCY_MISMATCH
 * - Provider / account mismatch -> PROVIDER_OR_ACCOUNT_MISMATCH
 * - Already SETTLED -> DUPLICATE_WEBHOOK_IDEMPOTENCY
 * Atomically updates status to 'SETTLED' and mutates tenant pass ledger.
 */
export async function verifyAndSettleAuthoritativePayment(
  client: Client | PoolClient,
  webhookPayload: AuthoritativePaymentWebhookPayload,
  targetSchema: string = 'workforce_staging',
  options?: SettlePaymentOptions
): Promise<AuthoritativeSettlementResult> {
  const paymentRef = (webhookPayload.provider_transaction_id || webhookPayload.payment_reference || '').trim();

  // Rule 1: Empty payment reference rejection
  if (!paymentRef) {
    throw new SecurityInvariantViolation('UNKNOWN_PAYMENT_REFERENCE: Empty or missing payment transaction reference');
  }

  if (!webhookPayload.tenant_id || webhookPayload.tenant_id.trim() === '') {
    throw new SecurityInvariantViolation('TENANT_ID_REQUIRED: Missing authoritative tenant identifier');
  }

  // Rule 1b: Explicit positive integer passes validation
  const deltaPasses = webhookPayload.delta_passes !== undefined ? webhookPayload.delta_passes : 10;
  if (!Number.isInteger(deltaPasses) || deltaPasses <= 0) {
    throw new SecurityInvariantViolation(
      `INVALID_PASS_QUANTITY: delta_passes must be a positive integer greater than 0, received ${deltaPasses}`
    );
  }

  const manageTx = !options?.inTransaction;

  if (manageTx) {
    await client.query('BEGIN');
  }

  try {
    // 1. Transactional Row-Level Lock on order row in persistent registry
    const orderRes = await client.query(
      `SELECT id, tenant_id, internal_order_id, provider, provider_account_id, provider_transaction_id, currency, expected_amount, status, metadata
       FROM ${targetSchema}.workforce_payment_registry
       WHERE provider_transaction_id = $1
       FOR UPDATE`,
      [paymentRef]
    );

    // Rule 2: Unknown payment reference rejection (fail-closed)
    if (orderRes.rows.length === 0) {
      throw new SecurityInvariantViolation(
        `UNVERIFIED_PAYMENT_TENANT_MAPPING: UNKNOWN_PAYMENT_REFERENCE - Payment reference ${paymentRef} is not registered in authoritative persistent registry`
      );
    }

    const order = orderRes.rows[0];

    // Rule 3: Already settled check (duplicate webhook idempotency)
    if (order.status === 'SETTLED') {
      throw new SecurityInvariantViolation(
        `IDEMPOTENCY_REPLAY_SETTLED: DUPLICATE_WEBHOOK_IDEMPOTENCY - Payment transaction ${paymentRef} has already been settled`
      );
    }

    // Rule 3b: Explicit BOUND status requirement (fail-closed on INITIATED, FAILED, EXPIRED, etc.)
    if (order.status !== 'BOUND') {
      throw new SecurityInvariantViolation(
        `INVALID_PAYMENT_STATUS_NOT_BOUND: Order status is ${order.status}, must be in BOUND status to settle`
      );
    }

    // Rule 4: Cross-tenant collision rejection
    if (order.tenant_id !== webhookPayload.tenant_id.trim()) {
      throw new SecurityInvariantViolation(
        `UNVERIFIED_PAYMENT_TENANT_MAPPING: CROSS_TENANT_COLLISION - Payment reference ${paymentRef} belongs to tenant ${order.tenant_id}, attempted claim by tenant ${webhookPayload.tenant_id}`
      );
    }

    // Rule 5: Provider / account mismatch rejection
    const normalizeProvider = (p: string) => p.toLowerCase().replace(/_payments$/, '');
    if (normalizeProvider(order.provider) !== normalizeProvider(webhookPayload.provider)) {
      throw new SecurityInvariantViolation(
        `PROVIDER_OR_ACCOUNT_MISMATCH: Order provider ${order.provider} does not match webhook provider ${webhookPayload.provider}`
      );
    }
    if (order.provider_account_id && order.provider_account_id.trim() !== '') {
      if (!webhookPayload.provider_account_id || webhookPayload.provider_account_id.trim() === '') {
        throw new SecurityInvariantViolation(
          `MISSING_REQUIRED_PROVIDER_ACCOUNT: Provider account ID is required for registered order ${order.internal_order_id} but missing from webhook`
        );
      }
      if (order.provider_account_id.trim() !== webhookPayload.provider_account_id.trim()) {
        throw new SecurityInvariantViolation(
          `PROVIDER_OR_ACCOUNT_MISMATCH: Order provider account ${order.provider_account_id} does not match webhook provider account ${webhookPayload.provider_account_id}`
        );
      }
    }

    // Rule 6: Currency mismatch rejection
    if (webhookPayload.currency && order.currency.toUpperCase() !== webhookPayload.currency.trim().toUpperCase()) {
      throw new SecurityInvariantViolation(
        `AMOUNT_OR_CURRENCY_MISMATCH: Order currency ${order.currency} does not match webhook currency ${webhookPayload.currency}`
      );
    }

    // Rule 7: Amount mismatch rejection
    const expected = BigInt(order.expected_amount);
    const paid = BigInt(webhookPayload.amount);
    if (paid !== expected) {
      throw new SecurityInvariantViolation(
        `AMOUNT_OR_CURRENCY_MISMATCH: Expected amount ${expected} does not match paid amount ${paid}`
      );
    }

    // Rule 8: All security invariants satisfied -> Execute Atomic Settlement & Ledger Mutation
    // A. Transactional advisory lock on tenant for cold-start balance serialization
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [order.tenant_id]);

    // B. Row-level lock on current tenant balance in tenant_pass_ledger
    const lockBal = await client.query(
      `SELECT balance_after
       FROM ${targetSchema}.tenant_pass_ledger
       WHERE tenant_id = $1
       ORDER BY created_at DESC, balance_after DESC
       LIMIT 1
       FOR UPDATE`,
      [order.tenant_id]
    );

    const currentBalance = lockBal.rows.length > 0 ? Number(lockBal.rows[0].balance_after) : 0;
    const newBalance = currentBalance + deltaPasses;
    const entryId = `ple_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const batchId = webhookPayload.batch_id || `BATCH_${order.internal_order_id}`;
    const idempotencyKey = webhookPayload.idempotency_key || `settle_${paymentRef}_${Date.now()}`;
    const reason = webhookPayload.reason || 'PURCHASE';

    // C. Insert into tenant_pass_ledger
    await client.query(
      `INSERT INTO ${targetSchema}.tenant_pass_ledger (
        entry_id, tenant_id, batch_id, delta_passes, balance_after, reason, idempotency_key, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`,
      [
        entryId,
        order.tenant_id,
        batchId,
        deltaPasses,
        newBalance,
        reason,
        idempotencyKey,
        JSON.stringify(webhookPayload.metadata || {}),
      ]
    );

    // D. Update payment registry status to SETTLED
    const settleRes = await client.query(
      `UPDATE ${targetSchema}.workforce_payment_registry
       SET status = 'SETTLED',
           authoritative_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING authoritative_verified_at`,
      [order.id]
    );

    if (manageTx) {
      await client.query('COMMIT');
    }

    return {
      settled: true,
      orderId: order.id,
      internalOrderId: order.internal_order_id,
      providerTransactionId: paymentRef,
      tenantId: order.tenant_id,
      status: 'SETTLED',
      ledgerEntryId: entryId,
      balanceAfter: newBalance,
      settledAt: settleRes.rows[0].authoritative_verified_at.toISOString(),
    };
  } catch (err) {
    if (manageTx) {
      await client.query('ROLLBACK');
    }
    throw err;
  }
}
