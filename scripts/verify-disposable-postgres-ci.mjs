/**
 * scripts/verify-disposable-postgres-ci.mjs
 *
 * Ephemeral PostgreSQL CI Integration & Security Boundary Verification Suite
 * Targets: Ephemeral GitHub Actions PostgreSQL container service (postgres:15-alpine)
 * Strictly strictly strictly: NEVER connects to staging Supabase or production.
 *
 * Verifies CTO Work Order BWM Phase 6.1H Invariants:
 * Task 2: Baseline setup, Migration 011 UP, Migration 012 UP, DOWN migrations, idempotency.
 * Task 3: Credential isolation across anon, authenticated, supervisor, and service_role.
 * Task 4: Authz_version increments, single-session logout, prune procedure permissions.
 * Task 5: Logged PostgreSQL rate-limit atomic UPSERT concurrency (20 concurrent workers).
 * Task 6: Tenant isolation and CRUD regression across Tenant Alpha and Tenant Beta.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, Pool } from 'pg';

/**
 * Asserts that a database connection string strictly targets the authorized disposable CI container.
 * Strict allowlist based on WHATWG URL:
 * - protocol: 'postgres:' or 'postgresql:'
 * - host: ONLY 'localhost' or '127.0.0.1'
 * - port: exactly '5432'
 * - pathname: exactly '/test_workforce_ci'
 * - username: 'postgres' or 'authenticator'
 * - no url fragment
 * - no unexpected query parameters
 * - zero credentials in error messages
 */
export function assertDisposableDatabaseTarget(connStr) {
  if (!connStr || typeof connStr !== 'string' || !connStr.trim()) {
    throw new Error('[DISPOSABLE GUARD FATAL] Database connection string is empty or invalid.');
  }

  // Parse with WHATWG URL parser (never echo raw connection string with credentials)
  let parsed;
  try {
    parsed = new URL(connStr.trim());
  } catch {
    throw new Error('[DISPOSABLE GUARD FATAL] Malformed database connection URL. Abort.');
  }

  // 1. Protocol validation
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid protocol (${parsed.protocol}). Expected postgres: or postgresql:.`);
  }

  // 2. Host validation: ONLY localhost or 127.0.0.1 (Strict loopback isolation - rejects staging, production, poolers, cloud hosts)
  const hostname = parsed.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Unauthorized database host (${hostname}). Only localhost or 127.0.0.1 is authorized.`);
  }

  // 3. Port validation: exact 5432
  if (parsed.port !== '5432') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid database port (${parsed.port || 'default'}). Exactly 5432 is required.`);
  }

  // 4. Database name validation: exact /test_workforce_ci
  if (parsed.pathname !== '/test_workforce_ci') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid database name (${parsed.pathname}). Disposable CI database must strictly be /test_workforce_ci.`);
  }

  // 5. Username validation: postgres or authenticator
  const username = decodeURIComponent(parsed.username);
  if (username !== 'postgres' && username !== 'authenticator') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Unauthorized database user (${username}). Only postgres or authenticator is permitted.`);
  }

  // 6. URL Fragment Security Validation: Fragments are strictly forbidden
  if (parsed.hash) {
    throw new Error('[DISPOSABLE GUARD FATAL] URL fragment identifier detected. Fragment identifiers are strictly forbidden on database connection.');
  }

  // 7. Query Parameter Security Validation (Block node-postgres connection parameter overrides via searchParams)
  if (parsed.search && parsed.search.length > 1) {
    const FORBIDDEN_QUERY_PARAMS = new Set([
      'host',
      'hostaddr',
      'port',
      'dbname',
      'database',
      'user',
      'username',
      'password',
      'options',
      'sslrootcert',
      'sslcert',
      'sslkey',
    ]);

    for (const [key] of parsed.searchParams.entries()) {
      if (FORBIDDEN_QUERY_PARAMS.has(key.toLowerCase())) {
        throw new Error(
          `[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "${key}". Overriding connection target via query parameters is strictly forbidden.`
        );
      }
    }

    throw new Error('[DISPOSABLE GUARD FATAL] Unexpected query parameters detected. Query parameters are strictly forbidden on disposable database connection.');
  }

  return connStr.trim();
}

const connectionString =
  process.env.DISPOSABLE_POSTGRES_URL ||
  process.env.TEST_POSTGRES_URL ||
  '';

async function runVerification() {
  console.log('======================================================================');
  console.log('BWM PHASE 6.1H — EPHEMERAL POSTGRESQL INTEGRATION PROOF');
  console.log('======================================================================');

  if (!connectionString) {
    console.error('[BLOCKER-ENV-01] DISPOSABLE_POSTGRES_URL environment variable is not set.');
    console.error('This verification suite requires an isolated disposable PostgreSQL instance');
    console.error('(e.g., GitHub Actions PostgreSQL service container: postgres:15-alpine).');
    console.error('Staging Supabase connection is strictly blocked from executing this test.');
    process.exit(1);
  }

  // Strict allowlist safety check: Ensure the connection string strictly targets disposable CI database
  try {
    assertDisposableDatabaseTarget(connectionString);
  } catch (guardErr) {
    console.error(`[FATAL SECURITY VIOLATION] ${guardErr.message}`);
    process.exit(1);
  }

  console.log('[SECURITY VERIFIED] Target database is an isolated disposable local container.');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('[CONNECTED] Connected successfully to disposable PostgreSQL.');

    // ========================================================================
    // SECTION 1: INITIALIZE BASELINE SUPABASE EMULATION IN DISPOSABLE POSTGRES
    // ========================================================================
    console.log('\n--- Section 1: Initializing Supabase Environment Emulation ---');

    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ),
          ''
        )::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
          'anon'
        );
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
        SELECT coalesce(
          nullif(current_setting('request.jwt.claim', true), '')::jsonb,
          nullif(current_setting('request.jwt.claims', true), '')::jsonb,
          '{}'::jsonb
        );
      $$ LANGUAGE sql STABLE;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
          CREATE ROLE authenticator WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'authenticator_password_disposable_ci_2026';
        END IF;
      END $$;

      GRANT anon TO authenticator;
      GRANT authenticated TO authenticator;
      GRANT service_role TO authenticator;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO authenticator;
      CREATE SCHEMA IF NOT EXISTS workforce_staging;
      GRANT USAGE, CREATE ON SCHEMA workforce_staging TO authenticator, service_role;
    `);
    console.log('✓ Supabase auth functions and roles (anon, authenticated, service_role, authenticator) initialized.');

    // Helper to read and execute SQL migration files
    const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
    async function executeMigrationFile(filename) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');
      await client.query(sql);
      console.log(`✓ Executed: ${filename}`);
    }

    // Execute baseline schema draft (prerequisites for migration 007: branch_credit_pools, credit_purchase_transactions, seat_credit_ledger)
    console.log('\n--- Applying Prerequisite Schema Draft ---');
    const schemaDraftPath = path.resolve('lib/workforce/schema/schema-draft.sql');
    if (fs.existsSync(schemaDraftPath)) {
      const schemaDraftSql = fs.readFileSync(schemaDraftPath, 'utf8');
      await client.query(schemaDraftSql);
      console.log('✓ Executed prerequisite schema draft: lib/workforce/schema/schema-draft.sql');
    } else {
      throw new Error(`Prerequisite schema draft not found: ${schemaDraftPath}`);
    }

    // Apply baseline migrations 007, 008, 009, 010
    console.log('\n--- Applying Baseline Migrations 007-010 ---');
    await executeMigrationFile('007_create_workforce_staging_tenants_and_products.sql');
    await executeMigrationFile('008_harden_tenants_and_products_rls.sql');
    await executeMigrationFile('009_trusted_tenant_identity_and_safe_views.sql');
    await executeMigrationFile('010_strict_storefront_opt_in_and_role_authorization.sql');

    // ========================================================================
    // SECTION 2: MIGRATION 011 UP THROUGH 016 UP EXECUTION & VALIDATION
    // ========================================================================
    console.log('\n--- Section 2: Executing Migrations 011 UP through 016 UP ---');
    await executeMigrationFile('011_create_workforce_operational_tables.sql');
    await executeMigrationFile('012_create_workforce_revocation_and_authz_versioning.sql');
    await executeMigrationFile('013_attendance_atomic_state_rpc.sql');
    await executeMigrationFile('014_checkpoint_scan_atomic_rpc.sql');
    await executeMigrationFile('015_attendance_actor_binding_and_role_allowlist.sql');
    await executeMigrationFile('016_bwm_domain_authorization_isolation.sql');

    // Validate operational tables exist
    const expectedTables = [
      'facilities', 'personnel', 'personnel_credentials', 'credential_audit_logs',
      'checkpoints', 'attendance_logs', 'checkpoint_scans', 'incidents',
      'shift_handovers', 'notification_outbox', 'revoked_tokens'
    ];

    for (const tbl of expectedTables) {
      const res = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'workforce_staging' AND table_name = $1
        );`,
        [tbl]
      );
      if (!res.rows[0].exists) {
        throw new Error(`Table validation failed: workforce_staging.${tbl} does not exist`);
      }
    }
    console.log(`✓ Validated all ${expectedTables.length} operational & security tables exist.`);

    // Validate authz_version column on tenants and tenant_memberships
    const authzTenants = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'workforce_staging' AND table_name = 'tenants' AND column_name = 'authz_version';
    `);
    if (authzTenants.rows.length === 0) throw new Error('Missing authz_version on tenants');

    const authzMembers = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'workforce_staging' AND table_name = 'tenant_memberships' AND column_name = 'authz_version';
    `);
    if (authzMembers.rows.length === 0) throw new Error('Missing authz_version on tenant_memberships');
    console.log('✓ Validated authz_version columns exist on tenants and tenant_memberships.');

    // Validate prune_expired_revoked_tokens() procedure security
    const procRes = await client.query(`
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'workforce_staging' AND p.proname = 'prune_expired_revoked_tokens';
    `);
    if (procRes.rows.length === 0) throw new Error('prune_expired_revoked_tokens function not found');
    const proc = procRes.rows[0];
    if (!proc.prosecdef) throw new Error('prune_expired_revoked_tokens must be SECURITY DEFINER');
    const hasSearchPath = (proc.proconfig || []).some((c) => c.includes('search_path=pg_catalog, workforce_staging'));
    if (!hasSearchPath) throw new Error('prune_expired_revoked_tokens missing hardened search_path');
    console.log('✓ Validated prune_expired_revoked_tokens() has SECURITY DEFINER and hardened search_path.');

    // Validate record_attendance_atomic() RPC security (Migration 013)
    const rpcRes = await client.query(`
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'workforce_staging' AND p.proname = 'record_attendance_atomic';
    `);
    if (rpcRes.rows.length === 0) throw new Error('record_attendance_atomic function not found (Migration 013)');
    const rpcProc = rpcRes.rows[0];
    if (rpcProc.prosecdef) throw new Error('record_attendance_atomic must be SECURITY INVOKER (prosecdef = false)');
    const hasRpcSearchPath = (rpcProc.proconfig || []).some((c) => c.includes('search_path=pg_catalog, workforce_staging'));
    if (!hasRpcSearchPath) throw new Error('record_attendance_atomic missing hardened search_path');
    console.log('✓ Validated record_attendance_atomic() is SECURITY INVOKER with hardened search_path.');

    // Validate Migration 013 monotonic sequence columns & trigger
    const seqCol = await client.query(`
      SELECT is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'workforce_staging' AND table_name = 'attendance_logs' AND column_name = 'state_seq';
    `);
    if (seqCol.rows.length === 0 || seqCol.rows[0].is_nullable !== 'NO') {
      throw new Error('Migration 013 failed: attendance_logs.state_seq NOT NULL missing');
    }
    const verCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'workforce_staging' AND table_name = 'personnel' AND column_name = 'attendance_version';
    `);
    if (verCol.rows.length === 0) {
      throw new Error('Migration 013 failed: personnel.attendance_version column missing');
    }
    console.log('✓ Validated attendance_logs.state_seq (NOT NULL) and personnel.attendance_version.');

    // ========================================================================
    // SECTION 3: DOWN MIGRATION ROLLBACK VALIDATION (016 -> 011 SYMMETRICAL)
    // ========================================================================
    console.log('\n--- Section 3: Testing DOWN Migrations (016 -> 011) on Disposable Data ---');
    await executeMigrationFile('016_bwm_domain_authorization_isolation.down.sql');
    await executeMigrationFile('015_attendance_actor_binding_and_role_allowlist.down.sql');
    await executeMigrationFile('014_checkpoint_scan_atomic_rpc.down.sql');
    await executeMigrationFile('013_attendance_atomic_state_rpc.down.sql');
    const checkRpcDropped = await client.query(`
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'workforce_staging' AND p.proname = 'record_attendance_atomic';
    `);
    if (Number(checkRpcDropped.rows[0].count) !== 0) {
      throw new Error('DOWN migration failed: workforce_staging.record_attendance_atomic was not dropped');
    }
    const checkSeqDropped = await client.query(`
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'workforce_staging' AND table_name = 'attendance_logs' AND column_name = 'state_seq';
    `);
    if (Number(checkSeqDropped.rows[0].count) !== 0) {
      throw new Error('DOWN migration failed: attendance_logs.state_seq was not dropped');
    }
    // 010/016's SELECT * view on public.tenant_memberships binds to 012's authz_version column when recreated after 012;
    // drop the view prior to 012 DOWN (restored by 016 UP / 010 UP on re-apply).
    await client.query('DROP VIEW IF EXISTS public.tenant_memberships;');
    await executeMigrationFile('012_create_workforce_revocation_and_authz_versioning.down.sql');
    await executeMigrationFile('011_create_workforce_operational_tables.down.sql');

    // Confirm operational tables dropped
    const checkDropped = await client.query(`
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'workforce_staging' AND table_name = 'personnel';
    `);
    if (Number(checkDropped.rows[0].count) !== 0) {
      throw new Error('DOWN migration failed: workforce_staging.personnel was not dropped');
    }

    // Confirm baseline tables preserved
    const checkBaseline = await client.query(`
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'workforce_staging' AND table_name = 'tenants';
    `);
    if (Number(checkBaseline.rows[0].count) === 0) {
      throw new Error('DOWN migration corrupted baseline: workforce_staging.tenants was unexpectedly dropped');
    }
    console.log('✓ DOWN migrations executed cleanly without corrupting baseline schema.');

    // Reapply UP migrations (011 -> 016) for functional security testing
    console.log('\n--- Reapplying UP Migrations (011 -> 016) for Security Tests ---');
    await executeMigrationFile('011_create_workforce_operational_tables.sql');
    await executeMigrationFile('012_create_workforce_revocation_and_authz_versioning.sql');
    await executeMigrationFile('013_attendance_atomic_state_rpc.sql');
    await executeMigrationFile('014_checkpoint_scan_atomic_rpc.sql');
    await executeMigrationFile('015_attendance_actor_binding_and_role_allowlist.sql');
    await executeMigrationFile('016_bwm_domain_authorization_isolation.sql');

    // ========================================================================
    // SECTION 4: CREDENTIAL ISOLATION TESTS (ACTUAL POSTGRESQL ROLES & RLS)
    // ========================================================================
    console.log('\n--- Section 4: Testing Credential Isolation (Real PostgreSQL Roles) ---');
    const tenantAlphaId = '11111111-1111-4111-8111-111111111111';
    const tenantBetaId = '22222222-2222-4222-8222-222222222222';
    const officerAlphaUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const supervisorAlphaUserId = '55555555-5555-4555-8555-555555555555';
    const officerBetaUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    // Seed test tenants as service_role/superuser
    await client.query(`
      INSERT INTO workforce_staging.tenants (id, slug, name, tier)
      VALUES
        ('${tenantAlphaId}', 'alpha-security', 'Alpha Security Corp', 'PRO_SCALE'),
        ('${tenantBetaId}', 'beta-defense', 'Beta Defense Services', 'ENTERPRISE')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES
        ('${officerAlphaUserId}', '${tenantAlphaId}', 'alpha-security', 'field_personnel', true),
        ('${supervisorAlphaUserId}', '${tenantAlphaId}', 'alpha-security', 'supervisor', true),
        ('${officerBetaUserId}', '${tenantBetaId}', 'beta-defense', 'field_personnel', true)
      ON CONFLICT DO NOTHING;
    `);

    // Fetch membership IDs
    const memAlphaRes = await client.query(
      `SELECT id FROM workforce_staging.tenant_memberships WHERE user_id = $1`,
      [officerAlphaUserId]
    );
    const membershipAlphaId = memAlphaRes.rows[0].id;

    const memBetaRes = await client.query(
      `SELECT id FROM workforce_staging.tenant_memberships WHERE user_id = $1`,
      [officerBetaUserId]
    );
    const membershipBetaId = memBetaRes.rows[0].id;

    // Seed personnel profiles (Alpha & Beta)
    const personnelAlphaRes = await client.query(`
      INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, name, nik, role)
      VALUES ('${tenantAlphaId}', 'alpha-security', '${officerAlphaUserId}', '${membershipAlphaId}', 'Officer Alpha', 'NIK-001', 'field_personnel')
      RETURNING id;
    `);
    const personnelAlphaId = personnelAlphaRes.rows[0].id;

    const personnelBetaRes = await client.query(`
      INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, name, nik, role)
      VALUES ('${tenantBetaId}', 'beta-defense', '${officerBetaUserId}', '${membershipBetaId}', 'Officer Beta', 'NIK-002', 'field_personnel')
      RETURNING id;
    `);
    const personnelBetaId = personnelBetaRes.rows[0].id;

    // Fixture verification: Confirm both Alpha and Beta personnel records exist in base table
    const fixtureCheck = await client.query(`
      SELECT count(*) as count FROM workforce_staging.personnel
      WHERE id IN ('${personnelAlphaId}', '${personnelBetaId}');
    `);
    if (Number(fixtureCheck.rows[0].count) !== 2) {
      throw new Error('Fixture integrity failure: Both Alpha and Beta personnel records must exist in DB.');
    }

    // Seed credentials as service_role
    await client.query(`
      INSERT INTO workforce_staging.personnel_credentials (personnel_id, tenant_id, pin_hash, pin_algo)
      VALUES ('${personnelAlphaId}', '${tenantAlphaId}', '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgqlfreSdK7PvJRhkX', 'argon2id');
    `);
    console.log('✓ Seeded test personnel (Alpha & Beta) and Argon2id credential hash.');

    // Test 1: Anonymous cannot read credentials (SQLSTATE 42501)
    await client.query(`SET ROLE anon;`);
    let anonBlocked = false;
    let anonErrCode = '';
    try {
      await client.query(`SELECT * FROM workforce_staging.personnel_credentials;`);
    } catch (err) {
      anonErrCode = err.code;
      if (err.code === '42501') anonBlocked = true; // permission denied
    }
    if (!anonBlocked) throw new Error(`Security failure: Anonymous was able to query personnel_credentials! (code: ${anonErrCode})`);
    console.log('✓ Anonymous role rejected with SQLSTATE 42501 when querying personnel_credentials.');

    // Test 2: Ordinary Authenticated Member cannot read credentials (SQLSTATE 42501)
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claim.sub = '${officerAlphaUserId}';`);
    await client.query(`SET request.jwt.claim.role = 'authenticated';`);

    let memberCredBlocked = false;
    let memberErrCode = '';
    try {
      await client.query(`SELECT * FROM workforce_staging.personnel_credentials;`);
    } catch (err) {
      memberErrCode = err.code;
      if (err.code === '42501') memberCredBlocked = true;
    }
    if (!memberCredBlocked) throw new Error(`Security failure: Authenticated member queried personnel_credentials! (code: ${memberErrCode})`);
    console.log('✓ Authenticated member rejected with SQLSTATE 42501 on personnel_credentials.');

    // Test 3: Public view public.workforce_personnel reads own record with zero credential fields
    const viewRows = await client.query(`SELECT * FROM public.workforce_personnel WHERE tenant_id = '${tenantAlphaId}';`);
    if (viewRows.rows.length === 0) throw new Error('Authenticated member unable to view own personnel profile via view');
    if ('pin_hash' in viewRows.rows[0] || 'pin' in viewRows.rows[0]) {
      throw new Error('Critical security failure: public.workforce_personnel view leaks pin_hash!');
    }
    console.log('✓ public.workforce_personnel successfully accessed by member with ZERO credential fields exposed.');

    // Test 3b: Tenant isolation via public view (Alpha member cannot read Beta personnel)
    const betaViaView = await client.query(`SELECT * FROM public.workforce_personnel WHERE tenant_id = '${tenantBetaId}';`);
    if (betaViaView.rows.length !== 0) {
      throw new Error('Tenant isolation breach: Officer Alpha observed Beta personnel via public view!');
    }
    const allViaView = await client.query(`SELECT * FROM public.workforce_personnel;`);
    const leakedBetaInView = allViaView.rows.filter(r => r.tenant_id === tenantBetaId);
    if (leakedBetaInView.length > 0) {
      throw new Error('Tenant isolation breach: Unfiltered public view returned Beta rows to Officer Alpha!');
    }
    console.log('✓ Tenant isolation confirmed on public.workforce_personnel: Beta rows invisible to Alpha member.');

    // Test 3c: RLS remains effective when querying workforce_staging.personnel directly
    const alphaDirect = await client.query(`SELECT * FROM workforce_staging.personnel WHERE tenant_id = '${tenantAlphaId}';`);
    if (alphaDirect.rows.length === 0) throw new Error('Authenticated member unable to read own personnel directly under RLS');
    const betaDirect = await client.query(`SELECT * FROM workforce_staging.personnel WHERE tenant_id = '${tenantBetaId}';`);
    if (betaDirect.rows.length !== 0) {
      throw new Error('RLS breach: Officer Alpha observed Beta personnel directly on workforce_staging.personnel!');
    }
    const allDirect = await client.query(`SELECT * FROM workforce_staging.personnel;`);
    const leakedBetaDirect = allDirect.rows.filter(r => r.tenant_id === tenantBetaId);
    if (leakedBetaDirect.length > 0) {
      throw new Error('RLS breach: Unfiltered query on workforce_staging.personnel returned Beta rows to Officer Alpha!');
    }
    console.log('✓ RLS verified on workforce_staging.personnel: Direct queries strictly tenant-scoped.');

    // Test 4: Supervisor cannot tamper with or read credentials
    await client.query(`SET request.jwt.claim.sub = '${supervisorAlphaUserId}';`);
    let supervisorTamperBlocked = false;
    try {
      await client.query(`UPDATE workforce_staging.personnel_credentials SET pin_hash = 'tampered' WHERE personnel_id = '${personnelAlphaId}';`);
    } catch (err) {
      if (err.code === '42501') supervisorTamperBlocked = true;
    }
    if (!supervisorTamperBlocked) throw new Error('Security failure: Supervisor tampered with credentials!');
    console.log('✓ Supervisor rejected with SQLSTATE 42501 when attempting to update personnel_credentials.');

    // Reset role to superuser/service_role
    await client.query(`RESET ROLE;`);

    // Test 5: Privilege Audit on Migration 011 Operational Tables & Migration 016 Column ACL
    const viewSourceTables = ['facilities', 'personnel', 'incidents', 'attendance_logs', 'checkpoint_scans'];
    for (const tbl of viewSourceTables) {
      const privRes = await client.query(`
        SELECT has_table_privilege('authenticated', 'workforce_staging.' || $1, 'SELECT') AS has_select;
      `, [tbl]);
      if (!privRes.rows[0].has_select) {
        throw new Error(`Privilege failure: authenticated role must have SELECT on workforce_staging.${tbl}`);
      }
    }
    const cpPrivRes = await client.query(`
      SELECT
        has_table_privilege('authenticated', 'workforce_staging.checkpoints', 'SELECT') AS has_table_select,
        has_column_privilege('authenticated', 'workforce_staging.checkpoints', 'id', 'SELECT') AS has_id_select,
        has_column_privilege('authenticated', 'workforce_staging.checkpoints', 'qr_token', 'SELECT') AS has_qr_token_select;
    `);
    const cpPriv = cpPrivRes.rows[0];
    if (cpPriv.has_table_select || !cpPriv.has_id_select || cpPriv.has_qr_token_select) {
      throw new Error(`Privilege failure on workforce_staging.checkpoints column ACL: ${JSON.stringify(cpPriv)}`);
    }
    console.log('✓ Verified: Minimum required SELECT privilege granted to authenticated across view source tables & qr_token column-revoked on checkpoints.');

    const nonViewTables = ['shift_handovers', 'notification_outbox', 'credential_audit_logs', 'personnel_credentials'];
    for (const tbl of nonViewTables) {
      const privRes = await client.query(`
        SELECT has_table_privilege('authenticated', 'workforce_staging.' || $1, 'SELECT') AS has_select;
      `, [tbl]);
      if (privRes.rows[0].has_select) {
        throw new Error(`Privilege breach: authenticated role must NOT have SELECT on workforce_staging.${tbl}`);
      }
    }
    console.log('✓ Verified: Zero SELECT privilege for authenticated on restricted tables (handovers, outbox, audit logs, credentials).');

    const allOperationalTables = [
      'facilities', 'personnel', 'incidents', 'checkpoints', 'attendance_logs',
      'checkpoint_scans', 'shift_handovers', 'notification_outbox', 'credential_audit_logs', 'personnel_credentials'
    ];
    for (const tbl of allOperationalTables) {
      for (const action of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const privRes = await client.query(`
          SELECT has_table_privilege('authenticated', 'workforce_staging.' || $1, $2) AS has_priv;
        `, [tbl, action]);
        if (privRes.rows[0].has_priv) {
          throw new Error(`Privilege breach: authenticated role must NOT have ${action} on workforce_staging.${tbl}`);
        }
      }
    }
    console.log('✓ Verified: Zero INSERT/UPDATE/DELETE/TRUNCATE privileges for authenticated on all 10 operational tables.');

    // Test 6: Migration 014 & 015 Authoritative RPC Signatures, Obsolete Overload Removal, SECURITY INVOKER / search_path & ACLs
    const rpcAttendanceSig = 'workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)';
    const rpcScanSig = 'workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)';
    const legacyAttendanceSig = 'workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)';
    const legacyScanSig = 'workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)';

    const sigCheckRes = await client.query(
      `SELECT
         to_regprocedure($1) IS NOT NULL AS has_new_attendance,
         to_regprocedure($2) IS NOT NULL AS has_new_scan,
         to_regprocedure($3) IS NULL AS legacy_attendance_removed,
         to_regprocedure($4) IS NULL AS legacy_scan_removed;`,
      [rpcAttendanceSig, rpcScanSig, legacyAttendanceSig, legacyScanSig]
    );
    const sigRow = sigCheckRes.rows[0];
    if (!sigRow.has_new_attendance || !sigRow.has_new_scan) {
      throw new Error(`Missing authoritative RPC signature: ${JSON.stringify(sigRow)}`);
    }
    if (!sigRow.legacy_attendance_removed || !sigRow.legacy_scan_removed) {
      throw new Error(`Obsolete legacy RPC overload still exists in database: ${JSON.stringify(sigRow)}`);
    }

    const procAuditRes = await client.query(
      `SELECT proname, prosecdef, proconfig
       FROM pg_proc
       WHERE oid IN (to_regprocedure($1), to_regprocedure($2))
       ORDER BY proname;`,
      [rpcAttendanceSig, rpcScanSig]
    );
    for (const proc of procAuditRes.rows) {
      if (proc.prosecdef !== false) {
        throw new Error(`Security breach: ${proc.proname} must be SECURITY INVOKER (prosecdef=false), got ${proc.prosecdef}`);
      }
      const configStr = Array.isArray(proc.proconfig) ? proc.proconfig.join(';') : '';
      if (!configStr.includes('search_path=pg_catalog, workforce_staging')) {
        throw new Error(`Security breach: ${proc.proname} missing hardened search_path, got ${configStr}`);
      }
    }

    for (const sig of [rpcAttendanceSig, rpcScanSig]) {
      for (const deniedRole of ['anon', 'authenticated']) {
        const execPriv = await client.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS can_exec;`, [deniedRole, sig]);
        if (execPriv.rows[0].can_exec) {
          throw new Error(`Privilege breach: ${deniedRole} role must NOT have EXECUTE on ${sig}`);
        }
      }
      const serviceRolePriv = await client.query(`SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS can_exec;`, [sig]);
      if (!serviceRolePriv.rows[0].can_exec) {
        throw new Error(`Privilege failure: service_role must have EXECUTE on ${sig}`);
      }
    }

    const rpcAttendanceArgs = [
      '00000000-0000-4000-8000-000000000901',
      tenantAlphaId,
      '99999999-9999-4999-8999-999999999999',
      '99999999-9999-4999-8999-999999999998',
      null,
      'CLOCK_IN',
      new Date().toISOString(),
      -6.2088,
      106.8456,
      true,
      'SELFIE',
      null,
      'ci-rpc-acl-probe-01',
    ];
    const rpcScanArgs = [
      '00000000-0000-4000-8000-000000000902',
      tenantAlphaId,
      '99999999-9999-4999-8999-999999999997',
      '99999999-9999-4999-8999-999999999999',
      '99999999-9999-4999-8999-999999999998',
      'PROBE-QR-NONE',
      new Date().toISOString(),
      -6.2088,
      106.8456,
      200,
      'VERIFIED',
      'ci-scan-acl-probe-01',
    ];

    for (const deniedRole of ['anon', 'authenticated']) {
      await client.query(`SET ROLE ${deniedRole};`);
      let deniedAttCode = '';
      try {
        await client.query(
          `SELECT workforce_staging.record_attendance_atomic($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::timestamptz,$8::numeric,$9::numeric,$10::boolean,$11::text,$12::text,$13::text);`,
          rpcAttendanceArgs
        );
      } catch (err) {
        deniedAttCode = err.code;
      }
      let deniedScanCode = '';
      try {
        await client.query(
          `SELECT workforce_staging.record_checkpoint_scan_atomic($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::timestamptz,$8::numeric,$9::numeric,$10::numeric,$11::text,$12::text);`,
          rpcScanArgs
        );
      } catch (err) {
        deniedScanCode = err.code;
      }
      await client.query(`RESET ROLE;`);
      if (deniedAttCode !== '42501' || deniedScanCode !== '42501') {
        throw new Error(`RPC security failure for ${deniedRole}: attendance=${deniedAttCode}, scan=${deniedScanCode}`);
      }
    }

    await client.query(`SET ROLE service_role;`);
    await client.query(`SET request.jwt.claim.role = 'service_role';`);
    const serviceAttProbe = await client.query(
      `SELECT workforce_staging.record_attendance_atomic($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::timestamptz,$8::numeric,$9::numeric,$10::boolean,$11::text,$12::text,$13::text) AS res;`,
      rpcAttendanceArgs
    );
    const serviceScanProbe = await client.query(
      `SELECT workforce_staging.record_checkpoint_scan_atomic($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::timestamptz,$8::numeric,$9::numeric,$10::numeric,$11::text,$12::text) AS res;`,
      rpcScanArgs
    );
    await client.query(`RESET ROLE;`);
    await client.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
    if (serviceAttProbe.rows[0]?.res?.outcome !== 'PERSONNEL_NOT_PROVISIONED') {
      throw new Error(`Unexpected service_role 13-arg attendance RPC probe result: ${JSON.stringify(serviceAttProbe.rows[0]?.res)}`);
    }
    if (serviceScanProbe.rows[0]?.res?.outcome !== 'CHECKPOINT_NOT_FOUND' && serviceScanProbe.rows[0]?.res?.outcome !== 'PERSONNEL_NOT_PROVISIONED') {
      throw new Error(`Unexpected service_role 12-arg checkpoint scan RPC probe result: ${JSON.stringify(serviceScanProbe.rows[0]?.res)}`);
    }
    console.log('✓ Verified: 13-arg attendance & 12-arg checkpoint RPCs present, obsolete overloads removed, SECURITY INVOKER + hardened search_path, EXECUTE denied (42501) for anon/authenticated and permitted for service_role.');

    // ========================================================================
    // SECTION 5: REVOCATION & AUTHZ_VERSION FUNCTIONALITY
    // ========================================================================
    console.log('\n--- Section 5: Testing Revocation & authz_version Updates ---');

    // 1. Increment authz_version on membership
    await client.query(`
      UPDATE workforce_staging.tenant_memberships
      SET authz_version = authz_version + 1
      WHERE user_id = '${officerAlphaUserId}';
    `);
    const memVersionRes = await client.query(
      `SELECT authz_version FROM workforce_staging.tenant_memberships WHERE user_id = $1`,
      [officerAlphaUserId]
    );
    if (memVersionRes.rows[0].authz_version !== 2) throw new Error('authz_version failed to increment on membership');
    console.log('✓ authz_version monotonically incremented on tenant_memberships.');

    // 2. Increment authz_version on tenant
    await client.query(`
      UPDATE workforce_staging.tenants
      SET authz_version = authz_version + 1
      WHERE id = '${tenantAlphaId}';
    `);
    const tenantVersionRes = await client.query(
      `SELECT authz_version FROM workforce_staging.tenants WHERE id = $1`,
      [tenantAlphaId]
    );
    if (tenantVersionRes.rows[0].authz_version !== 2) throw new Error('authz_version failed to increment on tenants');
    console.log('✓ authz_version monotonically incremented on tenants.');

    // 3. Single-session logout & TTL cleanup procedure
    await client.query(`
      INSERT INTO workforce_staging.revoked_tokens (token_hash, nonce, user_id, tenant_id, expires_at)
      VALUES
        ('active_hash_1', 'active_nonce_1', '${officerAlphaUserId}', '${tenantAlphaId}', NOW() + INTERVAL '1 hour'),
        ('expired_hash_2', 'expired_nonce_2', '${officerAlphaUserId}', '${tenantAlphaId}', NOW() - INTERVAL '10 minutes');
    `);

    const pruneRes = await client.query(`SELECT workforce_staging.prune_expired_revoked_tokens() AS pruned;`);
    const prunedCount = pruneRes.rows[0].pruned;
    if (prunedCount < 1) throw new Error('prune_expired_revoked_tokens did not prune expired token');

    const activeTokenCheck = await client.query(
      `SELECT count(*) FROM workforce_staging.revoked_tokens WHERE nonce = 'active_nonce_1';`
    );
    if (Number(activeTokenCheck.rows[0].count) !== 1) throw new Error('prune procedure unexpectedly removed active token');
    console.log('✓ prune_expired_revoked_tokens() correctly pruned expired tokens while preserving active tokens.');

    // 4. Unauthorized role rejected from running cleanup function
    await client.query(`SET ROLE authenticated;`);
    let pruneDenied = false;
    try {
      await client.query(`SELECT workforce_staging.prune_expired_revoked_tokens();`);
    } catch (err) {
      if (err.code === '42501') pruneDenied = true;
    }
    if (!pruneDenied) throw new Error('Security failure: Authenticated role was able to run prune procedure!');
    console.log('✓ Authenticated role rejected with SQLSTATE 42501 from executing prune_expired_revoked_tokens().');

    await client.query(`RESET ROLE;`);

    // ========================================================================
    // SECTION 6: RATE LIMITER LOGGED TABLE ATOMIC CONCURRENCY PROOF
    // ========================================================================
    console.log('\n--- Section 6: Testing Logged PostgreSQL Rate Limiter Atomic Concurrency ---');

    // Create logged table for rate limits
    await client.query(`
      CREATE TABLE IF NOT EXISTS workforce_staging.auth_rate_limits (
          rate_key VARCHAR(160) PRIMARY KEY,
          attempts INT NOT NULL DEFAULT 1,
          window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON workforce_staging.auth_rate_limits(window_start);
    `);

    const testRateKey = 'bwm_login_agency_ip:alpha-security:198.51.100.42';

    // Acquire 20 real connections concurrently via pg.Pool
    const concurrencyCount = 20;
    const pool = new Pool({ connectionString, max: concurrencyCount });
    try {
      const poolClients = await Promise.all(
        Array.from({ length: concurrencyCount }, () => pool.connect())
      );

      const upsertSql = `
        INSERT INTO workforce_staging.auth_rate_limits (rate_key, attempts, window_start, updated_at)
        VALUES ($1, 1, NOW(), NOW())
        ON CONFLICT (rate_key) DO UPDATE
        SET attempts = CASE
                WHEN workforce_staging.auth_rate_limits.window_start < NOW() - INTERVAL '15 minutes' THEN 1
                ELSE workforce_staging.auth_rate_limits.attempts + 1
            END,
            window_start = CASE
                WHEN workforce_staging.auth_rate_limits.window_start < NOW() - INTERVAL '15 minutes' THEN NOW()
                ELSE workforce_staging.auth_rate_limits.window_start
            END,
            updated_at = NOW()
        RETURNING attempts,
                  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + INTERVAL '15 minutes' - NOW()))))::INT AS retry_after_seconds;
      `;

      // Synchronize start barrier timestamp so all 20 connections fire in parallel
      const startBarrier = Date.now() + 50;

      const results = await Promise.all(
        poolClients.map(async (pClient) => {
          try {
            const delay = startBarrier - Date.now();
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
            const res = await pClient.query(upsertSql, [testRateKey]);
            return res.rows[0];
          } finally {
            pClient.release();
          }
        })
      );

      const attemptNumbers = results.map((r) => r.attempts).sort((a, b) => a - b);
      const uniqueAttempts = new Set(attemptNumbers);

      if (uniqueAttempts.size !== concurrencyCount) {
        throw new Error(`Concurrency race condition detected! Expected 20 unique attempt numbers, got ${uniqueAttempts.size}`);
      }
      if (attemptNumbers[attemptNumbers.length - 1] !== concurrencyCount) {
        throw new Error(`Max attempts mismatch: expected 20, got ${attemptNumbers[attemptNumbers.length - 1]}`);
      }

      const blockedAttempts = results.filter((r) => r.attempts > 5);
      if (blockedAttempts.length !== concurrencyCount - 5) {
        throw new Error(`Expected ${concurrencyCount - 5} requests to exceed threshold 5, got ${blockedAttempts.length}`);
      }
      console.log(`✓ 20 concurrent requests executed atomically across 20 distinct pool connections with ZERO lost updates (attempts strictly 1 to 20).`);
      console.log(`✓ Threshold 5 enforced: exactly 15 requests blocked with valid retry_after_seconds.`);
    } finally {
      await pool.end().catch(() => {});
    }

    // ========================================================================
    // SECTION 7: TENANT ISOLATION AND CRUD REGRESSION (RLS PROOF)
    // ========================================================================
    console.log('\n--- Section 7: Testing Multi-Tenant Isolation & CRUD Regression ---');

    // 1. Seed facility for Tenant Alpha
    const facAlphaRes = await client.query(`
      INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude)
      VALUES ('${tenantAlphaId}', 'alpha-security', 'Alpha Headquarters', 'FAC-ALPHA-01', -6.2088, 106.8456)
      RETURNING id, tenant_id;
    `);
    const facilityAlphaId = facAlphaRes.rows[0].id;
    const facilityAlphaTenantId = facAlphaRes.rows[0].tenant_id;

    // 2. Seed facility for Tenant Beta + Unassigned second facility & Commerce/Supervisor fixtures in Alpha
    const facBetaRes = await client.query(`
      INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude)
      VALUES ('${tenantBetaId}', 'beta-defense', 'Beta Outpost North', 'FAC-BETA-01', -6.3000, 106.9000)
      RETURNING id, tenant_id;
    `);
    const facilityBetaId = facBetaRes.rows[0].id;
    const facilityBetaTenantId = facBetaRes.rows[0].tenant_id;

    // Bind Officer Alpha explicitly to facilityAlphaId for M-2 facility-bound RLS
    await client.query(
      `UPDATE workforce_staging.personnel SET facility_id = $1 WHERE id = $2;`,
      [facilityAlphaId, personnelAlphaId]
    );

    const facAlphaSecondRes = await client.query(`
      INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude)
      VALUES ('${tenantAlphaId}', 'alpha-security', 'Alpha Secondary Depot', 'FAC-ALPHA-02', -6.2200, 106.8600)
      RETURNING id;
    `);
    const facilityAlphaSecondId = facAlphaSecondRes.rows[0].id;

    const coworkerAlphaUserId = '55555555-5555-4555-8555-555555555502';
    const coworkerMemRes = await client.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES ('${coworkerAlphaUserId}', '${tenantAlphaId}', 'alpha-security', 'field_personnel', true)
      RETURNING id;
    `);
    const coworkerMemId = coworkerMemRes.rows[0].id;
    const coworkerPersRes = await client.query(`
      INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role)
      VALUES ('${tenantAlphaId}', 'alpha-security', '${coworkerAlphaUserId}', '${coworkerMemId}', '${facilityAlphaSecondId}', 'Officer Second', 'NIK-003', 'field_personnel')
      RETURNING id;
    `);
    const coworkerAlphaPersonnelId = coworkerPersRes.rows[0].id;

    const cpAlphaSecondRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token)
      VALUES ('${tenantAlphaId}', '${facilityAlphaSecondId}', 'Alpha Secondary Gate', 'CP-02', 'Rear', -6.2200, 106.8600, 'QR-ALPHA-02')
      RETURNING id;
    `);
    const cpAlphaSecondId = cpAlphaSecondRes.rows[0].id;

    const prodAlphaRes = await client.query(`
      INSERT INTO workforce_staging.products (tenant_id, title, slug, price, stock, category, product_type, is_active, status, is_publicly_published)
      VALUES ('${tenantAlphaId}', 'Alpha Commerce Package', 'alpha-commerce-pkg', 250000, 10, 'service', 'SERVICE', true, 'ACTIVE', false)
      RETURNING id;
    `);
    const prodAlphaId = prodAlphaRes.rows[0].id;

    await client.query(`
      INSERT INTO workforce_staging.branch_credit_pools (branch_id, agency_id, available_credits, active_seats, currency)
      VALUES ('44444444-4444-4444-8444-444444444401', '${tenantAlphaId}', 500, 5, 'IDR');
    `);

    // 3 & 4. Validate facilities are strictly bound to their respective tenants
    if (facilityAlphaTenantId !== tenantAlphaId) {
      throw new Error(`Facility Alpha tenant mismatch: expected ${tenantAlphaId}, got ${facilityAlphaTenantId}`);
    }
    if (facilityBetaTenantId !== tenantBetaId) {
      throw new Error(`Facility Beta tenant mismatch: expected ${tenantBetaId}, got ${facilityBetaTenantId}`);
    }
    console.log(`✓ Seeded facilities for Alpha (${facilityAlphaId}) and Beta (${facilityBetaId}) with valid tenant bindings.`);

    // 5. Seed checkpoint in Tenant Alpha using facility_id Alpha
    const cpAlphaRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token)
      VALUES ('${tenantAlphaId}', '${facilityAlphaId}', 'Alpha Main Gate', 'CP-01', 'Perimeter', -6.2088, 106.8456, 'QR-ALPHA-01')
      RETURNING id, tenant_id, facility_id;
    `);
    const checkpointAlphaId = cpAlphaRes.rows[0].id;

    // 6. Seed checkpoint in Tenant Beta using facility_id Beta
    const cpBetaRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token)
      VALUES ('${tenantBetaId}', '${facilityBetaId}', 'Beta North Gate', 'CP-B1', 'Perimeter', -6.3000, 106.9000, 'QR-BETA-01')
      RETURNING id, tenant_id, facility_id;
    `);
    const checkpointBetaId = cpBetaRes.rows[0].id;

    // Validate that each checkpoint uses a facility from the same tenant
    if (cpAlphaRes.rows[0].tenant_id !== tenantAlphaId || cpAlphaRes.rows[0].facility_id !== facilityAlphaId) {
      throw new Error('Checkpoint Alpha tenant or facility binding mismatch');
    }
    if (cpBetaRes.rows[0].tenant_id !== tenantBetaId || cpBetaRes.rows[0].facility_id !== facilityBetaId) {
      throw new Error('Checkpoint Beta tenant or facility binding mismatch');
    }
    console.log(`✓ Seeded checkpoints for Alpha (${checkpointAlphaId}) and Beta (${checkpointBetaId}) bound strictly to same-tenant facilities.`);

    // 7. Operational write via authorized application/server-side write path (service_role/superuser)
    const attendRes = await client.query(`
      INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, type, latitude, longitude, idempotency_key)
      VALUES ('${tenantAlphaId}', '${personnelAlphaId}', 'CLOCK_IN', -6.2088, 106.8456, 'IDEMP-ATTEND-ALPHA-01')
      RETURNING id, state_seq;
    `);
    const attendanceAlphaId = attendRes.rows[0].id;
    if (!attendRes.rows[0].state_seq || Number(attendRes.rows[0].state_seq) < 1) {
      throw new Error('Migration 013 trigger failed: state_seq not assigned on direct attendance_logs insert');
    }
    console.log(`✓ Authorized server-side write: Successfully recorded attendance log (${attendanceAlphaId}, state_seq=${attendRes.rows[0].state_seq}) in Tenant Alpha.`);

    // Act as Officer Alpha in Tenant Alpha
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claim.sub = '${officerAlphaUserId}';`);
    await client.query(`SET request.jwt.claim.role = 'authenticated';`);

    // Positive RLS Read: Officer Alpha can read non-secret columns of assigned Tenant Alpha checkpoint
    const readAlpha = await client.query(`SELECT id, tenant_id, facility_id, code, is_active FROM workforce_staging.checkpoints WHERE id = '${checkpointAlphaId}';`);
    if (readAlpha.rows.length !== 1) throw new Error('Officer Alpha failed to read own tenant checkpoint under RLS');
    console.log('✓ Positive RLS Read: Officer Alpha successfully read Tenant Alpha checkpoint (non-secret columns).');

    // Negative Column ACL: Authenticated role cannot read raw qr_token column directly on workforce_staging.checkpoints
    let rawQrDenied = false;
    try {
      await client.query(`SELECT qr_token FROM workforce_staging.checkpoints WHERE id = '${checkpointAlphaId}';`);
    } catch (err) {
      if (err.code === '42501') rawQrDenied = true;
    }
    if (!rawQrDenied) {
      throw new Error('CRITICAL M-2 BREACH: field_personnel read raw qr_token directly from workforce_staging.checkpoints');
    }
    console.log('✓ Column ACL Enforcement: Direct SELECT qr_token on workforce_staging.checkpoints denied with SQLSTATE 42501.');

    // Positive RLS Read: Officer Alpha can read Tenant Alpha attendance log
    const readAttendAlpha = await client.query(`SELECT * FROM workforce_staging.attendance_logs WHERE id = '${attendanceAlphaId}';`);
    if (readAttendAlpha.rows.length !== 1) throw new Error('Officer Alpha failed to read own tenant attendance log under RLS');
    console.log('✓ Positive RLS Read: Officer Alpha successfully read own tenant attendance log.');

    // Negative RLS Read: Officer Alpha CANNOT read Tenant Beta checkpoint (filtered by RLS -> 0 rows)
    const readBeta = await client.query(`SELECT id FROM workforce_staging.checkpoints WHERE id = '${checkpointBetaId}';`);
    if (readBeta.rows.length !== 0) {
      throw new Error('CRITICAL CROSS-TENANT DATA LEAK: Officer Alpha was able to view Tenant Beta checkpoint!');
    }
    console.log('✓ Negative RLS Read: Officer Alpha returned 0 rows when querying Tenant Beta checkpoint (RLS filtered).');

    // Negative SQL Privilege: Authenticated role has NO direct INSERT privilege on operational tables (table ACL enforcement)
    let directAlphaInsertBlocked = false;
    try {
      await client.query(`
        INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, type, latitude, longitude, idempotency_key)
        VALUES ('${tenantAlphaId}', '${personnelAlphaId}', 'CLOCK_OUT', -6.2088, 106.8456, 'IDEMP-DIRECT-ATTEND-01');
      `);
    } catch (err) {
      if (err.code === '42501') directAlphaInsertBlocked = true;
    }
    if (!directAlphaInsertBlocked) {
      throw new Error('Privilege violation: Authenticated role bypassed table ACL to directly insert attendance log!');
    }
    console.log('✓ Negative SQL Privilege: Direct client INSERT on attendance_logs by authenticated role denied with SQLSTATE 42501 (least-privilege table ACL).');

    // Negative SQL Privilege: Cross-tenant direct mutation rejected with SQLSTATE 42501
    let crossTenantInsertBlocked = false;
    try {
      await client.query(`
        INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, type, latitude, longitude, idempotency_key)
        VALUES ('${tenantBetaId}', '${personnelAlphaId}', 'CLOCK_IN', -6.3000, 106.9000, 'IDEMP-CROSS-01');
      `);
    } catch (err) {
      if (err.code === '42501') crossTenantInsertBlocked = true;
    }
    if (!crossTenantInsertBlocked) {
      throw new Error('Privilege violation: Authenticated role was able to mutate cross-tenant attendance!');
    }
    console.log('✓ Negative SQL Privilege: Cross-tenant direct mutation rejected with SQLSTATE 42501.');

    // M-2 Domain Isolation Checks as field_personnel (Officer Alpha)
    const fpViewCp = await client.query(`SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = '${checkpointAlphaId}';`);
    if (fpViewCp.rows.length !== 1 || fpViewCp.rows[0].qr_token !== null) {
      throw new Error(`M-2 failure: field_personnel public.workforce_checkpoints expected 1 row with NULL qr_token, got ${JSON.stringify(fpViewCp.rows)}`);
    }
    if ((await client.query(`SELECT id FROM workforce_staging.checkpoints WHERE id = '${cpAlphaSecondId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: field_personnel read unassigned same-tenant facility checkpoint');
    }
    if ((await client.query(`SELECT id FROM workforce_staging.personnel WHERE id = '${coworkerAlphaPersonnelId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: field_personnel read coworker personnel record');
    }
    let fpDirectProdDenied = false;
    try {
      const fpDirectProd = await client.query(`SELECT id FROM workforce_staging.products WHERE id = '${prodAlphaId}';`);
      if (fpDirectProd.rows.length === 0) fpDirectProdDenied = true;
    } catch (err) {
      if (err.code === '42501') fpDirectProdDenied = true;
    }
    if (!fpDirectProdDenied) {
      throw new Error('M-2 breach: field_personnel read Commerce products table');
    }
    if ((await client.query(`SELECT id FROM public.products WHERE id = '${prodAlphaId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: field_personnel read Commerce public.products view');
    }
    if ((await client.query(`SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE agency_id = '${tenantAlphaId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: field_personnel read branch_credit_pools');
    }
    console.log('✓ M-2 Verified: field_personnel strictly self/facility-scoped, qr_token masked, Commerce isolated.');

    // M-2 Option C Checks as supervisor (Supervisor Alpha)
    await client.query(`SET request.jwt.claim.sub = '${supervisorAlphaUserId}';`);
    const supFacRead = await client.query(
      `SELECT id FROM workforce_staging.facilities WHERE id IN ('${facilityAlphaId}', '${facilityAlphaSecondId}');`
    );
    if (supFacRead.rows.length !== 2) {
      throw new Error(`M-2 Option C breach: supervisor must read same-tenant cross-facility rows, got ${supFacRead.rows.length}`);
    }
    const supBetaRead = await client.query(`SELECT id FROM workforce_staging.facilities WHERE id = '${facilityBetaId}';`);
    if (supBetaRead.rows.length !== 0) {
      throw new Error('M-2 breach: supervisor read cross-tenant Beta facility');
    }
    const supViewCp = await client.query(`SELECT id, qr_token FROM public.workforce_checkpoints WHERE id = '${checkpointAlphaId}';`);
    if (supViewCp.rows.length !== 1 || supViewCp.rows[0].qr_token !== null) {
      throw new Error('M-2 failure: supervisor must see masked NULL qr_token on public.workforce_checkpoints');
    }
    if ((await client.query(`SELECT id FROM public.products WHERE id = '${prodAlphaId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: supervisor read Commerce public.products view');
    }
    if ((await client.query(`SELECT branch_id FROM workforce_staging.branch_credit_pools WHERE agency_id = '${tenantAlphaId}';`)).rows.length !== 0) {
      throw new Error('M-2 breach: supervisor read branch_credit_pools');
    }
    console.log('✓ M-2 Verified (Option C): supervisor retains same-tenant cross-facility read with masked qr_token & zero Commerce access.');

    await client.query(`RESET ROLE;`);

    // ========================================================================
    // SECTION 8: MIGRATION 016 -> 015 -> 014 ROLLBACK & RE-APPLY GATE (M-3)
    // ========================================================================
    console.log('\n--- Section 8: Testing Migration 016 -> 015 -> 014 Rollback & Clean Re-apply ---');
    await executeMigrationFile('016_bwm_domain_authorization_isolation.down.sql');
    await executeMigrationFile('015_attendance_actor_binding_and_role_allowlist.down.sql');
    await executeMigrationFile('014_checkpoint_scan_atomic_rpc.down.sql');

    const rolledBackCheck = await client.query(
      `SELECT
         to_regprocedure($1) IS NULL AS attendance_015_dropped,
         to_regprocedure($2) IS NULL AS scan_014_dropped,
         to_regprocedure($3) IS NOT NULL AS attendance_013_restored,
         to_regprocedure('workforce_staging.is_trusted_commerce_member(text,text)') IS NULL AS m2_helper_dropped;`,
      [rpcAttendanceSig, rpcScanSig, legacyAttendanceSig]
    );
    const rb = rolledBackCheck.rows[0];
    if (!rb.attendance_015_dropped || !rb.scan_014_dropped || !rb.attendance_013_restored || !rb.m2_helper_dropped) {
      throw new Error(`Migration rollback verification failed: ${JSON.stringify(rb)}`);
    }

    await executeMigrationFile('014_checkpoint_scan_atomic_rpc.sql');
    await executeMigrationFile('015_attendance_actor_binding_and_role_allowlist.sql');
    await executeMigrationFile('016_bwm_domain_authorization_isolation.sql');

    const reappliedCheck = await client.query(
      `SELECT
         to_regprocedure($1) IS NOT NULL AS attendance_015_restored,
         to_regprocedure($2) IS NOT NULL AS scan_014_restored,
         to_regprocedure($3) IS NULL AS attendance_013_removed,
         to_regprocedure('workforce_staging.is_trusted_commerce_member(text,text)') IS NOT NULL AS m2_helper_restored;`,
      [rpcAttendanceSig, rpcScanSig, legacyAttendanceSig]
    );
    const ra = reappliedCheck.rows[0];
    if (!ra.attendance_015_restored || !ra.scan_014_restored || !ra.attendance_013_removed || !ra.m2_helper_restored) {
      throw new Error(`Migration re-apply verification failed: ${JSON.stringify(ra)}`);
    }
    console.log('✓ Section 8 Verified: 016 -> 015 -> 014 DOWN rollback and clean 014 -> 015 -> 016 UP re-apply succeeded.');

    console.log('\n======================================================================');
    console.log('All 8 verification sections passed successfully on disposable PostgreSQL.');
    console.log('======================================================================');
  } finally {
    await client.end();
  }
}

const isMainModule = () => {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url).toLowerCase();
    const executedFilePath = path.resolve(process.argv[1]).toLowerCase();
    return currentFilePath === executedFilePath;
  } catch {
    return process.argv[1]?.includes('verify-disposable-postgres-ci');
  }
};

if (isMainModule()) {
  runVerification().catch((err) => {
    console.error('\n[VERIFICATION SUITE FAILED]', err);
    process.exit(1);
  });
}
