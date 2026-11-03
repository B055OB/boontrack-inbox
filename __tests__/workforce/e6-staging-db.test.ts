/**
 * __tests__/workforce/e6-staging-db.test.ts
 * BWM Gate E6-A: Staging Database Live Integration Test Suite
 *
 * Verifies live PostgreSQL functions, triggers, rules, and RLS policies
 * inside the isolated 'workforce_staging' schema on Supabase Staging.
 *
 * Scenarios:
 * 1. fn_workforce_deposit_credits: 5 credits deposit (Rp166.500) + idempotency replay.
 * 2. fn_workforce_activate_personnel_seat: 1 personnel seat activation + atomic quota decrements.
 * 3. fn_workforce_process_chargeback: Freeze dormant credits + mark DISPUTED + zero negative debt.
 * 4. Immutability Enforcers: Direct DELETE and invalid UPDATE rejected fail-closed.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

jest.setTimeout(30000);

describe('BWM Gate E6-A: Live Staging Database Integration Suite', () => {
  let client: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Isolated test fixture keys
  const testRunId = Date.now();
  const agencyId = `tenant_e6_test_${testRunId}`;
  const branchId = `branch_e6_test_${testRunId}`;
  const paymentReference = `pay_ref_e6_${testRunId}`;
  const purchaseReference = `po_ref_e6_${testRunId}`;
  const personnelId = `personnel_e6_guard_${testRunId}`;
  let activatedCreditId: string;

  /**
   * Resolves connection string prioritizing Port 5432 Direct / Session Mode
   */
  async function createLiveClient(): Promise<Client> {
    const envDirect = process.env.WORKFORCE_DATABASE_DIRECT_URL;
    const envPooler = process.env.WORKFORCE_DATABASE_URL;

    // Fallback: read directly from .env.local if not populated
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
      // Session mode on port 5432 (IPv4 supported)
      candidates.push(poolerUrl.replace(':6543', ':5432'));
      // Transaction mode on port 6543
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

  beforeAll(async () => {
    client = await createLiveClient();

    // Set search_path to isolated schema
    await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);

    // Clean up any residual test fixture data
    await client.query(`
      ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;
      ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;
      DELETE FROM seat_credit_ledger WHERE agency_id LIKE 'tenant_e6_test_%';
      DELETE FROM credit_purchase_transactions WHERE agency_id LIKE 'tenant_e6_test_%';
      DELETE FROM branch_credit_pools WHERE agency_id LIKE 'tenant_e6_test_%';
      ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;
      ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;
    `);
  });

  afterAll(async () => {
    if (client) {
      try {
        // Teardown fixture data cleanly
        await client.query(`
          ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;
          ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;
          DELETE FROM seat_credit_ledger WHERE agency_id LIKE 'tenant_e6_test_%';
          DELETE FROM credit_purchase_transactions WHERE agency_id LIKE 'tenant_e6_test_%';
          DELETE FROM branch_credit_pools WHERE agency_id LIKE 'tenant_e6_test_%';
          ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;
          ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;
        `);
      } catch (err) {
        console.error('Teardown cleanup error:', (err as Error).message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Live Deposit & Banking Idempotency
  // ---------------------------------------------------------------------------
  describe('1. fn_workforce_deposit_credits (Live Staging)', () => {
    it('deposits 5 credits (Rp150.000 + Rp16.500 PPN = Rp166.500) and enforces banking idempotency', async () => {
      const depositQuery = `SELECT fn_workforce_deposit_credits($1, $2, $3, $4, $5) AS result;`;

      // 1. Initial Deposit
      const res = await client.query(depositQuery, [branchId, agencyId, 5, purchaseReference, paymentReference]);
      const result = res.rows[0].result;

      expect(result.success).toBe(true);
      expect(result.idempotent).toBe(false);
      expect(result.branch_id).toBe(branchId);
      expect(result.quantity_added).toBe(5);
      expect(result.subtotal_idr).toBe(150000);
      expect(result.tax_idr).toBe(16500);
      expect(result.total_idr).toBe(166500);
      expect(result.available_credits).toBe(5);
      expect(result.active_seats).toBe(0);

      // Verify row in credit_purchase_transactions
      const txRes = await client.query(
        `SELECT * FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [paymentReference]
      );
      expect(txRes.rows.length).toBe(1);
      expect(txRes.rows[0].branch_id).toBe(branchId);
      expect(txRes.rows[0].agency_id).toBe(agencyId);
      expect(txRes.rows[0].quantity).toBe(5);
      expect(Number(txRes.rows[0].subtotal_idr)).toBe(150000);
      expect(Number(txRes.rows[0].tax_idr)).toBe(16500);
      expect(Number(txRes.rows[0].total_idr)).toBe(166500);
      expect(txRes.rows[0].status).toBe('SETTLED');

      // Verify row in branch_credit_pools
      const poolRes = await client.query(
        `SELECT * FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolRes.rows.length).toBe(1);
      expect(poolRes.rows[0].available_credits).toBe(5);
      expect(poolRes.rows[0].active_seats).toBe(0);

      // Verify 5 individual ledger rows in seat_credit_ledger
      const ledgerRes = await client.query(
        `SELECT * FROM seat_credit_ledger WHERE branch_id = $1 ORDER BY created_at;`,
        [branchId]
      );
      expect(ledgerRes.rows.length).toBe(5);
      expect(ledgerRes.rows.every((r: any) => r.status === 'AVAILABLE')).toBe(true);
      expect(ledgerRes.rows.every((r: any) => r.action_type === 'PURCHASE')).toBe(true);
      expect(ledgerRes.rows.every((r: any) => Number(r.amount_idr) === 30000)).toBe(true);

      // 2. Idempotency Replay with same paymentReference
      const replayRes = await client.query(depositQuery, [branchId, agencyId, 5, purchaseReference, paymentReference]);
      const replay = replayRes.rows[0].result;

      expect(replay.success).toBe(true);
      expect(replay.idempotent).toBe(true);
      expect(replay.available_credits).toBe(5);
      expect(replay.quantity_added).toBe(5);
      expect(replay.message).toBe('Payment reference was already processed');

      // Verify no duplicate ledger rows created
      const countRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branchId]
      );
      expect(Number(countRes.rows[0].count)).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Live Activation & Atomic Quota Mutation
  // ---------------------------------------------------------------------------
  describe('2. fn_workforce_activate_personnel_seat (Live Staging)', () => {
    it('activates 1 personnel seat, updates ledger to CONSUMED, and atomically decrements available credits', async () => {
      const activateQuery = `SELECT fn_workforce_activate_personnel_seat($1, $2) AS result;`;
      const actRes = await client.query(activateQuery, [branchId, personnelId]);
      const actResult = actRes.rows[0].result;

      expect(actResult.success).toBe(true);
      expect(actResult.personnel_id).toBe(personnelId);
      expect(actResult.available_credits).toBe(4);
      expect(actResult.active_seats).toBe(1);
      expect(actResult.credit_row_id).toBeDefined();
      expect(actResult.expires_at).toBeDefined();

      activatedCreditId = actResult.credit_row_id;

      // Verify ledger state for the activated credit
      const consumedRes = await client.query(
        `SELECT * FROM seat_credit_ledger WHERE id = $1;`,
        [activatedCreditId]
      );
      expect(consumedRes.rows.length).toBe(1);
      expect(consumedRes.rows[0].status).toBe('CONSUMED');
      expect(consumedRes.rows[0].action_type).toBe('CONSUME');
      expect(consumedRes.rows[0].consumed_by_personnel_id).toBe(personnelId);
      expect(consumedRes.rows[0].consumed_at).not.toBeNull();
      expect(consumedRes.rows[0].expires_at).not.toBeNull();

      // Verify branch pool state
      const poolRes = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolRes.rows[0].available_credits).toBe(4);
      expect(poolRes.rows[0].active_seats).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Live Chargeback / Dispute Process
  // ---------------------------------------------------------------------------
  describe('3. fn_workforce_process_chargeback (Live Staging)', () => {
    it('freezes remaining 4 dormant credits, marks transaction DISPUTED, and protects active seats without negative balance', async () => {
      const cbQuery = `SELECT fn_workforce_process_chargeback($1, $2) AS result;`;
      const cbRes = await client.query(cbQuery, [paymentReference, 'Gate E6 Live Chargeback Test']);
      const cbResult = cbRes.rows[0].result;

      expect(cbResult.success).toBe(true);
      expect(cbResult.payment_reference).toBe(paymentReference);
      expect(cbResult.frozen_credits_count).toBe(4);
      expect(cbResult.branch_id).toBe(branchId);

      // Verify parent purchase transaction marked DISPUTED
      const txRes = await client.query(
        `SELECT status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [paymentReference]
      );
      expect(txRes.rows[0].status).toBe('DISPUTED');

      // Verify exactly 4 credits are FROZEN and 1 credit remains CONSUMED
      const frozenRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'FROZEN';`,
        [branchId]
      );
      expect(Number(frozenRes.rows[0].count)).toBe(4);

      const consumedRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'CONSUMED';`,
        [branchId]
      );
      expect(Number(consumedRes.rows[0].count)).toBe(1);

      // Verify pool balance: available_credits dropped to 0, active_seats preserved at 1 (no negative debt)
      const poolRes = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolRes.rows[0].available_credits).toBe(0);
      expect(poolRes.rows[0].active_seats).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Live Immutability Enforcers (Rules & Triggers)
  // ---------------------------------------------------------------------------
  describe('4. Immutability Enforcers (Live Staging)', () => {
    it('rejects direct manual DELETE on seat_credit_ledger fail-closed', async () => {
      let delCount = 0;
      try {
        const delRes = await client.query(
          `DELETE FROM seat_credit_ledger WHERE branch_id = $1;`,
          [branchId]
        );
        delCount = delRes.rowCount ?? 0;
      } catch {
        delCount = 0;
      }

      // Rule no_delete_seat_credit_ledger suppresses deletion (0 rows deleted)
      expect(delCount).toBe(0);

      // Verify all 5 ledger rows still exist intact
      const countRes = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branchId]
      );
      expect(Number(countRes.rows[0].count)).toBe(5);
    });

    it('rejects direct manual UPDATE on already CONSUMED credit rows', async () => {
      let updateCount = 0;
      let updateError: any = null;

      try {
        const updateRes = await client.query(
          `UPDATE seat_credit_ledger SET status = 'AVAILABLE' WHERE id = $1;`,
          [activatedCreditId]
        );
        updateCount = updateRes.rowCount ?? 0;
      } catch (err) {
        updateError = err;
      }

      // Either suppressed by rule (0 rows updated) or rejected by trigger exception
      if (!updateError) {
        expect(updateCount).toBe(0);
      }

      // Ensure status in database was NOT altered
      const verifyRes = await client.query(
        `SELECT status FROM seat_credit_ledger WHERE id = $1;`,
        [activatedCreditId]
      );
      expect(verifyRes.rows[0].status).toBe('CONSUMED');
    });
  });
});

