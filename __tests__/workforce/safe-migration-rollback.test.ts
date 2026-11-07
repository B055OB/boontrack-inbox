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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for rollback tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3H — Safe Migration Rollback (Blocker F)', () => {
  let client: Client;

  const upSqlPath = path.resolve('packages/workforce-billing/schema/migrations/010_strict_storefront_opt_in_and_role_authorization.sql');
  const downSqlPath = path.resolve('packages/workforce-billing/schema/migrations/010_strict_storefront_opt_in_and_role_authorization.down.sql');

  const upSql = fs.readFileSync(upSqlPath, 'utf8');
  const downSql = fs.readFileSync(downSqlPath, 'utf8');

  beforeAll(async () => {
    client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    await client.query('SET search_path TO workforce_staging, public');
  }, 30000);

  afterAll(async () => {
    // ALWAYS ensure migration 010 UP is applied and verified at completion
    if (client) {
      try {
        await client.query('RESET ROLE');
        await client.query(upSql);
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

    // C. Safe public storefront views remain accessible
    const sfTenantsRes = await client.query('SELECT COUNT(*)::int AS count FROM public.storefront_tenants');
    expect(sfTenantsRes.rows[0].count).toBeGreaterThanOrEqual(0);

    const sfProdsRes = await client.query('SELECT COUNT(*)::int AS count FROM public.storefront_products');
    expect(sfProdsRes.rows[0].count).toBeGreaterThanOrEqual(0);

    await client.query('RESET ROLE');
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
});
