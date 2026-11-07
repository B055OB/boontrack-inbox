/**
 * __tests__/workforce/membership-revocation.test.ts
 * BWM Gate 1 Round 3H: Revocation & Stale JWT Claim Safety (Blocker E)
 *
 * Directives (CTO Official Mandate Round 3H — Blocker E):
 * 1. Database Authoritative SSOT:
 *    - The single source of truth for access is the database `tenant_memberships` table.
 *    - A valid unexpired JWT cannot bypass a database revocation (`is_active = false`).
 * 2. Revocation Verification:
 *    - Active member (`is_active = true`) has operational access.
 *    - When `is_active = false`, the identical JWT context immediately fails closed:
 *      - `is_trusted_tenant_member` returns FALSE.
 *      - `SELECT` returns 0 rows.
 *      - `INSERT` throws SQLSTATE 42501.
 *      - `UPDATE` affects 0 rows.
 *      - `DELETE` affects 0 rows.
 * 3. Stale / Contradictory JWT Claims:
 *    - Stale tenant claim in `app_metadata.tenant_id` differing from target tenant fails closed.
 * 4. Reactivation & Immediate Restoral:
 *    - Setting `is_active = true` immediately restores access without requiring new credentials.
 * 5. Terminology Accuracy:
 *    - Explicitly labels synthetic claims simulation (`request.jwt.claims` in postgres)
 *      to ensure audit clarity.
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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for membership revocation tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3H — Revocation & Stale JWT Claim Safety (Blocker E)', () => {
  let client: Client;
  const timestamp = Date.now();

  const TENANT_A_SLUG = `revoc-tenant-a-${timestamp}`;
  const TENANT_B_SLUG = `revoc-tenant-b-${timestamp}`;
  let tenantAId: string;
  let tenantBId: string;

  const USER_TEST_ID = '22222222-3333-4444-5555-666666666661';
  let prodAId: string;

  async function setSyntheticAuthClaims(
    pgClient: Client,
    userId: string | null,
    jwtTenantClaim?: string | null,
    appTenantSetting?: string | null
  ) {
    await pgClient.query('SET ROLE authenticated');
    if (userId) {
      const claims: Record<string, any> = {
        sub: userId,
        role: 'authenticated',
      };
      if (jwtTenantClaim) {
        claims.app_metadata = { tenant_id: jwtTenantClaim };
      }
      await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    } else {
      await pgClient.query('RESET request.jwt.claims');
    }

    if (appTenantSetting) {
      await pgClient.query("SELECT set_config('app.current_tenant_id', $1, false)", [appTenantSetting]);
      await pgClient.query("SELECT set_config('app.current_agency_id', $1, false)", [appTenantSetting]);
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

    // 1. Seed Tenant A
    const tARes = await client.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled
      ) VALUES (
        $1, 'Tenant A Alpha Corp', 'service', 'PRO_SCALE', 'active', true, true
      ) RETURNING id
    `, [TENANT_A_SLUG]);
    tenantAId = tARes.rows[0].id;

    // 2. Seed Tenant B
    const tBRes = await client.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled
      ) VALUES (
        $1, 'Tenant B Beta Corp', 'service', 'PRO_SCALE', 'active', true, true
      ) RETURNING id
    `, [TENANT_B_SLUG]);
    tenantBId = tBRes.rows[0].id;

    // 3. Seed Product for Tenant A
    const pRes = await client.query(`
      INSERT INTO workforce_staging.products (
        tenant_id, title, slug, price, stock, category, product_type, is_active, status
      ) VALUES (
        $1, 'Product Alpha', $2, 120000, 15, 'service', 'SERVICE', true, 'ACTIVE'
      ) RETURNING id
    `, [tenantAId, `prod-a-${timestamp}`]);
    prodAId = pRes.rows[0].id;

    // 4. Seed Initially Active Membership for USER_TEST_ID on Tenant A (Role: MERCHANT)
    await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES (
        $1, $2, $3, 'MERCHANT', true
      )
    `, [USER_TEST_ID, tenantAId, TENANT_A_SLUG]);
  }, 30000);

  afterAll(async () => {
    let pCount = 0;
    let mCount = 0;
    let tCount = 0;

    if (client) {
      try {
        await resetAuthContext(client);

        const pDel = await client.query(
          'DELETE FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAId, tenantBId]
        );
        pCount = pDel.rowCount ?? 0;

        const mDel = await client.query(
          'DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAId, tenantBId]
        );
        mCount = mDel.rowCount ?? 0;

        const tDel = await client.query(
          'DELETE FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [tenantAId, tenantBId]
        );
        tCount = tDel.rowCount ?? 0;

        // Verify clean deletion with independent counts
        const pCheck = await client.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAId, tenantBId]
        );
        expect(pCheck.rows[0].count).toBe(0);

        const mCheck = await client.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.tenant_memberships WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAId, tenantBId]
        );
        expect(mCheck.rows[0].count).toBe(0);

        const tCheck = await client.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [tenantAId, tenantBId]
        );
        expect(tCheck.rows[0].count).toBe(0);
      } finally {
        await client.end();
      }
    }

    console.log('[Membership Revocation Cleanup Verified] Fixtures Removed:', {
      productsRemoved: pCount,
      membershipsRemoved: mCount,
      tenantsRemoved: tCount,
    });
  }, 30000);

  test('1. Baseline Active Membership: User has valid operational access to Tenant A', async () => {
    await setSyntheticAuthClaims(client, USER_TEST_ID, tenantAId, tenantAId);

    // 1. Function verifies active membership
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantAId]
    );
    expect(checkRes.rows[0].is_member).toBe(true);

    // 2. Can SELECT product
    const pRead = await client.query('SELECT * FROM workforce_staging.products WHERE id = $1', [prodAId]);
    expect(pRead.rows.length).toBe(1);

    // 3. Can UPDATE product (as MERCHANT)
    const pUpdate = await client.query(
      'UPDATE workforce_staging.products SET price = 130000 WHERE id = $1',
      [prodAId]
    );
    expect(pUpdate.rowCount).toBe(1);

    await resetAuthContext(client);
  });

  test('2. Revoked Membership (is_active = FALSE): Fails closed immediately under identical JWT claims', async () => {
    // Administratively revoke membership in database (SSOT)
    await resetAuthContext(client);
    await client.query(`
      UPDATE workforce_staging.tenant_memberships 
      SET is_active = FALSE 
      WHERE user_id = $1 AND tenant_id = $2
    `, [USER_TEST_ID, tenantAId]);

    // Present the EXACT SAME JWT claims as Test 1 (valid signature, matching tenant claim)
    await setSyntheticAuthClaims(client, USER_TEST_ID, tenantAId, tenantAId);

    // 1. is_trusted_tenant_member must return FALSE immediately
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantAId]
    );
    expect(checkRes.rows[0].is_member).toBe(false);

    // 2. SELECT returns 0 rows (fail closed)
    const pRead = await client.query('SELECT * FROM workforce_staging.products WHERE id = $1', [prodAId]);
    expect(pRead.rows.length).toBe(0);

    // 3. INSERT fails with SQLSTATE 42501 (RLS Policy Violation)
    let insertErr: any = null;
    try {
      await client.query(`
        INSERT INTO workforce_staging.products (
          tenant_id, title, slug, price, stock, category, product_type
        ) VALUES (
          $1, 'Revoked User Rogue Product', $2, 90000, 5, 'service', 'SERVICE'
        )
      `, [tenantAId, `revoked-rogue-${timestamp}`]);
    } catch (err) {
      insertErr = err;
    }
    expect(insertErr).toBeDefined();
    expect(insertErr.code).toBe('42501');

    // 4. UPDATE affects 0 rows
    const pUpdate = await client.query(
      'UPDATE workforce_staging.products SET price = 999999 WHERE id = $1',
      [prodAId]
    );
    expect(pUpdate.rowCount).toBe(0);

    // 5. DELETE affects 0 rows
    const pDelete = await client.query(
      'DELETE FROM workforce_staging.products WHERE id = $1',
      [prodAId]
    );
    expect(pDelete.rowCount).toBe(0);

    await resetAuthContext(client);
  });

  test('3. Stale JWT Claim Mismatch: Stale app_metadata.tenant_id differing from target tenant fails closed', async () => {
    // Reactivate membership for Tenant A
    await resetAuthContext(client);
    await client.query(`
      UPDATE workforce_staging.tenant_memberships 
      SET is_active = TRUE 
      WHERE user_id = $1 AND tenant_id = $2
    `, [USER_TEST_ID, tenantAId]);

    // User is active for Tenant A, but presents a token with stale claim claiming Tenant B
    await setSyntheticAuthClaims(client, USER_TEST_ID, tenantBId, tenantAId);

    // is_trusted_tenant_member must detect mismatch between JWT tenant claim (B) and target tenant (A)
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantAId]
    );
    expect(checkRes.rows[0].is_member).toBe(false);

    // Querying Tenant A with mismatched claim returns 0 rows
    const pReadA = await client.query('SELECT * FROM workforce_staging.products WHERE id = $1', [prodAId]);
    expect(pReadA.rows.length).toBe(0);

    // Querying Tenant B (where claim matches, but NO membership exists) returns 0 rows
    const checkResB = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantBId]
    );
    expect(checkResB.rows[0].is_member).toBe(false);

    await resetAuthContext(client);
  });

  test('4. Reactivation: Setting is_active = TRUE immediately restores operational access', async () => {
    // Present matching claims for Tenant A
    await setSyntheticAuthClaims(client, USER_TEST_ID, tenantAId, tenantAId);

    // Verified that access is cleanly restored
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantAId]
    );
    expect(checkRes.rows[0].is_member).toBe(true);

    const pRead = await client.query('SELECT price FROM workforce_staging.products WHERE id = $1', [prodAId]);
    expect(pRead.rows.length).toBe(1);
    expect(Number(pRead.rows[0].price)).toBe(130000);

    // Operational mutation works again
    const pUpdate = await client.query(
      'UPDATE workforce_staging.products SET price = 140000 WHERE id = $1',
      [prodAId]
    );
    expect(pUpdate.rowCount).toBe(1);

    await resetAuthContext(client);
  });

  test('5. Complete Membership Row Deletion Fails Closed Immediately', async () => {
    // Delete the membership record entirely
    await resetAuthContext(client);
    await client.query(`
      DELETE FROM workforce_staging.tenant_memberships 
      WHERE user_id = $1 AND tenant_id = $2
    `, [USER_TEST_ID, tenantAId]);

    // Present valid authenticated JWT claims
    await setSyntheticAuthClaims(client, USER_TEST_ID, tenantAId, tenantAId);

    // Without membership record, access is strictly denied
    const checkRes = await client.query(
      'SELECT workforce_staging.is_trusted_tenant_member($1) AS is_member',
      [tenantAId]
    );
    expect(checkRes.rows[0].is_member).toBe(false);

    const pRead = await client.query('SELECT * FROM workforce_staging.products WHERE id = $1', [prodAId]);
    expect(pRead.rows.length).toBe(0);

    await resetAuthContext(client);
  });
});
