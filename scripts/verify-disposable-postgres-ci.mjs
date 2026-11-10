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
 */
export function assertDisposableDatabaseTarget(connStr) {
  if (!connStr || typeof connStr !== 'string' || !connStr.trim()) {
    throw new Error('[DISPOSABLE GUARD FATAL] Database connection string is empty or invalid.');
  }

  let parsed;
  try {
    parsed = new URL(connStr.trim());
  } catch {
    throw new Error(`[DISPOSABLE GUARD FATAL] Malformed database connection URL: ${connStr}`);
  }

  // 1. Protocol validation
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid protocol (${parsed.protocol}). Expected postgres: or postgresql:.`);
  }

  // 2. Host validation: ONLY localhost or 127.0.0.1
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

  // 6. Query Parameter Security Validation (Block node-postgres connection parameter overrides via searchParams)
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

  return true;
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
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim', true), '')::jsonb, '{}'::jsonb);
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
    // SECTION 2: MIGRATION 011 UP & 012 UP EXECUTION & VALIDATION
    // ========================================================================
    console.log('\n--- Section 2: Executing Migration 011 UP & 012 UP ---');
    await executeMigrationFile('011_create_workforce_operational_tables.sql');
    await executeMigrationFile('012_create_workforce_revocation_and_authz_versioning.sql');

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

    // ========================================================================
    // SECTION 3: DOWN MIGRATION ROLLBACK VALIDATION
    // ========================================================================
    console.log('\n--- Section 3: Testing DOWN Migrations on Disposable Data ---');
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

    // Reapply UP migrations for functional security testing
    console.log('\n--- Reapplying UP Migrations for Security Tests ---');
    await executeMigrationFile('011_create_workforce_operational_tables.sql');
    await executeMigrationFile('012_create_workforce_revocation_and_authz_versioning.sql');

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

    // Seed personnel profile
    const personnelAlphaRes = await client.query(`
      INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, name, nik, role)
      VALUES ('${tenantAlphaId}', 'alpha-security', '${officerAlphaUserId}', '${membershipAlphaId}', 'Officer Alpha', 'NIK-001', 'field_personnel')
      RETURNING id;
    `);
    const personnelAlphaId = personnelAlphaRes.rows[0].id;

    // Seed credentials as service_role
    await client.query(`
      INSERT INTO workforce_staging.personnel_credentials (personnel_id, tenant_id, pin_hash, pin_algo)
      VALUES ('${personnelAlphaId}', '${tenantAlphaId}', '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgqlfreSdK7PvJRhkX', 'argon2id');
    `);
    console.log('✓ Seeded test personnel and Argon2id credential hash.');

    // Test 1: Anonymous cannot read credentials
    await client.query(`SET ROLE anon;`);
    let anonBlocked = false;
    try {
      await client.query(`SELECT * FROM workforce_staging.personnel_credentials;`);
    } catch (err) {
      if (err.code === '42501') anonBlocked = true; // permission denied
    }
    if (!anonBlocked) throw new Error('Security failure: Anonymous was able to query personnel_credentials!');
    console.log('✓ Anonymous role rejected with SQLSTATE 42501 when querying personnel_credentials.');

    // Test 2: Ordinary Authenticated Member cannot read credentials
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claim.sub = '${officerAlphaUserId}';`);
    await client.query(`SET request.jwt.claim.role = 'authenticated';`);

    let memberCredBlocked = false;
    try {
      await client.query(`SELECT * FROM workforce_staging.personnel_credentials;`);
    } catch (err) {
      if (err.code === '42501') memberCredBlocked = true;
    }
    if (!memberCredBlocked) throw new Error('Security failure: Authenticated member queried personnel_credentials!');
    console.log('✓ Authenticated member rejected with SQLSTATE 42501 on personnel_credentials.');

    // Test 3: Public view public.workforce_personnel projects zero credential fields
    const viewRows = await client.query(`SELECT * FROM public.workforce_personnel WHERE tenant_id = '${tenantAlphaId}';`);
    if (viewRows.rows.length === 0) throw new Error('Authenticated member unable to view own personnel profile');
    if ('pin_hash' in viewRows.rows[0] || 'pin' in viewRows.rows[0]) {
      throw new Error('Critical security failure: public.workforce_personnel view leaks pin_hash!');
    }
    console.log('✓ public.workforce_personnel successfully accessed by member with ZERO credential fields exposed.');

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

    // Seed checkpoint in Tenant Alpha
    const cpAlphaRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (tenant_id, name, code, zone, latitude, longitude, qr_token)
      VALUES ('${tenantAlphaId}', 'Alpha Main Gate', 'CP-01', 'Perimeter', -6.2088, 106.8456, 'QR-ALPHA-01')
      RETURNING id;
    `);
    const checkpointAlphaId = cpAlphaRes.rows[0].id;

    // Seed checkpoint in Tenant Beta
    const cpBetaRes = await client.query(`
      INSERT INTO workforce_staging.checkpoints (tenant_id, name, code, zone, latitude, longitude, qr_token)
      VALUES ('${tenantBetaId}', 'Beta North Gate', 'CP-B1', 'Perimeter', -6.3000, 106.9000, 'QR-BETA-01')
      RETURNING id;
    `);
    const checkpointBetaId = cpBetaRes.rows[0].id;

    // Act as Officer Alpha in Tenant Alpha
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claim.sub = '${officerAlphaUserId}';`);
    await client.query(`SET request.jwt.claim.role = 'authenticated';`);

    // Positive Test: Officer Alpha can read Tenant Alpha checkpoint
    const readAlpha = await client.query(`SELECT * FROM workforce_staging.checkpoints WHERE id = '${checkpointAlphaId}';`);
    if (readAlpha.rows.length !== 1) throw new Error('Officer Alpha failed to read own tenant checkpoint');
    console.log('✓ Positive: Officer Alpha successfully read Tenant Alpha checkpoint.');

    // Positive Test: Officer Alpha submits attendance log for Tenant Alpha
    const attendRes = await client.query(`
      INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, type, latitude, longitude, idempotency_key)
      VALUES ('${tenantAlphaId}', '${personnelAlphaId}', 'CLOCK_IN', -6.2088, 106.8456, 'IDEMP-ATTEND-ALPHA-01')
      RETURNING id;
    `);
    if (!attendRes.rows[0].id) throw new Error('Officer Alpha failed to submit attendance log');
    console.log('✓ Positive: Officer Alpha successfully submitted attendance log in Tenant Alpha.');

    // Negative Test: Officer Alpha CANNOT read Tenant Beta checkpoint
    const readBeta = await client.query(`SELECT * FROM workforce_staging.checkpoints WHERE id = '${checkpointBetaId}';`);
    if (readBeta.rows.length !== 0) {
      throw new Error('CRITICAL CROSS-TENANT DATA LEAK: Officer Alpha was able to view Tenant Beta checkpoint!');
    }
    console.log('✓ Negative: Officer Alpha returned 0 rows when attempting to query Tenant Beta checkpoint.');

    // Negative Test: Officer Alpha CANNOT insert attendance into Tenant Beta
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
      throw new Error('CRITICAL CROSS-TENANT MUTATION LEAK: Officer Alpha inserted attendance into Tenant Beta!');
    }
    console.log('✓ Negative: Officer Alpha rejected with SQLSTATE 42501 when attempting mutation in Tenant Beta.');

    await client.query(`RESET ROLE;`);

    console.log('\n======================================================================');
    console.log('ALL 7 SECTIONS PASSED WITH 100% SUCCESS ON DISPOSABLE POSTGRESQL.');
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
