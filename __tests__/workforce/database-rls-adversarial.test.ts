/**
 * __tests__/workforce/database-rls-adversarial.test.ts
 * BWM Gate 1 Round 3E: Database-Level RLS Adversarial Verification Suite
 *
 * Directives (CTO Official Mandate Round 3E):
 * 1. Prove that cross-tenant isolation is enforced by the actual PostgreSQL database
 *    security boundary (Row-Level Security), not merely application-level filters.
 * 2. Invariants Tested:
 *    - Role privileges: 'authenticated' has rolbypassrls = false; 'postgres' has rolbypassrls = true.
 *    - Positive read under authenticated role: Tenant A reads own records via RLS without WHERE predicate.
 *    - Negative cross-tenant read: Tenant A cannot read Tenant B's records (0 rows returned).
 *    - Negative cross-tenant update: Tenant A cannot update Tenant B's records (rowCount = 0).
 *    - Negative cross-tenant delete: Tenant A cannot delete Tenant B's records (rowCount = 0).
 *    - Negative cross-tenant insert: Tenant A cannot insert records for Tenant B (PostgreSQL Error 42501).
 *    - Missing tenant context: Query without app.current_agency_id returns 0 rows (fail-closed).
 *    - Unauthorized tenant context: Query with spoofed app.current_agency_id returns 0 rows (fail-closed).
 *    - Privileged service-role bypass: Demonstrates intentional bypass for admin reconciler operations.
 *    - Ledger immutability trigger defense: Proves seat_credit_ledger triggers reject unauthorized mutations.
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

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
    throw new Error('STAGING_DB_REQUIRED: Database RLS adversarial test must run against real PostgreSQL');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3E — Database-Level RLS Adversarial Verification', () => {
  let client: Client;
  const TENANT_ALPHA = 'adv_tenant_alpha_3e';
  const TENANT_BETA = 'adv_tenant_beta_3e';
  const BRANCH_ALPHA = 'adv_branch_alpha_3e';
  const BRANCH_BETA = 'adv_branch_beta_3e';
  const PROD_ALPHA_SLUG = 'adv-prod-alpha-3e';
  const PROD_BETA_SLUG = 'adv-prod-beta-3e';

  async function cleanFixtures(pgClient: Client) {
    await pgClient.query('RESET ROLE');
    await pgClient.query(`
      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DELETE FROM seat_credit_ledger WHERE agency_id IN ('adv_tenant_alpha_3e', 'adv_tenant_beta_3e');
      DELETE FROM credit_purchase_transactions WHERE agency_id IN ('adv_tenant_alpha_3e', 'adv_tenant_beta_3e');
      DELETE FROM branch_credit_pools WHERE agency_id IN ('adv_tenant_alpha_3e', 'adv_tenant_beta_3e');
      DELETE FROM products WHERE tenant_id IN ('adv_tenant_alpha_3e', 'adv_tenant_beta_3e');

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;
    `);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    await client.query('SET search_path TO workforce_staging, public');

    // Clean up any stale test fixtures cleanly
    await cleanFixtures(client);

    // Seed baseline rows for Alpha and Beta using privileged connection
    await client.query(`
      INSERT INTO branch_credit_pools (branch_id, agency_id, available_credits, active_seats, currency)
      VALUES 
        ($1, $2, 500, 5, 'IDR'),
        ($3, $4, 1000, 10, 'IDR')
    `, [BRANCH_ALPHA, TENANT_ALPHA, BRANCH_BETA, TENANT_BETA]);

    await client.query(`
      INSERT INTO products (tenant_id, title, slug, price, stock, category, product_type)
      VALUES
        ($1, 'Alpha Intelligence Suite', $2, 250000, 50, 'service', 'SERVICE'),
        ($3, 'Beta Operations Suite', $4, 500000, 100, 'service', 'SERVICE')
    `, [TENANT_ALPHA, PROD_ALPHA_SLUG, TENANT_BETA, PROD_BETA_SLUG]);
  }, 30000);

  afterAll(async () => {
    if (client) {
      try {
        await cleanFixtures(client);
      } catch {
        // ignore
      } finally {
        await client.end();
      }
    }
  }, 30000);

  test('1. Database Engine Verification: Role RLS Bypass Flags & Table Row Security', async () => {
    // Verify authenticated role does NOT have bypassrls
    const authRoleRes = await client.query(`
      SELECT rolname, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = 'authenticated'
    `);
    expect(authRoleRes.rows.length).toBe(1);
    expect(authRoleRes.rows[0].rolbypassrls).toBe(false);

    // Verify postgres role has bypassrls
    const pgRoleRes = await client.query(`
      SELECT rolname, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = 'postgres'
    `);
    expect(pgRoleRes.rows.length).toBe(1);
    expect(pgRoleRes.rows[0].rolbypassrls).toBe(true);

    // Verify Row-Level Security is active on target tables
    const tableRlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'workforce_staging' AND tablename IN ('branch_credit_pools', 'products')
    `);
    const rlsMap = Object.fromEntries(tableRlsRes.rows.map(r => [r.tablename, r.rowsecurity]));
    expect(rlsMap['branch_credit_pools']).toBe(true);
    expect(rlsMap['products']).toBe(true);
  });

  test('2. Positive Read via Database RLS Boundary (Pure SELECT Without WHERE Predicate)', async () => {
    // Switch to authenticated runtime role
    await client.query('SET ROLE authenticated');
    // Set tenant context to Tenant Alpha
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [TENANT_ALPHA]);

    // Query branch_credit_pools with ZERO WHERE filter
    const poolsRes = await client.query('SELECT branch_id, agency_id, available_credits FROM branch_credit_pools');
    
    // RLS must restrict the result set to ONLY Tenant Alpha
    expect(poolsRes.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of poolsRes.rows) {
      expect(row.agency_id).toBe(TENANT_ALPHA);
    }
    const alphaPool = poolsRes.rows.find(r => r.branch_id === BRANCH_ALPHA);
    expect(alphaPool).toBeDefined();
    expect(alphaPool?.available_credits).toBe(500);

    // Query products with ZERO WHERE filter
    const prodsRes = await client.query('SELECT tenant_id, title, slug, price FROM products');
    expect(prodsRes.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of prodsRes.rows) {
      expect(row.tenant_id).toBe(TENANT_ALPHA);
    }
    const alphaProd = prodsRes.rows.find(r => r.slug === PROD_ALPHA_SLUG);
    expect(alphaProd).toBeDefined();
    expect(alphaProd?.title).toBe('Alpha Intelligence Suite');
  });

  test('3. Negative Cross-Tenant Read Suppression: Tenant A Cannot Read Tenant B Records (0 Rows)', async () => {
    // Still in authenticated role with app.current_agency_id = TENANT_ALPHA
    // Adversary explicitly attempts to query Tenant Beta records
    const poolsRes = await client.query(
      'SELECT * FROM branch_credit_pools WHERE agency_id = $1',
      [TENANT_BETA]
    );
    expect(poolsRes.rows.length).toBe(0);

    const prodsRes = await client.query(
      'SELECT * FROM products WHERE tenant_id = $1',
      [TENANT_BETA]
    );
    expect(prodsRes.rows.length).toBe(0);
  });

  test('4. Negative Cross-Tenant Update Suppression: Tenant A Cannot Update Tenant B Records (rowCount = 0)', async () => {
    // Adversary attempts to alter Tenant Beta's credit balance
    const updatePoolRes = await client.query(
      'UPDATE branch_credit_pools SET available_credits = 999999 WHERE agency_id = $1',
      [TENANT_BETA]
    );
    expect(updatePoolRes.rowCount).toBe(0);

    // Adversary attempts to alter Tenant Beta's product price
    const updateProdRes = await client.query(
      'UPDATE products SET price = 1 WHERE tenant_id = $1',
      [TENANT_BETA]
    );
    expect(updateProdRes.rowCount).toBe(0);

    // Verify via privileged query that Tenant Beta state was NOT modified
    await client.query('RESET ROLE');
    const verifyPoolRes = await client.query(
      'SELECT available_credits FROM branch_credit_pools WHERE branch_id = $1',
      [BRANCH_BETA]
    );
    expect(verifyPoolRes.rows[0].available_credits).toBe(1000);

    const verifyProdRes = await client.query(
      'SELECT price FROM products WHERE slug = $1',
      [PROD_BETA_SLUG]
    );
    expect(Number(verifyProdRes.rows[0].price)).toBe(500000);

    // Revert to authenticated role for next tests
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [TENANT_ALPHA]);
  });

  test('5. Negative Cross-Tenant Delete Suppression: Tenant A Cannot Delete Tenant B Records (rowCount = 0)', async () => {
    // Adversary attempts to delete Tenant Beta's credit pool
    const deletePoolRes = await client.query(
      'DELETE FROM branch_credit_pools WHERE agency_id = $1',
      [TENANT_BETA]
    );
    expect(deletePoolRes.rowCount).toBe(0);

    // Adversary attempts to delete Tenant Beta's product
    const deleteProdRes = await client.query(
      'DELETE FROM products WHERE tenant_id = $1',
      [TENANT_BETA]
    );
    expect(deleteProdRes.rowCount).toBe(0);

    // Verify via privileged query that Tenant Beta records still exist intact
    await client.query('RESET ROLE');
    const verifyPool = await client.query('SELECT 1 FROM branch_credit_pools WHERE branch_id = $1', [BRANCH_BETA]);
    expect(verifyPool.rows.length).toBe(1);

    const verifyProd = await client.query('SELECT 1 FROM products WHERE slug = $1', [PROD_BETA_SLUG]);
    expect(verifyProd.rows.length).toBe(1);

    // Revert to authenticated
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [TENANT_ALPHA]);
  });

  test('6. Negative Cross-Tenant Insert: Rejected with PostgreSQL RLS Policy Violation (SQLSTATE 42501)', async () => {
    // Adversary attempts to insert a credit pool record for Tenant Beta
    let poolError: any = null;
    try {
      await client.query(`
        INSERT INTO branch_credit_pools (branch_id, agency_id, available_credits)
        VALUES ('adv_illegal_pool', $1, 9999)
      `, [TENANT_BETA]);
    } catch (err: any) {
      poolError = err;
    }
    expect(poolError).not.toBeNull();
    expect(poolError.code).toBe('42501');
    expect(poolError.message).toContain('violates row-level security policy');

    // Adversary attempts to insert a product record for Tenant Beta
    let prodError: any = null;
    try {
      await client.query(`
        INSERT INTO products (tenant_id, title, slug, price)
        VALUES ($1, 'Spoofed Malicious Product', 'spoofed-mal-prod', 100)
      `, [TENANT_BETA]);
    } catch (err: any) {
      prodError = err;
    }
    expect(prodError).not.toBeNull();
    expect(prodError.code).toBe('42501');
    expect(prodError.message).toContain('violates row-level security policy');
  });

  test('7. Fail-Closed on Missing Tenant Context: Queries Return 0 Rows', async () => {
    // Reset tenant context to NULL / unset
    await client.query('RESET app.current_agency_id');
    await client.query('RESET app.current_tenant_id');

    // Query branch_credit_pools without WHERE clause
    const poolRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolRes.rows.length).toBe(0);

    // Query products without WHERE clause
    const prodRes = await client.query('SELECT * FROM products');
    expect(prodRes.rows.length).toBe(0);
  });

  test('8. Fail-Closed on Unauthorized / Spoofed Tenant Context: Queries Return 0 Rows', async () => {
    // Set an unauthorized non-existent tenant context
    await client.query("SET app.current_agency_id = 'unauthorized_ghost_context_xyz'");

    const poolRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolRes.rows.length).toBe(0);

    const prodRes = await client.query('SELECT * FROM products');
    expect(prodRes.rows.length).toBe(0);
  });

  test('9. Privileged Service-Role / Postgres Bypass Verification (Administrative SSOT)', async () => {
    // Reset role to postgres (privileged superuser/admin)
    await client.query('RESET ROLE');

    // Admin query sees both Tenant Alpha and Tenant Beta records
    const adminPoolRes = await client.query(`
      SELECT branch_id, agency_id, available_credits 
      FROM branch_credit_pools 
      WHERE agency_id IN ($1, $2)
      ORDER BY agency_id ASC
    `, [TENANT_ALPHA, TENANT_BETA]);

    expect(adminPoolRes.rows.length).toBe(2);
    expect(adminPoolRes.rows.map(r => r.agency_id)).toEqual([TENANT_ALPHA, TENANT_BETA]);

    const adminProdRes = await client.query(`
      SELECT tenant_id, title 
      FROM products 
      WHERE tenant_id IN ($1, $2)
      ORDER BY tenant_id ASC
    `, [TENANT_ALPHA, TENANT_BETA]);

    expect(adminProdRes.rows.length).toBe(2);
    expect(adminProdRes.rows.map(r => r.tenant_id)).toEqual([TENANT_ALPHA, TENANT_BETA]);
  });

  test('10. Seat Credit Ledger Defense-in-Depth: Rules & Triggers Prevent Ledger Mutation Even Under RLS Scope', async () => {
    // Seed a test credit ledger entry for Tenant Alpha using admin connection
    const ledgerTxRef = `tx_adv_test_${Date.now()}`;
    const ledgerCreditId = `crd_adv_test_${Date.now()}`;

    // Insert purchase transaction first (due to foreign key)
    const purchaseRes = await client.query(`
      INSERT INTO credit_purchase_transactions (branch_id, agency_id, payment_reference, purchase_reference, quantity, unit_price_idr, subtotal_idr, tax_idr, total_idr, status)
      VALUES ($1, $2, $3, $4, 10, 30000, 300000, 33000, 333000, 'SETTLED')
      RETURNING purchase_id
    `, [BRANCH_ALPHA, TENANT_ALPHA, ledgerTxRef, ledgerTxRef]);
    const purchaseId = purchaseRes.rows[0].purchase_id;

    // Insert ledger record
    await client.query(`
      INSERT INTO seat_credit_ledger (credit_id, purchase_id, branch_id, agency_id, purchase_reference, payment_reference, amount_idr, action_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, 30000, 'PURCHASE', 'AVAILABLE')
    `, [ledgerCreditId, purchaseId, BRANCH_ALPHA, TENANT_ALPHA, ledgerTxRef, ledgerTxRef]);

    // Switch to authenticated role with Tenant Alpha's context
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [TENANT_ALPHA]);

    // Tenant Alpha can view its own ledger row
    const ledgerRead = await client.query('SELECT credit_id, agency_id, amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
    expect(ledgerRead.rows.length).toBe(1);
    expect(ledgerRead.rows[0].agency_id).toBe(TENANT_ALPHA);

    // Attempt to DELETE own ledger entry: Database immutability rule suppresses delete (rowCount = 0)
    const deleteRes = await client.query('DELETE FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
    expect(deleteRes.rowCount).toBe(0);

    // Verify row still exists in database intact
    const verifyStillExists = await client.query('SELECT credit_id, amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
    expect(verifyStillExists.rows.length).toBe(1);
    expect(verifyStillExists.rows[0].credit_id).toBe(ledgerCreditId);

    // Attempt to UPDATE own ledger entry amount: Suppressed by immutability rule/trigger (rowCount = 0)
    const updateRes = await client.query('UPDATE seat_credit_ledger SET amount_idr = 999999 WHERE credit_id = $1', [ledgerCreditId]);
    expect(updateRes.rowCount).toBe(0);

    // Verify amount_idr was NOT mutated
    const verifyUnchanged = await client.query('SELECT amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
    expect(Number(verifyUnchanged.rows[0].amount_idr)).toBe(30000);

    // Clean up ledger fixtures as admin using rule-disabling teardown
    await client.query('RESET ROLE');
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DELETE FROM seat_credit_ledger WHERE credit_id = '${ledgerCreditId}';
      DELETE FROM credit_purchase_transactions WHERE purchase_id = '${purchaseId}';

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;

      DO $$ BEGIN
        ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;
      EXCEPTION WHEN undefined_object THEN null;
      END $$;
    `);
  });
});
