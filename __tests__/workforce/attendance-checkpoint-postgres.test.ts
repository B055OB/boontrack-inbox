/**
 * __tests__/workforce/attendance-checkpoint-postgres.test.ts
 * BWM Workstream A — Corrective Round: Actual HTTP Routes + Disposable PostgreSQL Integration Suite
 *
 * Strictly executes actual HTTP requests over loopback TCP against the Next.js App Router
 * handlers (POST /api/attendance and POST /api/checkpoints/scan) backed by the isolated
 * DISPOSABLE_PG_SUPERUSER_TEST adapter (postgres:15-alpine on localhost:5432/test_workforce_ci).
 *
 * NOTE ON ADAPTER BOUNDARY:
 * This suite exercises HTTP route logic + SQL persistence via direct postgres superuser test adapter
 * (`createDisposablePgTestStore`), while asserting least-privilege `authenticated` table ACL (`42501`)
 * and RLS filtering. Production/staging Supabase PostgREST (`createSupabaseServiceRoleOperationalStore`)
 * is tested separately via mocked SupabaseClient contract tests until CI/staging authorization.
 *
 * Fails closed at load time unless NODE_ENV=test, WORKFORCE_USE_DISPOSABLE_PG=true, and valid loopback
 * DISPOSABLE_POSTGRES_URL are explicitly provided.
 */

import http from 'http';
import type net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { NextRequest } from 'next/server';
import { signBwmSessionToken } from '@/workforce-web/lib/auth/session';
import {
  assertDisposableLoopbackUrl,
  closeDisposablePgPool,
} from '@/workforce-web/lib/workforce/disposable-pg-test-store';
import { POST as attendancePOST } from '@/workforce-web/app/api/attendance/route';
import { POST as checkpointScanPOST } from '@/workforce-web/app/api/checkpoints/scan/route';

jest.setTimeout(30000);

function getVerifiedDisposableTestConfig(): { connectionString: string } {
  if (process.env.NODE_ENV !== 'test' || process.env.WORKFORCE_USE_DISPOSABLE_PG !== 'true') {
    throw new Error(
      'WORKFORCE_USE_DISPOSABLE_PG=true and NODE_ENV=test are required for attendance-checkpoint-postgres integration test. ' +
        'Unit Job 1 must exclude or fail-closed this suite.'
    );
  }
  const connStr = process.env.DISPOSABLE_POSTGRES_URL || '';
  if (!connStr) {
    throw new Error(
      'DISPOSABLE_POSTGRES_URL environment variable is required for attendance-checkpoint-postgres integration test. ' +
        'No fallback to .env.local or staging database is permitted.'
    );
  }
  return { connectionString: assertDisposableLoopbackUrl(connStr) };
}

async function sendHttpJson(
  baseUrl: string,
  routePath: string,
  body: Record<string, unknown>,
  cookieToken?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; json: Record<string, any> }> {
  const payload = JSON.stringify(body);
  const url = new URL(routePath, baseUrl);

  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname + url.search,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Connection: 'close',
          ...(cookieToken ? { Cookie: `bwm_session_token=${cookieToken}` } : {}),
          ...(extraHeaders || {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, json: JSON.parse(raw) });
          } catch (err) {
            reject(new Error(`Invalid JSON response (${res.statusCode}): ${raw} (${err})`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('Workstream A Integration: Actual HTTP Routes + Disposable PostgreSQL', () => {
  const { connectionString: disposableUrl } = getVerifiedDisposableTestConfig();
  let pgClient: Client;
  let pgConnected = false;
  let server: http.Server;
  let baseUrl: string;

  const ts = Date.now();
  const tenantAlphaId = crypto.randomUUID();
  const tenantAlphaSlug = `ws-a-alpha-${ts}`;
  const tenantBetaId = crypto.randomUUID();
  const tenantBetaSlug = `ws-a-beta-${ts}`;
  const tenantSuspendedId = crypto.randomUUID();
  const tenantSuspendedSlug = `ws-a-susp-${ts}`;

  // Distinct user_id vs personnel.id across all accounts
  const officerAlphaUserId = crypto.randomUUID();
  const officerConcurrentUserId = crypto.randomUUID();
  const officerMultiConnUserId = crypto.randomUUID();
  const officerOrderedUserId = crypto.randomUUID();
  const supervisorAlphaUserId = crypto.randomUUID();
  const ownerAlphaUserId = crypto.randomUUID();
  const unprovisionedAlphaUserId = crypto.randomUUID();
  const inactivePersonnelAlphaUserId = crypto.randomUUID();
  const revokedMemberAlphaUserId = crypto.randomUUID();
  const suspendedTenantUserId = crypto.randomUUID();
  const officerBetaUserId = crypto.randomUUID();

  let personnelAlphaId: string;
  let personnelConcurrentId: string;
  let personnelMultiConnId: string;
  let personnelOrderedId: string;
  let personnelSupervisorId: string;
  let personnelOwnerId: string;
  let personnelInactiveAlphaId: string;
  let personnelBetaId: string;

  let facilityAlphaActiveId: string;
  let facilityAlphaSecondaryActiveId: string;
  let facilityAlphaInactiveId: string;
  let facilityBetaActiveId: string;

  let checkpointAlphaActiveId: string;
  let checkpointAlphaSecondaryActiveId: string;
  let checkpointAlphaInactiveId: string;
  let checkpointAlphaDeadFacilityId: string;
  let checkpointBetaActiveId: string;

  let tokenOfficerAlpha: string;
  let tokenOfficerConcurrent: string;
  let tokenSupervisorAlpha: string;
  let tokenUnprovisionedAlpha: string;
  let tokenInactivePersonnelAlpha: string;
  let tokenRevokedMemberAlpha: string;
  let tokenSuspendedTenant: string;

  async function ensureOperationalSchema(client: Client): Promise<void> {
    const tblCheck = await client.query(`
      SELECT count(*)::int AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'workforce_staging'
        AND table_name IN ('tenants', 'tenant_memberships', 'facilities', 'personnel', 'checkpoints', 'attendance_logs', 'checkpoint_scans');
    `);
    const rpcCheck = await client.query(`
      SELECT count(*)::int AS cnt
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'workforce_staging' AND p.proname = 'record_attendance_atomic';
    `);
    const seqColCheck = await client.query(`
      SELECT count(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'workforce_staging'
        AND table_name = 'attendance_logs'
        AND column_name = 'state_seq';
    `);
    const rootDir = process.cwd();
    const rpcMigrationPath = path.resolve(
      rootDir,
      'packages/workforce-billing/schema/migrations/013_attendance_atomic_state_rpc.sql'
    );

    if (tblCheck.rows[0].cnt === 7) {
      await client.query(`GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`);
      if (rpcCheck.rows[0].cnt === 0 || seqColCheck.rows[0].cnt === 0) {
        await client.query(fs.readFileSync(rpcMigrationPath, 'utf8'));
      }
      return;
    }

    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')
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
          nullif(current_setting('request.jwt.claims', true), '')::jsonb,
          nullif(current_setting('request.jwt.claim', true), '')::jsonb,
          '{}'::jsonb
        );
      $$ LANGUAGE sql STABLE;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      CREATE SCHEMA IF NOT EXISTS workforce_staging;
    `);

    const sqlFiles = [
      path.resolve(rootDir, 'lib/workforce/schema/schema-draft.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/007_create_workforce_staging_tenants_and_products.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/008_harden_tenants_and_products_rls.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/009_trusted_tenant_identity_and_safe_views.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/010_strict_storefront_opt_in_and_role_authorization.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/011_create_workforce_operational_tables.sql'),
      path.resolve(rootDir, 'packages/workforce-billing/schema/migrations/012_create_workforce_revocation_and_authz_versioning.sql'),
      rpcMigrationPath,
    ];
    for (const filePath of sqlFiles) {
      await client.query(fs.readFileSync(filePath, 'utf8'));
    }
  }

  beforeAll(async () => {
    pgClient = new Client({ connectionString: disposableUrl });
    await pgClient.connect();
    pgConnected = true;
    await ensureOperationalSchema(pgClient);

    // 1. Seed Tenants
    await pgClient.query(
      `INSERT INTO workforce_staging.tenants (id, slug, name, tier, status, is_active, metadata)
       VALUES
         ($1, $2, 'Workstream A Alpha Corp', 'PRO_SCALE', 'active', true, '{}'::jsonb),
         ($3, $4, 'Workstream A Beta Corp', 'ENTERPRISE', 'active', true, '{}'::jsonb),
         ($5, $6, 'Workstream A Suspended Corp', 'PRO_SCALE', 'suspended', false, '{}'::jsonb)`,
      [tenantAlphaId, tenantAlphaSlug, tenantBetaId, tenantBetaSlug, tenantSuspendedId, tenantSuspendedSlug]
    );

    // 2. Seed Memberships (field_personnel + supervisor)
    const memAlphaRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memConcRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerConcurrentUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memMultiConnRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerMultiConnUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memOrderedRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerOrderedUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memSupRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'supervisor', true) RETURNING id`,
      [supervisorAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memOwnerRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'OWNER', true) RETURNING id`,
      [ownerAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true)`,
      [unprovisionedAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    const memInactivePersRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [inactivePersonnelAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', false)`,
      [revokedMemberAlphaUserId, tenantAlphaId, tenantAlphaSlug]
    );
    await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true)`,
      [suspendedTenantUserId, tenantSuspendedId, tenantSuspendedSlug]
    );
    const memBetaRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerBetaUserId, tenantBetaId, tenantBetaSlug]
    );

    // 3. Seed Facilities (Alpha A1 Primary, Alpha A2 Secondary Active, Alpha A3 Inactive, Beta B1)
    facilityAlphaActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'Alpha Central Hub', 'FAC-A1', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug]
      )
    ).rows[0].id;

    facilityAlphaSecondaryActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'Alpha West Annex', 'FAC-A2-ACT', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug]
      )
    ).rows[0].id;

    facilityAlphaInactiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'Alpha Closed Site', 'FAC-A2', -6.2088000, 106.8456000, 100, false) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug]
      )
    ).rows[0].id;

    facilityBetaActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'Beta Vault', 'FAC-B1', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantBetaId, tenantBetaSlug]
      )
    ).rows[0].id;

    // 4. Seed Personnel
    personnelAlphaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer Alpha', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerAlphaUserId, memAlphaRes.rows[0].id, facilityAlphaActiveId, `NIK-A1-${ts}`]
      )
    ).rows[0].id;

    personnelConcurrentId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer Concurrent', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerConcurrentUserId, memConcRes.rows[0].id, facilityAlphaActiveId, `NIK-CONC-${ts}`]
      )
    ).rows[0].id;

    personnelMultiConnId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer MultiConn', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerMultiConnUserId, memMultiConnRes.rows[0].id, facilityAlphaActiveId, `NIK-MCONN-${ts}`]
      )
    ).rows[0].id;

    personnelOrderedId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer Ordered', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerOrderedUserId, memOrderedRes.rows[0].id, facilityAlphaActiveId, `NIK-ORD-${ts}`]
      )
    ).rows[0].id;

    personnelSupervisorId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Supervisor Alpha', $6, 'supervisor', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, supervisorAlphaUserId, memSupRes.rows[0].id, facilityAlphaActiveId, `NIK-SUP-${ts}`]
      )
    ).rows[0].id;

    personnelOwnerId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Owner Alpha', $6, 'master_reseller', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, ownerAlphaUserId, memOwnerRes.rows[0].id, facilityAlphaActiveId, `NIK-OWN-${ts}`]
      )
    ).rows[0].id;

    personnelInactiveAlphaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer Inactive', $6, 'field_personnel', false) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, inactivePersonnelAlphaUserId, memInactivePersRes.rows[0].id, facilityAlphaActiveId, `NIK-A2-${ts}`]
      )
    ).rows[0].id;

    personnelBetaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'Officer Beta', $6, 'field_personnel', true) RETURNING id`,
        [tenantBetaId, tenantBetaSlug, officerBetaUserId, memBetaRes.rows[0].id, facilityBetaActiveId, `NIK-B1-${ts}`]
      )
    ).rows[0].id;

    // 5. Seed Checkpoints
    checkpointAlphaActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'Alpha Gate One', 'CP-A1', 'Perimeter', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantAlphaId, facilityAlphaActiveId, `QR-ALPHA-A1-${ts}`]
      )
    ).rows[0].id;

    checkpointAlphaSecondaryActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'Alpha Annex Gate', 'CP-A-SEC', 'Annex', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantAlphaId, facilityAlphaSecondaryActiveId, `QR-ALPHA-SEC-${ts}`]
      )
    ).rows[0].id;

    checkpointAlphaInactiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'Alpha Gate Retired', 'CP-A2', 'Perimeter', -6.2088000, 106.8456000, $3, 60, false) RETURNING id`,
        [tenantAlphaId, facilityAlphaActiveId, `QR-ALPHA-A2-${ts}`]
      )
    ).rows[0].id;

    checkpointAlphaDeadFacilityId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'Alpha Dead Facility CP', 'CP-A3', 'Basement', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantAlphaId, facilityAlphaInactiveId, `QR-ALPHA-A3-${ts}`]
      )
    ).rows[0].id;

    checkpointBetaActiveId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'Beta North Gate', 'CP-B1', 'Perimeter', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantBetaId, facilityBetaActiveId, `QR-BETA-B1-${ts}`]
      )
    ).rows[0].id;

    // 6. Mint Real Session Cookies
    tokenOfficerAlpha = signBwmSessionToken({
      userId: officerAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-A1-${ts}`,
      name: 'Officer Alpha',
      siteId: facilityAlphaActiveId,
    });
    tokenOfficerConcurrent = signBwmSessionToken({
      userId: officerConcurrentUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-CONC-${ts}`,
      name: 'Officer Concurrent',
      siteId: facilityAlphaActiveId,
    });
    tokenSupervisorAlpha = signBwmSessionToken({
      userId: supervisorAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'supervisor',
      nik: `NIK-SUP-${ts}`,
      name: 'Supervisor Alpha',
      siteId: facilityAlphaActiveId,
    });
    tokenUnprovisionedAlpha = signBwmSessionToken({
      userId: unprovisionedAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-UNPROV-${ts}`,
      name: 'Unprovisioned Alpha',
    });
    tokenInactivePersonnelAlpha = signBwmSessionToken({
      userId: inactivePersonnelAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-A2-${ts}`,
      name: 'Inactive Personnel',
    });
    tokenRevokedMemberAlpha = signBwmSessionToken({
      userId: revokedMemberAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-REV-${ts}`,
      name: 'Revoked Member',
    });
    tokenSuspendedTenant = signBwmSessionToken({
      userId: suspendedTenantUserId,
      tenantId: tenantSuspendedId,
      tenantSlug: tenantSuspendedSlug,
      role: 'field_personnel',
      nik: `NIK-SUSP-${ts}`,
      name: 'Suspended Tenant Officer',
    });

    // 7. Boot actual loopback HTTP server routing into App Router handlers
    const activeHttpSockets = new Set<net.Socket>();
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const fullUrl = `http://127.0.0.1${req.url || '/'}`;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join('; '));
          }
          const rawBody = Buffer.concat(chunks).toString('utf8');
          const nextReq = new NextRequest(fullUrl, {
            method: req.method || 'POST',
            headers,
            body: rawBody || undefined,
          });

          const response =
            req.url === '/api/attendance'
              ? await attendancePOST(nextReq)
              : req.url === '/api/checkpoints/scan'
                ? await checkpointScanPOST(nextReq)
                : new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const text = await response.text();
          res.end(text);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err?.message || 'SERVER_ERROR' }));
        }
      });
    });

    server.on('connection', (socket: net.Socket) => {
      activeHttpSockets.add(socket);
      socket.on('close', () => {
        activeHttpSockets.delete(socket);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    const teardownErrors: unknown[] = [];

    if (server) {
      try {
        for (const socket of activeHttpSockets) {
          socket.destroy();
        }
        activeHttpSockets.clear();
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('HTTP server.close() exceeded 5000ms safety timeout'));
          }, 5000);
          server.close((err) => {
            clearTimeout(timer);
            if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
              reject(err);
              return;
            }
            resolve();
          });
        });
      } catch (err) {
        console.error('[PG TEST TEARDOWN] HTTP server teardown error:', err);
        teardownErrors.push(err);
      }
    }

    try {
      await closeDisposablePgPool();
    } catch (err) {
      console.error('[PG TEST TEARDOWN] closeDisposablePgPool() error:', err);
      teardownErrors.push(err);
    }

    if (pgClient) {
      try {
        if (pgConnected) {
          try {
            await pgClient.query('RESET ROLE');
          } catch {
            await pgClient.query('ROLLBACK');
            await pgClient.query('RESET ROLE');
          }
          await pgClient.query(`DELETE FROM workforce_staging.tenants WHERE id IN ($1, $2, $3)`, [
            tenantAlphaId,
            tenantBetaId,
            tenantSuspendedId,
          ]);
          await pgClient.query(`DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id IN ($1, $2, $3)`, [
            tenantAlphaId,
            tenantBetaId,
            tenantSuspendedId,
          ]);
        }
      } catch (err) {
        console.error('[PG TEST TEARDOWN] Test fixture cleanup error:', err);
        teardownErrors.push(err);
      } finally {
        try {
          await pgClient.end();
        } catch (err) {
          console.error('[PG TEST TEARDOWN] pgClient.end() error:', err);
          teardownErrors.push(err);
        }
      }
    }

    if (teardownErrors.length > 0) {
      throw teardownErrors.length === 1
        ? teardownErrors[0]
        : new AggregateError(teardownErrors, 'One or more teardown failures occurred in attendance-checkpoint-postgres');
    }
  });

  it('1. Positive HTTP Clock-In persists personnel.id + server-derived NONE_UNVERIFIED + unattested telemetry & enforces RLS read / 42501 write ACL', async () => {
    const idempKey = `pg-att-pos-${ts}`;
    const res = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_IN',
        latitude: -6.20885,
        longitude: 106.8456,
        accuracy_meters: 12,
        biometric_mode: 'CAMERA_PREVIEW_VERIFIED', // Must be ignored by server!
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': idempKey }
    );

    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    expect(res.json.data.personnel_id).toBe(personnelAlphaId);
    expect(res.json.data.personnel_id).not.toBe(officerAlphaUserId);
    expect(res.json.data.facility_id).toBe(facilityAlphaActiveId);
    expect(res.json.data.biometric_mode).toBe('NONE_UNVERIFIED');
    expect(res.json.verification.biometric_verified).toBe(false);
    expect(res.json.verification.location_evidence_tier).toBe('CLIENT_REPORTED_UNATTESTED');
    expect(res.json.verification.anti_spoof_verified).toBe(false);
    expect(res.json.verification.store_adapter).toBe('DISPOSABLE_PG_SUPERUSER_TEST');

    // Direct PostgreSQL check
    const dbRows = await pgClient.query(
      `SELECT id, tenant_id, personnel_id, facility_id, type, geofence_verified, biometric_mode
       FROM workforce_staging.attendance_logs
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantAlphaId, idempKey]
    );
    expect(dbRows.rows.length).toBe(1);
    expect(dbRows.rows[0].personnel_id).toBe(personnelAlphaId);
    expect(dbRows.rows[0].biometric_mode).toBe('NONE_UNVERIFIED');

    // Verify RLS read as Alpha (1), zero leak as Beta (0), and 42501 direct write denial (authenticated unchanged)
    try {
      await pgClient.query(`SET ROLE authenticated;`);
      await pgClient.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [officerAlphaUserId]);
      await pgClient.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
      const alphaRead = await pgClient.query(`SELECT id FROM workforce_staging.attendance_logs WHERE id = $1`, [
        res.json.data.id,
      ]);
      expect(alphaRead.rows.length).toBe(1);

      await pgClient.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [officerBetaUserId]);
      const betaRead = await pgClient.query(`SELECT id FROM workforce_staging.attendance_logs WHERE id = $1`, [
        res.json.data.id,
      ]);
      expect(betaRead.rows.length).toBe(0);

      let directWriteCode = '';
      try {
        await pgClient.query(
          `INSERT INTO workforce_staging.attendance_logs (tenant_id, personnel_id, type, latitude, longitude, idempotency_key)
           VALUES ($1, $2, 'CLOCK_OUT', -6.2088, 106.8456, $3)`,
          [tenantAlphaId, personnelAlphaId, `direct-denied-${ts}`]
        );
      } catch (err: any) {
        directWriteCode = err.code;
      }
      expect(directWriteCode).toBe('42501');
    } finally {
      await pgClient.query('RESET ROLE');
    }
  });

  it('2. Canonical idempotency in PostgreSQL: identical replay (200) vs mutated type/coords/photo_url (409)', async () => {
    const idempKey = `pg-att-pos-${ts}`;

    const replayRes = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_IN',
        facility_id: facilityAlphaActiveId,
        latitude: -6.20885,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': idempKey }
    );
    expect(replayRes.status).toBe(200);
    expect(replayRes.json.idempotent_replay).toBe(true);

    const diffTypeRes = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_OUT',
        facility_id: facilityAlphaActiveId,
        latitude: -6.20885,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': idempKey }
    );
    expect(diffTypeRes.status).toBe(409);
    expect(diffTypeRes.json.error).toBe('IDEMPOTENCY_KEY_CONFLICT');

    const diffCoordRes = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_IN',
        facility_id: facilityAlphaActiveId,
        latitude: -6.2089,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': idempKey }
    );
    expect(diffCoordRes.status).toBe(409);
    expect(diffCoordRes.json.error).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('3. Rejects missing accuracy_meters (400 GPS_ACCURACY_REQUIRED) and persists PHOTO_URL_UNVERIFIED when photo_url attached', async () => {
    const missingAccAtt = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_OUT', latitude: -6.2088, longitude: 106.8456 },
      tokenOfficerAlpha
    );
    expect(missingAccAtt.status).toBe(400);
    expect(missingAccAtt.json.error).toBe('GPS_ACCURACY_REQUIRED');

    const clockOutPhoto = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_OUT',
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 8,
        photo_url: 'https://vault.example.com/attendance/out.jpg',
        biometric_mode: 'CAMERA_PREVIEW_VERIFIED',
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': `pg-att-out-photo-${ts}` }
    );
    expect(clockOutPhoto.status).toBe(201);
    expect(clockOutPhoto.json.data.biometric_mode).toBe('PHOTO_URL_UNVERIFIED');
    expect(clockOutPhoto.json.verification.biometric_verified).toBe(false);
  });

  it('4. Attendance state transitions + true concurrent Promise.all double CLOCK_IN against PostgreSQL FOR UPDATE row lock', async () => {
    // 4a. CLOCK_OUT without prior CLOCK_IN must fail 409 and write 0 rows
    const earlyClockOut = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_OUT', latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerConcurrent,
      { 'Idempotency-Key': `pg-conc-early-out-${ts}` }
    );
    expect(earlyClockOut.status).toBe(409);
    expect(earlyClockOut.json.error).toBe('INVALID_STATE_TRANSITION');

    // 4b. Simultaneous Promise.all CLOCK_IN requests -> strictly 1 (201) + 1 (409)
    const [r1, r2] = await Promise.all([
      sendHttpJson(
        baseUrl,
        '/api/attendance',
        { type: 'CLOCK_IN', latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
        tokenOfficerConcurrent,
        { 'Idempotency-Key': `pg-conc-in-1-${ts}` }
      ),
      sendHttpJson(
        baseUrl,
        '/api/attendance',
        { type: 'CLOCK_IN', latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
        tokenOfficerConcurrent,
        { 'Idempotency-Key': `pg-conc-in-2-${ts}` }
      ),
    ]);
    const sorted = [r1.status, r2.status].sort((a, b) => a - b);
    expect(sorted).toEqual([201, 409]);

    const rowCnt = (
      await pgClient.query(
        `SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs WHERE tenant_id = $1 AND personnel_id = $2`,
        [tenantAlphaId, personnelConcurrentId]
      )
    ).rows[0].cnt;
    expect(rowCnt).toBe(1);

    // 4c. Sequential duplicate CLOCK_IN must fail 409
    const dupSeqIn = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_IN', latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerConcurrent,
      { 'Idempotency-Key': `pg-conc-in-3-${ts}` }
    );
    expect(dupSeqIn.status).toBe(409);
    expect(dupSeqIn.json.error).toBe('INVALID_STATE_TRANSITION');
  });

  it('5. Enforces multi-site facility assignment in PostgreSQL (blocks field_personnel switching, permits supervisor cross-facility)', async () => {
    const fieldSwitchAtt = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_IN', facility_id: facilityAlphaSecondaryActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerAlpha
    );
    expect(fieldSwitchAtt.status).toBe(403);
    expect(fieldSwitchAtt.json.error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');

    const fieldSwitchScan = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaSecondaryActiveId,
        qr_token: `QR-ALPHA-SEC-${ts}`,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
      },
      tokenOfficerAlpha
    );
    expect(fieldSwitchScan.status).toBe(403);
    expect(fieldSwitchScan.json.error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');

    const supCrossAtt = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_IN', facility_id: facilityAlphaSecondaryActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenSupervisorAlpha,
      { 'Idempotency-Key': `pg-sup-cross-att-${ts}` }
    );
    expect(supCrossAtt.status).toBe(201);
    expect(supCrossAtt.json.verification.facility_scope).toBe('CROSS_FACILITY_AUTHORIZED');

    const supCrossScan = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaSecondaryActiveId,
        qr_token: `QR-ALPHA-SEC-${ts}`,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
      },
      tokenSupervisorAlpha,
      { 'Idempotency-Key': `pg-sup-cross-scan-${ts}` }
    );
    expect(supCrossScan.status).toBe(201);
    expect(supCrossScan.json.verification.facility_scope).toBe('CROSS_FACILITY_AUTHORIZED');
  });

  it('6. Positive Checkpoint Scan via UUID/Code/QR-only & canonical checkpoint idempotency in PostgreSQL', async () => {
    const scanKey = `pg-scan-uuid-${ts}`;
    const resUuid = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaActiveId,
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.20889,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': scanKey }
    );
    expect(resUuid.status).toBe(201);
    expect(resUuid.json.verified).toBe(true);
    expect(resUuid.json.data.personnel_id).toBe(personnelAlphaId);

    // Same payload -> 200 replay
    const replayScan = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaActiveId,
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.20889,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': scanKey }
    );
    expect(replayScan.status).toBe(200);
    expect(replayScan.json.idempotent_replay).toBe(true);

    // Different coordinate -> 409 IDEMPOTENCY_KEY_CONFLICT
    const conflictScan = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaActiveId,
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.20885,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha,
      { 'Idempotency-Key': scanKey }
    );
    expect(conflictScan.status).toBe(409);
    expect(conflictScan.json.error).toBe('IDEMPOTENCY_KEY_CONFLICT');

    const resCode = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: 'CP-A1',
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha
    );
    expect(resCode.status).toBe(201);

    const resQrOnly = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 12,
      },
      tokenOfficerAlpha
    );
    expect(resQrOnly.status).toBe(201);
  });

  it('7. Rejects cross-tenant, wrong QR, spoofed coords, impersonation, unprovisioned/inactive/revoked/suspended entities with zero DB writes', async () => {
    const beforeAttCount = (
      await pgClient.query(`SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs WHERE tenant_id = $1`, [tenantAlphaId])
    ).rows[0].cnt;
    const beforeScanCount = (
      await pgClient.query(`SELECT count(*)::int AS cnt FROM workforce_staging.checkpoint_scans WHERE tenant_id = $1`, [tenantAlphaId])
    ).rows[0].cnt;

    const crossFac = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      { type: 'CLOCK_IN', facility_id: facilityBetaActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerAlpha
    );
    expect(crossFac.status).toBe(403);
    expect(crossFac.json.error).toBe('CROSS_TENANT_FACILITY_FORBIDDEN');

    const crossCp = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      { checkpoint_id: checkpointBetaActiveId, qr_token: `QR-BETA-B1-${ts}`, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerAlpha
    );
    expect(crossCp.status).toBe(403);
    expect(crossCp.json.error).toBe('CROSS_TENANT_CHECKPOINT_FORBIDDEN');

    const foreignQrOnly = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      { qr_token: `QR-BETA-B1-${ts}`, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerAlpha
    );
    expect(foreignQrOnly.status).toBe(403);
    expect(foreignQrOnly.json.error).toBe('INVALID_QR_TOKEN');

    const badQr = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      { checkpoint_id: checkpointAlphaActiveId, qr_token: 'FORGED-QR-TOKEN', latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
      tokenOfficerAlpha
    );
    expect(badQr.status).toBe(403);
    expect(badQr.json.error).toBe('QR_TOKEN_MISMATCH');

    const spoofedGeo = await sendHttpJson(
      baseUrl,
      '/api/checkpoints/scan',
      {
        checkpoint_id: checkpointAlphaActiveId,
        qr_token: `QR-ALPHA-A1-${ts}`,
        latitude: -6.25,
        longitude: 106.9,
        accuracy_meters: 10,
        checkpoint_lat: -6.25,
        checkpoint_lon: 106.9,
      },
      tokenOfficerAlpha
    );
    expect(spoofedGeo.status).toBe(403);
    expect(spoofedGeo.json.error).toBe('GEOFENCE_VIOLATION');

    const impers = await sendHttpJson(
      baseUrl,
      '/api/attendance',
      {
        type: 'CLOCK_IN',
        facility_id: facilityAlphaActiveId,
        personnel_id: personnelBetaId,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
      },
      tokenOfficerAlpha
    );
    expect(impers.status).toBe(403);
    expect(impers.json.error).toBe('PERSONNEL_IMPERSONATION_FORBIDDEN');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/attendance',
          { type: 'CLOCK_IN', facility_id: facilityAlphaActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenUnprovisionedAlpha
        )
      ).json.error
    ).toBe('PERSONNEL_NOT_PROVISIONED');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/attendance',
          {
            type: 'CLOCK_IN',
            facility_id: facilityAlphaActiveId,
            personnel_id: personnelInactiveAlphaId,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          },
          tokenInactivePersonnelAlpha
        )
      ).json.error
    ).toBe('PERSONNEL_INACTIVE');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/attendance',
          { type: 'CLOCK_IN', facility_id: facilityAlphaActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenRevokedMemberAlpha
        )
      ).json.error
    ).toBe('MEMBERSHIP_REVOKED');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/attendance',
          { type: 'CLOCK_IN', facility_id: facilityAlphaActiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenSuspendedTenant
        )
      ).json.error
    ).toBe('TENANT_SUSPENDED');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/attendance',
          { type: 'CLOCK_IN', facility_id: facilityAlphaInactiveId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenOfficerAlpha
        )
      ).json.error
    ).toBe('FACILITY_INACTIVE');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/checkpoints/scan',
          { checkpoint_id: checkpointAlphaInactiveId, qr_token: `QR-ALPHA-A2-${ts}`, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenOfficerAlpha
        )
      ).json.error
    ).toBe('CHECKPOINT_INACTIVE');

    expect(
      (
        await sendHttpJson(
          baseUrl,
          '/api/checkpoints/scan',
          { checkpoint_id: checkpointAlphaDeadFacilityId, qr_token: `QR-ALPHA-A3-${ts}`, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          tokenOfficerAlpha
        )
      ).json.error
    ).toBe('FACILITY_INACTIVE');

    const afterAttCount = (
      await pgClient.query(`SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs WHERE tenant_id = $1`, [tenantAlphaId])
    ).rows[0].cnt;
    const afterScanCount = (
      await pgClient.query(`SELECT count(*)::int AS cnt FROM workforce_staging.checkpoint_scans WHERE tenant_id = $1`, [tenantAlphaId])
    ).rows[0].cnt;

    expect(afterAttCount).toBe(beforeAttCount);
    expect(afterScanCount).toBe(beforeScanCount);
  });

  it('8. Distributed Multi-Connection Concurrency & RPC Privilege Enforcement (Migration 013)', async () => {
    const connA = new Client({ connectionString: disposableUrl });
    const connB = new Client({ connectionString: disposableUrl });
    await connA.connect();
    await connB.connect();

    const execRpcOnConnection = async (
      conn: Client,
      eventType: 'CLOCK_IN' | 'CLOCK_OUT',
      idempotencyKey: string,
      delayMs = 0
    ): Promise<Record<string, any>> => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await conn.query('BEGIN');
      try {
        await conn.query('SET LOCAL ROLE service_role');
        await conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
        const res = await conn.query(
          `SELECT workforce_staging.record_attendance_atomic(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid,
             $5::text, $6::timestamptz, $7::numeric, $8::numeric,
             $9::boolean, $10::text, $11::text, $12::text
           ) AS result`,
          [
            crypto.randomUUID(),
            tenantAlphaId,
            personnelMultiConnId,
            facilityAlphaActiveId,
            eventType,
            new Date().toISOString(),
            -6.2088,
            106.8456,
            true,
            'NONE_UNVERIFIED',
            null,
            idempotencyKey,
          ]
        );
        await conn.query('COMMIT');
        return res.rows[0].result;
      } catch (err) {
        await conn.query('ROLLBACK').catch(() => {});
        throw err;
      }
    };

    try {
      // 8a. CLOCK_OUT without prior CLOCK_IN rejected atomically by RPC in INITIAL state
      const initialOut = await execRpcOnConnection(connA, 'CLOCK_OUT', `mconn-early-out-${ts}`);
      expect(initialOut.outcome).toBe('INVALID_STATE_TRANSITION');
      expect(initialOut.current_state).toBe('INITIAL');

      // 8b. True multi-connection race: two independent PostgreSQL sessions attempt simultaneous CLOCK_IN
      const keyA = `mconn-race-A-${ts}`;
      const keyB = `mconn-race-B-${ts}`;
      const barrierDelay = 30;
      const [resA, resB] = await Promise.all([
        execRpcOnConnection(connA, 'CLOCK_IN', keyA, barrierDelay),
        execRpcOnConnection(connB, 'CLOCK_IN', keyB, barrierDelay),
      ]);

      const outcomes = [resA.outcome, resB.outcome].sort();
      expect(outcomes).toEqual(['CREATED', 'INVALID_STATE_TRANSITION']);

      const winningKey = resA.outcome === 'CREATED' ? keyA : keyB;
      const winningRowId = resA.outcome === 'CREATED' ? resA.row.id : resB.row.id;

      const persisted = await pgClient.query(
        `SELECT id, type, idempotency_key FROM workforce_staging.attendance_logs
         WHERE tenant_id = $1 AND personnel_id = $2`,
        [tenantAlphaId, personnelMultiConnId]
      );
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0].id).toBe(winningRowId);

      // 8c. Idempotent retry with winning key replays cleanly on connB without creating a second event
      const retryRes = await execRpcOnConnection(connB, 'CLOCK_IN', winningKey);
      expect(retryRes.outcome).toBe('IDEMPOTENCY_EXISTING');
      expect(retryRes.row.id).toBe(winningRowId);

      const postRetryCnt = (
        await pgClient.query(
          `SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs
           WHERE tenant_id = $1 AND personnel_id = $2`,
          [tenantAlphaId, personnelMultiConnId]
        )
      ).rows[0].cnt;
      expect(postRetryCnt).toBe(1);

      // 8d. Direct execution of Migration 013 RPC by anon / authenticated MUST fail with 42501
      for (const unprivilegedRole of ['anon', 'authenticated']) {
        await connA.query(`SET ROLE ${unprivilegedRole}`);
        let errCode = '';
        try {
          await connA.query(
            `SELECT workforce_staging.record_attendance_atomic(
               $1::uuid, $2::uuid, $3::uuid, $4::uuid,
               'CLOCK_IN', NOW(), -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $5::text
             )`,
            [crypto.randomUUID(), tenantAlphaId, personnelMultiConnId, facilityAlphaActiveId, `mconn-unpriv-${unprivilegedRole}-${ts}`]
          );
        } catch (err: any) {
          errCode = err.code;
        } finally {
          await connA.query('RESET ROLE').catch(() => {});
        }
        expect(errCode).toBe('42501');
      }
    } finally {
      await connA.end().catch(() => {});
      await connB.end().catch(() => {});
    }
  });

  it('9. Item A — Reversed transaction-start & client timestamps preserve strict committed serialized state_seq order', async () => {
    const tx1Conn = new Client({ connectionString: disposableUrl });
    const tx2Conn = new Client({ connectionString: disposableUrl });
    await tx1Conn.connect();
    await tx2Conn.connect();

    let tx1InTx = false;
    let tx2InTx = false;

    const waitForPidLockWait = async (pid: number): Promise<void> => {
      for (let i = 0; i < 60; i++) {
        const res = await pgClient.query(
          `SELECT wait_event_type, state FROM pg_stat_activity WHERE pid = $1`,
          [pid]
        );
        if (res.rows[0]?.wait_event_type === 'Lock') {
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`Timed out waiting for backend PID ${pid} to block on Lock`);
    };

    try {
      const tx1Pid = (await tx1Conn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      const tx2Pid = (await tx2Conn.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;

      // Phase 9a: tx1 starts its transaction BEFORE tx2 (older transaction_timestamp & NOW()),
      // and passes an older client p_timestamp, but acquires the personnel lock AFTER tx2 commits CLOCK_IN.
      await tx1Conn.query('BEGIN');
      tx1InTx = true;
      await tx1Conn.query('SET LOCAL ROLE service_role');
      await tx1Conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
      const tx1NowRes = await tx1Conn.query('SELECT now() AS tx_ts');
      const tx1StartMs = new Date(tx1NowRes.rows[0].tx_ts).getTime();

      await new Promise((r) => setTimeout(r, 35));

      await tx2Conn.query('BEGIN');
      tx2InTx = true;
      await tx2Conn.query('SET LOCAL ROLE service_role');
      await tx2Conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
      const tx2NowRes = await tx2Conn.query('SELECT now() AS tx_ts');
      const tx2StartMs = new Date(tx2NowRes.rows[0].tx_ts).getTime();
      expect(tx2StartMs).toBeGreaterThan(tx1StartMs);

      const clientNewerIso = new Date(Date.now() + 3600_000).toISOString();
      const clientOlderIso = new Date(Date.now() - 3600_000).toISOString();

      // Younger transaction (tx2) locks & commits CLOCK_IN first -> state_seq = 1
      const r2In = await tx2Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_IN', $5::timestamptz, -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $6::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, clientNewerIso, `ord-9a-in-${ts}`]
      );
      await tx2Conn.query('COMMIT');
      tx2InTx = false;
      expect(r2In.rows[0].result.outcome).toBe('CREATED');
      expect(r2In.rows[0].result.state_seq).toBe(1);

      // Older transaction (tx1) locks & commits CLOCK_OUT second with older p_timestamp -> state_seq = 2
      const r1Out = await tx1Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_OUT', $5::timestamptz, -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $6::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, clientOlderIso, `ord-9a-out-${ts}`]
      );
      await tx1Conn.query('COMMIT');
      tx1InTx = false;
      expect(r1Out.rows[0].result.outcome).toBe('CREATED');
      expect(r1Out.rows[0].result.state_seq).toBe(2);

      // Phase 9b: Deterministic lock-contention sequence without Node Promise.all deadlock
      // 1. tx1Conn starts transaction, acquires FOR UPDATE lock on personnel, and writes CLOCK_IN (state_seq = 3) before committing.
      await tx1Conn.query('BEGIN');
      tx1InTx = true;
      await tx1Conn.query('SET LOCAL ROLE service_role');
      await tx1Conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
      await tx1Conn.query(
        `SELECT id FROM workforce_staging.personnel WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [personnelOrderedId, tenantAlphaId]
      );
      const r1NextIn = await tx1Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_IN', $5::timestamptz, -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $6::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, new Date(Date.now() + 7200_000).toISOString(), `ord-9b-in-${ts}`]
      );
      expect(r1NextIn.rows[0].result.outcome).toBe('CREATED');
      expect(r1NextIn.rows[0].result.state_seq).toBe(3);

      // 2. Verify empirically in PostgreSQL that tx1Pid holds active granted lock on personnel.
      const tx1Locks = await pgClient.query(
        `SELECT count(*)::int AS cnt
         FROM pg_locks l
         JOIN pg_class c ON c.oid = l.relation
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE l.pid = $1
           AND l.granted = true
           AND n.nspname = 'workforce_staging'
           AND c.relname = 'personnel'`,
        [tx1Pid]
      );
      expect(tx1Locks.rows[0].cnt).toBeGreaterThan(0);

      // 3. tx2Conn begins and invokes CLOCK_OUT which must block on tx1Conn's personnel lock.
      await tx2Conn.query('BEGIN');
      tx2InTx = true;
      await tx2Conn.query('SET LOCAL ROLE service_role');
      await tx2Conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
      const pTx2Lock = tx2Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_OUT', $5::timestamptz, -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $6::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, new Date(Date.now() - 7200_000).toISOString(), `ord-9b-out-${ts}`]
      );

      // 4. Empirically verify tx2Pid is blocked on Lock in PostgreSQL AND pTx2Lock remains pending while tx1Conn holds the lock.
      await waitForPidLockWait(tx2Pid);
      const pendingProbe = await Promise.race([
        pTx2Lock.then(() => 'SETTLED'),
        new Promise<'PENDING'>((resolve) => setTimeout(() => resolve('PENDING'), 80)),
      ]);
      expect(pendingProbe).toBe('PENDING');

      // 5. Commit tx1Conn so lock release unblocks pTx2Lock deterministically.
      await tx1Conn.query('COMMIT');
      tx1InTx = false;

      // 6. Await pTx2Lock completion and assert serialized state_seq = 4 after committed CLOCK_IN (state_seq = 3).
      const res2 = await pTx2Lock;
      expect(res2.rows[0].result.outcome).toBe('CREATED');
      expect(res2.rows[0].result.state_seq).toBe(4);

      // 7. Commit tx2Conn and close transaction cleanly.
      await tx2Conn.query('COMMIT');
      tx2InTx = false;

      // Verify committed serialized ordering in DB and prove next transitions obey state_seq=4 (CLOCK_OUT), not timestamp
      const hist = await pgClient.query(
        `SELECT type, state_seq::int AS state_seq, timestamp
         FROM workforce_staging.attendance_logs
         WHERE tenant_id = $1 AND personnel_id = $2
         ORDER BY state_seq ASC`,
        [tenantAlphaId, personnelOrderedId]
      );
      expect(hist.rows.map((r) => [r.state_seq, r.type])).toEqual([
        [1, 'CLOCK_IN'],
        [2, 'CLOCK_OUT'],
        [3, 'CLOCK_IN'],
        [4, 'CLOCK_OUT'],
      ]);

      await tx2Conn.query('BEGIN');
      tx2InTx = true;
      await tx2Conn.query('SET LOCAL ROLE service_role');
      await tx2Conn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
      const invalidDupOut = await tx2Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_OUT', NOW(), -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $5::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, `ord-9c-bad-out-${ts}`]
      );
      expect(invalidDupOut.rows[0].result.outcome).toBe('INVALID_STATE_TRANSITION');
      expect(invalidDupOut.rows[0].result.current_state).toBe('CLOCK_OUT');

      const validNextIn = await tx2Conn.query(
        `SELECT workforce_staging.record_attendance_atomic(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid,
           'CLOCK_IN', NOW(), -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $5::text
         ) AS result`,
        [crypto.randomUUID(), tenantAlphaId, personnelOrderedId, facilityAlphaActiveId, `ord-9c-good-in-${ts}`]
      );
      await tx2Conn.query('COMMIT');
      tx2InTx = false;
      expect(validNextIn.rows[0].result.outcome).toBe('CREATED');
      expect(validNextIn.rows[0].result.state_seq).toBe(5);
    } finally {
      const cleanupErrors: unknown[] = [];
      for (const item of [
        { conn: tx1Conn, inTx: tx1InTx, label: 'tx1Conn' },
        { conn: tx2Conn, inTx: tx2InTx, label: 'tx2Conn' },
      ]) {
        try {
          if (item.inTx) {
            await item.conn.query('ROLLBACK');
          }
        } catch (err) {
          console.error(`[TEST 9 TEARDOWN] ${item.label} ROLLBACK error:`, err);
          cleanupErrors.push(err);
        } finally {
          try {
            await item.conn.end();
          } catch (err) {
            console.error(`[TEST 9 TEARDOWN] ${item.label} end() error:`, err);
            cleanupErrors.push(err);
          }
        }
      }
      if (cleanupErrors.length > 0) {
        console.error('[TEST 9 TEARDOWN] Accumulated cleanup failures:', cleanupErrors);
      }
    }
  });

  it('10. Item B — Revocation/facility concurrent races (FOR SHARE / FOR UPDATE locks) & direct RPC facility negatives', async () => {
    const blockerConn = new Client({ connectionString: disposableUrl });
    const directConn = new Client({ connectionString: disposableUrl });
    await blockerConn.connect();
    await directConn.connect();

    const callDirectRpc = async (params: {
      tenantId: string;
      personnelId: string;
      facilityId: string | null;
      type?: 'CLOCK_IN' | 'CLOCK_OUT';
      keySuffix: string;
    }): Promise<Record<string, any>> => {
      await directConn.query('BEGIN');
      try {
        await directConn.query('SET LOCAL ROLE service_role');
        await directConn.query("SET LOCAL request.jwt.claim.role = 'service_role'");
        const res = await directConn.query(
          `SELECT workforce_staging.record_attendance_atomic(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid,
             $5::text, NOW(), -6.2088, 106.8456, true, 'NONE_UNVERIFIED', NULL, $6::text
           ) AS result`,
          [
            crypto.randomUUID(),
            params.tenantId,
            params.personnelId,
            params.facilityId,
            params.type || 'CLOCK_IN',
            `direct-rpc-${params.keySuffix}-${ts}`,
          ]
        );
        await directConn.query('COMMIT');
        return res.rows[0].result;
      } catch (err) {
        await directConn.query('ROLLBACK').catch(() => {});
        throw err;
      }
    };

    try {
      // 10a. Direct RPC negative facility & role checks bypassing app layer
      const fieldDirectSwitch = await callDirectRpc({
        tenantId: tenantAlphaId,
        personnelId: personnelAlphaId,
        facilityId: facilityAlphaSecondaryActiveId,
        keySuffix: 'field-switch',
      });
      expect(fieldDirectSwitch.outcome).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');

      const supDirectCrossTenant = await callDirectRpc({
        tenantId: tenantAlphaId,
        personnelId: personnelSupervisorId,
        facilityId: facilityBetaActiveId,
        keySuffix: 'sup-cross-tenant',
      });
      expect(supDirectCrossTenant.outcome).toBe('CROSS_TENANT_FACILITY_FORBIDDEN');

      const inactiveDirectFac = await callDirectRpc({
        tenantId: tenantAlphaId,
        personnelId: personnelSupervisorId,
        facilityId: facilityAlphaInactiveId,
        keySuffix: 'sup-dead-fac',
      });
      expect(inactiveDirectFac.outcome).toBe('FACILITY_INACTIVE');

      // Direct RPC allows supervisor & master_reseller (DB role OWNER) on secondary active Alpha facility
      const supDirectSwitch = await callDirectRpc({
        tenantId: tenantAlphaId,
        personnelId: personnelSupervisorId,
        facilityId: facilityAlphaSecondaryActiveId,
        keySuffix: 'sup-alpha-sec',
      });
      expect(['CREATED', 'INVALID_STATE_TRANSITION']).toContain(supDirectSwitch.outcome);

      const ownerDirectSwitch = await callDirectRpc({
        tenantId: tenantAlphaId,
        personnelId: personnelOwnerId,
        facilityId: facilityAlphaSecondaryActiveId,
        keySuffix: 'owner-alpha-sec',
      });
      expect(ownerDirectSwitch.outcome).toBe('CREATED');

      // 10b. Isolated disposable tenant & entities for concurrent lock-contention race proofs
      const raceTenantId = crypto.randomUUID();
      const raceTenantSlug = `ws-a-race-${ts}`;
      const raceFac1Id = (
        await pgClient.query(
          `INSERT INTO workforce_staging.tenants (id, slug, name, tier, status, is_active, metadata)
           VALUES ($1, $2, 'Race Test Tenant', 'PRO_SCALE', 'active', true, '{}'::jsonb)`,
          [raceTenantId, raceTenantSlug]
        ).then(() =>
          pgClient.query(
            `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
             VALUES ($1, $2, 'Race Fac 1', 'RACE-1', -6.2088, 106.8456, 100, true) RETURNING id`,
            [raceTenantId, raceTenantSlug]
          )
        )
      ).rows[0].id as string;

      const raceFac2Id = (
        await pgClient.query(
          `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
           VALUES ($1, $2, 'Race Fac 2', 'RACE-2', -6.2088, 106.8456, 100, true) RETURNING id`,
          [raceTenantId, raceTenantSlug]
        )
      ).rows[0].id as string;

      const raceUserId = crypto.randomUUID();
      const raceMemId = (
        await pgClient.query(
          `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
           VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
          [raceUserId, raceTenantId, raceTenantSlug]
        )
      ).rows[0].id as string;

      const racePersonnelId = (
        await pgClient.query(
          `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
           VALUES ($1, $2, $3, $4, $5, 'Race Officer', $6, 'field_personnel', true) RETURNING id`,
          [raceTenantId, raceTenantSlug, raceUserId, raceMemId, raceFac1Id, `NIK-RACE-${ts}`]
        )
      ).rows[0].id as string;

      const raceToken = signBwmSessionToken({
        userId: raceUserId,
        tenantId: raceTenantId,
        tenantSlug: raceTenantSlug,
        role: 'field_personnel',
        nik: `NIK-RACE-${ts}`,
        name: 'Race Officer',
        siteId: raceFac1Id,
      });

      const runRaceAgainstUncommittedMutation = async (
        mutationSql: string,
        mutationArgs: unknown[],
        targetFacId: string,
        expectedError: string,
        keyTag: string
      ) => {
        await blockerConn.query('BEGIN');
        await blockerConn.query(mutationSql, mutationArgs);

        const httpPromise = sendHttpJson(
          baseUrl,
          '/api/attendance',
          { type: 'CLOCK_IN', facility_id: targetFacId, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
          raceToken,
          { 'Idempotency-Key': `race-${keyTag}-${ts}` }
        );

        await new Promise((r) => setTimeout(r, 80));
        await blockerConn.query('COMMIT');

        const httpRes = await httpPromise;
        expect(httpRes.status).toBe(403);
        expect(httpRes.json.error).toBe(expectedError);
      };

      // Race 1: Personnel facility reassignment (Fac 1 -> Fac 2) mid-flight after stale app check passed Fac 1
      await runRaceAgainstUncommittedMutation(
        `UPDATE workforce_staging.personnel SET facility_id = $1 WHERE id = $2`,
        [raceFac2Id, racePersonnelId],
        raceFac1Id,
        'FACILITY_ASSIGNMENT_FORBIDDEN',
        'reassign'
      );

      // Reassign back to Fac 1 for next race, then run Race 2: Facility deactivation (is_active = false)
      await pgClient.query(`UPDATE workforce_staging.personnel SET facility_id = $1 WHERE id = $2`, [raceFac1Id, racePersonnelId]);
      await runRaceAgainstUncommittedMutation(
        `UPDATE workforce_staging.facilities SET is_active = false WHERE id = $1`,
        [raceFac1Id],
        raceFac1Id,
        'FACILITY_INACTIVE',
        'fac-off'
      );

      // Reactivate facility, then run Race 3: Membership revocation (is_active = false)
      await pgClient.query(`UPDATE workforce_staging.facilities SET is_active = true WHERE id = $1`, [raceFac1Id]);
      await runRaceAgainstUncommittedMutation(
        `UPDATE workforce_staging.tenant_memberships SET is_active = false WHERE id = $1`,
        [raceMemId],
        raceFac1Id,
        'MEMBERSHIP_REVOKED',
        'mem-revoke'
      );

      // Reactivate membership, then run Race 4: Tenant deactivation (is_active = false, status = 'suspended')
      await pgClient.query(`UPDATE workforce_staging.tenant_memberships SET is_active = true WHERE id = $1`, [raceMemId]);
      await runRaceAgainstUncommittedMutation(
        `UPDATE workforce_staging.tenants SET is_active = false, status = 'suspended' WHERE id = $1`,
        [raceTenantId],
        raceFac1Id,
        'TENANT_INACTIVE',
        'tenant-susp'
      );

      // Also test direct RPC rejection when membership role is corrupted to unissued/prototype token
      await pgClient.query(`UPDATE workforce_staging.tenants SET is_active = true, status = 'active' WHERE id = $1`, [raceTenantId]);
      await pgClient.query(`UPDATE workforce_staging.tenant_memberships SET role = 'constructor' WHERE id = $1`, [raceMemId]);
      const protoRpcRes = await callDirectRpc({
        tenantId: raceTenantId,
        personnelId: racePersonnelId,
        facilityId: raceFac1Id,
        keySuffix: 'proto-role',
      });
      expect(protoRpcRes.outcome).toBe('UNRECOGNIZED_MEMBERSHIP_ROLE');

      const raceAttCount = (
        await pgClient.query(`SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs WHERE tenant_id = $1`, [raceTenantId])
      ).rows[0].cnt;
      expect(raceAttCount).toBe(0);
    } finally {
      await blockerConn.query('ROLLBACK').catch(() => {});
      await directConn.query('ROLLBACK').catch(() => {});
      await blockerConn.end().catch(() => {});
      await directConn.end().catch(() => {});
    }
  });
});
