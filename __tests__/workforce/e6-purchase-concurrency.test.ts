/**
 * __tests__/workforce/e6-purchase-concurrency.test.ts
 * BWM Gate E6-B: Purchase to Credit Pool Concurrency & Reconciliation Test Suite
 *
 * Verifies:
 * 1. 10x Concurrent Webhook Replay: 10 simultaneous webhook calls with identical payment_reference.
 *    - Exactly 1 fresh execution (idempotent: false).
 *    - Exactly 9 idempotent responses (idempotent: true).
 *    - Zero balance inflation (pool = 10 credits, not 100).
 *    - Zero duplicate ledger emission (ledger = 10 rows, not 100).
 * 2. Automated Ledger & Pool Reconciliation:
 *    - Formula: SUM(available + consumed + frozen + reversed) == pool.available_credits + pool.active_seats + total_frozen
 *    - Assert Delta === 0 across deposit, personnel activation, and chargeback phases.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

jest.setTimeout(35000);

describe('BWM Gate E6-B: Purchase to Credit Pool (Concurrency & Reconciliation)', () => {
  let adminClient: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Isolated fixture namespace
  const timestamp = Date.now();
  const branchId = `test_e6b_${timestamp}_branch`;
  const agencyId = `test_e6b_${timestamp}_agency`;
  const paymentReference = `test_e6b_${timestamp}_payref`;
  const purchaseReference = `test_e6b_${timestamp}_poref`;

  /**
   * Resolves connection string prioritizing Port 5432 Direct / Session Mode
   */
  async function createLiveClient(): Promise<Client> {
    const envDirect = process.env.WORKFORCE_DATABASE_DIRECT_URL;
    const envPooler = process.env.WORKFORCE_DATABASE_URL;

    let directUrl = envDirect;
    let poolerUrl = envPooler;
    if (!directUrl || !poolerUrl) {
      try {
        const envFile = fs.readFileSync(path.resolve('.env.local'), 'utf8');
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        const matchPooler = envFile.match(/^WORKFORCE_DATABASE_URL=(.*)$/m);
        if (matchDirect) directUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
        if (matchPooler) poolerUrl = matchPooler[1].trim().replace(/^["']|["']$/g, '');
      } catch {
        // ignore read error
      }
    }

    const candidates: string[] = [];
    if (directUrl) candidates.push(directUrl);
    if (poolerUrl) {
      candidates.push(poolerUrl.replace(':6543', ':5432'));
      candidates.push(poolerUrl);
    }

    for (const connStr of candidates) {
      try {
        const c = new Client({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        await c.connect();
        return c;
      } catch {
        // try next candidate
      }
    }
    throw new Error('Failed to connect to staging database via candidate connection strings');
  }

  async function cleanFixtureData(client: Client) {
    await client.query('ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;');
    await client.query('ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;');
    await client.query("DELETE FROM seat_credit_ledger WHERE branch_id LIKE 'test_e6b_%';");
    await client.query("DELETE FROM credit_purchase_transactions WHERE branch_id LIKE 'test_e6b_%';");
    await client.query("DELETE FROM branch_credit_pools WHERE branch_id LIKE 'test_e6b_%';");
    await client.query('ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;');
    await client.query('ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;');
  }

  beforeAll(async () => {
    adminClient = await createLiveClient();
    await adminClient.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
    await cleanFixtureData(adminClient);
  });

  afterAll(async () => {
    if (adminClient) {
      try {
        await cleanFixtureData(adminClient);
      } catch (err) {
        console.error('Teardown error:', (err as Error).message);
      } finally {
        await adminClient.end().catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Skenario 10x Concurrent Webhook Replay
  // ---------------------------------------------------------------------------
  describe('1. 10x Concurrent Webhook Replay (Live Staging Concurrency)', () => {
    it('processes 10 simultaneous webhook deposit calls with identical payment_reference without credit inflation', async () => {
      const quantity = 10;
      const unitPrice = 30000;
      const expectedSubtotal = quantity * unitPrice; // Rp300.000
      const expectedTax = Math.round(expectedSubtotal * 0.11); // Rp33.000
      const expectedTotal = expectedSubtotal + expectedTax; // Rp333.000

      // Connect 10 independent database clients to simulate 10 distributed workers
      const workerClients = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const c = await createLiveClient();
          await c.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
          return c;
        })
      );

      let results: any[] = [];
      try {
        // Fire 10 simultaneous deposit transactions at the exact same moment
        const depositPromises = workerClients.map((c, index) => {
          const query = `
            SELECT workforce_staging.fn_workforce_deposit_credits(
              $1::text, 
              $2::text, 
              $3::int, 
              $4::text, 
              $5::text, 
              $6::bigint, 
              $7::text
            ) AS result;
          `;
          return c
            .query(query, [
              branchId,
              agencyId,
              quantity,
              purchaseReference,
              paymentReference,
              unitPrice,
              `idemp_client_key_${index}`,
            ])
            .then((res) => res.rows[0].result);
        });

        results = await Promise.all(depositPromises);
      } finally {
        // Always close worker connections
        await Promise.all(workerClients.map((c) => c.end().catch(() => {})));
      }

      // 1. All 10 requests must succeed without unhandled error
      expect(results.length).toBe(10);
      expect(results.every((r) => r.success === true)).toBe(true);

      // 2. Exactly 1 execution must be fresh (idempotent: false)
      const freshExecutions = results.filter((r) => r.idempotent === false);
      expect(freshExecutions.length).toBe(1);
      const freshResult = freshExecutions[0];
      expect(freshResult.quantity_added).toBe(quantity);
      expect(freshResult.subtotal_idr).toBe(expectedSubtotal);
      expect(freshResult.tax_idr).toBe(expectedTax);
      expect(freshResult.total_idr).toBe(expectedTotal);
      expect(freshResult.available_credits).toBe(quantity);
      expect(freshResult.active_seats).toBe(0);

      // 3. Exactly 9 executions must be idempotent responses (idempotent: true)
      const idempotentExecutions = results.filter((r) => r.idempotent === true);
      expect(idempotentExecutions.length).toBe(9);
      for (const idem of idempotentExecutions) {
        expect(idem.quantity_added).toBe(quantity);
        expect(idem.subtotal_idr).toBe(expectedSubtotal);
        expect(idem.tax_idr).toBe(expectedTax);
        expect(idem.total_idr).toBe(expectedTotal);
        expect(idem.available_credits).toBe(quantity);
        expect(idem.message).toBe('Payment reference was already processed');
      }

      // 4. Authoritative Database Verification: Single parent purchase transaction
      const txRes = await adminClient.query(
        `SELECT * FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [paymentReference]
      );
      expect(txRes.rows.length).toBe(1);
      expect(txRes.rows[0].branch_id).toBe(branchId);
      expect(txRes.rows[0].quantity).toBe(10);
      expect(Number(txRes.rows[0].total_idr)).toBe(expectedTotal);
      expect(txRes.rows[0].status).toBe('SETTLED');

      // 5. Authoritative Database Verification: Exactly 10 ledger rows (NO double emission)
      const ledgerCountRes = await adminClient.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branchId]
      );
      expect(Number(ledgerCountRes.rows[0].count)).toBe(10);

      // 6. Authoritative Database Verification: Pool contains exactly 10 credits (NO credit inflation)
      const poolRes = await adminClient.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolRes.rows.length).toBe(1);
      expect(poolRes.rows[0].available_credits).toBe(10);
      expect(poolRes.rows[0].active_seats).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Skenario Automated Ledger & Pool Reconciliation (Zero-Delta Audit)
  // ---------------------------------------------------------------------------
  describe('2. Automated Ledger & Pool Reconciliation (Zero-Delta Formula)', () => {
    async function evaluateReconciliationMetrics(branch: string) {
      // 1. Fetch Ledger status breakdown
      const ledgerRes = await adminClient.query(
        `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available_count,
          COUNT(*) FILTER (WHERE status = 'CONSUMED') AS consumed_count,
          COUNT(*) FILTER (WHERE status = 'FROZEN') AS frozen_count,
          COUNT(*) FILTER (WHERE status = 'REVERSED') AS reversed_count,
          COUNT(*) AS total_ledger_credits
        FROM seat_credit_ledger
        WHERE branch_id = $1;
      `,
        [branch]
      );
      const ledger = ledgerRes.rows[0];
      const availableCount = Number(ledger.available_count);
      const consumedCount = Number(ledger.consumed_count);
      const frozenCount = Number(ledger.frozen_count);
      const reversedCount = Number(ledger.reversed_count);
      const totalLedger = Number(ledger.total_ledger_credits);

      // 2. Fetch Pool snapshot
      const poolRes = await adminClient.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch]
      );
      const pool = poolRes.rows[0];
      const poolAvailable = Number(pool.available_credits);
      const poolActive = Number(pool.active_seats);

      // 3. Mathematical Formula:
      // SUM(available + consumed + frozen + reversed) == pool.available_credits + pool.active_seats + total_frozen
      const expectedPoolSum = poolAvailable + poolActive + frozenCount;
      const delta = totalLedger - expectedPoolSum;

      return {
        availableCount,
        consumedCount,
        frozenCount,
        reversedCount,
        totalLedger,
        poolAvailable,
        poolActive,
        expectedPoolSum,
        delta,
      };
    }

    it('verifies Zero-Delta reconciliation formula immediately post-deposit (Phase 1)', async () => {
      const metrics = await evaluateReconciliationMetrics(branchId);

      expect(metrics.totalLedger).toBe(10);
      expect(metrics.availableCount).toBe(10);
      expect(metrics.consumedCount).toBe(0);
      expect(metrics.frozenCount).toBe(0);
      expect(metrics.reversedCount).toBe(0);

      expect(metrics.poolAvailable).toBe(10);
      expect(metrics.poolActive).toBe(0);

      // Mandate: Zero Delta
      expect(metrics.delta).toBe(0);
    });

    it('maintains Zero-Delta reconciliation after consuming credits for personnel seats (Phase 2)', async () => {
      // Activate 2 personnel seats
      await adminClient.query(`SELECT fn_workforce_activate_personnel_seat($1, $2);`, [branchId, 'guard_recon_01']);
      await adminClient.query(`SELECT fn_workforce_activate_personnel_seat($1, $2);`, [branchId, 'guard_recon_02']);

      const metrics = await evaluateReconciliationMetrics(branchId);

      expect(metrics.totalLedger).toBe(10);
      expect(metrics.availableCount).toBe(8);
      expect(metrics.consumedCount).toBe(2);
      expect(metrics.frozenCount).toBe(0);

      expect(metrics.poolAvailable).toBe(8);
      expect(metrics.poolActive).toBe(2);

      // Mandate: Zero Delta
      expect(metrics.delta).toBe(0);
    });

    it('maintains Zero-Delta reconciliation post-chargeback with frozen dormant credits (Phase 3)', async () => {
      // Chargeback remaining 8 available credits
      const cbRes = await adminClient.query(`SELECT fn_workforce_process_chargeback($1, $2) AS result;`, [
        paymentReference,
        'E6B Concurrency Reconciliation Chargeback',
      ]);
      expect(cbRes.rows[0].result.frozen_credits_count).toBe(8);

      const metrics = await evaluateReconciliationMetrics(branchId);

      expect(metrics.totalLedger).toBe(10);
      expect(metrics.availableCount).toBe(0);
      expect(metrics.consumedCount).toBe(2); // Personnel seats remain protected
      expect(metrics.frozenCount).toBe(8); // 8 dormant credits frozen

      expect(metrics.poolAvailable).toBe(0);
      expect(metrics.poolActive).toBe(2);

      // Mandate: SUM(available + consumed + frozen) == pool.available + pool.active + frozen (Delta === 0)
      expect(metrics.expectedPoolSum).toBe(10);
      expect(metrics.delta).toBe(0);
    });
  });
});
