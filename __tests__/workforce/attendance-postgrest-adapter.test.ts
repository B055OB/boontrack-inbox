/**
 * __tests__/workforce/attendance-postgrest-adapter.test.ts
 * BWM Workstream A R3 — Real Disposable PostgREST Integration Suite for createSupabaseServiceRoleOperationalStore
 *
 * Strictly exercises the production `createSupabaseServiceRoleOperationalStore` adapter (`SUPABASE_SERVICE_ROLE`)
 * against a REAL running disposable PostgREST + GoTrue + PostgreSQL stack over loopback HTTP
 * (`http://localhost:3000/rest/v1/*`, `http://localhost:3000/auth/v1/*`), NOT an in-memory mock and NOT
 * `createDisposablePgTestStore`.
 *
 * `pg` is used ONLY in test fixture setup/teardown and database state verification assertions; the runtime
 * routes (`processAttendanceSubmission`, `processCheckpointScanSubmission`) execute strictly through
 * `createSupabaseServiceRoleOperationalStore(realSupabaseClient)`.
 *
 * Fails closed unless NODE_ENV=test, BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP=true, loopback WORKFORCE_SUPABASE_URL,
 * and loopback DISPOSABLE_POSTGRES_URL are explicitly configured.
 */

jest.unmock('@supabase/supabase-js');

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { ALLOWED_TRANSITIONS } from '@/packages/attendance';
import { getAuthenticatedWorkforceSession, signBwmSessionToken } from '@/workforce-web/lib/auth/session';
import { assertDisposableLoopbackUrl } from '@/workforce-web/lib/workforce/disposable-pg-test-store';
import { createSupabaseServiceRoleOperationalStore } from '@/workforce-web/lib/workforce/operational-store';
import {
  processAttendanceSubmission,
  processCheckpointScanSubmission,
} from '@/workforce-web/lib/workforce/attendance-verification';

jest.setTimeout(60000);

function assertEphemeralPostgrestUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error(
      '[POSTGREST ADAPTER GATE] WORKFORCE_SUPABASE_URL is required for attendance-postgrest-adapter.test.ts.'
    );
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('supabase.co') ||
    lower.includes('tjkbgxrckaocgosvmzmj') ||
    lower.includes('boontrack.com')
  ) {
    throw new Error(
      `[POSTGREST ADAPTER GATE] Forbidden staging/production Supabase URL detected: "${trimmed}". Aborting fail-closed.`
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`[POSTGREST ADAPTER GATE] Invalid URL: "${trimmed}"`);
  }
  if (parsed.protocol !== 'http:') {
    throw new Error(`[POSTGREST ADAPTER GATE] Ephemeral PostgREST test URL must use http:, got ${parsed.protocol}`);
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(
      `[POSTGREST ADAPTER GATE] Hostname "${parsed.hostname}" forbidden. Only localhost/127.0.0.1 loopback is permitted.`
    );
  }
  return parsed.origin;
}

interface EphemeralPostgrestConfig {
  pgConnectionString: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

function assertNotStagingJwt(token: string, label: string): string {
  const trimmed = (token || '').trim();
  if (!trimmed) {
    throw new Error(`[POSTGREST ADAPTER GATE] Missing ${label}.`);
  }
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as { ref?: string; iss?: string };
      const ref = String(payload.ref || '').toLowerCase();
      const iss = String(payload.iss || '').toLowerCase();
      if (
        ref === 'tjkbgxrckaocgosvmzmj' ||
        ref === 'mpluzajlzpregmjwpjqr' ||
        ref === 'xkhqirhurnjqglmajghn' ||
        iss.includes('tjkbgxrckaocgosvmzmj') ||
        iss.includes('supabase.co')
      ) {
        throw new Error(`[POSTGREST ADAPTER GATE] Staging/production JWT detected in ${label}. Aborting fail-closed.`);
      }
    } catch (err: any) {
      if (err?.message?.includes('[POSTGREST ADAPTER GATE]')) throw err;
    }
  }
  return trimmed;
}

function getVerifiedEphemeralPostgrestConfig(): EphemeralPostgrestConfig {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('[POSTGREST ADAPTER GATE] NODE_ENV=test is strictly required.');
  }
  if (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production') {
    throw new Error(`[POSTGREST ADAPTER GATE] Forbidden APP_ENV=${process.env.APP_ENV}.`);
  }
  if (process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP !== 'true') {
    throw new Error(
      '[POSTGREST ADAPTER GATE] BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP=true is strictly required. ' +
        'Unit Job 1 must exclude or fail-closed this suite.'
    );
  }

  const supabaseUrl = assertEphemeralPostgrestUrl(
    process.env.DISPOSABLE_POSTGREST_URL || process.env.WORKFORCE_SUPABASE_URL || ''
  );
  const anonKey = assertNotStagingJwt(
    process.env.DISPOSABLE_POSTGREST_ANON_KEY || process.env.WORKFORCE_SUPABASE_ANON_KEY || '',
    'DISPOSABLE_POSTGREST_ANON_KEY / WORKFORCE_SUPABASE_ANON_KEY'
  );
  const serviceRoleKey = assertNotStagingJwt(
    process.env.DISPOSABLE_POSTGREST_SERVICE_ROLE_KEY || process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY || '',
    'DISPOSABLE_POSTGREST_SERVICE_ROLE_KEY / WORKFORCE_SUPABASE_SERVICE_ROLE_KEY'
  );

  const pgRaw = (process.env.DISPOSABLE_POSTGRES_URL || '').trim();
  if (!pgRaw) {
    throw new Error('[POSTGREST ADAPTER GATE] DISPOSABLE_POSTGRES_URL is required.');
  }
  const pgConnectionString = assertDisposableLoopbackUrl(pgRaw);

  return {
    pgConnectionString,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  };
}

describe('Workstream A R3.1: Production createSupabaseServiceRoleOperationalStore + Disposable PostgREST Integration', () => {
  const config = getVerifiedEphemeralPostgrestConfig();
  const prevPostgrestContext = process.env.BWM_POSTGREST_INTEGRATION_TEST;

  let pgClient: Client;
  let pgConnected = false;
  let serviceRoleClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let authenticatedClient: SupabaseClient;
  let createdAuthUserId: string | null = null;
  const observedFetchUrls: string[] = [];

  const ts = Date.now();
  const tenantAlphaId = crypto.randomUUID();
  const tenantAlphaSlug = `pgrst-alpha-${ts}`;
  const tenantBetaId = crypto.randomUUID();
  const tenantBetaSlug = `pgrst-beta-${ts}`;

  let officerAlphaUserId = '';
  const officerConcurrentUserId = crypto.randomUUID();
  const officerBetaUserId = crypto.randomUUID();

  let personnelAlphaId = '';
  let personnelConcurrentId = '';
  let personnelBetaId = '';

  let facilityAlphaId = '';
  let facilityAlphaSecondaryId = '';
  let facilityBetaId = '';

  let checkpointAlphaId = '';
  let checkpointBetaId = '';

  let tokenOfficerAlpha = '';
  let tokenOfficerConcurrent = '';

  function buildReq(urlPath: string, body: Record<string, unknown>, cookieToken: string, idempotencyKey?: string): NextRequest {
    return new NextRequest(`http://127.0.0.1${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `bwm_session_token=${cookieToken}`,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    process.env.BWM_POSTGREST_INTEGRATION_TEST = 'true';
    if (typeof (globalThis.fetch as any)?.mockClear === 'function') {
      (globalThis.fetch as jest.Mock).mockClear();
    }

    // Standard Supabase clients route strictly through Jest's global guarded fetch -> nativeFetch
    serviceRoleClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    pgClient = new Client({ connectionString: config.pgConnectionString });
    await pgClient.connect();
    pgConnected = true;

    // Ensure Migrations 014, 015, and 016 are applied and poll PostgREST over HTTP until schema cache reloads
    const scanRpcPath = path.resolve(
      process.cwd(),
      'packages/workforce-billing/schema/migrations/014_checkpoint_scan_atomic_rpc.sql'
    );
    const actorBindingRpcPath = path.resolve(
      process.cwd(),
      'packages/workforce-billing/schema/migrations/015_attendance_actor_binding_and_role_allowlist.sql'
    );
    const domainAuthzPath = path.resolve(
      process.cwd(),
      'packages/workforce-billing/schema/migrations/016_bwm_domain_authorization_isolation.sql'
    );
    await pgClient.query(fs.readFileSync(scanRpcPath, 'utf8'));
    await pgClient.query(fs.readFileSync(actorBindingRpcPath, 'utf8'));
    await pgClient.query(fs.readFileSync(domainAuthzPath, 'utf8'));
    await pgClient.query(`NOTIFY pgrst, 'reload schema'`);

    let schemaCacheReady = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
      const [attProbe, scanProbe] = await Promise.all([
        serviceRoleClient.schema('workforce_staging').rpc('record_attendance_atomic', {
          p_id: '00000000-0000-4000-8000-000000000911',
          p_tenant_id: '00000000-0000-4000-8000-000000000912',
          p_personnel_id: '00000000-0000-4000-8000-000000000913',
          p_expected_user_id: '00000000-0000-4000-8000-000000000914',
          p_facility_id: null,
          p_type: 'CLOCK_IN',
          p_timestamp: new Date().toISOString(),
          p_latitude: -6.2088,
          p_longitude: 106.8456,
          p_geofence_verified: true,
          p_biometric_mode: 'NONE_UNVERIFIED',
          p_photo_url: null,
          p_idempotency_key: `schema-probe-att-${ts}`,
        }),
        serviceRoleClient.schema('workforce_staging').rpc('record_checkpoint_scan_atomic', {
          p_id: '00000000-0000-4000-8000-000000000921',
          p_tenant_id: '00000000-0000-4000-8000-000000000912',
          p_checkpoint_id: '00000000-0000-4000-8000-000000000922',
          p_personnel_id: '00000000-0000-4000-8000-000000000913',
          p_expected_user_id: '00000000-0000-4000-8000-000000000914',
          p_qr_token: 'PROBE-NONE',
          p_scanned_at: new Date().toISOString(),
          p_latitude: -6.2088,
          p_longitude: 106.8456,
          p_distance_m: 0,
          p_status: 'VERIFIED',
          p_idempotency_key: `schema-probe-scan-${ts}`,
        }),
      ]);
      if (attProbe.error?.code !== 'PGRST202' && scanProbe.error?.code !== 'PGRST202') {
        schemaCacheReady = true;
        break;
      }
      await pgClient.query(`NOTIFY pgrst, 'reload schema'`);
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!schemaCacheReady) {
      throw new Error('PostgREST schema cache did not expose 13-arg/12-arg RPC signatures within bounded wait.');
    }

    // 1. Create real GoTrue user using an isolated bootstrap client so anonClient never stores a user session
    const testEmail = `pgrst-officer-alpha-${ts}@workforce-ci.invalid`;
    const testPassword = `BwmCiPass!${ts}`;
    const createUserRes = await serviceRoleClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createUserRes.error || !createUserRes.data.user) {
      throw new Error(`Failed to create GoTrue user in disposable stack: ${createUserRes.error?.message}`);
    }
    createdAuthUserId = createUserRes.data.user.id;
    officerAlphaUserId = createdAuthUserId;

    const authBootstrapClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signInRes = await authBootstrapClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInRes.error || !signInRes.data.session?.access_token) {
      throw new Error(`Failed to sign in disposable GoTrue user: ${signInRes.error?.message}`);
    }
    const authenticatedJwt = signInRes.data.session.access_token;

    authenticatedClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${authenticatedJwt}`,
        },
      },
    });

    // 2. Seed disposable PostgreSQL test fixtures strictly for test setup
    await pgClient.query(
      `INSERT INTO workforce_staging.tenants (id, slug, name, tier, status, is_active, metadata)
       VALUES
         ($1, $2, 'PostgREST Alpha Corp', 'PRO_SCALE', 'active', true, '{}'::jsonb),
         ($3, $4, 'PostgREST Beta Corp', 'ENTERPRISE', 'active', true, '{}'::jsonb)`,
      [tenantAlphaId, tenantAlphaSlug, tenantBetaId, tenantBetaSlug]
    );

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
    const memBetaRes = await pgClient.query(
      `INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
       VALUES ($1, $2, $3, 'field_personnel', true) RETURNING id`,
      [officerBetaUserId, tenantBetaId, tenantBetaSlug]
    );

    facilityAlphaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'PostgREST Alpha HQ', 'PGRST-A1', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug]
      )
    ).rows[0].id;

    facilityAlphaSecondaryId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'PostgREST Alpha Annex', 'PGRST-A2', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug]
      )
    ).rows[0].id;

    facilityBetaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.facilities (tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active)
         VALUES ($1, $2, 'PostgREST Beta HQ', 'PGRST-B1', -6.2088000, 106.8456000, 100, true) RETURNING id`,
        [tenantBetaId, tenantBetaSlug]
      )
    ).rows[0].id;

    personnelAlphaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'PostgREST Officer Alpha', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerAlphaUserId, memAlphaRes.rows[0].id, facilityAlphaId, `NIK-PG-A-${ts}`]
      )
    ).rows[0].id;

    personnelConcurrentId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'PostgREST Concurrent Officer', $6, 'field_personnel', true) RETURNING id`,
        [tenantAlphaId, tenantAlphaSlug, officerConcurrentUserId, memConcRes.rows[0].id, facilityAlphaId, `NIK-PG-C-${ts}`]
      )
    ).rows[0].id;

    personnelBetaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.personnel (tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'PostgREST Officer Beta', $6, 'field_personnel', true) RETURNING id`,
        [tenantBetaId, tenantBetaSlug, officerBetaUserId, memBetaRes.rows[0].id, facilityBetaId, `NIK-PG-B-${ts}`]
      )
    ).rows[0].id;

    checkpointAlphaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'PostgREST Gate Alpha', 'PG-CP-A1', 'Perimeter', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantAlphaId, facilityAlphaId, `PG-QR-ALPHA-${ts}`]
      )
    ).rows[0].id;

    checkpointBetaId = (
      await pgClient.query(
        `INSERT INTO workforce_staging.checkpoints (tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active)
         VALUES ($1, $2, 'PostgREST Gate Beta', 'PG-CP-B1', 'Perimeter', -6.2088000, 106.8456000, $3, 60, true) RETURNING id`,
        [tenantBetaId, facilityBetaId, `PG-QR-BETA-${ts}`]
      )
    ).rows[0].id;

    tokenOfficerAlpha = signBwmSessionToken({
      userId: officerAlphaUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-PG-A-${ts}`,
      name: 'PostgREST Officer Alpha',
      siteId: facilityAlphaId,
    });
    tokenOfficerConcurrent = signBwmSessionToken({
      userId: officerConcurrentUserId,
      tenantId: tenantAlphaId,
      tenantSlug: tenantAlphaSlug,
      role: 'field_personnel',
      nik: `NIK-PG-C-${ts}`,
      name: 'PostgREST Concurrent Officer',
      siteId: facilityAlphaId,
    });
  });

  afterAll(async () => {
    if (pgConnected) {
      await pgClient
        .query(`DELETE FROM workforce_staging.tenants WHERE id = ANY($1::uuid[])`, [[tenantAlphaId, tenantBetaId]])
        .catch(() => {});
      await pgClient.end().catch(() => {});
    }
    if (createdAuthUserId && serviceRoleClient) {
      await serviceRoleClient.auth.admin.deleteUser(createdAuthUserId).catch(() => {});
    }
    if (prevPostgrestContext === undefined) {
      delete process.env.BWM_POSTGREST_INTEGRATION_TEST;
    } else {
      process.env.BWM_POSTGREST_INTEGRATION_TEST = prevPostgrestContext;
    }
  });

  it('1. Enforces fail-closed loopback guardrails without weakening strict production assertExactWorkforceUrl', () => {
    expect(() => assertEphemeralPostgrestUrl('https://tjkbgxrckaocgosvmzmj.supabase.co')).toThrow(
      /Forbidden staging\/production/
    );
    expect(() => assertEphemeralPostgrestUrl('https://workforce.boontrack.com')).toThrow(
      /Forbidden staging\/production/
    );
    expect(() => assertEphemeralPostgrestUrl('http://10.0.0.5:3000')).toThrow(/forbidden/);

    const savedUrl = process.env.WORKFORCE_SUPABASE_URL;
    const savedAnon = process.env.WORKFORCE_SUPABASE_ANON_KEY;
    try {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'dummy-anon';
      jest.isolateModules(() => {
        const { assertExactWorkforceUrl } = require('@/workforce-web/lib/supabase');
        expect(() => assertExactWorkforceUrl('http://localhost:3000')).toThrow(/Insecure protocol/);
        expect(() => assertExactWorkforceUrl('https://mpluzajlzpregmjwpjqr.supabase.co')).toThrow(
          /Production database reference detected/
        );
      });
    } finally {
      if (savedUrl === undefined) delete process.env.WORKFORCE_SUPABASE_URL;
      else process.env.WORKFORCE_SUPABASE_URL = savedUrl;
      if (savedAnon === undefined) delete process.env.WORKFORCE_SUPABASE_ANON_KEY;
      else process.env.WORKFORCE_SUPABASE_ANON_KEY = savedAnon;
    }

    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);
    expect(store.adapterKind).toBe('SUPABASE_SERVICE_ROLE');
  });

  it('2. Executes attendance CLOCK_IN, idempotent replay, conflict, CLOCK_OUT, and checkpoint scan via live PostgREST', async () => {
    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);
    const keyIn = `pgrst-att-in-${ts}`;

    const clockInRes = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_IN',
          facility_id: facilityAlphaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        keyIn
      ),
      { store }
    );
    expect(clockInRes.status).toBe(201);
    const clockInBody = await clockInRes.json();
    expect(clockInBody.verification.store_adapter).toBe('SUPABASE_SERVICE_ROLE');
    expect(clockInBody.data.personnel_id).toBe(personnelAlphaId);

    const persisted = await pgClient.query(
      `SELECT id, tenant_id, personnel_id, type, state_seq::int AS state_seq FROM workforce_staging.attendance_logs WHERE id = $1`,
      [clockInBody.data.id]
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].personnel_id).toBe(personnelAlphaId);
    expect(persisted.rows[0].state_seq).toBe(1);

    // Idempotent replay via PostgREST RPC
    const replayRes = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_IN',
          facility_id: facilityAlphaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        keyIn
      ),
      { store }
    );
    expect(replayRes.status).toBe(200);
    expect((await replayRes.json()).idempotent_replay).toBe(true);

    // Payload mismatch with same key -> 409 IDEMPOTENCY_KEY_CONFLICT
    const conflictRes = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_IN',
          facility_id: facilityAlphaId,
          latitude: -6.2089,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        keyIn
      ),
      { store }
    );
    expect(conflictRes.status).toBe(409);
    expect((await conflictRes.json()).error).toBe('IDEMPOTENCY_KEY_CONFLICT');

    // CLOCK_OUT via PostgREST RPC
    const clockOutRes = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_OUT',
          facility_id: facilityAlphaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        `pgrst-att-out-${ts}`
      ),
      { store }
    );
    expect(clockOutRes.status).toBe(201);

    // Checkpoint scan via PostgREST atomic RPC (Migration 014)
    const scanKey = `pgrst-scan-${ts}`;
    const scanRes = await processCheckpointScanSubmission(
      buildReq(
        '/api/checkpoints/scan',
        {
          checkpoint_id: checkpointAlphaId,
          qr_token: `PG-QR-ALPHA-${ts}`,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        scanKey
      ),
      { store }
    );
    expect(scanRes.status).toBe(201);
    const scanBody = await scanRes.json();
    expect(scanBody.verification.store_adapter).toBe('SUPABASE_SERVICE_ROLE');

    const persistedScan = await pgClient.query(
      `SELECT id, personnel_id FROM workforce_staging.checkpoint_scans WHERE id = $1`,
      [scanBody.data.id]
    );
    expect(persistedScan.rows).toHaveLength(1);
    expect(persistedScan.rows[0].personnel_id).toBe(personnelAlphaId);

    // Idempotent replay of checkpoint scan via PostgREST atomic RPC
    const scanReplayRes = await processCheckpointScanSubmission(
      buildReq(
        '/api/checkpoints/scan',
        {
          checkpoint_id: checkpointAlphaId,
          qr_token: `PG-QR-ALPHA-${ts}`,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        scanKey
      ),
      { store }
    );
    expect(scanReplayRes.status).toBe(200);
    expect((await scanReplayRes.json()).idempotent_replay).toBe(true);

    // Conflicting payload with same checkpoint scan idempotency key -> 409 IDEMPOTENCY_KEY_CONFLICT
    const scanConflictRes = await processCheckpointScanSubmission(
      buildReq(
        '/api/checkpoints/scan',
        {
          checkpoint_id: checkpointAlphaId,
          qr_token: `PG-QR-ALPHA-${ts}`,
          latitude: -6.2089,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        scanKey
      ),
      { store }
    );
    expect(scanConflictRes.status).toBe(409);
    expect((await scanConflictRes.json()).error).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('3. Enforces distributed concurrency over live PostgREST RPC (1x201, 1x409) and rejects CLOCK_OUT without CLOCK_IN', async () => {
    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);

    const earlyOut = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_OUT',
          facility_id: facilityAlphaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerConcurrent,
        `pgrst-early-out-${ts}`
      ),
      { store }
    );
    expect(earlyOut.status).toBe(409);
    expect((await earlyOut.json()).error).toBe('INVALID_STATE_TRANSITION');

    const [resA, resB] = await Promise.all([
      processAttendanceSubmission(
        buildReq(
          '/api/attendance',
          {
            type: 'CLOCK_IN',
            facility_id: facilityAlphaId,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          },
          tokenOfficerConcurrent,
          `pgrst-conc-A-${ts}`
        ),
        { store }
      ),
      processAttendanceSubmission(
        buildReq(
          '/api/attendance',
          {
            type: 'CLOCK_IN',
            facility_id: facilityAlphaId,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          },
          tokenOfficerConcurrent,
          `pgrst-conc-B-${ts}`
        ),
        { store }
      ),
    ]);

    expect([resA.status, resB.status].sort((a, b) => a - b)).toEqual([201, 409]);

    const concCnt = (
      await pgClient.query(
        `SELECT count(*)::int AS cnt FROM workforce_staging.attendance_logs
         WHERE tenant_id = $1 AND personnel_id = $2`,
        [tenantAlphaId, personnelConcurrentId]
      )
    ).rows[0].cnt;
    expect(concCnt).toBe(1);
  });

  it('4. Propagates Migration 013 FACILITY_REJECTED domain contract and PostgREST PGRST202 errors cleanly without swallowing failures', async () => {
    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);

    // Pre-insert facility guard in Migration 013/015 returns FACILITY_NOT_FOUND before raw FK INSERT when facility UUID does not exist
    const facilityResult = await store.recordAttendanceWithStateTransition({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        personnel_id: personnelConcurrentId,
        facility_id: '99999999-9999-4999-8999-999999999999',
        type: 'CLOCK_OUT',
        timestamp: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        geofence_verified: true,
        biometric_mode: 'NONE_UNVERIFIED',
        photo_url: null,
        idempotency_key: `pgrst-fac-not-found-${ts}`,
      },
      expectedUserId: officerConcurrentUserId,
      checkTransition: (currentState, eventType) => ({
        allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
      }),
    });
    expect(facilityResult.kind).toBe('FACILITY_REJECTED');
    if (facilityResult.kind === 'FACILITY_REJECTED') {
      expect(facilityResult.errorCode).toBe('FACILITY_NOT_FOUND');
    }

    // HIGH-03 Actor-binding mismatch over PostgREST: active member B (officerConcurrentUserId) cannot claim personnelAlphaId
    const attActorMismatch = await store.recordAttendanceWithStateTransition({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        personnel_id: personnelAlphaId,
        facility_id: facilityAlphaId,
        type: 'CLOCK_IN',
        timestamp: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        geofence_verified: true,
        biometric_mode: 'NONE_UNVERIFIED',
        photo_url: null,
        idempotency_key: `pgrst-att-actor-mismatch-${ts}`,
      },
      expectedUserId: officerConcurrentUserId,
      checkTransition: (currentState, eventType) => ({
        allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
      }),
    });
    expect(attActorMismatch).toEqual({
      kind: 'AUTHORITY_REVOKED',
      errorCode: 'MEMBERSHIP_REVOKED',
    });

    // Real PostgREST missing-RPC propagation
    const missingRpc = await serviceRoleClient
      .schema('workforce_staging')
      .rpc('nonexistent_atomic_rpc_probe', {});
    expect(missingRpc.error?.code).toBe('PGRST202');

    // Migration 014 record_checkpoint_scan_atomic direct PostgREST contract checks
    const scanNotFoundRes = await store.recordCheckpointScanAtomic!({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        checkpoint_id: '99999999-9999-4999-8999-999999999998',
        personnel_id: personnelAlphaId,
        scanned_at: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        distance_m: 0,
        status: 'VERIFIED',
        idempotency_key: `pgrst-scan-cp-not-found-${ts}`,
      },
      qrToken: `PG-QR-ALPHA-${ts}`,
      expectedUserId: officerAlphaUserId,
    });
    expect(scanNotFoundRes).toEqual({
      kind: 'CHECKPOINT_REJECTED',
      errorCode: 'CHECKPOINT_NOT_FOUND',
    });

    // HIGH-01 Actor-binding mismatch over PostgREST: active member B (officerConcurrentUserId) cannot claim personnelAlphaId
    const scanActorMismatchRes = await store.recordCheckpointScanAtomic!({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        checkpoint_id: checkpointAlphaId,
        personnel_id: personnelAlphaId,
        scanned_at: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        distance_m: 0,
        status: 'VERIFIED',
        idempotency_key: `pgrst-scan-actor-mismatch-${ts}`,
      },
      qrToken: `PG-QR-ALPHA-${ts}`,
      expectedUserId: officerConcurrentUserId,
    });
    expect(scanActorMismatchRes).toEqual({
      kind: 'AUTHORITY_REVOKED',
      errorCode: 'MEMBERSHIP_REVOKED',
    });

    const scanGeoViolationRes = await store.recordCheckpointScanAtomic!({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        checkpoint_id: checkpointAlphaId,
        personnel_id: personnelAlphaId,
        scanned_at: new Date().toISOString(),
        latitude: -6.2200,
        longitude: 106.8456,
        distance_m: 0,
        status: 'VERIFIED',
        idempotency_key: `pgrst-scan-geo-viol-${ts}`,
      },
      qrToken: `PG-QR-ALPHA-${ts}`,
      expectedUserId: officerAlphaUserId,
    });
    expect(scanGeoViolationRes.kind).toBe('CHECKPOINT_REJECTED');
    if (scanGeoViolationRes.kind === 'CHECKPOINT_REJECTED') {
      expect(scanGeoViolationRes.errorCode).toBe('GEOFENCE_VIOLATION');
      expect(scanGeoViolationRes.distanceM).toBeGreaterThan(1000);
      expect(scanGeoViolationRes.radiusM).toBe(100);
    }
  });

  it('5. Enforces tenant isolation & least-privilege ACL over live PostgREST (anon/authenticated denied 42501 on RPC & writes)', async () => {
    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);

    // Cross-tenant isolation at HTTP handler + PostgREST boundary
    const crossFac = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_IN',
          facility_id: facilityBetaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        `pgrst-cross-fac-${ts}`
      ),
      { store }
    );
    expect(crossFac.status).toBe(403);
    expect((await crossFac.json()).error).toBe('CROSS_TENANT_FACILITY_FORBIDDEN');

    const crossCp = await processCheckpointScanSubmission(
      buildReq(
        '/api/checkpoints/scan',
        {
          checkpoint_id: checkpointBetaId,
          qr_token: `PG-QR-BETA-${ts}`,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        `pgrst-cross-cp-${ts}`
      ),
      { store }
    );
    expect(crossCp.status).toBe(403);
    expect((await crossCp.json()).error).toBe('CROSS_TENANT_CHECKPOINT_FORBIDDEN');

    const crossImpersonate = await processAttendanceSubmission(
      buildReq(
        '/api/attendance',
        {
          type: 'CLOCK_IN',
          facility_id: facilityAlphaId,
          personnel_id: personnelBetaId,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        },
        tokenOfficerAlpha,
        `pgrst-cross-imp-${ts}`
      ),
      { store }
    );
    expect(crossImpersonate.status).toBe(403);
    expect((await crossImpersonate.json()).error).toBe('PERSONNEL_IMPERSONATION_FORBIDDEN');

    // Authenticated client can read OWN Alpha attendance rows via RLS, ZERO Beta rows
    const authRead = await authenticatedClient
      .schema('workforce_staging')
      .from('attendance_logs')
      .select('id, tenant_id, personnel_id');
    expect(authRead.error).toBeNull();
    expect((authRead.data || []).length).toBeGreaterThanOrEqual(1);
    expect((authRead.data || []).some((r) => r.tenant_id === tenantBetaId)).toBe(false);

    // Neither anon nor authenticated can call record_attendance_atomic or insert attendance_logs over PostgREST (42501)
    for (const restrictedClient of [anonClient, authenticatedClient]) {
      const rpcRes = await restrictedClient
        .schema('workforce_staging')
        .rpc('record_attendance_atomic', {
          p_id: crypto.randomUUID(),
          p_tenant_id: tenantAlphaId,
          p_personnel_id: personnelAlphaId,
          p_expected_user_id: officerAlphaUserId,
          p_facility_id: facilityAlphaId,
          p_type: 'CLOCK_IN',
          p_timestamp: new Date().toISOString(),
          p_latitude: -6.2088,
          p_longitude: 106.8456,
          p_geofence_verified: true,
          p_biometric_mode: 'NONE_UNVERIFIED',
          p_photo_url: null,
          p_idempotency_key: `pgrst-denied-rpc-${crypto.randomUUID()}`,
        });
      expect(rpcRes.error).not.toBeNull();
      expect(rpcRes.error?.code).toBe('42501');

      const directInsert = await restrictedClient
        .schema('workforce_staging')
        .from('attendance_logs')
        .insert({
          id: crypto.randomUUID(),
          tenant_id: tenantAlphaId,
          personnel_id: personnelAlphaId,
          type: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          idempotency_key: `pgrst-denied-insert-${crypto.randomUUID()}`,
        });
      expect(directInsert.error).not.toBeNull();
      expect(directInsert.error?.code).toBe('42501');

      const scanRpcRes = await restrictedClient
        .schema('workforce_staging')
        .rpc('record_checkpoint_scan_atomic', {
          p_id: crypto.randomUUID(),
          p_tenant_id: tenantAlphaId,
          p_personnel_id: personnelAlphaId,
          p_expected_user_id: officerAlphaUserId,
          p_checkpoint_id: checkpointAlphaId,
          p_qr_token: `PG-QR-ALPHA-${ts}`,
          p_scanned_at: new Date().toISOString(),
          p_latitude: -6.2088,
          p_longitude: 106.8456,
          p_distance_m: 0,
          p_status: 'VERIFIED',
          p_idempotency_key: `pgrst-denied-scan-rpc-${crypto.randomUUID()}`,
        });
      expect(scanRpcRes.error).not.toBeNull();
      expect(scanRpcRes.error?.code).toBe('42501');

      const directScanInsert = await restrictedClient
        .schema('workforce_staging')
        .from('checkpoint_scans')
        .insert({
          id: crypto.randomUUID(),
          tenant_id: tenantAlphaId,
          checkpoint_id: checkpointAlphaId,
          personnel_id: personnelAlphaId,
          scanned_at: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          distance_m: 0,
          status: 'VERIFIED',
          idempotency_key: `pgrst-denied-scan-ins-${crypto.randomUUID()}`,
        });
      expect(directScanInsert.error).not.toBeNull();
      expect(directScanInsert.error?.code).toBe('42501');
    }

    // Anonymous cannot read attendance_logs at all (42501)
    const anonSelect = await anonClient
      .schema('workforce_staging')
      .from('attendance_logs')
      .select('id');
    expect(anonSelect.error).not.toBeNull();
    expect(anonSelect.error?.code).toBe('42501');
    expect(anonSelect.data).toBeNull();

    // Direct PostgREST RPC facility negatives (bypassing app checks)
    const directFieldSwitch = await store.recordAttendanceWithStateTransition({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        personnel_id: personnelAlphaId,
        facility_id: facilityAlphaSecondaryId,
        type: 'CLOCK_IN',
        timestamp: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        geofence_verified: true,
        biometric_mode: 'NONE_UNVERIFIED',
        photo_url: null,
        idempotency_key: `pgrst-direct-field-switch-${ts}`,
      },
      expectedUserId: officerAlphaUserId,
      checkTransition: (s, t) => ({ allowed: ALLOWED_TRANSITIONS[s]?.includes(t) ?? false }),
    });
    expect(directFieldSwitch).toEqual({ kind: 'FACILITY_REJECTED', errorCode: 'FACILITY_ASSIGNMENT_FORBIDDEN' });

    const directCrossTenantFac = await store.recordAttendanceWithStateTransition({
      row: {
        id: crypto.randomUUID(),
        tenant_id: tenantAlphaId,
        personnel_id: personnelAlphaId,
        facility_id: facilityBetaId,
        type: 'CLOCK_IN',
        timestamp: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        geofence_verified: true,
        biometric_mode: 'NONE_UNVERIFIED',
        photo_url: null,
        idempotency_key: `pgrst-direct-cross-fac-${ts}`,
      },
      expectedUserId: officerAlphaUserId,
      checkTransition: (s, t) => ({ allowed: ALLOWED_TRANSITIONS[s]?.includes(t) ?? false }),
    });
    expect(directCrossTenantFac).toEqual({
      kind: 'FACILITY_REJECTED',
      errorCode: 'CROSS_TENANT_FACILITY_FORBIDDEN',
    });
  });

  it('6. Routes getAuthenticatedWorkforceSession & revocation checks through real PostgREST + guarded global fetch', async () => {
    const store = createSupabaseServiceRoleOperationalStore(serviceRoleClient);

    const activeSessionRes = await getAuthenticatedWorkforceSession(
      buildReq('/api/attendance', {}, tokenOfficerAlpha),
      { store }
    );
    expect(activeSessionRes.session?.userId).toBe(officerAlphaUserId);
    expect(activeSessionRes.session?.role).toBe('field_personnel');

    // Revoke membership in PostgreSQL and verify session authority fails closed via real PostgREST HTTP query
    await pgClient.query(
      `UPDATE workforce_staging.tenant_memberships SET is_active = false WHERE tenant_id = $1 AND user_id = $2`,
      [tenantAlphaId, officerAlphaUserId]
    );
    try {
      const revokedSessionRes = await getAuthenticatedWorkforceSession(
        buildReq('/api/attendance', {}, tokenOfficerAlpha),
        { store }
      );
      expect(revokedSessionRes.session).toBeNull();
      expect(revokedSessionRes.status).toBe(403);
      expect(revokedSessionRes.error).toBe('MEMBERSHIP_REVOKED');
    } finally {
      await pgClient.query(
        `UPDATE workforce_staging.tenant_memberships SET is_active = true WHERE tenant_id = $1 AND user_id = $2`,
        [tenantAlphaId, officerAlphaUserId]
      );
    }

    // Assert actual guarded Jest global fetch was exercised for GoTrue, tables, and RPC on loopback only
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    const calls = (fetchMock?.mock?.calls || []).map((args) => {
      const target = args[0];
      return typeof target === 'string' ? target : target instanceof URL ? target.toString() : String(target?.url || '');
    });
    observedFetchUrls.push(...calls);
    expect(observedFetchUrls.length).toBeGreaterThan(0);
    expect(observedFetchUrls.every((u) => u.startsWith(config.supabaseUrl))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/auth/v1/'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/tenants'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/tenant_memberships'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/personnel'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/facilities'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/rpc/record_attendance_atomic'))).toBe(true);
    expect(observedFetchUrls.some((u) => u.includes('/rest/v1/rpc/record_checkpoint_scan_atomic'))).toBe(true);
  });

  it('7. Verifies PostgREST HTTP schema cache: rejects obsolete 12-arg/11-arg signatures (PGRST202), denies anon/authenticated RPC (42501), and masks qr_token & Commerce', async () => {
    // Obsolete 12-arg attendance payload (missing p_expected_user_id) must fail with PGRST202 over HTTP
    const legacyAttRes = await serviceRoleClient.schema('workforce_staging').rpc('record_attendance_atomic', {
      p_id: crypto.randomUUID(),
      p_tenant_id: tenantAlphaId,
      p_personnel_id: personnelAlphaId,
      p_facility_id: facilityAlphaId,
      p_type: 'CLOCK_IN',
      p_timestamp: new Date().toISOString(),
      p_latitude: -6.2088,
      p_longitude: 106.8456,
      p_geofence_verified: true,
      p_biometric_mode: 'NONE_UNVERIFIED',
      p_photo_url: null,
      p_idempotency_key: `legacy-att-http-${ts}`,
    });
    expect(legacyAttRes.error?.code).toBe('PGRST202');

    // Obsolete 11-arg scan payload (missing p_qr_token) must fail with PGRST202 over HTTP
    const legacyScanRes = await serviceRoleClient.schema('workforce_staging').rpc('record_checkpoint_scan_atomic', {
      p_id: crypto.randomUUID(),
      p_tenant_id: tenantAlphaId,
      p_checkpoint_id: checkpointAlphaId,
      p_personnel_id: personnelAlphaId,
      p_expected_user_id: officerAlphaUserId,
      p_scanned_at: new Date().toISOString(),
      p_latitude: -6.2088,
      p_longitude: 106.8456,
      p_distance_m: 0,
      p_status: 'VERIFIED',
      p_idempotency_key: `legacy-scan-http-${ts}`,
    });
    expect(legacyScanRes.error?.code).toBe('PGRST202');

    // anon and authenticated clients must be denied EXECUTE over PostgREST HTTP (42501 / permission denied)
    for (const untrustedClient of [anonClient, authenticatedClient]) {
      const attDenied = await untrustedClient.schema('workforce_staging').rpc('record_attendance_atomic', {
        p_id: crypto.randomUUID(),
        p_tenant_id: tenantAlphaId,
        p_personnel_id: personnelAlphaId,
        p_expected_user_id: officerAlphaUserId,
        p_facility_id: facilityAlphaId,
        p_type: 'CLOCK_IN',
        p_timestamp: new Date().toISOString(),
        p_latitude: -6.2088,
        p_longitude: 106.8456,
        p_geofence_verified: true,
        p_biometric_mode: 'NONE_UNVERIFIED',
        p_photo_url: null,
        p_idempotency_key: `denied-att-http-${ts}`,
      });
      expect(attDenied.error).not.toBeNull();
      expect(attDenied.error?.code).toBe('42501');

      const scanDenied = await untrustedClient.schema('workforce_staging').rpc('record_checkpoint_scan_atomic', {
        p_id: crypto.randomUUID(),
        p_tenant_id: tenantAlphaId,
        p_checkpoint_id: checkpointAlphaId,
        p_personnel_id: personnelAlphaId,
        p_expected_user_id: officerAlphaUserId,
        p_qr_token: `PG-QR-ALPHA-${ts}`,
        p_scanned_at: new Date().toISOString(),
        p_latitude: -6.2088,
        p_longitude: 106.8456,
        p_distance_m: 0,
        p_status: 'VERIFIED',
        p_idempotency_key: `denied-scan-http-${ts}`,
      });
      expect(scanDenied.error).not.toBeNull();
      expect(scanDenied.error?.code).toBe('42501');
    }

    // Authenticated field_personnel reads own assigned public.workforce_checkpoints via HTTP with masked qr_token = null
    const authedCpRes = await authenticatedClient
      .from('workforce_checkpoints')
      .select('id, facility_id, qr_token')
      .eq('id', checkpointAlphaId);
    expect(authedCpRes.error).toBeNull();
    expect(authedCpRes.data).toHaveLength(1);
    expect(authedCpRes.data?.[0].qr_token).toBeNull();

    // Authenticated field_personnel cannot read cross-tenant Beta checkpoint or Commerce products over PostgREST HTTP
    const crossBetaCpRes = await authenticatedClient
      .from('workforce_checkpoints')
      .select('id')
      .eq('id', checkpointBetaId);
    expect(crossBetaCpRes.error).toBeNull();
    expect(crossBetaCpRes.data).toHaveLength(0);

    const commerceProdRes = await authenticatedClient
      .from('products')
      .select('id')
      .eq('tenant_id', tenantAlphaId);
    expect(commerceProdRes.error).toBeNull();
    expect(commerceProdRes.data).toHaveLength(0);
  });
});
