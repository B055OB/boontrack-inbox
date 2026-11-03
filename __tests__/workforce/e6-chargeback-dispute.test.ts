/**
 * __tests__/workforce/e6-chargeback-dispute.test.ts
 * BWM Gate E6-D: Chargeback & Dispute Isolation Test Suite
 *
 * Verifies live PostgreSQL function fn_workforce_process_chargeback on Supabase Staging:
 * 1. Dormant Credit Freezing (Partial Consumption State):
 *    - 10 credits deposit, 3 consumed by active guards.
 *    - Chargeback freezes exactly 7 dormant credits, leaves 3 active seats CONSUMED.
 *    - Parent purchase transaction updated to DISPUTED.
 *    - Pool available_credits drops to 0, active_seats remains 3.
 * 2. Zero Negative Balance Protection (Fully Consumed Chargeback):
 *    - 5 credits deposit, all 5 consumed.
 *    - Chargeback freezes 0 credits.
 *    - Pool balance strictly protected against negative debt (available_credits stays 0, never -5).
 *    - Parent transaction marked DISPUTED for authoritative accounting.
 * 3. Idempotent Chargeback Replay:
 *    - Replaying chargeback returns idempotent success without balance modification or duplicate records.
 * 4. Cross-Transaction Boundary Protection:
 *    - Branch with Deposit A (5 credits) and Deposit B (5 credits).
 *    - Chargeback on Deposit A freezes only Deposit A credits, leaving Deposit B intact (available_credits = 5).
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

jest.setTimeout(35000);

describe('BWM Gate E6-D: Chargeback & Dispute Isolation Suite', () => {
  let client: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Base timestamp for unique fixture isolation
  const timestamp = Date.now();

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

  async function cleanFixtureData(dbClient: Client) {
    try {
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;');
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;');
      await dbClient.query("DELETE FROM seat_credit_ledger WHERE branch_id LIKE 'test_e6d_%' OR agency_id LIKE 'test_e6d_%';");
      await dbClient.query("DELETE FROM credit_purchase_transactions WHERE branch_id LIKE 'test_e6d_%' OR agency_id LIKE 'test_e6d_%';");
      await dbClient.query("DELETE FROM branch_credit_pools WHERE branch_id LIKE 'test_e6d_%' OR agency_id LIKE 'test_e6d_%';");
    } finally {
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;').catch(() => {});
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;').catch(() => {});
    }
  }

  beforeAll(async () => {
    client = await createLiveClient();
    await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
    await cleanFixtureData(client);
  });

  afterAll(async () => {
    if (client) {
      try {
        await cleanFixtureData(client);
      } catch (err) {
        console.error('Teardown error:', (err as Error).message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Skenario 1 — Dormant Credit Freezing (Partial Consumption State)
  // ---------------------------------------------------------------------------
  describe('1. Skenario 1 — Dormant Credit Freezing (Partial Consumption State)', () => {
    const branch1 = `test_e6d_${timestamp}_branch1`;
    const agency1 = `test_e6d_${timestamp}_agency1`;
    const payRef1 = `test_e6d_${timestamp}_payref1`;
    const poRef1 = `test_e6d_${timestamp}_poref1`;

    it('freezes exactly 7 dormant credits, leaves 3 active seats CONSUMED, marks transaction DISPUTED, and drops pool to 0 available', async () => {
      // 1. Deposit 10 credits (Rp333.000)
      await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
        [branch1, agency1, 10, poRef1, payRef1]
      );

      // 2. Consume 3 credits for 3 active guards
      for (let i = 1; i <= 3; i++) {
        await client.query(
          `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`,
          [branch1, `guard_active_${timestamp}_${i}`]
        );
      }

      // Verify pre-chargeback pool: available = 7, active = 3
      const prePool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch1]
      );
      expect(prePool.rows[0].available_credits).toBe(7);
      expect(prePool.rows[0].active_seats).toBe(3);

      // 3. Execute chargeback on parent payment reference
      const cbRes = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRef1, 'Bank Dispute Chargeback - Fraud Claim']
      );
      const result = cbRes.rows[0].result;

      expect(result.success).toBe(true);
      expect(result.payment_reference).toBe(payRef1);
      expect(result.frozen_credits_count).toBe(7);
      expect(result.branch_id).toBe(branch1);

      // 4. Verify parent purchase transaction is DISPUTED
      const txRes = await client.query(
        `SELECT status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [payRef1]
      );
      expect(txRes.rows[0].status).toBe('DISPUTED');

      // 5. Verify ledger row breakdown: exactly 7 FROZEN and 3 CONSUMED
      const frozenRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'FROZEN';`,
        [branch1]
      );
      expect(Number(frozenRes.rows[0].count)).toBe(7);

      const consumedRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'CONSUMED';`,
        [branch1]
      );
      expect(Number(consumedRes.rows[0].count)).toBe(3);

      const availableRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'AVAILABLE';`,
        [branch1]
      );
      expect(Number(availableRes.rows[0].count)).toBe(0);

      // 6. Verify pool balance: available_credits = 0, active_seats = 3 (uninterrupted)
      const postPool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch1]
      );
      expect(postPool.rows[0].available_credits).toBe(0);
      expect(postPool.rows[0].active_seats).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Skenario 2 — Zero Negative Balance Protection (Fully Consumed Chargeback)
  // ---------------------------------------------------------------------------
  describe('2. Skenario 2 — Zero Negative Balance Protection (Fully Consumed Chargeback)', () => {
    const branch2 = `test_e6d_${timestamp}_branch2`;
    const agency2 = `test_e6d_${timestamp}_agency2`;
    const payRef2 = `test_e6d_${timestamp}_payref2`;
    const poRef2 = `test_e6d_${timestamp}_poref2`;

    it('freezes 0 credits when all credits are already consumed, marks transaction DISPUTED, and strictly prevents negative debt', async () => {
      // 1. Deposit 5 credits
      await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
        [branch2, agency2, 5, poRef2, payRef2]
      );

      // 2. Consume all 5 credits
      for (let i = 1; i <= 5; i++) {
        await client.query(
          `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`,
          [branch2, `guard_fully_consumed_${timestamp}_${i}`]
        );
      }

      // Verify pre-chargeback pool: available = 0, active = 5
      const prePool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch2]
      );
      expect(prePool.rows[0].available_credits).toBe(0);
      expect(prePool.rows[0].active_seats).toBe(5);

      // 3. Execute chargeback
      const cbRes = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRef2, 'Chargeback on fully consumed batch']
      );
      const result = cbRes.rows[0].result;

      expect(result.success).toBe(true);
      expect(result.frozen_credits_count).toBe(0); // 0 credits available to freeze
      expect(result.branch_id).toBe(branch2);

      // 4. Saldo pool available_credits DILARANG KERAS minus (harus tetap 0, BUKAN -5)
      const postPool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch2]
      );
      expect(postPool.rows[0].available_credits).toBe(0);
      expect(postPool.rows[0].active_seats).toBe(5);

      // 5. Parent transaction marked DISPUTED for audit trail
      const txRes = await client.query(
        `SELECT status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [payRef2]
      );
      expect(txRes.rows[0].status).toBe('DISPUTED');

      // 6. Ledger remains 5 CONSUMED, 0 FROZEN
      const ledgerRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'CONSUMED';`,
        [branch2]
      );
      expect(Number(ledgerRes.rows[0].count)).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Skenario 3 — Idempotent Chargeback Replay
  // ---------------------------------------------------------------------------
  describe('3. Skenario 3 — Idempotent Chargeback Replay', () => {
    const branch3 = `test_e6d_${timestamp}_branch3`;
    const agency3 = `test_e6d_${timestamp}_agency3`;
    const payRef3 = `test_e6d_${timestamp}_payref3`;
    const poRef3 = `test_e6d_${timestamp}_poref3`;

    it('returns idempotent success without duplicate balance deductions or ledger alterations on replay', async () => {
      // Deposit 6 credits, consume 2, 4 remain available
      await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
        [branch3, agency3, 6, poRef3, payRef3]
      );
      await client.query(`SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`, [branch3, `guard_idemp_${timestamp}_1`]);
      await client.query(`SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`, [branch3, `guard_idemp_${timestamp}_2`]);

      // First Chargeback Call: freezes 4 credits
      const call1 = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRef3, 'First Chargeback Execution']
      );
      expect(call1.rows[0].result.success).toBe(true);
      expect(call1.rows[0].result.frozen_credits_count).toBe(4);

      // Pool snapshot post-first call
      const pool1 = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch3]
      );
      expect(pool1.rows[0].available_credits).toBe(0);
      expect(pool1.rows[0].active_seats).toBe(2);

      // Second Chargeback Call (Replay): must be safe and idempotent
      const call2 = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRef3, 'Second Replay Execution']
      );
      expect(call2.rows[0].result.success).toBe(true);
      expect(call2.rows[0].result.frozen_credits_count).toBe(0); // Already frozen, no additional deduction

      // Third Chargeback Call (Replay 2):
      const call3 = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRef3, 'Third Replay Execution']
      );
      expect(call3.rows[0].result.success).toBe(true);
      expect(call3.rows[0].result.frozen_credits_count).toBe(0);

      // Verify final pool state is unchanged
      const poolFinal = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch3]
      );
      expect(poolFinal.rows[0].available_credits).toBe(0);
      expect(poolFinal.rows[0].active_seats).toBe(2);

      // Verify ledger rows remain exactly 6 (4 FROZEN, 2 CONSUMED)
      const countRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branch3]
      );
      expect(Number(countRes.rows[0].count)).toBe(6);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Skenario 4 — Cross-Transaction Boundary Protection
  // ---------------------------------------------------------------------------
  describe('4. Skenario 4 — Cross-Transaction Boundary Protection', () => {
    const branch4 = `test_e6d_${timestamp}_branch4`;
    const agency4 = `test_e6d_${timestamp}_agency4`;
    const payRefA = `test_e6d_${timestamp}_payref_A`;
    const poRefA = `test_e6d_${timestamp}_poref_A`;
    const payRefB = `test_e6d_${timestamp}_payref_B`;
    const poRefB = `test_e6d_${timestamp}_poref_B`;

    it('isolates chargeback to target transaction: freezes Deposit A while leaving Deposit B untouched (available_credits = 5)', async () => {
      // 1. Agency buys Deposit A (5 credits)
      await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
        [branch4, agency4, 5, poRefA, payRefA]
      );

      // 2. Agency buys Deposit B (5 credits) for the same branch
      await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
        [branch4, agency4, 5, poRefB, payRefB]
      );

      // Total pool before chargeback: 10 available credits
      const poolPre = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch4]
      );
      expect(poolPre.rows[0].available_credits).toBe(10);
      expect(poolPre.rows[0].active_seats).toBe(0);

      // 3. Execute chargeback ONLY on Deposit A
      const cbRes = await client.query(
        `SELECT workforce_staging.fn_workforce_process_chargeback($1, $2) AS result;`,
        [payRefA, 'Dispute on Batch A only']
      );
      expect(cbRes.rows[0].result.frozen_credits_count).toBe(5);

      // 4. Verify Deposit A transaction is DISPUTED, while Deposit B is still SETTLED
      const txA = await client.query(
        `SELECT status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [payRefA]
      );
      expect(txA.rows[0].status).toBe('DISPUTED');

      const txB = await client.query(
        `SELECT status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [payRefB]
      );
      expect(txB.rows[0].status).toBe('SETTLED');

      // 5. Verify Deposit A credits are FROZEN, while Deposit B credits are still AVAILABLE
      const frozenA = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE payment_reference = $1 AND status = 'FROZEN';`,
        [payRefA]
      );
      expect(Number(frozenA.rows[0].count)).toBe(5);

      const availableB = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE payment_reference = $1 AND status = 'AVAILABLE';`,
        [payRefB]
      );
      expect(Number(availableB.rows[0].count)).toBe(5);

      // 6. Verify pool balance: Exactly 5 available credits remain from Deposit B
      const poolPost = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branch4]
      );
      expect(poolPost.rows[0].available_credits).toBe(5);
      expect(poolPost.rows[0].active_seats).toBe(0);
    });
  });
});

