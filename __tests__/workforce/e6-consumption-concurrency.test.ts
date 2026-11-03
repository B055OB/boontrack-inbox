/**
 * __tests__/workforce/e6-consumption-concurrency.test.ts
 * BWM Gate E6-C: Credit Consumption & Multi-Admin Race Condition Test Suite
 *
 * Verifies:
 * 1. Multi-Admin Race Condition (Last Seat Depletion):
 *    - 2 simultaneous admins racing for the last 1 available credit in pool.
 *    - Exactly 1 succeeds, exactly 1 fails-closed with 'INSUFFICIENT_CREDITS'.
 *    - Pool balance stops exactly at available_credits = 0, active_seats = 5 (never negative).
 * 2. 30-Day Rolling Window Expiry Precision:
 *    - Verifies consumed_at (NOW()) and expires_at (consumed_at + 30 days) are exact.
 *    - Bound validly to consumed_by_personnel_id.
 * 3. Zero-Credit Denial (Negative Test):
 *    - Activation rejected immediately when pool is empty.
 *    - Zero orphaned records created.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

jest.setTimeout(35000);

describe('BWM Gate E6-C: Credit Consumption & Multi-Admin Race Condition Suite', () => {
  let adminClient: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Isolated fixture namespace
  const timestamp = Date.now();
  const branchId = `test_e6c_${timestamp}_branch`;
  const agencyId = `test_e6c_${timestamp}_agency`;
  const paymentReference = `test_e6c_${timestamp}_payref`;
  const purchaseReference = `test_e6c_${timestamp}_poref`;

  const personnelX = `test_e6c_${timestamp}_guard_X`;
  const personnelY = `test_e6c_${timestamp}_guard_Y`;
  let winningPersonnelId: string;

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
    try {
      await client.query('ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;');
      await client.query('ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;');
      await client.query("DELETE FROM seat_credit_ledger WHERE branch_id LIKE 'test_e6c_%' OR agency_id LIKE 'test_e6c_%';");
      await client.query("DELETE FROM credit_purchase_transactions WHERE branch_id LIKE 'test_e6c_%' OR agency_id LIKE 'test_e6c_%';");
      await client.query("DELETE FROM branch_credit_pools WHERE branch_id LIKE 'test_e6c_%' OR agency_id LIKE 'test_e6c_%';");
    } finally {
      await client.query('ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;').catch(() => {});
      await client.query('ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;').catch(() => {});
    }
  }

  beforeAll(async () => {
    adminClient = await createLiveClient();
    await adminClient.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
    await cleanFixtureData(adminClient);

    // Initial setup: Deposit 5 credits
    await adminClient.query(
      `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5);`,
      [branchId, agencyId, 5, purchaseReference, paymentReference]
    );

    // Consume 4 credits so exactly 1 credit remains in the pool
    for (let i = 1; i <= 4; i++) {
      await adminClient.query(
        `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`,
        [branchId, `guard_seed_${timestamp}_${i}`]
      );
    }

    // Verify initial pre-condition: exactly 1 credit available, 4 active seats
    const poolRes = await adminClient.query(
      `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
      [branchId]
    );
    expect(poolRes.rows[0].available_credits).toBe(1);
    expect(poolRes.rows[0].active_seats).toBe(4);
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
  // 1. Skenario Multi-Admin Race Condition (Last Seat Depletion)
  // ---------------------------------------------------------------------------
  describe('1. Multi-Admin Race Condition (Last Seat Depletion)', () => {
    it('allows exactly 1 activation and rejects competing concurrent admin with INSUFFICIENT_CREDITS', async () => {
      // Connect 2 independent admin client connections
      const clientAdminA = await createLiveClient();
      const clientAdminB = await createLiveClient();

      await clientAdminA.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
      await clientAdminB.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);

      // Fire simultaneous activation requests racing for the last 1 available credit
      const query = `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1::text, $2::text) AS result;`;

      let settledResults: PromiseSettledResult<any>[] = [];
      try {
        settledResults = await Promise.allSettled([
          clientAdminA.query(query, [branchId, personnelX]).then((r) => r.rows[0].result),
          clientAdminB.query(query, [branchId, personnelY]).then((r) => r.rows[0].result),
        ]);
      } finally {
        await clientAdminA.end().catch(() => {});
        await clientAdminB.end().catch(() => {});
      }

      // 1. Evaluate race results
      const fulfilled = settledResults.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = settledResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      // Exactly 1 activation must succeed
      expect(fulfilled.length).toBe(1);
      const winner = fulfilled[0].value;
      expect(winner.success).toBe(true);
      expect(winner.available_credits).toBe(0);
      expect(winner.active_seats).toBe(5);
      expect([personnelX, personnelY]).toContain(winner.personnel_id);
      winningPersonnelId = winner.personnel_id;

      // Exactly 1 activation must fail-closed
      expect(rejected.length).toBe(1);
      const loserError = rejected[0].reason;
      expect(loserError.message).toContain('INSUFFICIENT_CREDITS');

      // 2. Authoritative Database State Validation
      const poolCheck = await adminClient.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      // Pool must be 0 available credits, 5 active seats (CANNOT be -1)
      expect(poolCheck.rows[0].available_credits).toBe(0);
      expect(poolCheck.rows[0].active_seats).toBe(5);

      // 3. Ledger must contain exactly 5 CONSUMED rows (4 initial + 1 race winner)
      const consumedCount = await adminClient.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'CONSUMED';`,
        [branchId]
      );
      expect(Number(consumedCount.rows[0].count)).toBe(5);

      // Exactly 0 AVAILABLE credits remaining in ledger
      const availableCount = await adminClient.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'AVAILABLE';`,
        [branchId]
      );
      expect(Number(availableCount.rows[0].count)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Skenario 30-Day Rolling Window Expiry Precision
  // ---------------------------------------------------------------------------
  describe('2. 30-Day Rolling Window Expiry Precision', () => {
    it('verifies consumed_at (valid_from) is transaction timestamp and expires_at (valid_until) is exact 30-day window', async () => {
      const rowRes = await adminClient.query(
        `
        SELECT 
          id,
          consumed_by_personnel_id,
          consumed_at,
          expires_at,
          NOW() AS db_now,
          EXTRACT(DAY FROM (expires_at - consumed_at)) AS diff_days,
          EXTRACT(EPOCH FROM (expires_at - consumed_at)) AS diff_seconds
        FROM seat_credit_ledger
        WHERE branch_id = $1 AND consumed_by_personnel_id = $2;
      `,
        [branchId, winningPersonnelId]
      );

      expect(rowRes.rows.length).toBe(1);
      const row = rowRes.rows[0];

      // 1. Bound validly to winning personnel ID
      expect(row.consumed_by_personnel_id).toBe(winningPersonnelId);

      // 2. consumed_at must match database transaction timestamp (within 5 seconds of db_now)
      const consumedAt = new Date(row.consumed_at);
      const dbNow = new Date(row.db_now);
      expect(Math.abs(dbNow.getTime() - consumedAt.getTime())).toBeLessThan(5000);

      // 3. expires_at must be precisely 30 days later
      const diffDays = Number(row.diff_days);
      const diffSeconds = Number(row.diff_seconds);

      expect(diffDays).toBe(30);
      expect(diffSeconds).toBe(30 * 24 * 60 * 60); // Exact 2,592,000 seconds
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Skenario Zero-Credit Denial (Negative Test)
  // ---------------------------------------------------------------------------
  describe('3. Zero-Credit Denial (Negative Test)', () => {
    it('instantly rejects seat activation when pool has available_credits = 0 without creating orphaned records', async () => {
      const emptyPersonnelId = `guard_zero_denial_${timestamp}`;

      // Pool currently has 0 available credits
      let errorThrown: any = null;
      try {
        await adminClient.query(
          `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2);`,
          [branchId, emptyPersonnelId]
        );
      } catch (err) {
        errorThrown = err;
      }

      // 1. Must fail with INSUFFICIENT_CREDITS
      expect(errorThrown).not.toBeNull();
      expect(errorThrown.message).toContain('INSUFFICIENT_CREDITS');

      // 2. Ensure pool balance was NOT decremented into negative
      const poolRes = await adminClient.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolRes.rows[0].available_credits).toBe(0);
      expect(poolRes.rows[0].active_seats).toBe(5);

      // 3. Ensure no orphaned ledger row was created for emptyPersonnelId
      const orphanedRes = await adminClient.query(
        `SELECT * FROM seat_credit_ledger WHERE consumed_by_personnel_id = $1;`,
        [emptyPersonnelId]
      );
      expect(orphanedRes.rows.length).toBe(0);

      // Total rows in ledger remain exactly 5
      const totalRes = await adminClient.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branchId]
      );
      expect(Number(totalRes.rows[0].count)).toBe(5);
    });
  });
});
