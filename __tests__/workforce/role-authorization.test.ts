/**
 * __tests__/workforce/role-authorization.test.ts
 * BWM Gate 1 Round 3H: Role-Based Database Authorization (Blocker D)
 *
 * Directives (CTO Official Mandate Round 3H — Blocker D):
 * 1. Role-Based Database Authorization:
 *    - `tenant_memberships.role` must have effective database security meaning:
 *      - OWNER: Full administrative control (billing, private credentials, tenant mutation, product CRUD).
 *      - MERCHANT: Operational product management (INSERT, UPDATE, DELETE products; cannot modify tenant settings or billing).
 *      - CS: Read-only customer support access (SELECT products; cannot mutate products [rejected with 42501 / 0 rows affected] and cannot modify tenant settings).
 *      - OPERATOR: Operational execution (read catalog; cannot mutate products, tenant settings, or billing).
 * 2. Enforced at PostgreSQL RLS Boundary:
 *    - Validates both `workforce_staging.is_trusted_tenant_member(target_tenant_id, required_role)`
 *      and per-command RLS policies on `tenants`, `products`, and `branch_credit_pools`.
 * 3. Clean Fixture Lifecycle:
 *    - Independent parameterized cleanup with verified zero remaining rows.
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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for role authorization tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3H — Role-Based Database Authorization (Blocker D)', () => {
  let client: Client;
  const timestamp = Date.now();

  const TENANT_SLUG = `role-auth-tenant-${timestamp}`;
  let tenantId: string;

  const USER_OWNER = '11111111-2222-3333-4444-555555555551';
  const USER_MERCHANT = '11111111-2222-3333-4444-555555555552';
  const USER_OPERATOR = '11111111-2222-3333-4444-555555555553';
  const USER_CS = '11111111-2222-3333-4444-555555555554';
  const USER_OUTSIDER = '11111111-2222-3333-4444-555555555559';

  let baselineProdId: string;
  const BRANCH_POOL_ID = `branch-role-${timestamp}`;

  async function setAuthContext(pgClient: Client, userId: string | null, targetTenantId?: string) {
    await pgClient.query('SET ROLE authenticated');
    if (userId) {
      await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
    } else {
      await pgClient.query('RESET request.jwt.claims');
    }
    if (targetTenantId) {
      await pgClient.query("SELECT set_config('app.current_tenant_id', $1, false)", [targetTenantId]);
      await pgClient.query("SELECT set_config('app.current_agency_id', $1, false)", [targetTenantId]);
    } else {
      await pgClient.query('RESET app.current_tenant_id');
      await pgClient.query('RESET app.current_agency_id');
    }
  }

  async function resetAuthContext(pgClient: Client) {
    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
    await pgClient.query('RESET app.current_tenant_id');
    await pgClient.query('RESET app.current_agency_id');
  }

  beforeAll(async () => {
    client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    await client.query('SET search_path TO workforce_staging, public');

    // 1. Seed Tenant
    const tRes = await client.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled, metadata
      ) VALUES (
        $1, 'Role Authorization Testing Corp', 'service', 'PRO_SCALE', 'active', true, true,
        '{"private_waba_key": "secret_waba_val", "internal_notes": "sensitive_admin_data"}'::jsonb
      ) RETURNING id
    `, [TENANT_SLUG]);
    tenantId = tRes.rows[0].id;

    // 2. Seed Baseline Product
    const pRes = await client.query(`
      INSERT INTO workforce_staging.products (
        tenant_id, title, slug, price, stock, category, product_type, is_active, status, is_publicly_published
      ) VALUES (
        $1, 'Baseline Product', $2, 150000, 20, 'service', 'SERVICE', true, 'ACTIVE', true
      ) RETURNING id
    `, [tenantId, `base-prod-${timestamp}`]);
    baselineProdId = pRes.rows[0].id;

    // 3. Seed Branch Credit Pool
    await client.query(`
      INSERT INTO workforce_staging.branch_credit_pools (
        branch_id, agency_id, available_credits, active_seats, currency
      ) VALUES (
        $1, $2, 250, 3, 'IDR'
      )
    `, [BRANCH_POOL_ID, tenantId]);

    // 4. Seed Role Memberships
    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES
        ($1, $2, $3, 'OWNER', true),
        ($4, $2, $3, 'MERCHANT', true),
        ($5, $2, $3, 'OPERATOR', true),
        ($6, $2, $3, 'CS', true)
    `, [
      USER_OWNER, tenantId, TENANT_SLUG,
      USER_MERCHANT,
      USER_OPERATOR,
      USER_CS,
    ]);
  }, 30000);

  afterAll(async () => {
    let pCount = 0;
    let poolCount = 0;
    let mCount = 0;
    let tCount = 0;

    if (client) {
      try {
        await resetAuthContext(client);

        const pDel = await client.query('DELETE FROM workforce_staging.products WHERE tenant_id = $1', [tenantId]);
        pCount = pDel.rowCount ?? 0;

        const poolDel = await client.query('DELETE FROM workforce_staging.branch_credit_pools WHERE agency_id = $1', [tenantId]);
        poolCount = poolDel.rowCount ?? 0;

        const mDel = await client.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [tenantId]);
        mCount = mDel.rowCount ?? 0;

        const tDel = await client.query('DELETE FROM workforce_staging.tenants WHERE id = $1', [tenantId]);
        tCount = tDel.rowCount ?? 0;

        // Verify clean deletion with independent counts
        const pCheck = await client.query('SELECT COUNT(*)::int AS count FROM workforce_staging.products WHERE tenant_id = $1', [tenantId]);
        expect(pCheck.rows[0].count).toBe(0);

        const mCheck = await client.query('SELECT COUNT(*)::int AS count FROM workforce_staging.tenant_memberships WHERE tenant_id = $1', [tenantId]);
        expect(mCheck.rows[0].count).toBe(0);

        const tCheck = await client.query('SELECT COUNT(*)::int AS count FROM workforce_staging.tenants WHERE id = $1', [tenantId]);
        expect(tCheck.rows[0].count).toBe(0);
      } finally {
        await client.end();
      }
    }

    console.log('[Role Authorization Cleanup Verified] Fixtures Removed:', {
      productsRemoved: pCount,
      creditPoolsRemoved: poolCount,
      membershipsRemoved: mCount,
      tenantsRemoved: tCount,
    });
  }, 30000);

  test('1. Database Function Level Role Hierarchy Verification (is_trusted_tenant_member)', async () => {
    // A. OWNER satisfies all role checks
    await setAuthContext(client, USER_OWNER, tenantId);
    const ownerRes = await client.query(`
      SELECT 
        workforce_staging.is_trusted_tenant_member($1) AS is_member,
        workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
        workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
        workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
        workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs
    `, [tenantId]);
    expect(ownerRes.rows[0].is_member).toBe(true);
    expect(ownerRes.rows[0].is_owner).toBe(true);
    expect(ownerRes.rows[0].is_merchant).toBe(true);
    expect(ownerRes.rows[0].is_operator).toBe(true);
    expect(ownerRes.rows[0].is_cs).toBe(true);

    // B. MERCHANT satisfies MERCHANT, OPERATOR, CS; but NOT OWNER
    await setAuthContext(client, USER_MERCHANT, tenantId);
    const merchantRes = await client.query(`
      SELECT 
        workforce_staging.is_trusted_tenant_member($1) AS is_member,
        workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
        workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
        workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
        workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs
    `, [tenantId]);
    expect(merchantRes.rows[0].is_member).toBe(true);
    expect(merchantRes.rows[0].is_owner).toBe(false);
    expect(merchantRes.rows[0].is_merchant).toBe(true);
    expect(merchantRes.rows[0].is_operator).toBe(true);
    expect(merchantRes.rows[0].is_cs).toBe(true);

    // C. OPERATOR satisfies OPERATOR, CS; but NOT MERCHANT or OWNER
    await setAuthContext(client, USER_OPERATOR, tenantId);
    const opRes = await client.query(`
      SELECT 
        workforce_staging.is_trusted_tenant_member($1) AS is_member,
        workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
        workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
        workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
        workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs
    `, [tenantId]);
    expect(opRes.rows[0].is_member).toBe(true);
    expect(opRes.rows[0].is_owner).toBe(false);
    expect(opRes.rows[0].is_merchant).toBe(false);
    expect(opRes.rows[0].is_operator).toBe(true);
    expect(opRes.rows[0].is_cs).toBe(true);

    // D. CS satisfies CS only; but NOT OPERATOR, MERCHANT, or OWNER
    await setAuthContext(client, USER_CS, tenantId);
    const csRes = await client.query(`
      SELECT 
        workforce_staging.is_trusted_tenant_member($1) AS is_member,
        workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
        workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
        workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
        workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs
    `, [tenantId]);
    expect(csRes.rows[0].is_member).toBe(true);
    expect(csRes.rows[0].is_owner).toBe(false);
    expect(csRes.rows[0].is_merchant).toBe(false);
    expect(csRes.rows[0].is_operator).toBe(false);
    expect(csRes.rows[0].is_cs).toBe(true);

    // E. OUTSIDER satisfies nothing (fails closed)
    await setAuthContext(client, USER_OUTSIDER, tenantId);
    const outsiderRes = await client.query(`
      SELECT 
        workforce_staging.is_trusted_tenant_member($1) AS is_member,
        workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
        workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
        workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
        workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs
    `, [tenantId]);
    expect(outsiderRes.rows[0].is_member).toBe(false);
    expect(outsiderRes.rows[0].is_owner).toBe(false);
    expect(outsiderRes.rows[0].is_merchant).toBe(false);
    expect(outsiderRes.rows[0].is_operator).toBe(false);
    expect(outsiderRes.rows[0].is_cs).toBe(false);

    await resetAuthContext(client);
  });

  test('2. Positive OWNER Authorization: Full Administrative Control on Tenants, Products, and Pools', async () => {
    await setAuthContext(client, USER_OWNER, tenantId);

    // 1. Can read tenant and private metadata
    const tRead = await client.query('SELECT slug, metadata FROM public.tenants WHERE id = $1', [tenantId]);
    expect(tRead.rows.length).toBe(1);
    expect(tRead.rows[0].metadata?.private_waba_key).toBe('secret_waba_val');

    // 2. Can UPDATE tenant settings
    const tUpdate = await client.query(
      "UPDATE public.tenants SET name = 'Owner Updated Name' WHERE id = $1",
      [tenantId]
    );
    expect(tUpdate.rowCount).toBe(1);

    // 3. Can INSERT products
    const ownerProdSlug = `owner-prod-${timestamp}`;
    const pInsert = await client.query(`
      INSERT INTO public.products (
        tenant_id, title, slug, price, stock, category, product_type
      ) VALUES (
        $1, 'Owner Created Product', $2, 200000, 10, 'service', 'SERVICE'
      ) RETURNING id
    `, [tenantId, ownerProdSlug]);
    expect(pInsert.rows.length).toBe(1);
    const ownerProdId = pInsert.rows[0].id;

    // 4. Can UPDATE products
    const pUpdate = await client.query(
      'UPDATE public.products SET price = 220000 WHERE id = $1',
      [ownerProdId]
    );
    expect(pUpdate.rowCount).toBe(1);

    // 5. Can DELETE products
    const pDelete = await client.query(
      'DELETE FROM public.products WHERE id = $1',
      [ownerProdId]
    );
    expect(pDelete.rowCount).toBe(1);

    // 6. Can UPDATE branch credit pools
    const poolUpdate = await client.query(
      'UPDATE workforce_staging.branch_credit_pools SET available_credits = 300 WHERE branch_id = $1',
      [BRANCH_POOL_ID]
    );
    expect(poolUpdate.rowCount).toBe(1);

    // 7. Can read tenant memberships (Round 3K: Role-Bounded Membership Visibility)
    const memRead = await client.query(
      'SELECT user_id, role FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
    expect(memRead.rows.length).toBeGreaterThanOrEqual(1);

    await resetAuthContext(client);
  });

  test('3. Positive MERCHANT Authorization: Product Management Permitted; Tenant/Pool Mutation Blocked', async () => {
    await setAuthContext(client, USER_MERCHANT, tenantId);

    // 1. Can read products
    const pRead = await client.query('SELECT id, title, price FROM public.products WHERE tenant_id = $1', [tenantId]);
    expect(pRead.rows.length).toBeGreaterThanOrEqual(1);

    // 2. Can INSERT products
    const merchantProdSlug = `merchant-prod-${timestamp}`;
    const pInsert = await client.query(`
      INSERT INTO public.products (
        tenant_id, title, slug, price, stock, category, product_type
      ) VALUES (
        $1, 'Merchant Created Product', $2, 175000, 15, 'service', 'SERVICE'
      ) RETURNING id
    `, [tenantId, merchantProdSlug]);
    expect(pInsert.rows.length).toBe(1);
    const merchantProdId = pInsert.rows[0].id;

    // 3. Can UPDATE products
    const pUpdate = await client.query(
      'UPDATE public.products SET price = 180000 WHERE id = $1',
      [merchantProdId]
    );
    expect(pUpdate.rowCount).toBe(1);

    // 4. Can DELETE products
    const pDelete = await client.query(
      'DELETE FROM public.products WHERE id = $1',
      [merchantProdId]
    );
    expect(pDelete.rowCount).toBe(1);

    // 5. CANNOT UPDATE tenant settings (affects 0 rows under RLS)
    const tUpdate = await client.query(
      "UPDATE public.tenants SET name = 'Merchant Rogue Attempt' WHERE id = $1",
      [tenantId]
    );
    expect(tUpdate.rowCount).toBe(0);

    // 6. CANNOT UPDATE branch credit pools (affects 0 rows under RLS)
    const poolUpdate = await client.query(
      'UPDATE workforce_staging.branch_credit_pools SET available_credits = 99999 WHERE branch_id = $1',
      [BRANCH_POOL_ID]
    );
    expect(poolUpdate.rowCount).toBe(0);

    // 7. Can read tenant memberships (Round 3K: Role-Bounded Membership Visibility)
    const memRead = await client.query(
      'SELECT user_id, role FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
    expect(memRead.rows.length).toBeGreaterThanOrEqual(1);

    await resetAuthContext(client);
  });

  test('4. CS (Customer Support) Role: Read-Only Support Permitted; All Mutations Strictly Suppressed', async () => {
    await setAuthContext(client, USER_CS, tenantId);

    // 1. Can read products
    const pRead = await client.query('SELECT id, title, price FROM public.products WHERE id = $1', [baselineProdId]);
    expect(pRead.rows.length).toBe(1);
    expect(pRead.rows[0].title).toBe('Baseline Product');

    // 2. CANNOT INSERT products (fails closed with SQLSTATE 42501)
    let insertErr: any = null;
    try {
      await client.query(`
        INSERT INTO public.products (
          tenant_id, title, slug, price, stock, category, product_type
        ) VALUES (
          $1, 'CS Rogue Product', $2, 50000, 5, 'service', 'SERVICE'
        )
      `, [tenantId, `cs-rogue-${timestamp}`]);
    } catch (err) {
      insertErr = err;
    }
    expect(insertErr).toBeDefined();
    expect(insertErr.code).toBe('42501');

    // 3. CANNOT UPDATE products (affects 0 rows under RLS)
    const pUpdate = await client.query(
      'UPDATE public.products SET price = 1 WHERE id = $1',
      [baselineProdId]
    );
    expect(pUpdate.rowCount).toBe(0);

    // 4. CANNOT DELETE products (affects 0 rows under RLS)
    const pDelete = await client.query(
      'DELETE FROM public.products WHERE id = $1',
      [baselineProdId]
    );
    expect(pDelete.rowCount).toBe(0);

    // 5. CANNOT UPDATE tenant settings (affects 0 rows)
    const tUpdate = await client.query(
      "UPDATE public.tenants SET name = 'CS Rogue Attempt' WHERE id = $1",
      [tenantId]
    );
    expect(tUpdate.rowCount).toBe(0);

    // 6. CANNOT UPDATE branch credit pools (affects 0 rows)
    const poolUpdate = await client.query(
      'UPDATE workforce_staging.branch_credit_pools SET available_credits = 99999 WHERE branch_id = $1',
      [BRANCH_POOL_ID]
    );
    expect(poolUpdate.rowCount).toBe(0);

    // 7. CANNOT read tenant memberships (Round 3K: returns 0 rows / fails closed for CS)
    const memRead = await client.query(
      'SELECT user_id, role FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
    expect(memRead.rows.length).toBe(0);

    // Verify baseline product was NOT modified or deleted
    await resetAuthContext(client);
    const verifyProd = await client.query('SELECT price FROM public.products WHERE id = $1', [baselineProdId]);
    expect(Number(verifyProd.rows[0].price)).toBe(150000);
  });

  test('5. OPERATOR Role: Operational Catalog View Permitted; Product & Tenant Mutations Suppressed', async () => {
    await setAuthContext(client, USER_OPERATOR, tenantId);

    // 1. Can read products and tenant
    const pRead = await client.query('SELECT id, title FROM public.products WHERE id = $1', [baselineProdId]);
    expect(pRead.rows.length).toBe(1);

    const tRead = await client.query('SELECT id, slug FROM public.tenants WHERE id = $1', [tenantId]);
    expect(tRead.rows.length).toBe(1);

    // 2. CANNOT INSERT products (fails closed with SQLSTATE 42501)
    let insertErr: any = null;
    try {
      await client.query(`
        INSERT INTO public.products (
          tenant_id, title, slug, price, stock, category, product_type
        ) VALUES (
          $1, 'Operator Rogue Product', $2, 50000, 5, 'service', 'SERVICE'
        )
      `, [tenantId, `op-rogue-${timestamp}`]);
    } catch (err) {
      insertErr = err;
    }
    expect(insertErr).toBeDefined();
    expect(insertErr.code).toBe('42501');

    // 3. CANNOT UPDATE products (affects 0 rows)
    const pUpdate = await client.query(
      'UPDATE public.products SET price = 999 WHERE id = $1',
      [baselineProdId]
    );
    expect(pUpdate.rowCount).toBe(0);

    // 4. CANNOT DELETE products (affects 0 rows)
    const pDelete = await client.query(
      'DELETE FROM public.products WHERE id = $1',
      [baselineProdId]
    );
    expect(pDelete.rowCount).toBe(0);

    // 5. CANNOT UPDATE tenant settings (affects 0 rows)
    const tUpdate = await client.query(
      "UPDATE public.tenants SET name = 'Operator Rogue Attempt' WHERE id = $1",
      [tenantId]
    );
    expect(tUpdate.rowCount).toBe(0);

    // 6. CANNOT UPDATE branch credit pools (affects 0 rows)
    const poolUpdate = await client.query(
      'UPDATE workforce_staging.branch_credit_pools SET available_credits = 99999 WHERE branch_id = $1',
      [BRANCH_POOL_ID]
    );
    expect(poolUpdate.rowCount).toBe(0);

    // 7. CANNOT read tenant memberships (Round 3K: returns 0 rows / fails closed for OPERATOR)
    const memRead = await client.query(
      'SELECT user_id, role FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
    expect(memRead.rows.length).toBe(0);

    await resetAuthContext(client);
  });

  test('6. Unassigned / Outsider User Fails Closed Across All Tables', async () => {
    await setAuthContext(client, USER_OUTSIDER, tenantId);

    // 1. SELECT returns 0 rows
    const pRead = await client.query('SELECT * FROM public.products WHERE tenant_id = $1', [tenantId]);
    expect(pRead.rows.length).toBe(0);

    const tRead = await client.query('SELECT * FROM public.tenants WHERE id = $1', [tenantId]);
    expect(tRead.rows.length).toBe(0);

    const poolRead = await client.query('SELECT * FROM workforce_staging.branch_credit_pools WHERE agency_id = $1', [tenantId]);
    expect(poolRead.rows.length).toBe(0);

    // 2. INSERT rejected with 42501
    let insertErr: any = null;
    try {
      await client.query(`
        INSERT INTO public.products (
          tenant_id, title, slug, price, stock, category, product_type
        ) VALUES (
          $1, 'Outsider Rogue Product', $2, 50000, 5, 'service', 'SERVICE'
        )
      `, [tenantId, `out-rogue-${timestamp}`]);
    } catch (err) {
      insertErr = err;
    }
    expect(insertErr).toBeDefined();
    expect(insertErr.code).toBe('42501');

    // 3. UPDATE / DELETE affects 0 rows
    const pUpdate = await client.query('UPDATE public.products SET price = 999 WHERE id = $1', [baselineProdId]);
    expect(pUpdate.rowCount).toBe(0);

    const pDelete = await client.query('DELETE FROM public.products WHERE id = $1', [baselineProdId]);
    expect(pDelete.rowCount).toBe(0);

    await resetAuthContext(client);
  });
});
