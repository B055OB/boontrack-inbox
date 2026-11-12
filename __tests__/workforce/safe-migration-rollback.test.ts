/**
 * __tests__/workforce/safe-migration-rollback.test.ts
 * BWM Gate 1 Round 3H: Safe Migration Rollback & Non-Regressive Security Boundary (Blocker F)
 *
 * Directives (CTO Official Mandate Round 3H — Blocker F):
 * 1. Safe Rollback Invariants:
 *    - Migration 010 DOWN must execute cleanly without error.
 *    - Down migration must NEVER restore anonymous access to raw full tables (`public.tenants`, `public.products`).
 *    - In the rolled-back state, `anon` role queries against full tables must fail closed with SQLSTATE 42501.
 * 2. Clean Reapplication (UP):
 *    - Migration 010 UP re-executes cleanly.
 *    - Publication columns (`public_storefront_enabled`, `is_publicly_published`) and per-command RLS policies are restored.
 * 3. Security Boundary Verification:
 *    - Proves that `anon` cannot access full private tables before, during, or after rollback.
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';

function getDatabaseConnectionString(): string {
  if (process.env.DISPOSABLE_POSTGRES_URL) {
    return process.env.DISPOSABLE_POSTGRES_URL.trim();
  }
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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for rollback tests');
  }
  assertStagingDatabaseTarget(connStr);
  return connStr;
}

describe('BWM Gate 1 Round 3H — Safe Migration Rollback (Blocker F)', () => {
  let client: Client;

  const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
  const readMigrationSql = (filename: string): string =>
    fs.readFileSync(path.join(migrationsDir, filename), 'utf8');

  const up009Sql = readMigrationSql('009_trusted_tenant_identity_and_safe_views.sql');
  const down009Sql = readMigrationSql('009_trusted_tenant_identity_and_safe_views.down.sql');
  const upSql = readMigrationSql('010_strict_storefront_opt_in_and_role_authorization.sql');
  const downSql = readMigrationSql('010_strict_storefront_opt_in_and_role_authorization.down.sql');
  const up011Sql = readMigrationSql('011_create_workforce_operational_tables.sql');
  const down011Sql = readMigrationSql('011_create_workforce_operational_tables.down.sql');
  const up012Sql = readMigrationSql('012_create_workforce_revocation_and_authz_versioning.sql');
  const down012Sql = readMigrationSql('012_create_workforce_revocation_and_authz_versioning.down.sql');
  const up013Sql = readMigrationSql('013_attendance_atomic_state_rpc.sql');
  const down013Sql = readMigrationSql('013_attendance_atomic_state_rpc.down.sql');
  const up014Sql = readMigrationSql('014_checkpoint_scan_atomic_rpc.sql');
  const down014Sql = readMigrationSql('014_checkpoint_scan_atomic_rpc.down.sql');
  const up015Sql = readMigrationSql('015_attendance_actor_binding_and_role_allowlist.sql');
  const down015Sql = readMigrationSql('015_attendance_actor_binding_and_role_allowlist.down.sql');
  const up016Sql = readMigrationSql('016_bwm_domain_authorization_isolation.sql');
  const down016Sql = readMigrationSql('016_bwm_domain_authorization_isolation.down.sql');

  async function ensureFullMigrationsRestored(pgClient: Client): Promise<void> {
    await pgClient.query('RESET ROLE');
    const has016 = await pgClient.query(
      "SELECT to_regprocedure('workforce_staging.is_trusted_commerce_member(text,text)') IS NOT NULL AS exists"
    );
    if (has016.rows[0].exists) {
      await pgClient.query(down016Sql);
    }
    const has015 = await pgClient.query(
      "SELECT to_regprocedure('workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)') IS NOT NULL AS exists"
    );
    if (has015.rows[0].exists) {
      await pgClient.query(down015Sql);
    }
    const has014 = await pgClient.query(
      "SELECT to_regprocedure('workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)') IS NOT NULL AS exists"
    );
    if (has014.rows[0].exists) {
      await pgClient.query(down014Sql);
    }
    const has013 = await pgClient.query(
      "SELECT to_regprocedure('workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)') IS NOT NULL AS exists"
    );
    if (has013.rows[0].exists) {
      await pgClient.query(down013Sql);
    }
    const has012 = await pgClient.query(`
      SELECT count(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'workforce_staging'
        AND table_name IN ('tenants', 'tenant_memberships')
        AND column_name = 'authz_version'
    `);
    if (has012.rows[0].cnt > 0) {
      await pgClient.query('DROP VIEW IF EXISTS public.tenant_memberships');
      await pgClient.query(down012Sql);
    }
    await pgClient.query(up009Sql);
    await pgClient.query(upSql);

    // Migration 011 creates rls_credential_audit_logs_insert without DROP POLICY IF EXISTS;
    // execute 011 UP whenever operational tables were rolled back so re-apply stays idempotent.
    const opsCheck = await pgClient.query(`
      SELECT count(*)::int AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'workforce_staging'
        AND table_name IN ('personnel', 'credential_audit_logs')
    `);
    if (opsCheck.rows[0].cnt < 2) {
      await pgClient.query(up011Sql);
    }

    await pgClient.query(up012Sql);
    await pgClient.query(up013Sql);
    await pgClient.query(up014Sql);
    await pgClient.query(up015Sql);
    await pgClient.query(up016Sql);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    await client.query('SET search_path TO workforce_staging, public');
    await ensureFullMigrationsRestored(client);
    await client.query(
      "DELETE FROM workforce_staging.products WHERE id IN ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')"
    );
  }, 30000);

  afterAll(async () => {
    // ALWAYS ensure migrations 009-013 UP are applied and verified at completion
    if (client) {
      try {
        await ensureFullMigrationsRestored(client);
      } finally {
        await client.end();
      }
    }
  }, 30000);

  test('1. Migration 010 DOWN Executes Cleanly Without Regressions', async () => {
    await client.query('RESET ROLE');
    await expect(client.query(downSql)).resolves.toBeDefined();

    // Verify columns dropped
    const colCheck = await client.query(`
      SELECT column_name, table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'workforce_staging' 
        AND column_name IN ('public_storefront_enabled', 'is_publicly_published')
    `);
    expect(colCheck.rows.length).toBe(0);
  });

  test('2. In Rolled-Back State: Anonymous Access to Full Tables Remains Strictly Revoked', async () => {
    await client.query('SET ROLE anon');

    // A. Direct table access strictly denied
    let anonDirectTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM workforce_staging.tenants LIMIT 1');
    } catch (err) {
      anonDirectTenantsErr = err;
    }
    expect(anonDirectTenantsErr).toBeDefined();
    expect(anonDirectTenantsErr.code).toBe('42501');

    let anonDirectProdsErr: any = null;
    try {
      await client.query('SELECT * FROM workforce_staging.products LIMIT 1');
    } catch (err) {
      anonDirectProdsErr = err;
    }
    expect(anonDirectProdsErr).toBeDefined();
    expect(anonDirectProdsErr.code).toBe('42501');

    // B. Base public views access strictly denied
    let anonBaseTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM public.tenants LIMIT 1');
    } catch (err) {
      anonBaseTenantsErr = err;
    }
    expect(anonBaseTenantsErr).toBeDefined();
    expect(anonBaseTenantsErr.code).toBe('42501');

    let anonBaseProdsErr: any = null;
    try {
      await client.query('SELECT * FROM public.products LIMIT 1');
    } catch (err) {
      anonBaseProdsErr = err;
    }
    expect(anonBaseProdsErr).toBeDefined();
    expect(anonBaseProdsErr.code).toBe('42501');

    // C. Storefront projections in rolled-back state strictly REVOKED from anon (Default-Deny Round 3I)
    let anonSfTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM public.storefront_tenants LIMIT 1');
    } catch (err) {
      anonSfTenantsErr = err;
    }
    expect(anonSfTenantsErr).toBeDefined();
    expect(anonSfTenantsErr.code).toBe('42501');

    let anonSfProdsErr: any = null;
    try {
      await client.query('SELECT * FROM public.storefront_products LIMIT 1');
    } catch (err) {
      anonSfProdsErr = err;
    }
    expect(anonSfProdsErr).toBeDefined();
    expect(anonSfProdsErr.code).toBe('42501');

    await client.query('RESET ROLE');
  });

  test('2b. In Rolled-Back State: Authenticated Users Cannot Perform Unrestricted DML and Fail Closed', async () => {
    await client.query('SET ROLE authenticated');

    // Unrestricted mutations on base views are strictly revoked in rolled-back state (Round 3J Blocker 6)
    let authTenantsMutateErr: any = null;
    try {
      await client.query("UPDATE public.tenants SET name = 'Attacker Compromised' WHERE id = '00000000-0000-0000-0000-000000000000'");
    } catch (err) {
      authTenantsMutateErr = err;
    }
    expect(authTenantsMutateErr).toBeDefined();
    expect(authTenantsMutateErr.code).toBe('42501');

    let authProductsMutateErr: any = null;
    try {
      await client.query("INSERT INTO public.products (tenant_id, title, slug) VALUES ('00000000-0000-0000-0000-000000000000', 'Illegal', 'illegal')");
    } catch (err) {
      authProductsMutateErr = err;
    }
    expect(authProductsMutateErr).toBeDefined();
    expect(authProductsMutateErr.code).toBe('42501');

    await client.query('RESET ROLE');
  });

  test('2c. In Rolled-Back State: Authenticated Users Cannot Query or Scrape Storefront Views (Round 3K)', async () => {
    await client.query('SET ROLE authenticated');

    // Storefront projections in rolled-back state strictly REVOKED from authenticated users (Round 3K)
    let authSfTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM public.storefront_tenants LIMIT 1');
    } catch (err) {
      authSfTenantsErr = err;
    }
    expect(authSfTenantsErr).toBeDefined();
    expect(authSfTenantsErr.code).toBe('42501');

    let authSfProdsErr: any = null;
    try {
      await client.query('SELECT * FROM public.storefront_products LIMIT 1');
    } catch (err) {
      authSfProdsErr = err;
    }
    expect(authSfProdsErr).toBeDefined();
    expect(authSfProdsErr.code).toBe('42501');

    await client.query('RESET ROLE');
  });

  test('2d. In Rolled-Back State: Revoked Membership with Stale JWT Fails Closed (Round 3L)', async () => {
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');

    const testTenantSlug = `rb-stale-${Date.now()}`;
    const testUserId = '88888888-8888-4888-8888-888888888888';

    // 1. Seed tenant baseline and revoked membership (is_active = FALSE)
    await client.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, is_active)
      VALUES ($1, 'Rollback Stale Test Tenant', 'service', 'PRO_SCALE', 'active', TRUE)
    `, [testTenantSlug]);

    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES ($1, $2, $2, 'MERCHANT', FALSE)
    `, [testUserId, testTenantSlug]);

    // 2. Set claims with matching tenant claim in app_metadata
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: testUserId,
        role: 'authenticated',
        app_metadata: { tenant_id: testTenantSlug },
      }),
    ]);

    // 3. Query is_trusted_tenant_member in 010 DOWN state
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [testTenantSlug]
    );
    // JWT claim alone MUST NOT grant access without an active DB membership!
    expect(checkRes.rows[0].is_member).toBe(false);

    // Clean up
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [testTenantSlug]);
    await client.query('DELETE FROM workforce_staging.tenants WHERE slug = $1', [testTenantSlug]);
  });

  test('2e. In Rolled-Back State: Full Role Matrix on Credit Pool Mutations (OWNER Permitted, MERCHANT/CS/OPERATOR Denied) (Round 3M)', async () => {
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_agency_id');

    const testTenantSlug = `rb-pool-${Date.now()}`;
    const ownerUserId = '99999999-9999-4999-9999-999999999991';
    const merchantUserId = '99999999-9999-4999-9999-999999999992';
    const operatorUserId = '99999999-9999-4999-9999-999999999993';
    const csUserId = '99999999-9999-4999-9999-999999999994';
    const branchPoolId = `pool-rb-${Date.now()}`;
    const ownerBranchPoolId = `pool-rb-owner-${Date.now()}`;

    // 1. Seed tenant baseline, memberships, and credit pool
    await client.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, is_active)
      VALUES ($1, 'Rollback Pool Test Tenant', 'service', 'PRO_SCALE', 'active', TRUE)
    `, [testTenantSlug]);

    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES 
        ($1, $5, $5, 'OWNER', TRUE),
        ($2, $5, $5, 'MERCHANT', TRUE),
        ($3, $5, $5, 'OPERATOR', TRUE),
        ($4, $5, $5, 'CS', TRUE)
    `, [ownerUserId, merchantUserId, operatorUserId, csUserId, testTenantSlug]);

    await client.query(`
      INSERT INTO workforce_staging.branch_credit_pools (branch_id, agency_id, available_credits, active_seats, currency)
      VALUES ($1, $2, 500, 5, 'IDR')
    `, [branchPoolId, testTenantSlug]);

    // Helper to test non-owner role denial across all mutations
    const assertNonOwnerDenial = async (userId: string, roleName: string) => {
      await client.query('RESET ROLE');
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({
          sub: userId,
          role: 'authenticated',
          app_metadata: { tenant_id: testTenantSlug },
        }),
      ]);
      await client.query("SELECT set_config('app.current_agency_id', $1, false)", [testTenantSlug]);

      // A. Can SELECT credit pools
      const readPool = await client.query(
        'SELECT available_credits FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
        [branchPoolId]
      );
      expect(readPool.rows.length).toBe(1);
      expect(readPool.rows[0].available_credits).toBe(500);

      // B. CANNOT UPDATE credit pools (affects 0 rows under RLS)
      const updateRes = await client.query(
        'UPDATE workforce_staging.branch_credit_pools SET available_credits = 99999 WHERE branch_id = $1',
        [branchPoolId]
      );
      expect(updateRes.rowCount).toBe(0);

      // C. CANNOT DELETE credit pools (affects 0 rows under RLS)
      const deleteRes = await client.query(
        'DELETE FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
        [branchPoolId]
      );
      expect(deleteRes.rowCount).toBe(0);

      // D. CANNOT INSERT credit pools (fails closed with 42501)
      let insertErr: any = null;
      try {
        await client.query(`
          INSERT INTO workforce_staging.branch_credit_pools (branch_id, agency_id, available_credits)
          VALUES ($1, $2, 1000)
        `, [`illegal_${roleName.toLowerCase()}_pool`, testTenantSlug]);
      } catch (err: any) {
        insertErr = err;
      }
      expect(insertErr).not.toBeNull();
      expect(insertErr.code).toBe('42501');
    };

    // 2. Test Non-Owner Roles (MERCHANT, OPERATOR, CS)
    await assertNonOwnerDenial(merchantUserId, 'MERCHANT');
    await assertNonOwnerDenial(operatorUserId, 'OPERATOR');
    await assertNonOwnerDenial(csUserId, 'CS');

    // 3. Test OWNER Role
    await client.query('RESET ROLE');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: ownerUserId,
        role: 'authenticated',
        app_metadata: { tenant_id: testTenantSlug },
      }),
    ]);
    await client.query("SELECT set_config('app.current_agency_id', $1, false)", [testTenantSlug]);

    // A. OWNER can SELECT
    const ownerRead = await client.query(
      'SELECT available_credits FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
      [branchPoolId]
    );
    expect(ownerRead.rows.length).toBe(1);
    expect(ownerRead.rows[0].available_credits).toBe(500);

    // B. OWNER can INSERT
    await client.query(`
      INSERT INTO workforce_staging.branch_credit_pools (branch_id, agency_id, available_credits, active_seats, currency)
      VALUES ($1, $2, 1000, 10, 'IDR')
    `, [ownerBranchPoolId, testTenantSlug]);

    const ownerVerifyInsert = await client.query(
      'SELECT available_credits FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
      [ownerBranchPoolId]
    );
    expect(ownerVerifyInsert.rows.length).toBe(1);
    expect(ownerVerifyInsert.rows[0].available_credits).toBe(1000);

    // C. OWNER can UPDATE
    const ownerUpdateRes = await client.query(
      'UPDATE workforce_staging.branch_credit_pools SET available_credits = 750 WHERE branch_id = $1',
      [branchPoolId]
    );
    expect(ownerUpdateRes.rowCount).toBe(1);

    const verifyOwnerUpdate = await client.query(
      'SELECT available_credits FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
      [branchPoolId]
    );
    expect(verifyOwnerUpdate.rows[0].available_credits).toBe(750);

    // D. OWNER can DELETE
    const ownerDeleteRes = await client.query(
      'DELETE FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
      [ownerBranchPoolId]
    );
    expect(ownerDeleteRes.rowCount).toBe(1);

    const verifyOwnerDelete = await client.query(
      'SELECT 1 FROM workforce_staging.branch_credit_pools WHERE branch_id = $1',
      [ownerBranchPoolId]
    );
    expect(verifyOwnerDelete.rows.length).toBe(0);

    // Clean up
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_agency_id');
    await client.query('DELETE FROM workforce_staging.branch_credit_pools WHERE branch_id IN ($1, $2)', [branchPoolId, ownerBranchPoolId]);
    await client.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [testTenantSlug]);
    await client.query('DELETE FROM workforce_staging.tenants WHERE slug = $1', [testTenantSlug]);
  });

  test('2f. In Rolled-Back State: Legitimate Tenant Read Access Restored & Cross-Tenant Read Boundary Enforced (Round 3M/3N)', async () => {
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_tenant_id');
    await client.query('RESET app.current_agency_id');

    const tenantASlug = `rb-read-a-${Date.now()}`;
    const tenantBSlug = `rb-read-b-${Date.now()}`;
    const userAId = '77777777-7777-4777-8777-777777777771';
    const ownerAId = '77777777-7777-4777-8777-777777777772';
    const prodAId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const prodBId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

    // 1. Seed two distinct tenants
    const tenantAInsert = await client.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, is_active, phone)
      VALUES ($1, 'Tenant Alpha (Legitimate)', 'service', 'PRO_SCALE', 'active', TRUE, '+62811111111')
      RETURNING id
    `, [tenantASlug]);
    const tenantAId = tenantAInsert.rows[0].id;

    const tenantBInsert = await client.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, is_active, phone)
      VALUES ($1, 'Tenant Beta (Isolated)', 'service', 'PRO_SCALE', 'active', TRUE, '+62822222222')
      RETURNING id
    `, [tenantBSlug]);
    const tenantBId = tenantBInsert.rows[0].id;

    // 2. Seed memberships: User A (MERCHANT) and Owner A (OWNER) belong to Tenant A
    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES 
        ($1, $2, $3, 'MERCHANT', TRUE),
        ($4, $2, $3, 'OWNER', TRUE)
    `, [userAId, tenantASlug, tenantASlug, ownerAId]);

    // 3. Seed products for both tenants
    await client.query(`
      INSERT INTO workforce_staging.products (id, tenant_id, title, slug, price, stock, is_active, status)
      VALUES 
        ($1, $2, 'Alpha Product', 'alpha-prod', 100000, 10, TRUE, 'ACTIVE'),
        ($3, $4, 'Beta Product', 'beta-prod', 200000, 20, TRUE, 'ACTIVE')
    `, [prodAId, tenantASlug, prodBId, tenantBSlug]);

    // 4. Authenticate as User A (MERCHANT)
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: userAId,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantASlug },
      }),
    ]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantASlug]);

    // A. Positive Read: User A (MERCHANT) can read their own tenant, but phone is MASKED (NULL) (Round 3N)
    const readOwnTenant = await client.query('SELECT id, slug, name, phone FROM public.tenants WHERE slug = $1', [tenantASlug]);
    expect(readOwnTenant.rows.length).toBe(1);
    expect(readOwnTenant.rows[0].slug).toBe(tenantASlug);
    expect(readOwnTenant.rows[0].name).toBe('Tenant Alpha (Legitimate)');
    expect(readOwnTenant.rows[0].phone).toBeNull();

    // B. Positive Control: OWNER querying the same tenant row DOES receive unmasked phone (Round 3N)
    await client.query('RESET ROLE');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: ownerAId,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantASlug },
      }),
    ]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantASlug]);

    const readOwnerTenant = await client.query('SELECT id, slug, name, phone FROM public.tenants WHERE slug = $1', [tenantASlug]);
    expect(readOwnerTenant.rows.length).toBe(1);
    expect(readOwnerTenant.rows[0].phone).toBe('+62811111111');

    // Return to User A (MERCHANT) context
    await client.query('RESET ROLE');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: userAId,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantASlug },
      }),
    ]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantASlug]);

    // C. Positive Read: User A can read their own products via public.products view in rolled-back state
    const readOwnProducts = await client.query('SELECT id, tenant_id, title, price FROM public.products WHERE tenant_id = $1', [tenantASlug]);
    expect(readOwnProducts.rows.length).toBe(1);
    expect(readOwnProducts.rows[0].id).toBe(prodAId);
    expect(readOwnProducts.rows[0].title).toBe('Alpha Product');

    // D. Cross-Tenant Adversarial Read: User A CANNOT see Tenant B via public.tenants view (filtered by row-level WHERE)
    const crossTenantRead = await client.query('SELECT * FROM public.tenants WHERE slug = $1', [tenantBSlug]);
    expect(crossTenantRead.rows.length).toBe(0);

    // E. Cross-Tenant Adversarial Read: User A CANNOT see Tenant B products via public.products view
    const crossProductRead = await client.query('SELECT * FROM public.products WHERE tenant_id = $1', [tenantBSlug]);
    expect(crossProductRead.rows.length).toBe(0);

    // F. Unfiltered view read: User A querying with zero WHERE filter only gets Tenant A rows
    const allVisibleTenants = await client.query('SELECT slug FROM public.tenants WHERE slug IN ($1, $2)', [tenantASlug, tenantBSlug]);
    expect(allVisibleTenants.rows.length).toBe(1);
    expect(allVisibleTenants.rows[0].slug).toBe(tenantASlug);

    const allVisibleProds = await client.query('SELECT tenant_id FROM public.products WHERE tenant_id IN ($1, $2)', [tenantASlug, tenantBSlug]);
    expect(allVisibleProds.rows.length).toBe(1);
    expect(allVisibleProds.rows[0].tenant_id).toBe(tenantASlug);

    // G. Direct table access remains strictly revoked (SQLSTATE 42501)
    let directTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM workforce_staging.tenants WHERE slug = $1', [tenantASlug]);
    } catch (err: any) {
      directTenantsErr = err;
    }
    expect(directTenantsErr).not.toBeNull();
    expect(directTenantsErr.code).toBe('42501');

    let directProdsErr: any = null;
    try {
      await client.query('SELECT * FROM workforce_staging.products WHERE tenant_id = $1', [tenantASlug]);
    } catch (err: any) {
      directProdsErr = err;
    }
    expect(directProdsErr).not.toBeNull();
    expect(directProdsErr.code).toBe('42501');

    // Clean up
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_tenant_id');
    await client.query('DELETE FROM workforce_staging.products WHERE id IN ($1, $2)', [prodAId, prodBId]);
    await client.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [tenantASlug]);
    await client.query('DELETE FROM workforce_staging.tenants WHERE id IN ($1, $2)', [tenantAId, tenantBId]);
  });

  test('2g. In Rolled-Back State: Full 4-Role Column Masking Matrix & Outsider Isolation (Round 3N)', async () => {
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_tenant_id');
    await client.query('RESET app.current_agency_id');

    const tenantSlug = `rb-matrix-${Date.now()}`;
    const prodId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const ownerId = '11111111-1111-4111-8111-111111111111';
    const merchantId = '22222222-2222-4222-8222-222222222222';
    const operatorId = '33333333-3333-4333-8333-333333333333';
    const csId = '44444444-4444-4444-8444-444444444444';
    const outsiderId = '55555555-5555-4555-8555-555555555555';

    // 1. Seed tenant with sensitive data
    await client.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active,
        phone, whatsapp_number, waba_phone_number_id, telegram_chat_id, metadata
      )
      VALUES (
        $1, 'Matrix 4-Role Test Tenant', 'service', 'PRO_SCALE', 'active', TRUE,
        '+6281234567890', '+6281234567891', 'waba_secret_id_123', 'tg_secret_chat_456', '{"sensitive_plan":"pro_enterprise"}'::jsonb
      )
    `, [tenantSlug]);

    // 2. Seed product with sensitive fields
    await client.query(`
      INSERT INTO workforce_staging.products (
        id, tenant_id, title, slug, price, stock, is_active, status,
        asset_reference, license_status, fulfillment_metadata
      )
      VALUES (
        $1, $2, 'Matrix Protected Product', 'matrix-prod', 250000, 50, TRUE, 'ACTIVE',
        'vault://credentials/license-key-abc', 'COMMERCIAL_LICENSED', '{"download_key":"enc_xyz987"}'::jsonb
      )
    `, [prodId, tenantSlug]);

    // 3. Seed memberships for 4 roles
    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES
        ($1, $5, $5, 'OWNER', TRUE),
        ($2, $5, $5, 'MERCHANT', TRUE),
        ($3, $5, $5, 'OPERATOR', TRUE),
        ($4, $5, $5, 'CS', TRUE)
    `, [ownerId, merchantId, operatorId, csId, tenantSlug]);

    const setAuthContext = async (userId: string) => {
      await client.query('RESET ROLE');
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({
          sub: userId,
          role: 'authenticated',
          app_metadata: { tenant_id: tenantSlug },
        }),
      ]);
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantSlug]);
    };

    // --- A. OWNER Role Verification ---
    await setAuthContext(ownerId);
    const ownerTenantRes = await client.query(`
      SELECT id, slug, metadata, phone, whatsapp_number, waba_phone_number_id, telegram_chat_id 
      FROM public.tenants WHERE slug = $1
    `, [tenantSlug]);
    expect(ownerTenantRes.rows.length).toBe(1);
    expect(ownerTenantRes.rows[0].phone).toBe('+6281234567890');
    expect(ownerTenantRes.rows[0].whatsapp_number).toBe('+6281234567891');
    expect(ownerTenantRes.rows[0].waba_phone_number_id).toBe('waba_secret_id_123');
    expect(ownerTenantRes.rows[0].telegram_chat_id).toBe('tg_secret_chat_456');
    expect(ownerTenantRes.rows[0].metadata).not.toBeNull();

    const ownerProdRes = await client.query(`
      SELECT id, tenant_id, asset_reference, license_status, fulfillment_metadata
      FROM public.products WHERE id = $1
    `, [prodId]);
    expect(ownerProdRes.rows.length).toBe(1);
    expect(ownerProdRes.rows[0].asset_reference).toBe('vault://credentials/license-key-abc');
    expect(ownerProdRes.rows[0].license_status).toBe('COMMERCIAL_LICENSED');
    expect(ownerProdRes.rows[0].fulfillment_metadata).not.toBeNull();

    // --- B. MERCHANT Role Verification ---
    await setAuthContext(merchantId);
    const merchantTenantRes = await client.query(`
      SELECT id, slug, metadata, phone, whatsapp_number, waba_phone_number_id, telegram_chat_id 
      FROM public.tenants WHERE slug = $1
    `, [tenantSlug]);
    expect(merchantTenantRes.rows.length).toBe(1);
    // Tenant sensitive columns MUST be MASKED (NULL) for MERCHANT
    expect(merchantTenantRes.rows[0].phone).toBeNull();
    expect(merchantTenantRes.rows[0].whatsapp_number).toBeNull();
    expect(merchantTenantRes.rows[0].waba_phone_number_id).toBeNull();
    expect(merchantTenantRes.rows[0].telegram_chat_id).toBeNull();
    expect(merchantTenantRes.rows[0].metadata).toBeNull();

    const merchantProdRes = await client.query(`
      SELECT id, tenant_id, asset_reference, license_status, fulfillment_metadata
      FROM public.products WHERE id = $1
    `, [prodId]);
    expect(merchantProdRes.rows.length).toBe(1);
    // Product sensitive columns MUST be UNMASKED for MERCHANT
    expect(merchantProdRes.rows[0].asset_reference).toBe('vault://credentials/license-key-abc');
    expect(merchantProdRes.rows[0].license_status).toBe('COMMERCIAL_LICENSED');
    expect(merchantProdRes.rows[0].fulfillment_metadata).not.toBeNull();

    // --- C. OPERATOR Role Verification ---
    await setAuthContext(operatorId);
    const opTenantRes = await client.query(`
      SELECT id, slug, metadata, phone, whatsapp_number, waba_phone_number_id, telegram_chat_id 
      FROM public.tenants WHERE slug = $1
    `, [tenantSlug]);
    expect(opTenantRes.rows.length).toBe(1);
    // Tenant sensitive columns MUST be MASKED (NULL) for OPERATOR
    expect(opTenantRes.rows[0].phone).toBeNull();
    expect(opTenantRes.rows[0].whatsapp_number).toBeNull();
    expect(opTenantRes.rows[0].waba_phone_number_id).toBeNull();
    expect(opTenantRes.rows[0].telegram_chat_id).toBeNull();
    expect(opTenantRes.rows[0].metadata).toBeNull();

    const opProdRes = await client.query(`
      SELECT id, tenant_id, asset_reference, license_status, fulfillment_metadata
      FROM public.products WHERE id = $1
    `, [prodId]);
    expect(opProdRes.rows.length).toBe(1);
    // Product sensitive columns MUST be MASKED (NULL) for OPERATOR
    expect(opProdRes.rows[0].asset_reference).toBeNull();
    expect(opProdRes.rows[0].license_status).toBeNull();
    expect(opProdRes.rows[0].fulfillment_metadata).toBeNull();

    // --- D. CS Role Verification ---
    await setAuthContext(csId);
    const csTenantRes = await client.query(`
      SELECT id, slug, metadata, phone, whatsapp_number, waba_phone_number_id, telegram_chat_id 
      FROM public.tenants WHERE slug = $1
    `, [tenantSlug]);
    expect(csTenantRes.rows.length).toBe(1);
    // Tenant sensitive columns MUST be MASKED (NULL) for CS
    expect(csTenantRes.rows[0].phone).toBeNull();
    expect(csTenantRes.rows[0].whatsapp_number).toBeNull();
    expect(csTenantRes.rows[0].waba_phone_number_id).toBeNull();
    expect(csTenantRes.rows[0].telegram_chat_id).toBeNull();
    expect(csTenantRes.rows[0].metadata).toBeNull();

    const csProdRes = await client.query(`
      SELECT id, tenant_id, asset_reference, license_status, fulfillment_metadata
      FROM public.products WHERE id = $1
    `, [prodId]);
    expect(csProdRes.rows.length).toBe(1);
    // Product sensitive columns MUST be MASKED (NULL) for CS
    expect(csProdRes.rows[0].asset_reference).toBeNull();
    expect(csProdRes.rows[0].license_status).toBeNull();
    expect(csProdRes.rows[0].fulfillment_metadata).toBeNull();

    // --- E. OUTSIDER Role Verification (Row-Level Filtering) ---
    await client.query('RESET ROLE');
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: outsiderId,
        role: 'authenticated',
        app_metadata: { tenant_id: 'some_other_tenant' },
      }),
    ]);
    await client.query("SELECT set_config('app.current_tenant_id', 'some_other_tenant', false)");

    const outsiderTenantRes = await client.query(`SELECT * FROM public.tenants WHERE slug = $1`, [tenantSlug]);
    expect(outsiderTenantRes.rows.length).toBe(0);

    const outsiderProdRes = await client.query(`SELECT * FROM public.products WHERE id = $1`, [prodId]);
    expect(outsiderProdRes.rows.length).toBe(0);

    // --- F. ANON Role Verification (Default-Deny) ---
    await client.query('RESET ROLE');
    await client.query('SET ROLE anon');

    let anonTenantErr: any = null;
    try {
      await client.query(`SELECT * FROM public.tenants WHERE slug = $1`, [tenantSlug]);
    } catch (err: any) {
      anonTenantErr = err;
    }
    expect(anonTenantErr).not.toBeNull();
    expect(anonTenantErr.code).toBe('42501');

    let anonProdErr: any = null;
    try {
      await client.query(`SELECT * FROM public.products WHERE id = $1`, [prodId]);
    } catch (err: any) {
      anonProdErr = err;
    }
    expect(anonProdErr).not.toBeNull();
    expect(anonProdErr.code).toBe('42501');

    // Clean up
    await client.query('RESET ROLE');
    await client.query('RESET request.jwt.claims');
    await client.query('RESET app.current_tenant_id');
    await client.query('DELETE FROM workforce_staging.products WHERE id = $1', [prodId]);
    await client.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [tenantSlug]);
    await client.query('DELETE FROM workforce_staging.tenants WHERE slug = $1', [tenantSlug]);
  });

  test('3. Migration 010 UP Reapplies Cleanly and Restores Publications and Policies', async () => {
    await client.query('RESET ROLE');
    await expect(client.query(upSql)).resolves.toBeDefined();

    // Verify columns restored
    const colCheck = await client.query(`
      SELECT column_name, table_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'workforce_staging' 
        AND column_name IN ('public_storefront_enabled', 'is_publicly_published')
      ORDER BY column_name
    `);
    expect(colCheck.rows.length).toBe(2);
    expect(colCheck.rows.find(r => r.column_name === 'public_storefront_enabled')).toBeDefined();
    expect(colCheck.rows.find(r => r.column_name === 'is_publicly_published')).toBeDefined();

    // Verify per-command policies restored
    const polCheck = await client.query(`
      SELECT policyname, tablename, cmd 
      FROM pg_policies 
      WHERE schemaname = 'workforce_staging' 
        AND tablename IN ('tenants', 'products', 'branch_credit_pools')
      ORDER BY tablename, cmd
    `);
    const polMap = new Set(polCheck.rows.map(r => `${r.tablename}:${r.cmd}`));
    expect(polMap.has('tenants:SELECT')).toBe(true);
    expect(polMap.has('tenants:INSERT')).toBe(true);
    expect(polMap.has('tenants:UPDATE')).toBe(true);
    expect(polMap.has('tenants:DELETE')).toBe(true);

    expect(polMap.has('products:SELECT')).toBe(true);
    expect(polMap.has('products:INSERT')).toBe(true);
    expect(polMap.has('products:UPDATE')).toBe(true);
    expect(polMap.has('products:DELETE')).toBe(true);

    expect(polMap.has('branch_credit_pools:SELECT')).toBe(true);
    expect(polMap.has('branch_credit_pools:INSERT')).toBe(true);
    expect(polMap.has('branch_credit_pools:UPDATE')).toBe(true);
    expect(polMap.has('branch_credit_pools:DELETE')).toBe(true);
  });

  test('4. Post-Reapplication Security Boundary: Anonymous Full-Table Denial Maintained', async () => {
    await client.query('SET ROLE anon');

    // A. Direct full tables deny anon
    let directTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM workforce_staging.tenants LIMIT 1');
    } catch (err) {
      directTenantsErr = err;
    }
    expect(directTenantsErr).toBeDefined();
    expect(directTenantsErr.code).toBe('42501');

    // B. Base views deny anon
    let baseTenantsErr: any = null;
    try {
      await client.query('SELECT * FROM public.tenants LIMIT 1');
    } catch (err) {
      baseTenantsErr = err;
    }
    expect(baseTenantsErr).toBeDefined();
    expect(baseTenantsErr.code).toBe('42501');

    let baseProdsErr: any = null;
    try {
      await client.query('SELECT * FROM public.products LIMIT 1');
    } catch (err) {
      baseProdsErr = err;
    }
    expect(baseProdsErr).toBeDefined();
    expect(baseProdsErr.code).toBe('42501');

    // C. Storefront safe projections permitted for anon
    const sfTenants = await client.query('SELECT COUNT(*)::int AS count FROM public.storefront_tenants');
    expect(sfTenants.rows[0].count).toBeGreaterThanOrEqual(0);

    const sfProds = await client.query('SELECT COUNT(*)::int AS count FROM public.storefront_products');
    expect(sfProds.rows[0].count).toBeGreaterThanOrEqual(0);

    await client.query('RESET ROLE');
  });

  test('5. Safe Migration 009 Rollback: Eliminates GUC Impersonation & Fails Closed (Round 3I)', async () => {
    await client.query('RESET ROLE');

    try {
      // Symmetrical FK-safe rollback order: 016 -> 015 -> 014 -> 013 -> 012 -> 011 -> 010 -> 009
      // Note: Test 3 re-applied 010 UP while 012 (authz_version) was active, causing 010's
      // `SELECT * FROM workforce_staging.tenant_memberships` view to bind to 012's column.
      // Drop the 010 view prior to 012 DOWN so 012->011->010->009 rollback is clean.
      await expect(client.query(down016Sql)).resolves.toBeDefined();
      await expect(client.query(down015Sql)).resolves.toBeDefined();
      await expect(client.query(down014Sql)).resolves.toBeDefined();
      await expect(client.query(down013Sql)).resolves.toBeDefined();
      await client.query('DROP VIEW IF EXISTS public.tenant_memberships');
      await expect(client.query(down012Sql)).resolves.toBeDefined();
      await expect(client.query(down011Sql)).resolves.toBeDefined();
      await expect(client.query(downSql)).resolves.toBeDefined();
      await expect(client.query(down009Sql)).resolves.toBeDefined();

      // Verify in 009 rolled-back state that GUC-only impersonation does NOT grant access
      await client.query('SET ROLE authenticated');
      await client.query("SET app.current_tenant_id = 'solusi-ads'");
      let gucBlocked = false;
      try {
        const res = await client.query('SELECT * FROM workforce_staging.tenants');
        if (res.rows.length === 0) gucBlocked = true;
      } catch (err: any) {
        if (err.code === '42501') gucBlocked = true;
      }
      expect(gucBlocked).toBe(true);
    } finally {
      // Symmetrical re-migration UP (009 -> 015) even if an assertion fails mid-test
      await ensureFullMigrationsRestored(client);
    }

    // Verify database views and operational RPCs restored (13-arg attendance + 12-arg scan, 0 legacy overloads)
    const viewCheck = await client.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' 
        AND table_name IN ('tenants', 'products', 'tenant_memberships', 'storefront_tenants', 'storefront_products')
    `);
    expect(viewCheck.rows.length).toBe(5);

    const rpcCheck = await client.query(`
      SELECT
        to_regprocedure('workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)') IS NOT NULL AS has_att_13,
        to_regprocedure('workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)') IS NOT NULL AS has_att_12,
        to_regprocedure('workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)') IS NOT NULL AS has_scan_12,
        to_regprocedure('workforce_staging.is_trusted_commerce_member(text,text)') IS NOT NULL AS has_commerce_helper,
        to_regprocedure('workforce_staging.is_trusted_bwm_operational_reader(text)') IS NOT NULL AS has_bwm_reader_helper
    `);
    expect(rpcCheck.rows[0]).toEqual({
      has_att_13: true,
      has_att_12: false,
      has_scan_12: true,
      has_commerce_helper: true,
      has_bwm_reader_helper: true,
    });
  });
});
