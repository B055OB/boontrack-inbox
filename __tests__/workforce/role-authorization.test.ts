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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for role authorization tests');
  }
  assertStagingDatabaseTarget(connStr);
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
  const USER_MASTER_RESELLER = '11111111-2222-3333-4444-555555555555';
  const USER_SUPERVISOR = '11111111-2222-3333-4444-555555555556';
  const USER_FIELD_PERSONNEL = '11111111-2222-3333-4444-555555555557';
  const USER_REVOKED = '11111111-2222-3333-4444-555555555558';
  const USER_UNRECOGNIZED_ROLE = '11111111-2222-3333-4444-555555555550';
  const USER_OUTSIDER = '11111111-2222-3333-4444-555555555559';

  let baselineProdId: string;
  let baselineFacilityId: string;
  let baselinePersonnelId: string;
  let baselineCheckpointId: string;
  let baselineAttendanceId: string;
  let baselineScanId: string;
  let baselineAuditId: string;
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

    // Ensure public.tenants 17-column view structure aligns with workforce_staging.tenants during 010 view trigger tests ([BWM-LEGACY-VIEW-001])
    const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
    const down012Sql = fs.readFileSync(
      path.join(migrationsDir, '012_create_workforce_revocation_and_authz_versioning.down.sql'),
      'utf8'
    );
    const up010Sql = fs.readFileSync(
      path.join(migrationsDir, '010_strict_storefront_opt_in_and_role_authorization.sql'),
      'utf8'
    );
    const up015Sql = fs.readFileSync(
      path.join(migrationsDir, '015_attendance_actor_binding_and_role_allowlist.sql'),
      'utf8'
    );
    const up016Sql = fs.readFileSync(
      path.join(migrationsDir, '016_bwm_domain_authorization_isolation.sql'),
      'utf8'
    );
    await client.query('DROP VIEW IF EXISTS public.tenant_memberships, public.products, public.storefront_products');
    await client.query('ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS metadata');
    await client.query(down012Sql);
    await client.query(up010Sql);
    await client.query(up015Sql);
    await client.query(up016Sql);

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

    // 4. Seed Role Memberships (Commerce + BWM Operational + Revoked + Unrecognized)
    const memInsertRes = await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES
        ($1, $2, $3, 'OWNER', true),
        ($4, $2, $3, 'MERCHANT', true),
        ($5, $2, $3, 'OPERATOR', true),
        ($6, $2, $3, 'CS', true),
        ($7, $2, $3, 'master_reseller', true),
        ($8, $2, $3, 'supervisor', true),
        ($9, $2, $3, 'field_personnel', true),
        ($10, $2, $3, 'OWNER', false),
        ($11, $2, $3, 'constructor', true)
      RETURNING id, user_id
    `, [
      USER_OWNER, tenantId, TENANT_SLUG,
      USER_MERCHANT,
      USER_OPERATOR,
      USER_CS,
      USER_MASTER_RESELLER,
      USER_SUPERVISOR,
      USER_FIELD_PERSONNEL,
      USER_REVOKED,
      USER_UNRECOGNIZED_ROLE,
    ]);
    const fieldMembershipId = memInsertRes.rows.find((r) => r.user_id === USER_FIELD_PERSONNEL)?.id;

    // 5. Seed BWM Operational Fixtures (facilities, personnel, checkpoints, attendance_logs, checkpoint_scans, credential_audit_logs)
    const facRes = await client.query(`
      INSERT INTO workforce_staging.facilities (
        tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active
      ) VALUES (
        $1, $2, 'Role Matrix HQ Facility', $3, -6.2088000, 106.8456000, 100, true
      ) RETURNING id
    `, [tenantId, TENANT_SLUG, `FAC-RM-${timestamp}`]);
    baselineFacilityId = facRes.rows[0].id;

    const persRes = await client.query(`
      INSERT INTO workforce_staging.personnel (
        tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, 'Field Officer Role Matrix', $6, 'field_personnel', true
      ) RETURNING id
    `, [tenantId, TENANT_SLUG, USER_FIELD_PERSONNEL, fieldMembershipId, baselineFacilityId, `NIK-RM-${timestamp}`]);
    baselinePersonnelId = persRes.rows[0].id;

    const cpRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (
        tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active
      ) VALUES (
        $1, $2, 'Role Matrix Gate A', $3, 'North', -6.2088000, 106.8456000, $4, 60, true
      ) RETURNING id
    `, [tenantId, baselineFacilityId, `CP-RM-${timestamp}`, `QR-RM-${timestamp}`]);
    baselineCheckpointId = cpRes.rows[0].id;

    const attRes = await client.query(`
      INSERT INTO workforce_staging.attendance_logs (
        tenant_id, personnel_id, facility_id, type, latitude, longitude, geofence_verified, biometric_mode, idempotency_key
      ) VALUES (
        $1, $2, $3, 'CLOCK_IN', -6.2088000, 106.8456000, true, 'NONE_UNVERIFIED', $4
      ) RETURNING id
    `, [tenantId, baselinePersonnelId, baselineFacilityId, `att-rm-${timestamp}`]);
    baselineAttendanceId = attRes.rows[0].id;

    const scanRes = await client.query(`
      INSERT INTO workforce_staging.checkpoint_scans (
        tenant_id, checkpoint_id, personnel_id, latitude, longitude, distance_m, status, idempotency_key
      ) VALUES (
        $1, $2, $3, -6.2088000, 106.8456000, 0, 'VERIFIED', $4
      ) RETURNING id
    `, [tenantId, baselineCheckpointId, baselinePersonnelId, `scan-rm-${timestamp}`]);
    baselineScanId = scanRes.rows[0].id;

    const auditRes = await client.query(`
      INSERT INTO workforce_staging.credential_audit_logs (
        tenant_id, personnel_id, action, actor_id, metadata
      ) VALUES (
        $1, $2, 'PIN_PROVISIONED', $3, '{"source": "role-matrix-test"}'::jsonb
      ) RETURNING id
    `, [tenantId, baselinePersonnelId, USER_OWNER]);
    baselineAuditId = auditRes.rows[0].id;
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

        const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
        const up012Sql = fs.readFileSync(
          path.join(migrationsDir, '012_create_workforce_revocation_and_authz_versioning.sql'),
          'utf8'
        );
        const up016Sql = fs.readFileSync(
          path.join(migrationsDir, '016_bwm_domain_authorization_isolation.sql'),
          'utf8'
        );
        await client.query("ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'");
        await client.query(up012Sql);
        await client.query(up016Sql);
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

  test('7. HIGH-02 Complete Role Matrix: OWNER, MERCHANT, OPERATOR, CS, master_reseller, supervisor, field_personnel, Revoked & Unrecognized Roles', async () => {
    // 1. Direct evaluation of workforce_staging.is_trusted_tenant_member(tenant_id, required_role) across all 9 role states
    const expectedMatrix: Array<{
      label: string;
      userId: string;
      member: boolean;
      cs: boolean;
      operator: boolean;
      merchant: boolean;
      owner: boolean;
    }> = [
      { label: 'OWNER', userId: USER_OWNER, member: true, cs: true, operator: true, merchant: true, owner: true },
      { label: 'MERCHANT', userId: USER_MERCHANT, member: true, cs: true, operator: true, merchant: true, owner: false },
      { label: 'OPERATOR', userId: USER_OPERATOR, member: true, cs: true, operator: true, merchant: false, owner: false },
      { label: 'CS', userId: USER_CS, member: true, cs: true, operator: false, merchant: false, owner: false },
      // BWM operational roles MUST satisfy 1-arg membership check (operational SELECT) but NEVER map to Commerce hierarchy
      { label: 'master_reseller', userId: USER_MASTER_RESELLER, member: true, cs: false, operator: false, merchant: false, owner: false },
      { label: 'supervisor', userId: USER_SUPERVISOR, member: true, cs: false, operator: false, merchant: false, owner: false },
      { label: 'field_personnel', userId: USER_FIELD_PERSONNEL, member: true, cs: false, operator: false, merchant: false, owner: false },
      // Revoked membership (is_active = false, even with role = 'OWNER') fails closed across all checks
      { label: 'revoked_membership', userId: USER_REVOKED, member: false, cs: false, operator: false, merchant: false, owner: false },
      // Unrecognized role ('constructor', is_active = true) fails closed across BOTH 1-arg operational allowlist AND 2-arg Commerce checks (Migration 015 HIGH-02)
      { label: 'unrecognized_role', userId: USER_UNRECOGNIZED_ROLE, member: false, cs: false, operator: false, merchant: false, owner: false },
    ];

    for (const row of expectedMatrix) {
      await setAuthContext(client, row.userId, tenantId);
      const fnRes = await client.query(
        `SELECT
           workforce_staging.is_trusted_tenant_member($1) AS is_member,
           workforce_staging.is_trusted_tenant_member($1, 'CS') AS is_cs,
           workforce_staging.is_trusted_tenant_member($1, 'OPERATOR') AS is_operator,
           workforce_staging.is_trusted_tenant_member($1, 'MERCHANT') AS is_merchant,
           workforce_staging.is_trusted_tenant_member($1, 'OWNER') AS is_owner,
           workforce_staging.is_trusted_tenant_member($1, 'master_reseller') AS is_bwm_arg,
           workforce_staging.is_trusted_tenant_member($1, 'constructor') AS is_proto_arg`,
        [tenantId]
      );
      expect({
        label: row.label,
        member: fnRes.rows[0].is_member,
        cs: fnRes.rows[0].is_cs,
        operator: fnRes.rows[0].is_operator,
        merchant: fnRes.rows[0].is_merchant,
        owner: fnRes.rows[0].is_owner,
        bwmArg: fnRes.rows[0].is_bwm_arg,
        protoArg: fnRes.rows[0].is_proto_arg,
      }).toEqual({
        label: row.label,
        member: row.member,
        cs: row.cs,
        operator: row.operator,
        merchant: row.merchant,
        owner: row.owner,
        // Pure Commerce 2-arg hierarchy + ELSE RETURN FALSE: neither 'master_reseller' nor 'constructor' is accepted as required_role
        bwmArg: false,
        protoArg: false,
      });
    }

    // 2. Verify BWM roles (master_reseller, supervisor, field_personnel) have operational SELECT access
    //    on Migration 011 tables, while being strictly isolated from Commerce writes & private metadata unmasking
    for (const bwmRole of [
      { name: 'master_reseller', userId: USER_MASTER_RESELLER },
      { name: 'supervisor', userId: USER_SUPERVISOR },
      { name: 'field_personnel', userId: USER_FIELD_PERSONNEL },
    ]) {
      await setAuthContext(client, bwmRole.userId, tenantId);

      // A. Positive: CAN read same-tenant BWM operational tables via 1-arg is_trusted_tenant_member(tenant_id::text)
      const facRead = await client.query(
        'SELECT id FROM workforce_staging.facilities WHERE id = $1',
        [baselineFacilityId]
      );
      expect(facRead.rows.length).toBe(1);

      const persRead = await client.query(
        'SELECT id FROM workforce_staging.personnel WHERE id = $1',
        [baselinePersonnelId]
      );
      expect(persRead.rows.length).toBe(1);

      const cpRead = await client.query(
        'SELECT id FROM workforce_staging.checkpoints WHERE id = $1',
        [baselineCheckpointId]
      );
      expect(cpRead.rows.length).toBe(1);

      const attRead = await client.query(
        'SELECT id FROM workforce_staging.attendance_logs WHERE id = $1',
        [baselineAttendanceId]
      );
      expect(attRead.rows.length).toBe(1);

      const scanRead = await client.query(
        'SELECT id FROM workforce_staging.checkpoint_scans WHERE id = $1',
        [baselineScanId]
      );
      expect(scanRead.rows.length).toBe(1);

      // B. Negative: CANNOT directly INSERT/UPDATE/DELETE BWM operational tables as authenticated (42501 privilege revoked)
      let directScanInsertErr: any = null;
      try {
        await client.query(
          `INSERT INTO workforce_staging.checkpoint_scans (
             tenant_id, checkpoint_id, personnel_id, latitude, longitude, distance_m, status, idempotency_key
           ) VALUES ($1, $2, $3, -6.2088, 106.8456, 0, 'VERIFIED', $4)`,
          [tenantId, baselineCheckpointId, baselinePersonnelId, `illegal-scan-${bwmRole.name}-${timestamp}`]
        );
      } catch (err) {
        directScanInsertErr = err;
      }
      expect(directScanInsertErr).toBeDefined();
      expect(directScanInsertErr.code).toBe('42501');

      // C. Negative: CANNOT read credential_audit_logs (table SELECT privilege revoked from authenticated -> 42501)
      let auditReadErr: any = null;
      try {
        await client.query(
          'SELECT id FROM workforce_staging.credential_audit_logs WHERE id = $1',
          [baselineAuditId]
        );
      } catch (err) {
        auditReadErr = err;
      }
      expect(auditReadErr).toBeDefined();
      expect(auditReadErr.code).toBe('42501');

      // D. Negative: CANNOT unmask private tenant metadata on public.tenants view (metadata must be NULL)
      const tenantViewRead = await client.query(
        'SELECT id, metadata FROM public.tenants WHERE id = $1',
        [tenantId]
      );
      expect(tenantViewRead.rows.length).toBe(1);
      expect(tenantViewRead.rows[0].metadata).toBeNull();

      // E. Negative: CANNOT mutate tenant settings, products, or branch_credit_pools
      const tenantUpdate = await client.query(
        "UPDATE public.tenants SET name = 'BWM Role Escalation Attempt' WHERE id = $1",
        [tenantId]
      );
      expect(tenantUpdate.rowCount).toBe(0);

      let prodInsertErr: any = null;
      try {
        await client.query(
          `INSERT INTO public.products (
             tenant_id, title, slug, price, stock, category, product_type
           ) VALUES ($1, 'BWM Rogue Product', $2, 50000, 5, 'service', 'SERVICE')`,
          [tenantId, `bwm-rogue-${bwmRole.name}-${timestamp}`]
        );
      } catch (err) {
        prodInsertErr = err;
      }
      expect(prodInsertErr).toBeDefined();
      expect(prodInsertErr.code).toBe('42501');

      const prodUpdate = await client.query(
        'UPDATE public.products SET price = 1 WHERE id = $1',
        [baselineProdId]
      );
      expect(prodUpdate.rowCount).toBe(0);

      const prodDelete = await client.query(
        'DELETE FROM public.products WHERE id = $1',
        [baselineProdId]
      );
      expect(prodDelete.rowCount).toBe(0);

      const poolUpdate = await client.query(
        'UPDATE workforce_staging.branch_credit_pools SET available_credits = 999999 WHERE branch_id = $1',
        [BRANCH_POOL_ID]
      );
      expect(poolUpdate.rowCount).toBe(0);
    }

    // 3. Verify Revoked Membership (is_active = false) is denied operational SELECT and Commerce access
    await setAuthContext(client, USER_REVOKED, tenantId);
    expect(
      (await client.query('SELECT id FROM workforce_staging.facilities WHERE id = $1', [baselineFacilityId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.personnel WHERE id = $1', [baselinePersonnelId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoints WHERE id = $1', [baselineCheckpointId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.attendance_logs WHERE id = $1', [baselineAttendanceId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoint_scans WHERE id = $1', [baselineScanId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE branch_id = $1', [BRANCH_POOL_ID])).rows.length
    ).toBe(0);

    const revokedTenantUpdate = await client.query(
      "UPDATE public.tenants SET name = 'Revoked Owner Attempt' WHERE id = $1",
      [tenantId]
    );
    expect(revokedTenantUpdate.rowCount).toBe(0);

    // 4. Verify Unrecognized Active Role ('constructor', is_active = true) is denied across all 4 surfaces (Migration 015 HIGH-02):
    //    (a) 1-arg helper FALSE, (b) BWM operational SELECT 0 rows, (c) Commerce hierarchy & reflective fallback FALSE/0 rows/42501, (d) credential_audit_logs 42501
    await setAuthContext(client, USER_UNRECOGNIZED_ROLE, tenantId);
    expect(
      (await client.query('SELECT id FROM workforce_staging.facilities WHERE id = $1', [baselineFacilityId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.personnel WHERE id = $1', [baselinePersonnelId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoints WHERE id = $1', [baselineCheckpointId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.attendance_logs WHERE id = $1', [baselineAttendanceId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoint_scans WHERE id = $1', [baselineScanId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM public.tenants WHERE id = $1', [tenantId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM public.products WHERE id = $1', [baselineProdId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE branch_id = $1', [BRANCH_POOL_ID])).rows.length
    ).toBe(0);

    let unrecAuditErr: any = null;
    try {
      await client.query('SELECT id FROM workforce_staging.credential_audit_logs WHERE id = $1', [baselineAuditId]);
    } catch (err) {
      unrecAuditErr = err;
    }
    expect(unrecAuditErr).toBeDefined();
    expect(unrecAuditErr.code).toBe('42501');

    const unrecTenantUpdate = await client.query(
      "UPDATE public.tenants SET name = 'Unrecognized Role Attempt' WHERE id = $1",
      [tenantId]
    );
    expect(unrecTenantUpdate.rowCount).toBe(0);

    await resetAuthContext(client);
  });

  test('8. Migration 016 Domain Authorization Isolation: Commerce vs BWM Scope, Self/Facility Field Scope, Option C Supervisor', async () => {
    const secondFacilityRes = await client.query(
      `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
       VALUES ($1, $2, 'Secondary Facility Matrix', $3, -6.2200000, 106.8600000, 100, true)
       RETURNING id`,
      [tenantId, TENANT_SLUG, `FAC-SEC-${timestamp}`]
    );
    const secondFacilityId = secondFacilityRes.rows[0].id;

    const secondCpRes = await client.query(
      `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
       VALUES ($1, $2, 'Secondary Gate B', $3, 'South', -6.2200000, 106.8600000, $4, 60, true)
       RETURNING id`,
      [tenantId, secondFacilityId, `CP-SEC-${timestamp}`, `QR-SEC-${timestamp}`]
    );
    const secondCheckpointId = secondCpRes.rows[0].id;

    const USER_COWORKER = '88888888-8888-4888-8888-888888888899';
    const coworkerMemRes = await client.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [USER_COWORKER, tenantId, TENANT_SLUG]
    );
    const coworkerMemId = coworkerMemRes.rows[0].id;
    const coworkerPersRes = await client.query(
      `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'Coworker Field Officer', $6, 'field_personnel', true) RETURNING id`,
      [tenantId, TENANT_SLUG, USER_COWORKER, coworkerMemId, secondFacilityId, `NIK-CW-${timestamp}`]
    );
    const coworkerPersonnelId = coworkerPersRes.rows[0].id;

    const coworkerAttRes = await client.query(
      `INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, facility_id, type, latitude, longitude, geofence_verified, biometric_mode, idempotency_key)
       VALUES ($1, $2, $3, 'CLOCK_IN', -6.2200000, 106.8600000, true, 'NONE_UNVERIFIED', $4) RETURNING id`,
      [tenantId, coworkerPersonnelId, secondFacilityId, `att-cw-${timestamp}`]
    );
    const coworkerAttId = coworkerAttRes.rows[0].id;

    const coworkerScanRes = await client.query(
      `INSERT INTO workforce_staging.checkpoint_scans (tenant_id, checkpoint_id, personnel_id, latitude, longitude, distance_m, status, idempotency_key)
       VALUES ($1, $2, $3, -6.2200000, 106.8600000, 0, 'VERIFIED', $4) RETURNING id`,
      [tenantId, secondCheckpointId, coworkerPersonnelId, `scan-cw-${timestamp}`]
    );
    const coworkerScanId = coworkerScanRes.rows[0].id;

    // 1. field_personnel strictly scoped to self & assigned facility, denied Commerce & outbox & coworkers
    await setAuthContext(client, USER_FIELD_PERSONNEL, tenantId);
    let fpDirectProdDenied = false;
    try {
      const fpDirectProd = await client.query('SELECT id FROM workforce_staging.products WHERE id = $1', [baselineProdId]);
      if (fpDirectProd.rows.length === 0) fpDirectProdDenied = true;
    } catch (err: any) {
      if (err?.code === '42501') fpDirectProdDenied = true;
    }
    expect(fpDirectProdDenied).toBe(true);
    expect(
      (await client.query('SELECT id FROM public.products WHERE id = $1', [baselineProdId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE agency_id = $1', [tenantId])).rows.length
    ).toBe(0);

    // Unassigned facility / coworker rows return 0 rows
    expect(
      (await client.query('SELECT id FROM workforce_staging.facilities WHERE id = $1', [secondFacilityId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoints WHERE id = $1', [secondCheckpointId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.personnel WHERE id = $1', [coworkerPersonnelId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.attendance_logs WHERE id = $1', [coworkerAttId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM workforce_staging.checkpoint_scans WHERE id = $1', [coworkerScanId])).rows.length
    ).toBe(0);

    // Assigned public.workforce_checkpoints masks qr_token for field_personnel, AND base table qr_token is column-denied (42501)
    const fpCpView = await client.query('SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = $1', [baselineCheckpointId]);
    expect(fpCpView.rows.length).toBe(1);
    expect(fpCpView.rows[0].qr_token).toBeNull();
    let fpBaseQrErr: any = null;
    try {
      await client.query('SELECT qr_token FROM workforce_staging.checkpoints WHERE id = $1', [baselineCheckpointId]);
    } catch (err) {
      fpBaseQrErr = err;
    }
    expect(fpBaseQrErr?.code).toBe('42501');

    // notification_outbox & personnel_credentials denied with 42501
    let fpOutboxErr: any = null;
    try {
      await client.query('SELECT id FROM workforce_staging.notification_outbox WHERE tenant_id = $1', [tenantId]);
    } catch (err) {
      fpOutboxErr = err;
    }
    expect(fpOutboxErr?.code).toBe('42501');

    // 2. supervisor (Option C): cross-facility same-tenant BWM read preserved, masked qr_token (plus base qr_token 42501), zero Commerce & zero outbox
    await setAuthContext(client, USER_SUPERVISOR, tenantId);
    expect(
      (await client.query('SELECT id FROM workforce_staging.facilities WHERE id IN ($1, $2)', [baselineFacilityId, secondFacilityId])).rows.length
    ).toBe(2);
    expect(
      (await client.query('SELECT id FROM workforce_staging.personnel WHERE id IN ($1, $2)', [baselinePersonnelId, coworkerPersonnelId])).rows.length
    ).toBe(2);
    expect(
      (await client.query('SELECT id FROM public.products WHERE id = $1', [baselineProdId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE agency_id = $1', [tenantId])).rows.length
    ).toBe(0);
    const supCpView = await client.query('SELECT id, qr_token FROM public.workforce_checkpoints WHERE id IN ($1, $2)', [
      baselineCheckpointId,
      secondCheckpointId,
    ]);
    expect(supCpView.rows.length).toBe(2);
    expect(supCpView.rows.every((r) => r.qr_token === null)).toBe(true);
    let supBaseQrErr: any = null;
    try {
      await client.query('SELECT qr_token FROM workforce_staging.checkpoints WHERE id = $1', [baselineCheckpointId]);
    } catch (err) {
      supBaseQrErr = err;
    }
    expect(supBaseQrErr?.code).toBe('42501');

    let supOutboxErr: any = null;
    try {
      await client.query('SELECT id FROM workforce_staging.notification_outbox WHERE tenant_id = $1', [tenantId]);
    } catch (err) {
      supOutboxErr = err;
    }
    expect(supOutboxErr?.code).toBe('42501');

    // 3. master_reseller: least-privilege masked qr_token (null), revoked BWM admin, ZERO Commerce products/pools/memberships/audit/credentials
    await setAuthContext(client, USER_MASTER_RESELLER, tenantId);
    const mrCpView = await client.query('SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = $1', [baselineCheckpointId]);
    expect(mrCpView.rows.length).toBe(1);
    expect(mrCpView.rows[0].qr_token).toBeNull();
    const mrAdminRes = await client.query('SELECT workforce_staging.is_trusted_bwm_admin($1) AS is_admin', [tenantId]);
    expect(mrAdminRes.rows[0].is_admin).toBe(false);
    expect(
      (await client.query('SELECT id FROM public.products WHERE id = $1', [baselineProdId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE agency_id = $1', [tenantId])).rows.length
    ).toBe(0);
    expect(
      (await client.query('SELECT id FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId])).rows.length
    ).toBe(0);
    let mrAuditErr: any = null;
    try {
      await client.query('SELECT id FROM workforce_staging.credential_audit_logs WHERE id = $1', [baselineAuditId]);
    } catch (err) {
      mrAuditErr = err;
    }
    expect(mrAuditErr?.code).toBe('42501');
    for (const commerceTier of [null, 'OWNER', 'MERCHANT', 'OPERATOR', 'CS']) {
      const helperRes = await client.query(
        'SELECT workforce_staging.is_trusted_commerce_member($1, $2) AS allowed',
        [tenantId, commerceTier]
      );
      expect(helperRes.rows[0].allowed).toBe(false);
    }

    // 3b. OWNER: BWM admin for outbox, but raw qr_token strictly masked to NULL on public.workforce_checkpoints (least-privilege)
    await setAuthContext(client, USER_OWNER, tenantId);
    const ownerCpView = await client.query('SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = $1', [baselineCheckpointId]);
    expect(ownerCpView.rows.length).toBe(1);
    expect(ownerCpView.rows[0].qr_token).toBeNull();
    const ownerAdminRes = await client.query('SELECT workforce_staging.is_trusted_bwm_admin($1) AS is_admin', [tenantId]);
    expect(ownerAdminRes.rows[0].is_admin).toBe(true);

    // 3c. service_role / superuser: Unmasked qr_token strictly restricted to service_role / postgres
    await resetAuthContext(client);
    const srCpView = await client.query('SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = $1', [baselineCheckpointId]);
    expect(srCpView.rows.length).toBe(1);
    expect(srCpView.rows[0].qr_token).toBe(`QR-RM-${timestamp}`);

    // 4. Commerce OPERATOR & CS keep Commerce read but CANNOT read BWM operational tables
    for (const commerceSupportUser of [USER_OPERATOR, USER_CS]) {
      await setAuthContext(client, commerceSupportUser, tenantId);
      expect(
        (await client.query('SELECT id FROM public.products WHERE id = $1', [baselineProdId])).rows.length
      ).toBe(1);
      expect(
        (await client.query('SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE branch_id = $1', [BRANCH_POOL_ID])).rows.length
      ).toBe(1);
      expect(
        (await client.query('SELECT id FROM workforce_staging.facilities WHERE id = $1', [baselineFacilityId])).rows.length
      ).toBe(0);
      expect(
        (await client.query('SELECT id FROM workforce_staging.personnel WHERE id = $1', [baselinePersonnelId])).rows.length
      ).toBe(0);
      expect(
        (await client.query('SELECT id FROM workforce_staging.checkpoints WHERE id = $1', [baselineCheckpointId])).rows.length
      ).toBe(0);
    }

    await resetAuthContext(client);
  });
});
