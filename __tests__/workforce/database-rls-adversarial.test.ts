/**
 * __tests__/workforce/database-rls-adversarial.test.ts
 * BWM Gate 1 Round 3G: Database-Level RLS & Trusted Identity Adversarial Verification Suite
 *
 * Directives (CTO Official Mandate Round 3G — Blockers B, C, E):
 * 1. Eliminate mutable session GUC impersonation: Enforce trusted tenant identity via
 *    workforce_staging.tenant_memberships and is_trusted_tenant_member(target_tenant_id).
 * 2. Complete 12 Adversarial Scenarios:
 *    - 1. Alpha can read Alpha records.
 *    - 2. Alpha cannot read Beta records (0 rows).
 *    - 3. Alpha cannot update Beta records (rowCount = 0).
 *    - 4. Alpha cannot delete Beta records (rowCount = 0).
 *    - 5. Alpha cannot insert records for Beta (rejected with SQLSTATE 42501).
 *    - 6. Critical Anti-Impersonation Test 1: Alpha sets app.current_agency_id = 'tenant_beta' -> 0 rows.
 *    - 7. Critical Anti-Impersonation Test 2: Alpha sets app.current_tenant_id = 'tenant_beta' -> 0 rows.
 *    - 8. Missing authentication context fails closed (0 rows).
 *    - 9. Invalid or revoked identity fails closed (0 rows).
 *    - 10. Sequential transactions on same connection do not leak identity.
 *    - 11. Rollback does not preserve tenant context.
 *    - 12. Actual authenticated JWT identity is tested via request.jwt.claims matching auth.uid().
 * 3. Preserve Admin SSOT and Append-Only Ledger Protections (Zero DISABLE RULE/TRIGGER).
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';

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
  assertStagingDatabaseTarget(connStr);
  return connStr;
}

describe('BWM Gate 1 Round 3G — Database-Level RLS & Trusted Identity Adversarial Verification', () => {
  let client: Client;
  const TENANT_ALPHA = 'adv_tenant_alpha_3f';
  const TENANT_BETA = 'adv_tenant_beta_3f';
  const BRANCH_ALPHA = 'adv_branch_alpha_3f';
  const BRANCH_BETA = 'adv_branch_beta_3f';
  const PROD_ALPHA_SLUG = 'adv-prod-alpha-3f';
  const PROD_BETA_SLUG = 'adv-prod-beta-3f';

  const USER_ALPHA_ID = '11111111-1111-4111-a111-111111111111';
  const USER_BETA_ID = '22222222-2222-4222-a222-222222222222';
  const USER_REVOKED_ID = '33333333-3333-4333-a333-333333333333';

  async function cleanFixtures(pgClient: Client) {
    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
    await pgClient.query('RESET request.jwt.claim.sub');
    await pgClient.query('RESET app.current_agency_id');
    await pgClient.query('RESET app.current_tenant_id');
    // Block E: NEVER disable rules or triggers during teardown.
    // Only delete mutable test-scoped baseline rows from branch_credit_pools, products, tenants, and tenant_memberships.
    await pgClient.query(`
      DELETE FROM branch_credit_pools WHERE agency_id IN ('adv_tenant_alpha_3f', 'adv_tenant_beta_3f');
      DELETE FROM products WHERE tenant_id IN ('adv_tenant_alpha_3f', 'adv_tenant_beta_3f');
      DELETE FROM tenants WHERE slug IN ('adv_tenant_alpha_3f', 'adv_tenant_beta_3f') OR id::text IN ('adv_tenant_alpha_3f', 'adv_tenant_beta_3f');
      DELETE FROM tenant_memberships WHERE user_id IN ('11111111-1111-4111-a111-111111111111', '22222222-2222-4222-a222-222222222222', '33333333-3333-4333-a333-333333333333');
    `);
  }

  async function setAuthContext(pgClient: Client, userId: string | null, agencyId?: string, tenantId?: string) {
    await pgClient.query('SET ROLE authenticated');
    if (userId) {
      await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: userId, role: 'authenticated' })
      ]);
    } else {
      await pgClient.query("RESET request.jwt.claims");
      await pgClient.query("RESET request.jwt.claim.sub");
    }
    if (agencyId) {
      await pgClient.query("SELECT set_config('app.current_agency_id', $1, false)", [agencyId]);
    } else {
      await pgClient.query("RESET app.current_agency_id");
    }
    if (tenantId) {
      await pgClient.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    } else {
      await pgClient.query("RESET app.current_tenant_id");
    }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    await client.query('SET search_path TO public, workforce_staging');

    // Clean up any stale test fixtures cleanly without touching ledger rules/triggers
    await cleanFixtures(client);

    // 1. Seed tenants baseline
    await client.query(`
      INSERT INTO tenants (slug, name, category, tier, status, is_active, metadata)
      VALUES 
        ($1, 'Alpha Defense Systems', 'service', 'PRO_SCALE', 'active', true, '{"isolation": "ALPHA"}'),
        ($2, 'Beta Intelligence Labs', 'service', 'PRO_SCALE', 'active', true, '{"isolation": "BETA"}')
    `, [TENANT_ALPHA, TENANT_BETA]);

    // 2. Seed branch credit pools baseline
    await client.query(`
      INSERT INTO branch_credit_pools (branch_id, agency_id, available_credits, active_seats, currency)
      VALUES 
        ($1, $2, 500, 5, 'IDR'),
        ($3, $4, 1000, 10, 'IDR')
    `, [BRANCH_ALPHA, TENANT_ALPHA, BRANCH_BETA, TENANT_BETA]);

    // 3. Seed products baseline
    await client.query(`
      INSERT INTO products (tenant_id, title, slug, price, stock, category, product_type)
      VALUES
        ($1, 'Alpha Intelligence Suite', $2, 250000, 50, 'service', 'SERVICE'),
        ($3, 'Beta Operations Suite', $4, 500000, 100, 'service', 'SERVICE')
    `, [TENANT_ALPHA, PROD_ALPHA_SLUG, TENANT_BETA, PROD_BETA_SLUG]);

    // 4. Seed tenant_memberships baseline (Blocker B)
    await client.query(`
      INSERT INTO tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES
        ($1, $2, $2, 'OWNER', true),
        ($3, $4, $4, 'OWNER', true),
        ($5, $2, $2, 'MEMBER', false)
    `, [USER_ALPHA_ID, TENANT_ALPHA, USER_BETA_ID, TENANT_BETA, USER_REVOKED_ID]);
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

  test('0. Database Engine Verification: Role RLS Bypass Flags & Table Row Security', async () => {
    const authRoleRes = await client.query(`
      SELECT rolname, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = 'authenticated'
    `);
    expect(authRoleRes.rows.length).toBe(1);
    expect(authRoleRes.rows[0].rolbypassrls).toBe(false);

    const pgRoleRes = await client.query(`
      SELECT rolname, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = 'postgres'
    `);
    expect(pgRoleRes.rows.length).toBe(1);
    expect(pgRoleRes.rows[0].rolbypassrls).toBe(true);

    const tableRlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'workforce_staging' AND tablename IN ('tenants', 'branch_credit_pools', 'products', 'tenant_memberships')
    `);
    const rlsMap = Object.fromEntries(tableRlsRes.rows.map(r => [r.tablename, r.rowsecurity]));
    expect(rlsMap['tenants']).toBe(true);
    expect(rlsMap['branch_credit_pools']).toBe(true);
    expect(rlsMap['products']).toBe(true);
    expect(rlsMap['tenant_memberships']).toBe(true);
  });

  test('1. Positive Read: Alpha can read Alpha records (Pure SELECT without WHERE)', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

    // Query branch_credit_pools with ZERO WHERE filter
    const poolsRes = await client.query('SELECT branch_id, agency_id, available_credits FROM branch_credit_pools');
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

    // Query tenants with ZERO WHERE filter
    const tenantsRes = await client.query('SELECT slug, name FROM tenants');
    expect(tenantsRes.rows.length).toBe(1);
    expect(tenantsRes.rows[0].slug).toBe(TENANT_ALPHA);
    expect(tenantsRes.rows[0].name).toBe('Alpha Defense Systems');
  });

  test('1b. Positive Write & Read-After-Write: Alpha can INSERT, UPDATE, and SELECT own products under authenticated role', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

    // 1. Positive INSERT under authenticated role for own tenant
    const testSlug = `pos-crud-prod-${Date.now()}`;
    const insertRes = await client.query(`
      INSERT INTO products (tenant_id, title, slug, price, stock, category, product_type)
      VALUES ($1, 'Positive CRUD Product', $2, 180000, 20, 'service', 'SERVICE')
      RETURNING id, title, price
    `, [TENANT_ALPHA, testSlug]);
    expect(insertRes.rows.length).toBe(1);
    const prodId = insertRes.rows[0].id;
    expect(Number(insertRes.rows[0].price)).toBe(180000);

    // 2. Positive UPDATE under authenticated role for own product
    const updateRes = await client.query(
      'UPDATE products SET price = 210000 WHERE id = $1',
      [prodId]
    );
    expect(updateRes.rowCount).toBe(1);

    // 3. Positive SELECT after write under authenticated role
    const selectRes = await client.query(
      'SELECT id, title, price FROM products WHERE id = $1',
      [prodId]
    );
    expect(selectRes.rows.length).toBe(1);
    expect(Number(selectRes.rows[0].price)).toBe(210000);

    // Cleanup: Positive DELETE under authenticated role
    const deleteRes = await client.query(
      'DELETE FROM products WHERE id = $1',
      [prodId]
    );
    expect(deleteRes.rowCount).toBe(1);
  });

  test('2. Negative Cross-Tenant Read Suppression: Alpha cannot read Beta records (0 rows)', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

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

    const tenantsRes = await client.query(
      'SELECT * FROM tenants WHERE slug = $1',
      [TENANT_BETA]
    );
    expect(tenantsRes.rows.length).toBe(0);
  });

  test('3. Negative Cross-Tenant Update Suppression: Alpha cannot update Beta records (rowCount = 0)', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

    const updatePoolRes = await client.query(
      'UPDATE branch_credit_pools SET available_credits = 999999 WHERE agency_id = $1',
      [TENANT_BETA]
    );
    expect(updatePoolRes.rowCount).toBe(0);

    const updateProdRes = await client.query(
      'UPDATE products SET price = 1 WHERE tenant_id = $1',
      [TENANT_BETA]
    );
    expect(updateProdRes.rowCount).toBe(0);

    const updateTenantRes = await client.query(
      "UPDATE tenants SET name = 'Hacked by Alpha' WHERE slug = $1",
      [TENANT_BETA]
    );
    expect(updateTenantRes.rowCount).toBe(0);

    // Verify via privileged query that Tenant Beta state was NOT modified
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
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

    const verifyTenantRes = await client.query(
      'SELECT name FROM tenants WHERE slug = $1',
      [TENANT_BETA]
    );
    expect(verifyTenantRes.rows[0].name).toBe('Beta Intelligence Labs');
  });

  test('4. Negative Cross-Tenant Delete Suppression: Alpha cannot delete Beta records (rowCount = 0)', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

    const deletePoolRes = await client.query(
      'DELETE FROM branch_credit_pools WHERE agency_id = $1',
      [TENANT_BETA]
    );
    expect(deletePoolRes.rowCount).toBe(0);

    const deleteProdRes = await client.query(
      'DELETE FROM products WHERE tenant_id = $1',
      [TENANT_BETA]
    );
    expect(deleteProdRes.rowCount).toBe(0);

    const deleteTenantRes = await client.query(
      'DELETE FROM tenants WHERE slug = $1',
      [TENANT_BETA]
    );
    expect(deleteTenantRes.rowCount).toBe(0);

    // Verify via privileged query that Tenant Beta records still exist intact
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    const verifyPool = await client.query('SELECT 1 FROM branch_credit_pools WHERE branch_id = $1', [BRANCH_BETA]);
    expect(verifyPool.rows.length).toBe(1);

    const verifyProd = await client.query('SELECT 1 FROM products WHERE slug = $1', [PROD_BETA_SLUG]);
    expect(verifyProd.rows.length).toBe(1);

    const verifyTenant = await client.query('SELECT 1 FROM tenants WHERE slug = $1', [TENANT_BETA]);
    expect(verifyTenant.rows.length).toBe(1);
  });

  test('5. Negative Cross-Tenant Insert: Rejected with SQLSTATE 42501 (RLS Policy Violation)', async () => {
    await setAuthContext(client, USER_ALPHA_ID, TENANT_ALPHA, TENANT_ALPHA);

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

    let tenantError: any = null;
    try {
      await client.query(`
        INSERT INTO tenants (slug, name, category, tier)
        VALUES ($1, 'Spoofed Beta Clone', 'service', 'PRO_SCALE')
      `, [TENANT_BETA]);
    } catch (err: any) {
      tenantError = err;
    }
    expect(tenantError).not.toBeNull();
    expect(tenantError.code).toBe('42501');
  });

  test('6. Critical Anti-Impersonation Test 1: Alpha sets app.current_agency_id = "tenant_beta" -> Returns 0 Rows', async () => {
    // Authenticated as Alpha
    await setAuthContext(client, USER_ALPHA_ID);

    // Adversary attempts to spoof agency GUC to Beta
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [TENANT_BETA]);

    // Query products: must return 0 rows (proves setting GUC does not grant Beta access)
    const prodsRes = await client.query('SELECT * FROM products');
    expect(prodsRes.rows.length).toBe(0);

    // Query tenants: must return 0 rows
    const tenantsRes = await client.query('SELECT * FROM tenants');
    expect(tenantsRes.rows.length).toBe(0);

    // Query pools: must return 0 rows
    const poolsRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolsRes.rows.length).toBe(0);
  });

  test('7. Critical Anti-Impersonation Test 2: Alpha sets app.current_tenant_id = "tenant_beta" -> Returns 0 Rows', async () => {
    // Authenticated as Alpha
    await setAuthContext(client, USER_ALPHA_ID);

    // Adversary attempts to spoof tenant GUC to Beta
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_BETA]);

    // Query products: must return 0 rows
    const prodsRes = await client.query('SELECT * FROM products');
    expect(prodsRes.rows.length).toBe(0);

    // Query tenants: must return 0 rows
    const tenantsRes = await client.query('SELECT * FROM tenants');
    expect(tenantsRes.rows.length).toBe(0);

    // Query pools: must return 0 rows
    const poolsRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolsRes.rows.length).toBe(0);
  });

  test('8. Missing Authentication Context Fails Closed: Queries Return 0 Rows', async () => {
    await setAuthContext(client, null);

    const poolRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolRes.rows.length).toBe(0);

    const prodRes = await client.query('SELECT * FROM products');
    expect(prodRes.rows.length).toBe(0);

    const tenantRes = await client.query('SELECT * FROM tenants');
    expect(tenantRes.rows.length).toBe(0);

    const memberRes = await client.query('SELECT * FROM tenant_memberships');
    expect(memberRes.rows.length).toBe(0);
  });

  test('9. Invalid or Revoked Identity Fails Closed: Queries Return 0 Rows', async () => {
    // Authenticate as USER_REVOKED_ID (membership is_active = false)
    await setAuthContext(client, USER_REVOKED_ID, TENANT_ALPHA, TENANT_ALPHA);

    const poolRes = await client.query('SELECT * FROM branch_credit_pools');
    expect(poolRes.rows.length).toBe(0);

    const prodRes = await client.query('SELECT * FROM products');
    expect(prodRes.rows.length).toBe(0);

    const tenantRes = await client.query('SELECT * FROM tenants');
    expect(tenantRes.rows.length).toBe(0);
  });

  test('10. Sequential Transactions on Same Connection Do Not Leak Identity', async () => {
    // 1. Transaction 1: User Alpha executes within transaction-local context
    await client.query('BEGIN');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: USER_ALPHA_ID, role: 'authenticated' })
    ]);
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [TENANT_ALPHA]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [TENANT_ALPHA]);

    const tx1Res = await client.query('SELECT slug FROM products');
    expect(tx1Res.rows.length).toBe(1);
    expect(tx1Res.rows[0].slug).toBe(PROD_ALPHA_SLUG);
    await client.query('COMMIT');

    // 2. Immediate subsequent query on SAME physical connection outside transaction:
    // Without any manual reset, context MUST be empty and fail closed (0 rows).
    const leakCheck = await client.query('SELECT slug FROM products');
    expect(leakCheck.rows.length).toBe(0);

    // 3. Transaction 2: User Beta uses the SAME physical connection
    await client.query('BEGIN');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: USER_BETA_ID, role: 'authenticated' })
    ]);
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [TENANT_BETA]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [TENANT_BETA]);

    const tx2Res = await client.query('SELECT slug FROM products');
    expect(tx2Res.rows.length).toBe(1);
    expect(tx2Res.rows[0].slug).toBe(PROD_BETA_SLUG);
    await client.query('COMMIT');

    // 4. Verify context again automatically cleared after Transaction 2 commit
    const finalLeakCheck = await client.query('SELECT slug FROM products');
    expect(finalLeakCheck.rows.length).toBe(0);
  });

  test('11. Rollback Does Not Preserve Tenant Context', async () => {
    await client.query('BEGIN');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: USER_ALPHA_ID, role: 'authenticated' })
    ]);
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [TENANT_ALPHA]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [TENANT_ALPHA]);

    const testSlug = `tx-rollback-prod-${Date.now()}`;
    await client.query(`
      INSERT INTO products (tenant_id, title, slug, price)
      VALUES ($1, 'Rollback Test Product', $2, 99000)
    `, [TENANT_ALPHA, testSlug]);

    const inTxCheck = await client.query('SELECT slug FROM products WHERE slug = $1', [testSlug]);
    expect(inTxCheck.rows.length).toBe(1);

    await client.query('ROLLBACK');

    // After rollback: context is gone
    const postRollbackCtx = await client.query('SELECT slug FROM products');
    expect(postRollbackCtx.rows.length).toBe(0);

    // Verify row was not persisted
    await client.query('RESET ROLE');
    const postRollbackData = await client.query('SELECT 1 FROM products WHERE slug = $1', [testSlug]);
    expect(postRollbackData.rows.length).toBe(0);
  });

  test('12. Actual Authenticated JWT Identity Tested via request.jwt.claims Matching auth.uid()', async () => {
    await client.query('SET ROLE authenticated');
    await client.query('RESET app.current_agency_id');
    await client.query('RESET app.current_tenant_id');

    // Test with Alpha JWT claims
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ALPHA_ID, role: 'authenticated' })
    ]);

    const alphaUidRes = await client.query('SELECT auth.uid() as uid, auth.role() as role');
    expect(alphaUidRes.rows[0].uid).toBe(USER_ALPHA_ID);
    expect(alphaUidRes.rows[0].role).toBe('authenticated');

    const alphaProds = await client.query('SELECT tenant_id FROM products');
    expect(alphaProds.rows.length).toBe(1);
    expect(alphaProds.rows[0].tenant_id).toBe(TENANT_ALPHA);

    // Test with Beta JWT claims
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_BETA_ID, role: 'authenticated' })
    ]);

    const betaUidRes = await client.query('SELECT auth.uid() as uid, auth.role() as role');
    expect(betaUidRes.rows[0].uid).toBe(USER_BETA_ID);
    expect(betaUidRes.rows[0].role).toBe('authenticated');

    const betaProds = await client.query('SELECT tenant_id FROM products');
    expect(betaProds.rows.length).toBe(1);
    expect(betaProds.rows[0].tenant_id).toBe(TENANT_BETA);
  });

  test('13. Privileged Service-Role / Postgres Bypass Verification (Administrative SSOT)', async () => {
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');

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

  test('14. Seat Credit Ledger Defense-in-Depth: Rules & Triggers Active Under Atomic Rollback (Blocker E)', async () => {
    const triggerRes = await client.query(`
      SELECT tgname, tgenabled 
      FROM pg_trigger 
      WHERE tgname = 'trg_seat_credit_ledger_immutability'
    `);
    expect(triggerRes.rows.length).toBe(1);
    expect(triggerRes.rows[0].tgenabled).toBe('O');

    const ruleRes = await client.query(`
      SELECT rulename, ev_type, is_instead 
      FROM pg_rewrite 
      WHERE rulename = 'no_delete_seat_credit_ledger'
    `);
    expect(ruleRes.rows.length).toBe(1);
    expect(ruleRes.rows[0].is_instead).toBe(true);

    await client.query('BEGIN');
    try {
      const ledgerTxRef = `tx_adv_test_${Date.now()}`;
      const ledgerCreditId = `crd_adv_test_${Date.now()}`;

      const purchaseRes = await client.query(`
        INSERT INTO credit_purchase_transactions (branch_id, agency_id, payment_reference, purchase_reference, quantity, unit_price_idr, subtotal_idr, tax_idr, total_idr, status)
        VALUES ($1, $2, $3, $4, 10, 30000, 300000, 33000, 333000, 'SETTLED')
        RETURNING purchase_id
      `, [BRANCH_ALPHA, TENANT_ALPHA, ledgerTxRef, ledgerTxRef]);
      const purchaseId = purchaseRes.rows[0].purchase_id;

      await client.query(`
        INSERT INTO seat_credit_ledger (credit_id, purchase_id, branch_id, agency_id, purchase_reference, payment_reference, amount_idr, action_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 30000, 'PURCHASE', 'AVAILABLE')
      `, [ledgerCreditId, purchaseId, BRANCH_ALPHA, TENANT_ALPHA, ledgerTxRef, ledgerTxRef]);

      // Switch to authenticated role with Tenant Alpha's context
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USER_ALPHA_ID, role: 'authenticated' })
      ]);
      await client.query("SELECT set_config('app.current_agency_id', $1, true)", [TENANT_ALPHA]);

      const ledgerRead = await client.query('SELECT credit_id, agency_id, amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
      expect(ledgerRead.rows.length).toBe(1);
      expect(ledgerRead.rows[0].agency_id).toBe(TENANT_ALPHA);

      // Attempt to DELETE own ledger entry: Database immutability rule suppresses delete (rowCount = 0)
      const deleteRes = await client.query('DELETE FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
      expect(deleteRes.rowCount).toBe(0);

      const verifyStillExists = await client.query('SELECT credit_id, amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
      expect(verifyStillExists.rows.length).toBe(1);
      expect(verifyStillExists.rows[0].credit_id).toBe(ledgerCreditId);

      // Attempt to UPDATE own ledger entry amount: Suppressed by immutability rule/trigger (rowCount = 0)
      const updateRes = await client.query('UPDATE seat_credit_ledger SET amount_idr = 999999 WHERE credit_id = $1', [ledgerCreditId]);
      expect(updateRes.rowCount).toBe(0);

      const verifyUnchanged = await client.query('SELECT amount_idr FROM seat_credit_ledger WHERE credit_id = $1', [ledgerCreditId]);
      expect(Number(verifyUnchanged.rows[0].amount_idr)).toBe(30000);
    } finally {
      await client.query('RESET ROLE');
      await client.query('ROLLBACK');
    }
  });
});
