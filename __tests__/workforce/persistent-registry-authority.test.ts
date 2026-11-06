/**
 * __tests__/workforce/persistent-registry-authority.test.ts
 * BWM Gate 1: Persistent Transaction Registry & Authority Engine Test Suite
 *
 * Directives (CTO Official Mandate):
 * 1. Multi-instance verification (eksekusi via pool koneksi berbeda)
 * 2. Application restart persistence (data registry tetap utuh setelah reset pool/koneksi)
 * 3. Unknown payment reference rejection (fail-closed)
 * 4. Empty payment reference rejection
 * 5. Cross-tenant collision rejection (Tenant B mengklaim referensi Tenant A)
 * 6. Currency mismatch rejection (order USD dibayar IDR atau sebaliknya)
 * 7. Amount mismatch rejection (kurang bayar / manipulasi nilai)
 * 8. Provider/account mismatch rejection
 * 9. Duplicate webhook idempotency
 * 10. Concurrent duplicate webhook handling (2 request masuk serentak, tepat 1 yang sukses)
 * 11. Zero ledger side-effects on invalid claims (COUNT(*) ledger === 0 saat klaim ditolak)
 * 12. Valid settlement creates exactly ONE authoritative ledger entry
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
  registerOrderPreCheckout,
  bindProviderTransaction,
  verifyAndSettleAuthoritativePayment,
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
  return connStr;
}

describe('BWM Gate 1: Persistent Transaction Registry & Authority Engine', () => {
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
  // SCENARIO 1: Multi-instance verification (eksekusi via pool koneksi berbeda)
  // ---------------------------------------------------------------------------
  test('Scenario 1: Multi-instance verification across independent connection pools', async () => {
    const ts = Date.now();
    const tenantId = `tenant_multi_${ts}`;
    const internalOrderId = `ord_multi_${ts}`;
    const providerTxId = `tx_multi_${ts}`;

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
      expect(bound.provider_transaction_id).toBe(providerTxId);
    } finally {
      clientA.release();
    }

    // Instance 2 (poolB): Settle via completely independent pool
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
      expect(settlement.tenantId).toBe(tenantId);
    } finally {
      clientB.release();
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Application restart persistence (data tetap utuh setelah reset pool)
  // ---------------------------------------------------------------------------
  test('Scenario 2: Application restart persistence (data registry intact after pool disposal)', async () => {
    const ts = Date.now();
    const tenantId = `tenant_restart_${ts}`;
    const internalOrderId = `ord_restart_${ts}`;
    const providerTxId = `tx_restart_${ts}`;

    // Step A: Ephemeral Pool 1 registers order
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

    // Step B: Brand new restarted pool connects and verifies persisted record
    const restartedPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });

    const client2 = await restartedPool.connect();
    try {
      const checkRes = await client2.query(
        `SELECT id, tenant_id, status FROM workforce_staging.workforce_payment_registry WHERE provider_transaction_id = $1`,
        [providerTxId]
      );
      expect(checkRes.rows.length).toBe(1);
      expect(checkRes.rows[0].status).toBe('BOUND');
      expect(checkRes.rows[0].tenant_id).toBe(tenantId);

      // Settle successfully on restarted instance
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

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Unknown payment reference rejection (fail-closed)
  // ---------------------------------------------------------------------------
  test('Scenario 3: Unknown payment reference rejection (fail-closed)', async () => {
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

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Empty payment reference rejection
  // ---------------------------------------------------------------------------
  test('Scenario 4: Empty payment reference rejection', async () => {
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

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Cross-tenant collision rejection (Tenant B mengklaim referensi Tenant A)
  // ---------------------------------------------------------------------------
  test('Scenario 5: Cross-tenant collision rejection (adversary claiming legit tenant transaction)', async () => {
    const ts = Date.now();
    const legitTenant = `tenant_legit_${ts}`;
    const adversaryTenant = `tenant_adversary_${ts}`;
    const internalOrderId = `ord_legit_${ts}`;
    const providerTxId = `tx_legit_${ts}`;

    const client = await poolA.connect();
    try {
      // Legitimate tenant registers and binds
      await registerOrderPreCheckout(client, {
        tenant_id: legitTenant,
        internal_order_id: internalOrderId,
        provider: 'xendit',
        currency: 'IDR',
        expected_amount: 1000000,
      });
      await bindProviderTransaction(client, {
        tenant_id: legitTenant,
        internal_order_id: internalOrderId,
        provider_transaction_id: providerTxId,
      });

      // Adversary attempts to settle legit tenant's transaction reference
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: adversaryTenant, // Adversary claims legit transaction
          currency: 'IDR',
          amount: 1000000,
        })
      ).rejects.toThrow('CROSS_TENANT_COLLISION');
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Currency mismatch rejection (order USD dibayar IDR atau sebaliknya)
  // ---------------------------------------------------------------------------
  test('Scenario 6: Currency mismatch rejection (USD order paid in IDR)', async () => {
    const ts = Date.now();
    const tenantId = `tenant_currency_mismatch_${ts}`;
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

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Amount mismatch rejection (kurang bayar / manipulasi nilai)
  // ---------------------------------------------------------------------------
  test('Scenario 7: Amount mismatch rejection (underpayment or value tampering)', async () => {
    const ts = Date.now();
    const tenantId = `tenant_amount_mismatch_${ts}`;
    const internalOrderId = `ord_amt_${ts}`;
    const providerTxId = `tx_amt_${ts}`;

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

      // Case A: Underpaid (350000 instead of 500000)
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 350000,
        })
      ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');

      // Case B: Tampered amount (999999 instead of 500000)
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 999999,
        })
      ).rejects.toThrow('AMOUNT_OR_CURRENCY_MISMATCH');
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Provider / Account mismatch rejection
  // ---------------------------------------------------------------------------
  test('Scenario 8: Provider and provider account mismatch rejection', async () => {
    const ts = Date.now();
    const tenantId = `tenant_prov_mismatch_${ts}`;
    const internalOrderId = `ord_prov_${ts}`;
    const providerTxId = `tx_prov_${ts}`;

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

      // Sub-case A: Wrong provider ('dodo' instead of 'xendit')
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'dodo',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 250000,
        })
      ).rejects.toThrow('PROVIDER_OR_ACCOUNT_MISMATCH');

      // Sub-case B: Wrong provider_account_id ('acc_compromised' instead of 'acc_primary_prod')
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_account_id: 'acc_compromised',
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

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Duplicate webhook idempotency
  // ---------------------------------------------------------------------------
  test('Scenario 9: Duplicate webhook idempotency rejects replay on already settled order', async () => {
    const ts = Date.now();
    const tenantId = `tenant_dup_${ts}`;
    const internalOrderId = `ord_dup_${ts}`;
    const providerTxId = `tx_dup_${ts}`;

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

      // First webhook delivery -> SUCCEEDS
      const res1 = await verifyAndSettleAuthoritativePayment(client, {
        provider: 'xendit',
        provider_transaction_id: providerTxId,
        tenant_id: tenantId,
        currency: 'IDR',
        amount: 300000,
        delta_passes: 15,
      });
      expect(res1.settled).toBe(true);
      expect(res1.status).toBe('SETTLED');

      // Second webhook delivery (Replay attack / duplicate delivery) -> REJECTS with DUPLICATE_WEBHOOK_IDEMPOTENCY
      await expect(
        verifyAndSettleAuthoritativePayment(client, {
          provider: 'xendit',
          provider_transaction_id: providerTxId,
          tenant_id: tenantId,
          currency: 'IDR',
          amount: 300000,
          delta_passes: 15,
        })
      ).rejects.toThrow('DUPLICATE_WEBHOOK_IDEMPOTENCY');
    } finally {
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Concurrent duplicate webhook handling (2 request serentak, tepat 1 sukses)
  // ---------------------------------------------------------------------------
  test('Scenario 10: Concurrent duplicate webhook handling (2 requests race, exactly 1 succeeds)', async () => {
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

    // Prepare 2 separate clients
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

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Zero ledger side-effects on invalid claims (COUNT(*) === 0)
  // ---------------------------------------------------------------------------
  test('Scenario 11: Zero ledger side-effects on invalid claims (COUNT(*) ledger === 0 on rejected claims)', async () => {
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

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Valid settlement creates exactly ONE authoritative ledger entry
  // ---------------------------------------------------------------------------
  test('Scenario 12: Valid settlement creates exactly ONE authoritative ledger entry', async () => {
    const ts = Date.now();
    const tenantId = `tenant_valid_settle_${ts}`;
    const internalOrderId = `ord_valid_${ts}`;
    const providerTxId = `tx_valid_${ts}`;

    const client = await poolA.connect();
    try {
      // 1. Pre-checkout registration
      await registerOrderPreCheckout(client, {
        tenant_id: tenantId,
        internal_order_id: internalOrderId,
        provider: 'xendit',
        currency: 'IDR',
        expected_amount: 850000,
      });

      // 2. Provider transaction binding
      await bindProviderTransaction(client, {
        tenant_id: tenantId,
        internal_order_id: internalOrderId,
        provider_transaction_id: providerTxId,
      });

      // 3. Authoritative verification and settlement
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

      // Verify in persistent payment registry
      const regRes = await client.query(
        `SELECT status, authoritative_verified_at FROM workforce_staging.workforce_payment_registry WHERE provider_transaction_id = $1`,
        [providerTxId]
      );
      expect(regRes.rows.length).toBe(1);
      expect(regRes.rows[0].status).toBe('SETTLED');
      expect(regRes.rows[0].authoritative_verified_at).not.toBeNull();

      // Verify in tenant_pass_ledger: EXACTLY ONE ROW
      const ledgerRes = await client.query(
        `SELECT entry_id, tenant_id, delta_passes, balance_after, reason FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
        [tenantId]
      );
      expect(ledgerRes.rows.length).toBe(1);
      expect(ledgerRes.rows[0].entry_id).toBe(settlement.ledgerEntryId);
      expect(Number(ledgerRes.rows[0].delta_passes)).toBe(25);
      expect(Number(ledgerRes.rows[0].balance_after)).toBe(25);
      expect(ledgerRes.rows[0].reason).toBe('PURCHASE');
    } finally {
      client.release();
    }
  });
});
