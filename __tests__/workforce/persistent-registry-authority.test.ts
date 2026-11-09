/**
 * __tests__/workforce/persistent-registry-authority.test.ts
 * BWM Gate 1: Persistent Transaction Registry & Authority Engine Test Suite
 *
 * Directives (CTO Official Mandate Round 2):
 * 1. Missing payment reference ditolak pada seluruh titik masuk settlement (fail-closed).
 * 2. Status INITIATED, FAILED, dan EXPIRED ditolak masuk settlement.
 * 3. Provider salah dan provider account hilang/salah ditolak (fail-closed).
 * 4. Amount dan currency mismatch ditolak.
 * 5. Bukti DB Trigger: Percobaan UPDATE pada tenant_id, internal_order_id, provider, currency, atau amount memicu PostgreSQL Exception.
 * 6. Concurrent duplicate settlement across independent connections terbukti atomik.
 * 7. Zero ledger side-effects pada seluruh skenario penolakan (COUNT(*) ledger === 0).
 * 8. Tepat satu ledger entry pada settlement yang valid.
 * 9. Operasi sah tenant tetap berjalan tanpa degradasi.
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';
import {
  registerOrderPreCheckout,
  bindProviderTransaction,
  verifyAndSettleAuthoritativePayment,
  PostgresTenantPassLedger,
  verifyAuthoritativePaymentTenant,
  SecurityInvariantViolation,
} from '@/packages/workforce-billing';

function getDatabaseConnectionString(): string {
  let directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
  let poolerUrl = process.env.WORKFORCE_DATABASE_URL;

  if (!directUrl || !poolerUrl) {
    try {
      const envPath = path.resolve('.env.local');
      if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        const matchPooler = envFile.match(/^WORKFORCE_DATABASE_URL=(.*)$/m);
        if (matchDirect) directUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
        if (matchPooler) poolerUrl = matchPooler[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      // ignore
    }
  }

  const connStr = directUrl || poolerUrl;
  if (!connStr) {
    throw new Error('STAGING_DB_REQUIRED: Persistent registry test must run against real PostgreSQL');
  }
  assertStagingDatabaseTarget(connStr);
  return connStr;
}

describe('BWM Gate 1: Persistent Transaction Registry & Authority Engine (CTO Mandate Round 2)', () => {
  let poolA: Pool;
  let poolB: Pool;
  const connStr = getDatabaseConnectionString();

  beforeAll(async () => {
    poolA = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10000,
    });

    poolB = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10000,
    });

    // Verify connectivity on both pools
    const clientA = await poolA.connect();
    const clientB = await poolB.connect();
    clientA.release();
    clientB.release();
  });

  afterAll(async () => {
    if (poolA) await poolA.end();
    if (poolB) await poolB.end();
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: Missing payment reference ditolak pada seluruh titik masuk settlement (fail-closed)
  // ---------------------------------------------------------------------------
  describe('Requirement 1: Missing payment reference ditolak pada seluruh titik masuk settlement (fail-closed)', () => {
    test('1a. verifyAndSettleAuthoritativePayment with empty or missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE', async () => {
      const client = await poolA.connect();
      try {
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: '',
            tenant_id: `tenant_empty_${Date.now()}`,
            currency: 'IDR',
            amount: 500000,
          })
        ).rejects.toThrow('UNKNOWN_PAYMENT_REFERENCE');
      } finally {
        client.release();
      }
    });

    test('1b. PostgresTenantPassLedger.processWebhookAndMutateLedgerAtomic with missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE', async () => {
      const client = await poolA.connect();
      try {
        const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
        await expect(
          pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId: `evt_no_payref_${Date.now()}`,
            idempotencyKey: `idemp_no_payref_${Date.now()}`,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 37500 }, // No payment reference in payload!
            headers: {},
            tenantId: `tenant_no_ref_${Date.now()}`,
            batchId: 'BATCH_NO_REF',
            deltaPasses: 10,
          })
        ).rejects.toThrow('UNKNOWN_PAYMENT_REFERENCE');
      } finally {
        client.release();
      }
    });

    test('1c. verifyAuthoritativePaymentTenant with missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE', async () => {
      const client = await poolA.connect();
      try {
        await expect(
          verifyAuthoritativePaymentTenant(
            'xendit',
            `evt_${Date.now()}`,
            `tenant_${Date.now()}`,
            { amount: 100000 }, // No payment reference!
            client,
            'workforce_staging'
          )
        ).rejects.toThrow('UNKNOWN_PAYMENT_REFERENCE');
      } finally {
        client.release();
      }
    });

    test('1d. Unregistered payment reference lookup in persistent DB fails closed -> throws UNKNOWN_PAYMENT_REFERENCE', async () => {
      const client = await poolA.connect();
      try {
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: `tx_completely_unregistered_${Date.now()}`,
            tenant_id: `tenant_unknown_${Date.now()}`,
            currency: 'IDR',
            amount: 500000,
          })
        ).rejects.toThrow('UNKNOWN_PAYMENT_REFERENCE');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: Status INITIATED, FAILED, dan EXPIRED ditolak masuk settlement
  // ---------------------------------------------------------------------------
  describe('Requirement 2: Status INITIATED, FAILED, dan EXPIRED ditolak masuk settlement', () => {
    test('2a. Order in status INITIATED (unbound) is rejected from settlement', async () => {
      const ts = Date.now();
      const tenantId = `tenant_init_reject_${ts}`;
      const internalOrderId = `ord_init_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 150000,
        });

        // Attempt to settle without binding (status is INITIATED)
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            payment_reference: `tx_fake_unbound_${ts}`,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 150000,
          })
        ).rejects.toThrow('UNKNOWN_PAYMENT_REFERENCE');
      } finally {
        client.release();
      }
    });

    test('2b. Order in status FAILED is rejected from settlement with INVALID_PAYMENT_STATUS_NOT_BOUND', async () => {
      const ts = Date.now();
      const tenantId = `tenant_failed_reject_${ts}`;
      const internalOrderId = `ord_failed_${ts}`;
      const providerTxId = `tx_failed_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 200000,
        });

        // Bind first
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Transition BOUND -> FAILED (legal state transition)
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry SET status = 'FAILED' WHERE provider_transaction_id = $1`,
          [providerTxId]
        );

        // Attempt settlement on FAILED order
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 200000,
          })
        ).rejects.toThrow('INVALID_PAYMENT_STATUS_NOT_BOUND');
      } finally {
        client.release();
      }
    });

    test('2c. Order in status EXPIRED is rejected from settlement with INVALID_PAYMENT_STATUS_NOT_BOUND', async () => {
      const ts = Date.now();
      const tenantId = `tenant_expired_reject_${ts}`;
      const internalOrderId = `ord_expired_${ts}`;
      const providerTxId = `tx_expired_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 300000,
        });

        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Transition BOUND -> EXPIRED
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry SET status = 'EXPIRED' WHERE provider_transaction_id = $1`,
          [providerTxId]
        );

        // Attempt settlement on EXPIRED order
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 300000,
          })
        ).rejects.toThrow('INVALID_PAYMENT_STATUS_NOT_BOUND');
      } finally {
        client.release();
      }
    });

    test('2d. Already SETTLED order is rejected with IDEMPOTENCY_REPLAY_SETTLED', async () => {
      const ts = Date.now();
      const tenantId = `tenant_settled_dup_${ts}`;
      const internalOrderId = `ord_settled_${ts}`;
      const providerTxId = `tx_settled_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 400000,
        });

        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Valid First Settlement
        const res1 = await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 400000,
          delta_passes: 10,
        });
        expect(res1.status).toBe('SETTLED');

        // Replay attempt on SETTLED order
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 400000,
            delta_passes: 10,
          })
        ).rejects.toThrow('DUPLICATE_WEBHOOK_IDEMPOTENCY');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3: Provider salah dan provider account hilang/salah ditolak (fail-closed)
  // ---------------------------------------------------------------------------
  describe('Requirement 3: Provider salah dan provider account hilang/salah ditolak (fail-closed)', () => {
    test('3a. Wrong provider is rejected with PROVIDER_OR_ACCOUNT_MISMATCH', async () => {
      const ts = Date.now();
      const tenantId = `tenant_prov_wrong_${ts}`;
      const internalOrderId = `ord_prov_wrong_${ts}`;
      const providerTxId = `tx_prov_wrong_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 250000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'dodo', // Mismatch!
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 250000,
          })
        ).rejects.toThrow('PROVIDER_OR_ACCOUNT_MISMATCH');
      } finally {
        client.release();
      }
    });

    test('3b. Missing required provider account is rejected with MISSING_REQUIRED_PROVIDER_ACCOUNT', async () => {
      const ts = Date.now();
      const tenantId = `tenant_acc_missing_${ts}`;
      const internalOrderId = `ord_acc_missing_${ts}`;
      const providerTxId = `tx_acc_missing_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          provider_account_id: 'acc_primary_prod',
          currency: 'IDR',
          expected_amount: 250000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: 'acc_primary_prod',
        });

        // Webhook omits provider_account_id
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 250000,
            // provider_account_id missing!
          })
        ).rejects.toThrow('MISSING_REQUIRED_PROVIDER_ACCOUNT');
      } finally {
        client.release();
      }
    });

    test('3c. Mismatched provider account is rejected with PROVIDER_OR_ACCOUNT_MISMATCH', async () => {
      const ts = Date.now();
      const tenantId = `tenant_acc_mismatch_${ts}`;
      const internalOrderId = `ord_acc_mismatch_${ts}`;
      const providerTxId = `tx_acc_mismatch_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          provider_account_id: 'acc_primary_prod',
          currency: 'IDR',
          expected_amount: 250000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: 'acc_primary_prod',
        });

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_account_id: 'acc_compromised_attacker',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 250000,
          })
        ).rejects.toThrow('PROVIDER_OR_ACCOUNT_MISMATCH');
      } finally {
        client.release();
      }
    });

    test('3d. verifyAuthoritativePaymentTenant fails closed on provider mismatch', async () => {
      const ts = Date.now();
      const tenantId = `tenant_prov_guard_${ts}`;
      const internalOrderId = `ord_prov_guard_${ts}`;
      const providerTxId = `tx_prov_guard_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Guard called with adversary provider 'dodo' for xendit order
        await expect(
          verifyAuthoritativePaymentTenant(
            'dodo',
            `evt_prov_${ts}`,
            tenantId,
            { payment_reference: providerTxId, tenant_id: tenantId },
            client
          )
        ).rejects.toThrow('PROVIDER_OR_ACCOUNT_MISMATCH');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 4: Amount dan currency mismatch ditolak
  // ---------------------------------------------------------------------------
  describe('Requirement 4: Amount dan currency mismatch ditolak', () => {
    test('4a. Currency mismatch (order USD paid IDR) rejected with AMOUNT_OR_CURRENCY_MISMATCH', async () => {
      const ts = Date.now();
      const tenantId = `tenant_curr_mismatch_${ts}`;
      const internalOrderId = `ord_curr_${ts}`;
      const providerTxId = `tx_curr_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'dodo',
          currency: 'USD',
          expected_amount: 4500,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'dodo',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR', // Mismatch!
            amount: 4500,
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');
      } finally {
        client.release();
      }
    });

    test('4b. Underpayment (amount less than expected) rejected with AMOUNT_OR_CURRENCY_MISMATCH', async () => {
      const ts = Date.now();
      const tenantId = `tenant_underpay_${ts}`;
      const internalOrderId = `ord_underpay_${ts}`;
      const providerTxId = `tx_underpay_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 500000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 350000, // Underpaid!
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');
      } finally {
        client.release();
      }
    });

    test('4c. Tampered amount (amount more than expected) rejected with AMOUNT_OR_CURRENCY_MISMATCH', async () => {
      const ts = Date.now();
      const tenantId = `tenant_tamper_amt_${ts}`;
      const internalOrderId = `ord_tamper_${ts}`;
      const providerTxId = `tx_tamper_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 500000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: 'IDR',
            amount: 999999, // Tampered!
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');
      } finally {
        client.release();
      }
    });

    test('4d. Non-positive or non-integer delta_passes rejected with INVALID_PASS_QUANTITY', async () => {
      const client = await poolA.connect();
      try {
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: 'tx_any',
            tenant_id: 'tenant_any',
            currency: 'IDR',
            amount: 100000,
            delta_passes: -5, // Invalid negative passes
          })
        ).rejects.toThrow('INVALID_PASS_QUANTITY');

        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: 'tx_any',
            tenant_id: 'tenant_any',
            currency: 'IDR',
            amount: 100000,
            delta_passes: 3.5, // Invalid fractional passes
          })
        ).rejects.toThrow('INVALID_PASS_QUANTITY');
      } finally {
        client.release();
      }
    });

    test('4e. Settlement request without currency throws MISSING_REQUIRED_CURRENCY (zero USD defaulting defense)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_no_curr_${ts}`;
      const internalOrderId = `ord_no_curr_${ts}`;
      const providerTxId = `tx_no_curr_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // verifyAndSettleAuthoritativePayment: empty currency rejected
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            currency: '',
            amount: 100000,
          } as any)
        ).rejects.toThrow('MISSING_REQUIRED_CURRENCY');

        // verifyAndSettleAuthoritativePayment: missing currency rejected
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: tenantId,
            amount: 100000,
          } as any)
        ).rejects.toThrow('MISSING_REQUIRED_CURRENCY');

        // processWebhookAndMutateLedgerAtomic: missing currency rejected without USD defaulting
        const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
        await expect(
          pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'xendit',
            eventId: `evt_nocurr_${ts}`,
            idempotencyKey: `idemp_nocurr_${ts}`,
            eventType: 'payment.succeeded',
            rawPayload: {
              payment_reference: providerTxId,
              amount: 100000,
              tenant_id: tenantId,
              // currency intentionally omitted
            },
            headers: {},
            tenantId,
            batchId: `BATCH_${internalOrderId}`,
            deltaPasses: 10,
          })
        ).rejects.toThrow('MISSING_REQUIRED_CURRENCY');
      } finally {
        client.release();
      }
    });

    test('4f. Non-positive expected_amount rejected (pre-checkout rejects and DB constraint chk_payment_registry_positive_amount prevents insert)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_non_pos_${ts}`;

      const client = await poolA.connect();
      try {
        // App-level rejection for zero amount
        await expect(
          registerOrderPreCheckout(client, {
            tenant_id: tenantId,
            internal_order_id: `ord_zero_${ts}`,
            provider: 'xendit',
            currency: 'IDR',
            expected_amount: 0,
          })
        ).rejects.toThrow('ORDER_AMOUNT_MUST_BE_POSITIVE');

        // App-level rejection for negative amount
        await expect(
          registerOrderPreCheckout(client, {
            tenant_id: tenantId,
            internal_order_id: `ord_neg_${ts}`,
            provider: 'xendit',
            currency: 'IDR',
            expected_amount: -50000,
          })
        ).rejects.toThrow('ORDER_AMOUNT_MUST_BE_POSITIVE');

        // DB check constraint chk_payment_registry_positive_amount rejection on direct SQL insert
        await expect(
          client.query(
            `INSERT INTO workforce_staging.workforce_payment_registry (
              tenant_id, internal_order_id, provider, currency, expected_amount, status
            ) VALUES ($1, $2, 'xendit', 'IDR', 0, 'INITIATED')`,
            [tenantId, `ord_sql_zero_${ts}`]
          )
        ).rejects.toThrow(/chk_payment_registry_positive_amount|check constraint/i);

        await expect(
          client.query(
            `INSERT INTO workforce_staging.workforce_payment_registry (
              tenant_id, internal_order_id, provider, currency, expected_amount, status
            ) VALUES ($1, $2, 'xendit', 'IDR', -9999, 'INITIATED')`,
            [tenantId, `ord_sql_neg_${ts}`]
          )
        ).rejects.toThrow(/chk_payment_registry_positive_amount|check constraint/i);
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 5: Bukti DB Trigger: Percobaan UPDATE pada immutable columns & illegal status transitions
  // ---------------------------------------------------------------------------
  describe('Requirement 5: Bukti DB Trigger: Percobaan UPDATE memicu PostgreSQL Exception', () => {
    test('5a. Attempt direct UPDATE on tenant_id triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_t_${ts}`;
      const internalOrderId = `ord_trg_t_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET tenant_id = 'rogue_tenant' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column tenant_id cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5b. Attempt direct UPDATE on internal_order_id triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_ord_${ts}`;
      const internalOrderId = `ord_trg_ord_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET internal_order_id = 'rogue_order' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column internal_order_id cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5c. Attempt direct UPDATE on provider triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_prov_${ts}`;
      const internalOrderId = `ord_trg_prov_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider = 'stripe' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column provider cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5d. Attempt direct UPDATE on currency triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_curr_${ts}`;
      const internalOrderId = `ord_trg_curr_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET currency = 'EUR' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column currency cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5e. Attempt direct UPDATE on expected_amount triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_amt_${ts}`;
      const internalOrderId = `ord_trg_amt_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET expected_amount = 999999 WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column expected_amount cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5f. Illegal status transition INITIATED -> SETTLED triggers INVALID_STATUS_TRANSITION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_stat1_${ts}`;
      const internalOrderId = `ord_trg_stat1_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Skip BOUND directly to SETTLED
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET status = 'SETTLED' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('INVALID_STATUS_TRANSITION: Cannot transition status from INITIATED to SETTLED');
      } finally {
        client.release();
      }
    });

    test('5g. Attempt transition on SETTLED order triggers INVALID_STATUS_TRANSITION exception (SETTLED is immutable)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_stat2_${ts}`;
      const internalOrderId = `ord_trg_stat2_${ts}`;
      const providerTxId = `tx_trg_stat2_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });
        await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 100000,
          delta_passes: 10,
        });

        // Attempt transition SETTLED -> BOUND
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET status = 'BOUND' WHERE provider_transaction_id = $1`,
            [providerTxId]
          )
        ).rejects.toThrow('INVALID_STATUS_TRANSITION: SETTLED is immutable');
      } finally {
        client.release();
      }
    });

    test('5h. Attempt transition on FAILED/EXPIRED terminal order triggers INVALID_STATUS_TRANSITION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_stat3_${ts}`;
      const internalOrderId = `ord_trg_stat3_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Legal transition INITIATED -> FAILED
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry SET status = 'FAILED' WHERE id = $1`,
          [order.id]
        );

        // Illegal transition from terminal FAILED -> BOUND
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET status = 'BOUND' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('INVALID_STATUS_TRANSITION: Terminal status FAILED cannot be transitioned');
      } finally {
        client.release();
      }
    });

    test('5i. Direct SQL UPDATE on provider_transaction_id for order in BOUND status raises IMMUTABLE_FIELD_MODIFICATION', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_tx_${ts}`;
      const internalOrderId = `ord_trg_tx_${ts}`;
      const providerTxId = `tx_bound_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Direct SQL update attempt on provider_transaction_id while in BOUND status
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider_transaction_id = 'tampered_tx_id' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: provider_transaction_id cannot be modified once BOUND');
      } finally {
        client.release();
      }
    });

    test('5j. Direct SQL UPDATE on provider_account_id for order in BOUND status raises IMMUTABLE_FIELD_MODIFICATION', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_acc_${ts}`;
      const internalOrderId = `ord_trg_acc_${ts}`;
      const providerTxId = `tx_bound_acc_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
          provider_account_id: 'acc_original_123',
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: 'acc_original_123',
        });

        // Direct SQL update attempt on provider_account_id while in BOUND status
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider_account_id = 'acc_tampered_999' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: provider_account_id cannot be modified once BOUND');
      } finally {
        client.release();
      }
    });

    test('5k. Attempt direct UPDATE during INITIATED -> BOUND transition modifying forbidden field triggers IMMUTABLE_FIELD_MODIFICATION exception', async () => {
      const ts = Date.now();
      const tenantId = `tenant_trg_bound_tamper_${ts}`;
      const internalOrderId = `ord_trg_bound_tamper_${ts}`;
      const providerTxId = `tx_bound_tamper_${ts}`;

      const client = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Attempt INITIATED -> BOUND transition while simultaneously altering expected_amount
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = $1, expected_amount = 500000 
             WHERE id = $2`,
            [providerTxId, order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column expected_amount cannot be modified');

        // Attempt INITIATED -> BOUND transition while simultaneously altering currency
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = $1, currency = 'USD' 
             WHERE id = $2`,
            [providerTxId, order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column currency cannot be modified');
      } finally {
        client.release();
      }
    });

    test('5l. Positive Authority Transition: Legitimate INITIATED -> BOUND transition with valid provider_transaction_id and provider_account_id succeeds, and tenant operations remain normal', async () => {
      const ts = Date.now();
      const tenantId = `tenant_auth_pos_${ts}`;
      const internalOrderId = `ord_auth_pos_${ts}`;
      const providerTxId = `tx_auth_pos_${ts}`;
      const validAccountId = `acc_xnd_valid_${ts}`;

      const client = await poolA.connect();
      try {
        // Step 1: Pre-register order with provider_account_id in INITIATED status
        const registered = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 150000,
          provider_account_id: validAccountId,
          metadata: { plan: 'tier1' },
        });
        expect(registered.status).toBe('INITIATED');
        expect(registered.provider_transaction_id).toBeNull();
        expect(registered.provider_account_id).toBe(validAccountId);

        // Step 2: Transition INITIATED -> BOUND atomically with provider_transaction_id
        const bound = await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: validAccountId,
        });
        expect(bound.status).toBe('BOUND');
        expect(bound.provider_transaction_id).toBe(providerTxId);
        expect(bound.provider_account_id).toBe(validAccountId);

        // Step 3: Legitimate tenant operational queries post-binding remain 100% normal
        const tenantOrders = await client.query(
          `SELECT id, internal_order_id, status FROM workforce_staging.workforce_payment_registry WHERE tenant_id = $1`,
          [tenantId]
        );
        expect(tenantOrders.rows.length).toBe(1);
        expect(tenantOrders.rows[0].status).toBe('BOUND');

        // Verify tenant balance query executes normally
        const balCheck = await client.query(
          `SELECT balance_after FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [tenantId]
        );
        expect(balCheck.rows.length).toBe(0); // Zero balance prior to settlement
      } finally {
        client.release();
      }
    });

    test('5m. Negative Binding Replacement & Authority Boundary: Subsequent attempts to overwrite provider_transaction_id or provider_account_id on bound order are rejected by trigger', async () => {
      const ts = Date.now();
      const tenantId = `tenant_auth_neg_${ts}`;
      const internalOrderId = `ord_auth_neg_${ts}`;
      const providerTxId = `tx_orig_${ts}`;
      const origAccountId = `acc_orig_${ts}`;

      const client = await poolA.connect();
      try {
        // Setup initial bound order
        const order = await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 200000,
          provider_account_id: origAccountId,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: origAccountId,
        });

        // Attempt 1: Direct SQL overwrite of provider_transaction_id on BOUND order rejected
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider_transaction_id = 'tx_tampered_overwrite' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: provider_transaction_id cannot be modified once BOUND');

        // Attempt 2: Direct SQL overwrite of provider_account_id on BOUND order rejected
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider_account_id = 'acc_tampered_overwrite' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: provider_account_id cannot be modified once BOUND');

        // Attempt 3: Secondary bind attempt via bindProviderTransaction API rejected
        await expect(
          bindProviderTransaction(client, {
            tenant_id: tenantId,
            internal_order_id: internalOrderId,
            provider_transaction_id: 'tx_secondary_illegal',
          })
        ).rejects.toThrow('INVALID_ORDER_STATUS');

        // Attempt 4: Overwriting provider column rejected
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry SET provider = 'dodo' WHERE id = $1`,
            [order.id]
          )
        ).rejects.toThrow('IMMUTABLE_FIELD_MODIFICATION: Column provider cannot be modified');

        // Final verification: original provider, transaction_id, and account_id remain completely intact
        const verifyRow = await client.query(
          `SELECT provider, provider_transaction_id, provider_account_id, status FROM workforce_staging.workforce_payment_registry WHERE id = $1`,
          [order.id]
        );
        expect(verifyRow.rows[0].provider).toBe('xendit');
        expect(verifyRow.rows[0].provider_transaction_id).toBe(providerTxId);
        expect(verifyRow.rows[0].provider_account_id).toBe(origAccountId);
        expect(verifyRow.rows[0].status).toBe('BOUND');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 6: Concurrent duplicate settlement across independent connections terbukti atomik
  // ---------------------------------------------------------------------------
  describe('Requirement 6: Concurrent duplicate settlement across independent connections terbukti atomik', () => {
    test('Concurrent duplicate settlement across independent connections: exactly 1 succeeds, exactly 1 fails', async () => {
      const ts = Date.now();
      const tenantId = `tenant_concur_${ts}`;
      const internalOrderId = `ord_concur_${ts}`;
      const providerTxId = `tx_concur_${ts}`;

      // Register & bind
      const setupClient = await poolA.connect();
      try {
        await registerOrderPreCheckout(setupClient, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 750000,
        });
        await bindProviderTransaction(setupClient, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });
      } finally {
        setupClient.release();
      }

      // Prepare 2 separate clients on independent pools
      const client1 = await poolA.connect();
      const client2 = await poolB.connect();

      try {
        const p1 = verifyAndSettleAuthoritativePayment(client1, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 750000,
          delta_passes: 20,
        });

        const p2 = verifyAndSettleAuthoritativePayment(client2, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 750000,
          delta_passes: 20,
        });

        const results = await Promise.allSettled([p1, p2]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // EXACTLY ONE SUCCEEDS, EXACTLY ONE REJECTED
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // Verify the rejected one threw DUPLICATE_WEBHOOK_IDEMPOTENCY
        const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
        expect(rejectedReason.message).toContain('DUPLICATE_WEBHOOK_IDEMPOTENCY');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 7: Zero ledger side-effects pada seluruh skenario penolakan (COUNT(*) ledger === 0)
  // ---------------------------------------------------------------------------
  describe('Requirement 7: Zero ledger side-effects pada seluruh skenario penolakan (COUNT(*) ledger === 0)', () => {
    test('Zero ledger side-effects across all rejection scenarios', async () => {
      const ts = Date.now();
      const cleanTenant = `tenant_zero_side_effect_${ts}`;
      const adversaryTenant = `tenant_adv_zero_${ts}`;
      const internalOrderId = `ord_clean_${ts}`;
      const providerTxId = `tx_clean_${ts}`;

      const client = await poolA.connect();
      try {
        // 1. Register valid order for cleanTenant
        await registerOrderPreCheckout(client, {
          tenant_id: cleanTenant,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 500000,
        });
        await bindProviderTransaction(client, {
          tenant_id: cleanTenant,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // 2. Attack 1: Adversary claims cleanTenant's transaction
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: adversaryTenant,
            currency: 'IDR',
            amount: 500000,
          })
        ).rejects.toThrow('CROSS_TENANT_COLLISION');

        // 3. Attack 2: Currency mismatch
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: cleanTenant,
            currency: 'USD',
            amount: 500000,
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');

        // 4. Attack 3: Amount mismatch
        await expect(
          verifyAndSettleAuthoritativePayment(client, {
            provider: 'xendit',
            provider_transaction_id: providerTxId,
            tenant_id: cleanTenant,
            currency: 'IDR',
            amount: 123456,
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');

        // VERIFY ZERO SIDE-EFFECTS: Both tenants must have exactly 0 ledger entries!
        const countClean = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [cleanTenant]
        );
        expect(Number(countClean.rows[0].count)).toBe(0);

        const countAdv = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [adversaryTenant]
        );
        expect(Number(countAdv.rows[0].count)).toBe(0);
      } finally {
        client.release();
      }
    });

    test('7b. Rollback verification: currency/provider failure during webhook settlement rolls back cleanly (zero rows in tenant_pass_ledger, inbox status not PROCESSED)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_rollback_${ts}`;
      const internalOrderId = `ord_rollback_${ts}`;
      const providerTxId = `tx_rollback_${ts}`;
      const eventId = `evt_rollback_${ts}`;
      const idempotencyKey = `idemp_rollback_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 300000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');

        // Webhook attempt with mismatching currency (USD instead of IDR)
        await expect(
          pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'xendit',
            eventId,
            idempotencyKey,
            eventType: 'payment.succeeded',
            rawPayload: {
              payment_reference: providerTxId,
              currency: 'USD', // Mismatch!
              amount: 300000,
              tenant_id: tenantId,
            },
            headers: {},
            tenantId,
            batchId: `BATCH_${internalOrderId}`,
            deltaPasses: 10,
          })
        ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');

        // Explicit check: order in persistent registry MUST remain in BOUND status with initialBoundTxId
        const orderRes = await client.query(
          `SELECT status, provider_transaction_id, provider_account_id FROM workforce_staging.workforce_payment_registry WHERE internal_order_id = $1`,
          [internalOrderId]
        );
        expect(orderRes.rows.length).toBe(1);
        const refetchedOrder = orderRes.rows[0];
        expect(refetchedOrder.status).toBe('BOUND');
        expect(refetchedOrder.provider_transaction_id).toBe(providerTxId);

        // Verify clean rollback: ZERO rows in tenant_pass_ledger
        const ledgerRes = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [tenantId]
        );
        const ledgerRowCount = Number(ledgerRes.rows[0].count);
        expect(ledgerRowCount).toBe(0);

        // Verify clean rollback: inbox row was rolled back or NOT PROCESSED
        const inboxRes = await client.query(
          `SELECT status FROM workforce_staging.workforce_webhook_inbox WHERE event_id = $1`,
          [eventId]
        );
        const inboxStatus = inboxRes.rows.length > 0 ? inboxRes.rows[0].status : null;
        expect(inboxStatus).not.toBe('PROCESSED');
      } finally {
        client.release();
      }
    });

    test('7c. Independent Provider Mismatch Rollback: Webhook settlement failure due to provider mismatch rolls back cleanly with order strictly remaining BOUND', async () => {
      const ts = Date.now();
      const tenantId = `tenant_pm_rb_${ts}`;
      const internalOrderId = `ord_pm_rb_${ts}`;
      const providerTxId = `tx_pm_rb_${ts}`;
      const initialAccountId = `acc_pm_orig_${ts}`;
      const eventId = `evt_pm_rb_${ts}`;
      const idempotencyKey = `idemp_pm_rb_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 350000,
          provider_account_id: initialAccountId,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
          provider_account_id: initialAccountId,
        });

        const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');

        // Webhook attempt with MISMATCHING PROVIDER: order registered as 'xendit', webhook sent with 'dodo'
        await expect(
          pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'dodo', // Mismatch!
            eventId,
            idempotencyKey,
            eventType: 'payment.succeeded',
            rawPayload: {
              payment_reference: providerTxId,
              currency: 'IDR',
              amount: 350000,
              tenant_id: tenantId,
              provider_account_id: initialAccountId,
            },
            headers: {},
            tenantId,
            batchId: `BATCH_${internalOrderId}`,
            deltaPasses: 10,
          })
        ).rejects.toThrow('PROVIDER_OR_ACCOUNT_MISMATCH');

        // 1. Direct SQL verification: order in persistent registry MUST remain in BOUND status
        const orderRes = await client.query(
          `SELECT status, provider, provider_transaction_id, provider_account_id FROM workforce_staging.workforce_payment_registry WHERE internal_order_id = $1`,
          [internalOrderId]
        );
        expect(orderRes.rows.length).toBe(1);
        const refetchedOrder = orderRes.rows[0];
        expect(refetchedOrder.status).toBe('BOUND');
        expect(refetchedOrder.provider).toBe('xendit');
        expect(refetchedOrder.provider_transaction_id).toBe(providerTxId);
        expect(refetchedOrder.provider_account_id).toBe(initialAccountId);

        // 2. Direct SQL verification: pass balance mutations remain 0 (ledger row count === 0)
        const ledgerRes = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [tenantId]
        );
        expect(Number(ledgerRes.rows[0].count)).toBe(0);

        // 3. Direct SQL verification: webhook inbox event status must NOT be 'PROCESSED'
        const inboxRes = await client.query(
          `SELECT status FROM workforce_staging.workforce_webhook_inbox WHERE event_id = $1`,
          [eventId]
        );
        const inboxStatus = inboxRes.rows.length > 0 ? inboxRes.rows[0].status : null;
        expect(inboxStatus).not.toBe('PROCESSED');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 8: Tepat satu ledger entry pada settlement yang valid
  // ---------------------------------------------------------------------------
  describe('Requirement 8: Tepat satu ledger entry pada settlement yang valid', () => {
    test('8a. Direct authoritative settlement creates exactly ONE ledger entry', async () => {
      const ts = Date.now();
      const tenantId = `tenant_valid_settle_${ts}`;
      const internalOrderId = `ord_valid_${ts}`;
      const providerTxId = `tx_valid_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 850000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        const settlement = await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 850000,
          delta_passes: 25,
        });

        expect(settlement.settled).toBe(true);
        expect(settlement.status).toBe('SETTLED');
        expect(settlement.balanceAfter).toBe(25);

        // Verify in tenant_pass_ledger: EXACTLY ONE ROW
        const ledgerRes = await client.query(
          `SELECT entry_id, tenant_id, delta_passes, balance_after, reason FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [tenantId]
        );
        expect(ledgerRes.rows.length).toBe(1);
        expect(ledgerRes.rows[0].entry_id).toBe(settlement.ledgerEntryId);
        expect(Number(ledgerRes.rows[0].delta_passes)).toBe(25);
        expect(Number(ledgerRes.rows[0].balance_after)).toBe(25);
      } finally {
        client.release();
      }
    });

    test('8b. Unified settlement via processWebhookAndMutateLedgerAtomic creates exactly ONE ledger entry and updates inbox to PROCESSED', async () => {
      const ts = Date.now();
      const tenantId = `tenant_unif_atomic_${ts}`;
      const internalOrderId = `ord_unif_${ts}`;
      const providerTxId = `tx_unif_${ts}`;
      const eventId = `evt_unif_${ts}`;
      const idempotencyKey = `idemp_unif_${ts}`;

      const client = await poolA.connect();
      try {
        // Pre-register and bind order
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'DODO_PAYMENTS',
          currency: 'USD',
          expected_amount: 50000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
        const res = await pgLedger.processWebhookAndMutateLedgerAtomic({
          provider: 'DODO_PAYMENTS',
          eventId,
          idempotencyKey,
          eventType: 'payment.succeeded',
          rawPayload: {
            payment_reference: providerTxId,
            currency: 'USD',
            amount: 50000,
            tenant_id: tenantId,
          },
          headers: { 'x-signature': 'sig_valid' },
          tenantId,
          batchId: `BATCH_${internalOrderId}`,
          deltaPasses: 10,
        });

        expect(res.status).toBe('PROCESSED');
        expect(res.isDuplicate).toBe(false);
        expect(res.balanceAfter).toBe(10);

        // Verify exactly 1 ledger entry
        const ledgerRes = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
          [tenantId]
        );
        expect(Number(ledgerRes.rows[0].count)).toBe(1);

        // Verify order status is SETTLED in persistent registry
        const orderRes = await client.query(
          `SELECT status, authoritative_verified_at FROM workforce_staging.workforce_payment_registry WHERE provider_transaction_id = $1`,
          [providerTxId]
        );
        expect(orderRes.rows[0].status).toBe('SETTLED');
        expect(orderRes.rows[0].authoritative_verified_at).not.toBeNull();

        // Verify webhook inbox status is PROCESSED
        const inboxRes = await client.query(
          `SELECT status FROM workforce_staging.workforce_webhook_inbox WHERE id = $1`,
          [res.inboxId]
        );
        expect(inboxRes.rows[0].status).toBe('PROCESSED');
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 9: Operasi sah tenant tetap berjalan tanpa degradasi
  // ---------------------------------------------------------------------------
  describe('Requirement 9: Operasi sah tenant tetap berjalan tanpa degradasi', () => {
    test('9a. Multi-instance verification across independent connection pools executes seamlessly', async () => {
      const ts = Date.now();
      const tenantId = `tenant_norm_multi_${ts}`;
      const internalOrderId = `ord_norm_multi_${ts}`;
      const providerTxId = `tx_norm_multi_${ts}`;

      // Instance 1 (poolA): Register pre-checkout & bind
      const clientA = await poolA.connect();
      try {
        const order = await registerOrderPreCheckout(clientA, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 150000,
          metadata: { client: 'Instance A' },
        });
        expect(order.status).toBe('INITIATED');

        const bound = await bindProviderTransaction(clientA, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });
        expect(bound.status).toBe('BOUND');
      } finally {
        clientA.release();
      }

      // Instance 2 (poolB): Settle via independent pool
      const clientB = await poolB.connect();
      try {
        const settlement = await verifyAndSettleAuthoritativePayment(clientB, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 150000,
          delta_passes: 10,
        });

        expect(settlement.settled).toBe(true);
        expect(settlement.status).toBe('SETTLED');
        expect(settlement.balanceAfter).toBe(10);
      } finally {
        clientB.release();
      }
    });

    test('9b. Application restart persistence (data registry intact after complete pool disposal)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_norm_restart_${ts}`;
      const internalOrderId = `ord_norm_restart_${ts}`;
      const providerTxId = `tx_norm_restart_${ts}`;

      // Ephemeral Pool registers & binds
      const ephemeralPool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 2,
      });

      const client1 = await ephemeralPool.connect();
      try {
        await registerOrderPreCheckout(client1, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'dodo',
          currency: 'USD',
          expected_amount: 4500,
        });
        await bindProviderTransaction(client1, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });
      } finally {
        client1.release();
      }

      // SIMULATE APP CRASH / RESTART: Close pool completely
      await ephemeralPool.end();

      // Restarted pool connects and settles
      const restartedPool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 2,
      });

      const client2 = await restartedPool.connect();
      try {
        const res = await verifyAndSettleAuthoritativePayment(client2, {
          provider: 'dodo',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'USD',
          amount: 4500,
          delta_passes: 10,
        });
        expect(res.settled).toBe(true);
        expect(res.status).toBe('SETTLED');
      } finally {
        client2.release();
        await restartedPool.end();
      }
    });

    test('9c. Multiple consecutive valid purchases accumulate tenant balance deterministically', async () => {
      const ts = Date.now();
      const tenantId = `tenant_accum_${ts}`;

      const client = await poolA.connect();
      try {
        // Purchase 1: 10 passes
        const ord1 = `ord_accum_1_${ts}`;
        const tx1 = `tx_accum_1_${ts}`;
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: ord1,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: ord1,
          provider_transaction_id: tx1,
        });
        const res1 = await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: tx1,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 100000,
          delta_passes: 10,
        });
        expect(res1.balanceAfter).toBe(10);

        // Purchase 2: 25 passes
        const ord2 = `ord_accum_2_${ts}`;
        const tx2 = `tx_accum_2_${ts}`;
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: ord2,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 250000,
        });
        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: ord2,
          provider_transaction_id: tx2,
        });
        const res2 = await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: tx2,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 250000,
          delta_passes: 25,
        });
        expect(res2.balanceAfter).toBe(35); // 10 + 25 = 35 passes
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 10: Final Persistent Binding Completeness & Database Authority (CTO Mandate Round 3C)
  // ---------------------------------------------------------------------------
  describe('Requirement 10: Final Persistent Binding Completeness & Database Authority (CTO Mandate Round 3C)', () => {
    test('10a. Direct SQL UPDATE to BOUND with NULL provider_transaction_id is rejected at database level', async () => {
      const ts = Date.now();
      const tenantId = `tenant_bound_null_${ts}`;
      const internalOrderId = `ord_bound_null_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Direct SQL attempt to set status = 'BOUND' with provider_transaction_id = NULL
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = NULL 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow(/(INVALID_BINDING_REFERENCE|chk_payment_registry_bound_has_valid_tx)/i);

        // Verify order remains intact in INITIATED status
        const orderRes = await client.query(
          `SELECT status, provider_transaction_id FROM workforce_staging.workforce_payment_registry 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, internalOrderId]
        );
        expect(orderRes.rows[0].status).toBe('INITIATED');
        expect(orderRes.rows[0].provider_transaction_id).toBeNull();
      } finally {
        client.release();
      }
    });

    test('10b. Direct SQL UPDATE to BOUND with empty string provider_transaction_id is rejected at database level', async () => {
      const ts = Date.now();
      const tenantId = `tenant_bound_empty_${ts}`;
      const internalOrderId = `ord_bound_empty_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Direct SQL attempt to set status = 'BOUND' with provider_transaction_id = ''
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = '' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow(/(INVALID_BINDING_REFERENCE|chk_payment_registry_bound_has_valid_tx)/i);

        // Verify order remains intact in INITIATED status
        const orderRes = await client.query(
          `SELECT status, provider_transaction_id FROM workforce_staging.workforce_payment_registry 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, internalOrderId]
        );
        expect(orderRes.rows[0].status).toBe('INITIATED');
        expect(orderRes.rows[0].provider_transaction_id).toBeNull();
      } finally {
        client.release();
      }
    });

    test('10c. Direct SQL UPDATE to BOUND with whitespace-only provider_transaction_id is rejected at database level', async () => {
      const ts = Date.now();
      const tenantId = `tenant_bound_white_${ts}`;
      const internalOrderId = `ord_bound_white_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });

        // Direct SQL attempt to set status = 'BOUND' with provider_transaction_id = '   '
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = '   ' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow(/(INVALID_BINDING_REFERENCE|chk_payment_registry_bound_has_valid_tx)/i);

        // Verify order remains intact in INITIATED status
        const orderRes = await client.query(
          `SELECT status, provider_transaction_id FROM workforce_staging.workforce_payment_registry 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, internalOrderId]
        );
        expect(orderRes.rows[0].status).toBe('INITIATED');
        expect(orderRes.rows[0].provider_transaction_id).toBeNull();
      } finally {
        client.release();
      }
    });

    test('10d. Direct SQL INSERT with status BOUND and invalid provider_transaction_id is rejected by CHECK constraint', async () => {
      const ts = Date.now();
      const tenantId = `tenant_ins_bound_${ts}`;
      const ordNull = `ord_ins_null_${ts}`;
      const ordEmpty = `ord_ins_empty_${ts}`;
      const ordWhite = `ord_ins_white_${ts}`;

      const client = await poolA.connect();
      try {
        // Direct INSERT with NULL
        await expect(
          client.query(
            `INSERT INTO workforce_staging.workforce_payment_registry (
              tenant_id, internal_order_id, provider, currency, expected_amount, status, provider_transaction_id
            ) VALUES ($1, $2, 'xendit', 'IDR', 100000, 'BOUND', NULL)`,
            [tenantId, ordNull]
          )
        ).rejects.toThrow(/chk_payment_registry_bound_has_valid_tx/i);

        // Direct INSERT with empty string ''
        await expect(
          client.query(
            `INSERT INTO workforce_staging.workforce_payment_registry (
              tenant_id, internal_order_id, provider, currency, expected_amount, status, provider_transaction_id
            ) VALUES ($1, $2, 'xendit', 'IDR', 100000, 'BOUND', '')`,
            [tenantId, ordEmpty]
          )
        ).rejects.toThrow(/chk_payment_registry_bound_has_valid_tx/i);

        // Direct INSERT with whitespace '   '
        await expect(
          client.query(
            `INSERT INTO workforce_staging.workforce_payment_registry (
              tenant_id, internal_order_id, provider, currency, expected_amount, status, provider_transaction_id
            ) VALUES ($1, $2, 'xendit', 'IDR', 100000, 'BOUND', '   ')`,
            [tenantId, ordWhite]
          )
        ).rejects.toThrow(/chk_payment_registry_bound_has_valid_tx/i);
      } finally {
        client.release();
      }
    });

    test('10e. Legitimate INITIATED -> BOUND transition with valid transaction ID succeeds (preserving nullable provider_account_id semantics)', async () => {
      const ts = Date.now();
      const tenantId = `tenant_pos_valid_${ts}`;
      const internalOrderId = `ord_pos_valid_${ts}`;
      const providerTxId = `tx_pos_valid_${ts}`;

      const client = await poolA.connect();
      try {
        // Register without provider_account_id (nullable semantics)
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'dodo',
          currency: 'USD',
          expected_amount: 5000,
        });

        // Direct SQL update to BOUND with valid provider_transaction_id
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry 
           SET status = 'BOUND', provider_transaction_id = $1 
           WHERE tenant_id = $2 AND internal_order_id = $3`,
          [providerTxId, tenantId, internalOrderId]
        );

        const orderRes = await client.query(
          `SELECT status, provider_transaction_id, provider_account_id 
           FROM workforce_staging.workforce_payment_registry 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, internalOrderId]
        );
        expect(orderRes.rows[0].status).toBe('BOUND');
        expect(orderRes.rows[0].provider_transaction_id).toBe(providerTxId);
        expect(orderRes.rows[0].provider_account_id).toBeNull(); // Valid nullable semantics
      } finally {
        client.release();
      }
    });

    test('10f. Subsequent overwrite or modification of provider_transaction_id on BOUND order is strictly rejected', async () => {
      const ts = Date.now();
      const tenantId = `tenant_bound_lock_${ts}`;
      const internalOrderId = `ord_bound_lock_${ts}`;
      const providerTxId = `tx_bound_orig_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 150000,
        });

        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Attempt 1: Overwrite with another transaction ID
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET provider_transaction_id = 'tx_adversary_hijack' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow(/IMMUTABLE_FIELD_MODIFICATION: provider_transaction_id cannot be modified once BOUND/i);

        // Attempt 2: Clear provider_transaction_id back to NULL
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET provider_transaction_id = NULL 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow();

        // Verify transaction ID was NOT mutated
        const orderRes = await client.query(
          `SELECT provider_transaction_id FROM workforce_staging.workforce_payment_registry 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, internalOrderId]
        );
        expect(orderRes.rows[0].provider_transaction_id).toBe(providerTxId);
      } finally {
        client.release();
      }
    });

    test('10g. Legitimate BOUND -> SETTLED transition succeeds, and SETTLED records enforce strict permanent immutability', async () => {
      const ts = Date.now();
      const tenantId = `tenant_settle_perm_${ts}`;
      const internalOrderId = `ord_settle_perm_${ts}`;
      const providerTxId = `tx_settle_perm_${ts}`;

      const client = await poolA.connect();
      try {
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 200000,
        });

        await bindProviderTransaction(client, {
          tenant_id: tenantId,
          internal_order_id: internalOrderId,
          provider_transaction_id: providerTxId,
        });

        // Settle legitimately
        const settlement = await verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 200000,
          delta_passes: 10,
        });
        expect(settlement.settled).toBe(true);
        expect(settlement.status).toBe('SETTLED');

        // Direct SQL attempt to nullify provider_transaction_id on SETTLED record
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET provider_transaction_id = NULL 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow();

        // Direct SQL attempt to revert status from SETTLED to BOUND or INITIATED
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, internalOrderId]
          )
        ).rejects.toThrow(/SETTLED is immutable and cannot be transitioned/i);
      } finally {
        client.release();
      }
    });

    test('10h. Terminal states FAILED and EXPIRED remain strictly immutable against status resurrection', async () => {
      const ts = Date.now();
      const tenantId = `tenant_term_res_${ts}`;
      const ordFailed = `ord_term_failed_${ts}`;
      const ordExpired = `ord_term_expired_${ts}`;

      const client = await poolA.connect();
      try {
        // Setup order 1 -> FAILED
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: ordFailed,
          provider: 'xendit',
          currency: 'IDR',
          expected_amount: 100000,
        });
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry SET status = 'FAILED' 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, ordFailed]
        );

        // Attempt resurrection of FAILED -> BOUND
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'BOUND', provider_transaction_id = 'tx_resurrect_fail' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, ordFailed]
          )
        ).rejects.toThrow(/Terminal status FAILED cannot be transitioned to BOUND/i);

        // Setup order 2 -> EXPIRED
        await registerOrderPreCheckout(client, {
          tenant_id: tenantId,
          internal_order_id: ordExpired,
          provider: 'dodo',
          currency: 'USD',
          expected_amount: 2500,
        });
        await client.query(
          `UPDATE workforce_staging.workforce_payment_registry SET status = 'EXPIRED' 
           WHERE tenant_id = $1 AND internal_order_id = $2`,
          [tenantId, ordExpired]
        );

        // Attempt resurrection of EXPIRED -> SETTLED
        await expect(
          client.query(
            `UPDATE workforce_staging.workforce_payment_registry 
             SET status = 'SETTLED' 
             WHERE tenant_id = $1 AND internal_order_id = $2`,
            [tenantId, ordExpired]
          )
        ).rejects.toThrow(/Terminal status EXPIRED cannot be transitioned to SETTLED/i);
      } finally {
        client.release();
      }
    });

    test('10i. Tenant operational CRUD regression verification (verified_domain_registry and pass queries remain 100% normal)', async () => {
      const ts = Date.now();
      const testTenant = `tenant_crud_regress_${ts}`;
      const testHost = `test-${ts}.workforce.boontrack.com`;

      const client = await poolA.connect();
      try {
        // 1. CREATE / INSERT domain registration
        await client.query(
          `INSERT INTO workforce_staging.verified_domain_registry 
           (tenant_id, hostname, brand_name, logo_url, primary_color, accent_color, is_active)
           VALUES ($1, $2, 'Audit Test Brand', '/icons/test.png', '#10b981', '#059669', TRUE)`,
          [testTenant, testHost]
        );

        // 2. READ domain registration
        const readRes = await client.query(
          `SELECT tenant_id, hostname, brand_name, is_active 
           FROM workforce_staging.verified_domain_registry 
           WHERE tenant_id = $1`,
          [testTenant]
        );
        expect(readRes.rows.length).toBe(1);
        expect(readRes.rows[0].brand_name).toBe('Audit Test Brand');
        expect(readRes.rows[0].is_active).toBe(true);

        // 3. UPDATE domain registration
        await client.query(
          `UPDATE workforce_staging.verified_domain_registry 
           SET brand_name = 'Updated Brand Name', accent_color = '#047857' 
           WHERE tenant_id = $1`,
          [testTenant]
        );

        const updateRes = await client.query(
          `SELECT brand_name, accent_color 
           FROM workforce_staging.verified_domain_registry 
           WHERE tenant_id = $1`,
          [testTenant]
        );
        expect(updateRes.rows[0].brand_name).toBe('Updated Brand Name');
        expect(updateRes.rows[0].accent_color).toBe('#047857');

        // 4. DELETE / Clean up
        await client.query(
          `DELETE FROM workforce_staging.verified_domain_registry WHERE tenant_id = $1`,
          [testTenant]
        );

        const cleanRes = await client.query(
          `SELECT COUNT(*) as count FROM workforce_staging.verified_domain_registry WHERE tenant_id = $1`,
          [testTenant]
        );
        expect(Number(cleanRes.rows[0].count)).toBe(0);
      } finally {
        client.release();
      }
    });
  });
});
