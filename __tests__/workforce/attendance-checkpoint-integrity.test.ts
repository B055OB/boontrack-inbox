/**
 * __tests__/workforce/attendance-checkpoint-integrity.test.ts
 * BWM Workstream A — Corrective Round: Attendance & Checkpoint Integrity Unit & Adapter Suite
 *
 * Covers CTO Corrective Directives 1-7:
 * 1. GPS Integrity: never defaults missing accuracy to 0; rejects missing accuracy_meters (400);
 *    distinguishes CLIENT_REPORTED_UNATTESTED telemetry from hardware anti-spoof / physical proof.
 * 2. Attendance State Machine: executes processAttendanceEvent() & ALLOWED_TRANSITIONS; rejects
 *    CLOCK_OUT without CLOCK_IN (409), duplicate CLOCK_IN (409), and concurrent double CLOCK_IN (1x201, 1x409).
 * 3. Multi-Site Facility Assignment: binds field personnel strictly to personnel.facility_id (403
 *    FACILITY_ASSIGNMENT_FORBIDDEN across same-tenant sites) while allowing authorized supervisor roles.
 * 4. Biometric Integrity: ignores client CAMERA_PREVIEW_VERIFIED and assigns NONE_UNVERIFIED / PHOTO_URL_UNVERIFIED.
 * 5. Canonical Idempotency: 200 replay ONLY for identical canonical business payload; 409 on any field mutation.
 * 6. Adapter Separation: explicitly verifies createSupabaseServiceRoleOperationalStore (mocked SupabaseClient contract)
 *    separately from createDisposablePgTestStore (gated to test mode + loopback /test_workforce_ci).
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { ALLOWED_TRANSITIONS, evaluateGeofence } from '@/packages/attendance';
import {
  AUTHORIZED_DB_MEMBERSHIP_ROLE_MAP,
  getAuthenticatedWorkforceSession,
  resolveAuthoritativeBwmRole,
  signBwmSessionToken,
  verifySessionAuthority,
  type BwmRole,
} from '@/workforce-web/lib/auth/session';
import {
  assertDisposableLoopbackUrl,
  createDisposablePgTestStore,
} from '@/workforce-web/lib/workforce/disposable-pg-test-store';
import {
  createSupabaseServiceRoleOperationalStore,
  getWorkforceOperationalStore,
  isDisposablePgTestMode,
  type AttendanceLogRow,
  type CheckpointScanRow,
  type WorkforceOperationalStore,
} from '@/workforce-web/lib/workforce/operational-store';
import {
  canUseNonAtomicCheckpointFallback,
  CROSS_FACILITY_AUTHORIZED_ROLES,
  isStrictUnitTestRuntime,
  processAttendanceSubmission,
  processCheckpointScanSubmission,
} from '@/workforce-web/lib/workforce/attendance-verification';

const TENANT_ALPHA_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_BETA_ID = '22222222-2222-4222-8222-222222222222';
const USER_ALPHA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_SUPERVISOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PERSONNEL_ALPHA_ID = '33333333-3333-4333-8333-333333333333';
const PERSONNEL_SUPERVISOR_ID = '33333333-3333-4333-8333-444444444444';
const FACILITY_ALPHA_ID = '44444444-4444-4444-8444-444444444444';
const FACILITY_ALPHA_SECOND_ID = '44444444-4444-4444-8444-555555555555';
const FACILITY_BETA_ID = '55555555-5555-4555-8555-555555555555';
const CHECKPOINT_ALPHA_ID = '66666666-6666-4666-8666-666666666666';
const CHECKPOINT_ALPHA_SECOND_ID = '66666666-6666-4666-8666-777777777777';
const CHECKPOINT_BETA_ID = '77777777-7777-4777-8777-777777777777';
const MEMBERSHIP_ALPHA_ID = '88888888-8888-4888-8888-888888888888';
const MEMBERSHIP_SUPERVISOR_ID = '88888888-8888-4888-8888-999999999999';

describe('Workstream A: Attendance & Checkpoint Integrity Unit & Contract Suite', () => {
  let validAlphaToken: string;

  beforeAll(() => {
    validAlphaToken = signBwmSessionToken({
      userId: USER_ALPHA_ID,
      tenantId: TENANT_ALPHA_ID,
      tenantSlug: 'alpha-sec',
      role: 'field_personnel',
      nik: 'NIK-ALPHA-01',
      name: 'Officer Alpha',
      siteId: FACILITY_ALPHA_ID,
    });
  });

  function createFixtureStore(overrides?: Partial<WorkforceOperationalStore>): WorkforceOperationalStore {
    const attendanceRows: AttendanceLogRow[] = [];
    const scanRows: CheckpointScanRow[] = [];
    let lockChain: Promise<unknown> = Promise.resolve();

    const store: WorkforceOperationalStore = {
      adapterKind: 'MOCK_TEST_DOUBLE',
      getTenantById: jest.fn(async (id: string) => ({
        data:
          id === TENANT_ALPHA_ID
            ? { id: TENANT_ALPHA_ID, slug: 'alpha-sec', status: 'active', is_active: true, metadata: {} }
            : null,
        error: null,
      })),
      getMembership: jest.fn(async (tenantId: string, userId: string) => {
        if (tenantId === TENANT_ALPHA_ID && userId === USER_ALPHA_ID) {
          return {
            data: {
              id: MEMBERSHIP_ALPHA_ID,
              user_id: USER_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              role: 'field_personnel',
              is_active: true,
            },
            error: null,
          };
        }
        if (tenantId === TENANT_ALPHA_ID && userId === USER_SUPERVISOR_ID) {
          return {
            data: {
              id: MEMBERSHIP_SUPERVISOR_ID,
              user_id: USER_SUPERVISOR_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              role: 'supervisor',
              is_active: true,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      getPersonnelByTenantAndUser: jest.fn(async (tenantId: string, userId: string) => {
        if (tenantId === TENANT_ALPHA_ID && userId === USER_ALPHA_ID) {
          return {
            data: {
              id: PERSONNEL_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              user_id: USER_ALPHA_ID,
              membership_id: MEMBERSHIP_ALPHA_ID,
              facility_id: FACILITY_ALPHA_ID,
              name: 'Officer Alpha',
              nik: 'NIK-ALPHA-01',
              role: 'field_personnel',
              is_active: true,
            },
            error: null,
          };
        }
        if (tenantId === TENANT_ALPHA_ID && userId === USER_SUPERVISOR_ID) {
          return {
            data: {
              id: PERSONNEL_SUPERVISOR_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              user_id: USER_SUPERVISOR_ID,
              membership_id: MEMBERSHIP_SUPERVISOR_ID,
              facility_id: FACILITY_ALPHA_ID,
              name: 'Supervisor Alpha',
              nik: 'NIK-SUP-01',
              role: 'supervisor',
              is_active: true,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      getFacilityById: jest.fn(async (id: string) => {
        if (id === FACILITY_ALPHA_ID) {
          return {
            data: {
              id: FACILITY_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              name: 'Alpha HQ',
              code: 'FAC-A1',
              latitude: -6.2088,
              longitude: 106.8456,
              geofence_radius_m: 100,
              is_active: true,
            },
            error: null,
          };
        }
        if (id === FACILITY_ALPHA_SECOND_ID) {
          return {
            data: {
              id: FACILITY_ALPHA_SECOND_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              name: 'Alpha West Annex',
              code: 'FAC-A2',
              latitude: -6.2088,
              longitude: 106.8456,
              geofence_radius_m: 100,
              is_active: true,
            },
            error: null,
          };
        }
        if (id === FACILITY_BETA_ID) {
          return {
            data: {
              id: FACILITY_BETA_ID,
              tenant_id: TENANT_BETA_ID,
              tenant_slug: 'beta-def',
              name: 'Beta HQ',
              code: 'FAC-B1',
              latitude: -6.2088,
              longitude: 106.8456,
              geofence_radius_m: 100,
              is_active: true,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      getCheckpointById: jest.fn(async (id: string) => {
        if (id === CHECKPOINT_ALPHA_ID) {
          return {
            data: {
              id: CHECKPOINT_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              facility_id: FACILITY_ALPHA_ID,
              name: 'Main Gate',
              code: 'CP-01',
              zone: 'Perimeter',
              latitude: -6.2088,
              longitude: 106.8456,
              qr_token: 'SECRET-QR-ALPHA-01',
              sla_minutes: 60,
              is_active: true,
            },
            error: null,
          };
        }
        if (id === CHECKPOINT_ALPHA_SECOND_ID) {
          return {
            data: {
              id: CHECKPOINT_ALPHA_SECOND_ID,
              tenant_id: TENANT_ALPHA_ID,
              facility_id: FACILITY_ALPHA_SECOND_ID,
              name: 'West Annex Gate',
              code: 'CP-02',
              zone: 'Annex Perimeter',
              latitude: -6.2088,
              longitude: 106.8456,
              qr_token: 'SECRET-QR-ALPHA-02',
              sla_minutes: 60,
              is_active: true,
            },
            error: null,
          };
        }
        if (id === CHECKPOINT_BETA_ID) {
          return {
            data: {
              id: CHECKPOINT_BETA_ID,
              tenant_id: TENANT_BETA_ID,
              facility_id: FACILITY_BETA_ID,
              name: 'Beta Gate',
              code: 'CP-B1',
              zone: 'Perimeter',
              latitude: -6.2088,
              longitude: 106.8456,
              qr_token: 'SECRET-QR-BETA-01',
              sla_minutes: 60,
              is_active: true,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      getCheckpointByTenantAndCode: jest.fn(async () => ({ data: null, error: null })),
      getCheckpointsByTenantAndQrToken: jest.fn(async (tenantId: string, qrToken: string) => {
        if (tenantId === TENANT_ALPHA_ID && qrToken === 'SECRET-QR-ALPHA-01') {
          return {
            data: [
              {
                id: CHECKPOINT_ALPHA_ID,
                tenant_id: TENANT_ALPHA_ID,
                facility_id: FACILITY_ALPHA_ID,
                name: 'Main Gate',
                code: 'CP-01',
                zone: 'Perimeter',
                latitude: -6.2088,
                longitude: 106.8456,
                qr_token: 'SECRET-QR-ALPHA-01',
                sla_minutes: 60,
                is_active: true,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      }),
      getLatestAttendanceByPersonnel: jest.fn(async (tenantId: string, personnelId: string) => {
        const matching = attendanceRows.filter((r) => r.tenant_id === tenantId && r.personnel_id === personnelId);
        return { data: matching.length > 0 ? matching[matching.length - 1] : null, error: null };
      }),
      insertAttendanceLog: jest.fn(async (row: AttendanceLogRow) => {
        const dup = attendanceRows.find(
          (r) => r.tenant_id === row.tenant_id && r.idempotency_key === row.idempotency_key
        );
        if (dup) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const saved = { ...row };
        attendanceRows.push(saved);
        return { data: saved, error: null };
      }),
      findAttendanceByIdempotencyKey: jest.fn(async (tenantId: string, idempotencyKey: string) => {
        const found = attendanceRows.find((r) => r.tenant_id === tenantId && r.idempotency_key === idempotencyKey) || null;
        return { data: found, error: null };
      }),
      insertCheckpointScan: jest.fn(async (row: CheckpointScanRow) => {
        const dup = scanRows.find((r) => r.tenant_id === row.tenant_id && r.idempotency_key === row.idempotency_key);
        if (dup) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const saved = { ...row };
        scanRows.push(saved);
        return { data: saved, error: null };
      }),
      findCheckpointScanByIdempotencyKey: jest.fn(async (tenantId: string, idempotencyKey: string) => {
        const found = scanRows.find((r) => r.tenant_id === tenantId && r.idempotency_key === idempotencyKey) || null;
        return { data: found, error: null };
      }),
      recordAttendanceWithStateTransition: jest.fn(async ({ row, checkTransition }) => {
        const exec = async () => {
          const existingRes = await store.findAttendanceByIdempotencyKey(row.tenant_id, row.idempotency_key);
          if (existingRes.error) return { kind: 'ERROR' as const, error: existingRes.error };
          if (existingRes.data) return { kind: 'IDEMPOTENCY_EXISTING' as const, row: existingRes.data };

          const latestRes = await store.getLatestAttendanceByPersonnel(row.tenant_id, row.personnel_id);
          if (latestRes.error) return { kind: 'ERROR' as const, error: latestRes.error };
          const currentState = latestRes.data ? latestRes.data.type : 'INITIAL';

          const check = checkTransition(currentState, row.type);
          if (!check.allowed) {
            return {
              kind: 'INVALID_STATE_TRANSITION' as const,
              currentState,
              attemptedType: row.type,
              reason: check.reason,
            };
          }

          const ins = await store.insertAttendanceLog(row);
          if (ins.error) {
            if (ins.error.code === '23505') {
              const dupRes = await store.findAttendanceByIdempotencyKey(row.tenant_id, row.idempotency_key);
              if (dupRes.error) return { kind: 'ERROR' as const, error: dupRes.error };
              if (dupRes.data) return { kind: 'IDEMPOTENCY_EXISTING' as const, row: dupRes.data };
            }
            return { kind: 'ERROR' as const, error: ins.error };
          }
          if (!ins.data) {
            return { kind: 'ERROR' as const, error: { message: 'Persisted row was not returned.' } };
          }
          return { kind: 'CREATED' as const, row: ins.data, previousState: currentState };
        };

        const run = lockChain.catch(() => {}).then(exec);
        lockChain = run;
        return run;
      }),
      ...overrides,
    };
    return store;
  }

  function makeAuthedRequest(url: string, body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bwm_session_token=${validAlphaToken}`,
        ...(headers || {}),
      },
      body: JSON.stringify(body),
    });
  }

  describe('1. Disposable PG Test Store Separation & Guardrails', () => {
    it('accepts strictly local /test_workforce_ci URLs and rejects staging/prod/arbitrary hosts', () => {
      expect(assertDisposableLoopbackUrl('postgresql://postgres:secret@localhost:5432/test_workforce_ci')).toContain(
        'test_workforce_ci'
      );
      expect(assertDisposableLoopbackUrl('postgres://authenticator:pass@127.0.0.1:5432/test_workforce_ci')).toContain(
        'test_workforce_ci'
      );

      expect(() =>
        assertDisposableLoopbackUrl('postgresql://postgres:p@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres')
      ).toThrow(/DISPOSABLE GUARD FATAL/);
      expect(() => assertDisposableLoopbackUrl('postgresql://postgres:p@localhost:5432/postgres')).toThrow(
        /Invalid database name/
      );
      expect(() =>
        assertDisposableLoopbackUrl('postgresql://postgres:p@localhost:5432/test_workforce_ci?sslmode=disable')
      ).toThrow(/Query parameters/);
      expect(() =>
        assertDisposableLoopbackUrl('postgresql://postgres:p@localhost:5432/test_workforce_ci#frag')
      ).toThrow(/fragment/);
    });

    it('keeps disposable PG mode disabled and blocks createDisposablePgTestStore outside test mode', async () => {
      const prevEnv = { ...process.env };
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.WORKFORCE_USE_DISPOSABLE_PG = 'true';
        expect(isDisposablePgTestMode()).toBe(false);
        expect(() => createDisposablePgTestStore({ query: jest.fn() } as never)).toThrow(/DISPOSABLE GUARD FATAL/);

        (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
        process.env.APP_ENV = 'staging';
        expect(isDisposablePgTestMode()).toBe(false);

        delete process.env.APP_ENV;
        delete process.env.WORKFORCE_USE_DISPOSABLE_PG;
        expect(isDisposablePgTestMode()).toBe(false);

        process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-role-key-for-unit-test-only';
        const resolved = await getWorkforceOperationalStore();
        expect(resolved.adapterKind).toBe('SUPABASE_SERVICE_ROLE');

        // Importing operational-store/session/attendance-verification with loopback WORKFORCE_SUPABASE_URL
        // must NOT throw assertExactWorkforceUrl at module load time (Item C.1), while direct
        // supabase module initialization still rejects non-canonical hosts/protocols (Item C.2).
        process.env.WORKFORCE_SUPABASE_URL = 'http://localhost:3000';
        jest.isolateModules(() => {
          expect(() => require('@/workforce-web/lib/workforce/operational-store')).not.toThrow();
          expect(() => require('@/workforce-web/lib/auth/session')).not.toThrow();
          expect(() => require('@/workforce-web/lib/workforce/attendance-verification')).not.toThrow();
          expect(() => require('@/workforce-web/lib/supabase')).toThrow(/Insecure protocol 'http:'/);
        });
      } finally {
        process.env = prevEnv;
      }
    });
  });

  describe('2. Production SupabaseServiceRoleStore Adapter Contract (Mocked SupabaseClient Only)', () => {
    function buildInMemorySupabaseClient(options?: {
      insertError?: { code?: string; message: string } | null;
      rpcError?: { code?: string; message: string; details?: string; hint?: string } | null;
      rpcRawData?: unknown;
      returnNullRow?: boolean;
      tenantInactive?: boolean;
      membershipRevoked?: boolean;
      personnelInactive?: boolean;
    }): SupabaseClient {
      const tables: Record<string, Record<string, unknown>[]> = {
        tenants: [
          {
            id: TENANT_ALPHA_ID,
            slug: 'alpha-sec',
            name: 'Alpha',
            status: options?.tenantInactive ? 'suspended' : 'active',
            is_active: !options?.tenantInactive,
            metadata: {},
          },
        ],
        tenant_memberships: [
          {
            id: MEMBERSHIP_ALPHA_ID,
            user_id: USER_ALPHA_ID,
            tenant_id: TENANT_ALPHA_ID,
            tenant_slug: 'alpha-sec',
            role: 'field_personnel',
            is_active: !options?.membershipRevoked,
          },
        ],
        personnel: [
          {
            id: PERSONNEL_ALPHA_ID,
            tenant_id: TENANT_ALPHA_ID,
            tenant_slug: 'alpha-sec',
            user_id: USER_ALPHA_ID,
            membership_id: MEMBERSHIP_ALPHA_ID,
            facility_id: FACILITY_ALPHA_ID,
            name: 'Officer Alpha',
            nik: 'NIK-ALPHA-01',
            role: 'field_personnel',
            is_active: !options?.personnelInactive,
          },
        ],
        facilities: [
          {
            id: FACILITY_ALPHA_ID,
            tenant_id: TENANT_ALPHA_ID,
            tenant_slug: 'alpha-sec',
            name: 'Alpha HQ',
            code: 'FAC-A1',
            latitude: -6.2088,
            longitude: 106.8456,
            geofence_radius_m: 100,
            is_active: true,
          },
          {
            id: FACILITY_ALPHA_SECOND_ID,
            tenant_id: TENANT_ALPHA_ID,
            tenant_slug: 'alpha-sec',
            name: 'Alpha Annex',
            code: 'FAC-A2',
            latitude: -6.2088,
            longitude: 106.8456,
            geofence_radius_m: 100,
            is_active: true,
          },
          {
            id: FACILITY_BETA_ID,
            tenant_id: TENANT_BETA_ID,
            tenant_slug: 'beta-def',
            name: 'Beta HQ',
            code: 'FAC-B1',
            latitude: -6.2088,
            longitude: 106.8456,
            geofence_radius_m: 100,
            is_active: true,
          },
        ],
        checkpoints: [
          {
            id: CHECKPOINT_ALPHA_ID,
            tenant_id: TENANT_ALPHA_ID,
            facility_id: FACILITY_ALPHA_ID,
            name: 'Main Gate',
            code: 'CP-01',
            zone: 'Perimeter',
            latitude: -6.2088,
            longitude: 106.8456,
            qr_token: 'SECRET-QR-ALPHA-01',
            sla_minutes: 60,
            is_active: true,
          },
        ],
        attendance_logs: [],
        checkpoint_scans: [],
      };

      const matchesFilters = (row: Record<string, unknown>, filters: Array<[string, unknown]>) =>
        filters.every(([k, v]) => row[k] === v);

      return {
        schema: () => ({
          rpc: async (fnName: string, params: Record<string, unknown>) => {
            if (fnName !== 'record_attendance_atomic') {
              return { data: null, error: { code: 'PGRST202', message: `Could not find function ${fnName}` } };
            }
            if (options?.rpcError) {
              return { data: null, error: options.rpcError };
            }
            if (options && 'rpcRawData' in options) {
              return { data: options.rpcRawData, error: null };
            }

            const pId = params.p_id as string;
            const tenantId = params.p_tenant_id as string;
            const personnelId = params.p_personnel_id as string;
            const facilityId = (params.p_facility_id as string | null) ?? null;
            const eventType = params.p_type as 'CLOCK_IN' | 'CLOCK_OUT';
            const idempotencyKey = params.p_idempotency_key as string;

            const personnel = tables.personnel.find((p) => p.id === personnelId && p.tenant_id === tenantId);
            if (!personnel) {
              return { data: { outcome: 'PERSONNEL_NOT_PROVISIONED' }, error: null };
            }
            if (personnel.is_active !== true) {
              return { data: { outcome: 'PERSONNEL_INACTIVE' }, error: null };
            }

            const tenant = tables.tenants.find((t) => t.id === tenantId);
            if (!tenant || tenant.is_active === false || tenant.status !== 'active') {
              return { data: { outcome: 'TENANT_INACTIVE' }, error: null };
            }

            const membership = tables.tenant_memberships.find(
              (m) => m.tenant_id === tenantId && m.user_id === personnel.user_id
            );
            if (!membership || membership.is_active !== true) {
              return { data: { outcome: 'MEMBERSHIP_REVOKED' }, error: null };
            }

            const issuedRole = resolveAuthoritativeBwmRole(membership.role as string);
            if (!issuedRole) {
              return { data: { outcome: 'UNRECOGNIZED_MEMBERSHIP_ROLE' }, error: null };
            }

            const effectiveFacilityId = facilityId || (personnel.facility_id as string | null);
            if (!effectiveFacilityId) {
              return { data: { outcome: 'FACILITY_REQUIRED' }, error: null };
            }
            const fac = tables.facilities.find((f) => f.id === effectiveFacilityId);
            if (!fac) {
              return { data: { outcome: 'FACILITY_NOT_FOUND' }, error: null };
            }
            if (fac.tenant_id !== tenantId) {
              return { data: { outcome: 'CROSS_TENANT_FACILITY_FORBIDDEN' }, error: null };
            }
            if (fac.is_active !== true) {
              return { data: { outcome: 'FACILITY_INACTIVE' }, error: null };
            }
            if (!CROSS_FACILITY_AUTHORIZED_ROLES.has(issuedRole) && personnel.facility_id !== fac.id) {
              return { data: { outcome: 'FACILITY_ASSIGNMENT_FORBIDDEN' }, error: null };
            }

            const existing = tables.attendance_logs.find(
              (a) => a.tenant_id === tenantId && a.idempotency_key === idempotencyKey
            );
            if (existing) {
              return { data: { outcome: 'IDEMPOTENCY_EXISTING', row: existing }, error: null };
            }

            const personnelEvents = tables.attendance_logs.filter(
              (a) => a.tenant_id === tenantId && a.personnel_id === personnelId
            );
            const latest = personnelEvents.length > 0 ? personnelEvents[personnelEvents.length - 1] : null;
            const currentState = (latest?.type as string | undefined) || 'INITIAL';
            if ((currentState === 'INITIAL' || currentState === 'CLOCK_OUT') && eventType !== 'CLOCK_IN') {
              return {
                data: {
                  outcome: 'INVALID_STATE_TRANSITION',
                  current_state: currentState,
                  attempted_type: eventType,
                  reason: `Invalid transition from ${currentState} to ${eventType}`,
                },
                error: null,
              };
            }
            if (currentState === 'CLOCK_IN' && eventType !== 'CLOCK_OUT') {
              return {
                data: {
                  outcome: 'INVALID_STATE_TRANSITION',
                  current_state: currentState,
                  attempted_type: eventType,
                  reason: `Duplicate ${eventType} rejected in state ${currentState}`,
                },
                error: null,
              };
            }

            const nextSeq = personnelEvents.length + 1;
            const saved: Record<string, unknown> = {
              id: pId,
              tenant_id: tenantId,
              personnel_id: personnelId,
              facility_id: fac.id,
              type: eventType,
              timestamp: params.p_timestamp,
              latitude: params.p_latitude,
              longitude: params.p_longitude,
              geofence_verified: params.p_geofence_verified,
              biometric_mode: params.p_biometric_mode,
              photo_url: params.p_photo_url ?? null,
              idempotency_key: idempotencyKey,
              state_seq: nextSeq,
              created_at: new Date().toISOString(),
            };
            tables.attendance_logs.push(saved);
            return {
              data: { outcome: 'CREATED', previous_state: currentState, state_seq: nextSeq, row: saved },
              error: null,
            };
          },
          from: (table: string) => {
            const filters: Array<[string, unknown]> = [];
            let pendingInsert: Record<string, unknown> | null = null;
            let limitVal: number | null = null;

            const builder: Record<string, unknown> = {
              select: () => builder,
              eq: (col: string, val: unknown) => {
                filters.push([col, val]);
                return builder;
              },
              order: () => builder,
              limit: (n: number) => {
                limitVal = n;
                if (pendingInsert === null && filters.length > 0 && table === 'checkpoints') {
                  const rows = (tables[table] || []).filter((r) => matchesFilters(r, filters)).slice(0, limitVal);
                  return Promise.resolve({ data: rows, error: null });
                }
                return builder;
              },
              insert: (row: Record<string, unknown>) => {
                pendingInsert = row;
                return builder;
              },
              maybeSingle: async () => {
                const rows = (tables[table] || []).filter((r) => matchesFilters(r, filters));
                const chosen =
                  table === 'attendance_logs' && filters.every(([k]) => k !== 'idempotency_key')
                    ? rows[rows.length - 1] || null
                    : rows[0] || null;
                return { data: chosen, error: null };
              },
              single: async () => {
                if (options?.insertError) {
                  return { data: null, error: options.insertError };
                }
                if (options?.returnNullRow) {
                  return { data: null, error: null };
                }
                const saved = { ...pendingInsert, created_at: new Date().toISOString() };
                tables[table].push(saved);
                return { data: saved, error: null };
              },
            };
            return builder;
          },
        }),
      } as unknown as SupabaseClient;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('propagates 42P01, PGRST202, 23503 and fails closed on null row or malformed RPC payload', async () => {
      const missingTableStore = createSupabaseServiceRoleOperationalStore(
        buildInMemorySupabaseClient({
          insertError: { code: '42P01', message: 'relation "workforce_staging.attendance_logs" does not exist' },
        })
      );
      expect(missingTableStore.adapterKind).toBe('SUPABASE_SERVICE_ROLE');

      const resErr = await missingTableStore.insertAttendanceLog({
        id: crypto.randomUUID(),
        tenant_id: TENANT_ALPHA_ID,
        personnel_id: PERSONNEL_ALPHA_ID,
        facility_id: FACILITY_ALPHA_ID,
        type: 'CLOCK_IN',
        timestamp: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        geofence_verified: true,
        biometric_mode: 'NONE_UNVERIFIED',
        photo_url: null,
        idempotency_key: 'idem-err-1',
      });
      expect(resErr.data).toBeNull();
      expect(resErr.error?.code).toBe('42P01');

      const nullRowStore = createSupabaseServiceRoleOperationalStore(buildInMemorySupabaseClient({ returnNullRow: true }));
      const resNull = await nullRowStore.insertCheckpointScan({
        id: crypto.randomUUID(),
        tenant_id: TENANT_ALPHA_ID,
        checkpoint_id: CHECKPOINT_ALPHA_ID,
        personnel_id: PERSONNEL_ALPHA_ID,
        scanned_at: new Date().toISOString(),
        latitude: -6.2088,
        longitude: 106.8456,
        distance_m: 0,
        status: 'VERIFIED',
        idempotency_key: 'scan-null-1',
      });
      expect(resNull.data).toBeNull();
      expect(resNull.error?.message).toContain('not returned');

      const missingRpcStore = createSupabaseServiceRoleOperationalStore(
        buildInMemorySupabaseClient({
          rpcError: { code: 'PGRST202', message: 'Could not find the function workforce_staging.record_attendance_atomic' },
        })
      );
      const rpcErrRes = await missingRpcStore.recordAttendanceWithStateTransition({
        row: {
          id: crypto.randomUUID(),
          tenant_id: TENANT_ALPHA_ID,
          personnel_id: PERSONNEL_ALPHA_ID,
          facility_id: FACILITY_ALPHA_ID,
          type: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          geofence_verified: true,
          biometric_mode: 'NONE_UNVERIFIED',
          photo_url: null,
          idempotency_key: 'rpc-pgrst202',
        },
        checkTransition: (currentState, eventType) => ({
          allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
        }),
      });
      expect(rpcErrRes.kind).toBe('ERROR');
      if (rpcErrRes.kind === 'ERROR') {
        expect(rpcErrRes.error.code).toBe('PGRST202');
      }

      const fkErrStore = createSupabaseServiceRoleOperationalStore(
        buildInMemorySupabaseClient({
          rpcError: { code: '23503', message: 'violates foreign key constraint attendance_logs_facility_id_fkey' },
        })
      );
      const fkErrRes = await fkErrStore.recordAttendanceWithStateTransition({
        row: {
          id: crypto.randomUUID(),
          tenant_id: TENANT_ALPHA_ID,
          personnel_id: PERSONNEL_ALPHA_ID,
          facility_id: FACILITY_ALPHA_ID,
          type: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          geofence_verified: true,
          biometric_mode: 'NONE_UNVERIFIED',
          photo_url: null,
          idempotency_key: 'rpc-fk-23503',
        },
        checkTransition: (currentState, eventType) => ({
          allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
        }),
      });
      expect(fkErrRes.kind).toBe('ERROR');
      if (fkErrRes.kind === 'ERROR') {
        expect(fkErrRes.error.code).toBe('23503');
      }

      const malformedRpcStore = createSupabaseServiceRoleOperationalStore(
        buildInMemorySupabaseClient({ rpcRawData: { outcome: 'CREATED', row: null } })
      );
      const malformedRes = await malformedRpcStore.recordAttendanceWithStateTransition({
        row: {
          id: crypto.randomUUID(),
          tenant_id: TENANT_ALPHA_ID,
          personnel_id: PERSONNEL_ALPHA_ID,
          facility_id: FACILITY_ALPHA_ID,
          type: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          geofence_verified: true,
          biometric_mode: 'NONE_UNVERIFIED',
          photo_url: null,
          idempotency_key: 'rpc-malformed-1',
        },
        checkTransition: (currentState, eventType) => ({
          allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
        }),
      });
      expect(malformedRes.kind).toBe('ERROR');

      const revokedStore = createSupabaseServiceRoleOperationalStore(
        buildInMemorySupabaseClient({ membershipRevoked: true })
      );
      const revokedRes = await revokedStore.recordAttendanceWithStateTransition({
        row: {
          id: crypto.randomUUID(),
          tenant_id: TENANT_ALPHA_ID,
          personnel_id: PERSONNEL_ALPHA_ID,
          facility_id: FACILITY_ALPHA_ID,
          type: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          latitude: -6.2088,
          longitude: 106.8456,
          geofence_verified: true,
          biometric_mode: 'NONE_UNVERIFIED',
          photo_url: null,
          idempotency_key: 'rpc-revoked-1',
        },
        checkTransition: (currentState, eventType) => ({
          allowed: ALLOWED_TRANSITIONS[currentState]?.includes(eventType) ?? false,
        }),
      });
      expect(revokedRes).toEqual({ kind: 'AUTHORITY_REVOKED', errorCode: 'MEMBERSHIP_REVOKED' });
    });

    it('verifies createSupabaseServiceRoleOperationalStore RPC contract end-to-end against mocked SupabaseClient', async () => {
      const sessionMod = require('@/workforce-web/lib/auth/session');
      jest.spyOn(sessionMod, 'getAuthenticatedWorkforceSession').mockResolvedValue({
        session: {
          userId: USER_ALPHA_ID,
          tenantId: TENANT_ALPHA_ID,
          tenantSlug: 'alpha-sec',
          role: 'field_personnel',
          nik: 'NIK-ALPHA-01',
          name: 'Officer Alpha',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          nonce: 'sbnonce',
        },
      });

      const store = createSupabaseServiceRoleOperationalStore(buildInMemorySupabaseClient());
      expect(store.adapterKind).toBe('SUPABASE_SERVICE_ROLE');

      const clockInReq = makeAuthedRequest(
        'https://workforce.boontrack.com/api/attendance',
        { type: 'CLOCK_IN', facility_id: FACILITY_ALPHA_ID, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
        { 'Idempotency-Key': 'sb-contract-k1' }
      );
      const clockInRes = await processAttendanceSubmission(clockInReq, { store });
      expect(clockInRes.status).toBe(201);
      const clockInBody = await clockInRes.json();
      expect(clockInBody.verification.store_adapter).toBe('SUPABASE_SERVICE_ROLE');

      const dupReq = makeAuthedRequest(
        'https://workforce.boontrack.com/api/attendance',
        { type: 'CLOCK_IN', facility_id: FACILITY_ALPHA_ID, latitude: -6.2088, longitude: 106.8456, accuracy_meters: 10 },
        { 'Idempotency-Key': 'sb-contract-k2' }
      );
      const dupRes = await processAttendanceSubmission(dupReq, { store });
      expect(dupRes.status).toBe(409);
      expect((await dupRes.json()).error).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('3. Full Corrective Controls via Store DI', () => {
    const sessionMod = require('@/workforce-web/lib/auth/session');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function spyActiveSession(userId = USER_ALPHA_ID, role: BwmRole | string = 'field_personnel') {
      jest.spyOn(sessionMod, 'getAuthenticatedWorkforceSession').mockResolvedValue({
        session: {
          userId,
          tenantId: TENANT_ALPHA_ID,
          tenantSlug: 'alpha-sec',
          role,
          nik: role === 'supervisor' ? 'NIK-SUP-01' : 'NIK-ALPHA-01',
          name: role === 'supervisor' ? 'Supervisor Alpha' : 'Officer Alpha',
          siteId: FACILITY_ALPHA_ID,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          nonce: 'testnonce',
        },
      });
    }

    it('GPS integrity: never defaults missing accuracy to 0; rejects missing accuracy_meters and refuses anti-spoof overclaim', async () => {
      // Pure geofence service never invents accuracyMeters = 0 when omitted
      const pureMissingAcc = evaluateGeofence(
        { latitude: -6.2088, longitude: 106.8456 },
        { id: 'geo', center: { latitude: -6.2088, longitude: 106.8456 }, radiusMeters: 100 }
      );
      expect(pureMissingAcc.accuracyMeters).toBeUndefined();
      expect(pureMissingAcc.accuracyProvided).toBe(false);

      const pureStrictMissingAcc = evaluateGeofence(
        { latitude: -6.2088, longitude: 106.8456 },
        { id: 'geo', center: { latitude: -6.2088, longitude: 106.8456 }, radiusMeters: 100 },
        { requireAccuracyMeters: true }
      );
      expect(pureStrictMissingAcc.isWithinBoundary).toBe(false);
      expect(pureStrictMissingAcc.accuracyAcceptable).toBe(false);

      spyActiveSession();
      const store = createFixtureStore();

      // Missing accuracy_meters rejected with 400 GPS_ACCURACY_REQUIRED on both routes
      const attMissingAcc = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
        }),
        { store }
      );
      expect(attMissingAcc.status).toBe(400);
      expect((await attMissingAcc.json()).error).toBe('GPS_ACCURACY_REQUIRED');

      const scanMissingAcc = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
          qr_token: 'SECRET-QR-ALPHA-01',
          checkpoint_id: CHECKPOINT_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
        }),
        { store }
      );
      expect(scanMissingAcc.status).toBe(400);
      expect((await scanMissingAcc.json()).error).toBe('GPS_ACCURACY_REQUIRED');

      // Valid submission exposes honest unattested client telemetry classification
      const okRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2089,
          longitude: 106.8456,
          accuracy_meters: 14,
        }),
        { store }
      );
      expect(okRes.status).toBe(201);
      const okBody = await okRes.json();
      expect(okBody.data.personnel_id).toBe(PERSONNEL_ALPHA_ID);
      expect(okBody.data.personnel_id).not.toBe(USER_ALPHA_ID);
      expect(okBody.verification.location_evidence_tier).toBe('CLIENT_REPORTED_UNATTESTED');
      expect(okBody.verification.geofence_evaluation_basis).toBe('CLIENT_REPORTED_COORDINATE_MATH_ONLY');
      expect(okBody.verification.anti_spoof_verified).toBe(false);
      expect(okBody.verification.client_reported_accuracy_m).toBe(14);
    });

    it('Attendance state machine: blocks CLOCK_OUT without CLOCK_IN (409), duplicate CLOCK_IN (409), and concurrent double CLOCK_IN', async () => {
      expect(ALLOWED_TRANSITIONS.INITIAL).toEqual(['CLOCK_IN']);
      expect(ALLOWED_TRANSITIONS.CLOCK_IN).toEqual(['BREAK_START', 'CLOCK_OUT']);
      spyActiveSession();

      // 1. CLOCK_OUT without prior CLOCK_IN must fail 409
      const storeA = createFixtureStore();
      const clockOutFirstRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_OUT',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: storeA }
      );
      expect(clockOutFirstRes.status).toBe(409);
      expect((await clockOutFirstRes.json()).error).toBe('INVALID_STATE_TRANSITION');
      expect(storeA.insertAttendanceLog).not.toHaveBeenCalled();

      // 2. Concurrent simultaneous CLOCK_IN calls must allow strictly 1 (201) and block the other (409)
      const [cRes1, cRes2] = await Promise.all([
        processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
            idempotency_key: 'conc-k1',
          }),
          { store: storeA }
        ),
        processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
            idempotency_key: 'conc-k2',
          }),
          { store: storeA }
        ),
      ]);
      const statuses = [cRes1.status, cRes2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      // 3. Sequential duplicate CLOCK_IN fails 409; CLOCK_OUT succeeds 201; duplicate CLOCK_OUT fails 409; subsequent CLOCK_IN succeeds 201
      const dupInRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          idempotency_key: 'seq-dup-in',
        }),
        { store: storeA }
      );
      expect(dupInRes.status).toBe(409);

      const clockOutRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_OUT',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          idempotency_key: 'seq-out-1',
        }),
        { store: storeA }
      );
      expect(clockOutRes.status).toBe(201);

      const dupOutRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_OUT',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          idempotency_key: 'seq-dup-out',
        }),
        { store: storeA }
      );
      expect(dupOutRes.status).toBe(409);

      const nextInRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          idempotency_key: 'seq-in-2',
        }),
        { store: storeA }
      );
      expect(nextInRes.status).toBe(201);
    });

    it('Facility assignment & canonical role boundary: aligns strictly to issued BwmRole and rejects hidden/prototype/mismatched roles (403)', async () => {
      expect(Array.from(CROSS_FACILITY_AUTHORIZED_ROLES).sort()).toEqual(['master_reseller', 'supervisor']);
      expect(AUTHORIZED_DB_MEMBERSHIP_ROLE_MAP instanceof Map).toBe(true);
      expect(Array.from(AUTHORIZED_DB_MEMBERSHIP_ROLE_MAP.keys()).sort()).toEqual([
        'cs',
        'field_personnel',
        'master_reseller',
        'merchant',
        'operator',
        'owner',
        'supervisor',
      ]);

      const store = createFixtureStore();

      // 1. Field personnel trying another active facility within Tenant Alpha -> 403 FACILITY_ASSIGNMENT_FORBIDDEN
      spyActiveSession(USER_ALPHA_ID, 'field_personnel');
      const fieldCrossAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_SECOND_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(fieldCrossAtt.status).toBe(403);
      expect((await fieldCrossAtt.json()).error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');

      const fieldCrossScan = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
          checkpoint_id: CHECKPOINT_ALPHA_SECOND_ID,
          qr_token: 'SECRET-QR-ALPHA-02',
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(fieldCrossScan.status).toBe(403);
      expect((await fieldCrossScan.json()).error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');
      expect(store.insertAttendanceLog).not.toHaveBeenCalled();
      expect(store.insertCheckpointScan).not.toHaveBeenCalled();

      // 2. Authorized supervisor operates across FACILITY_ALPHA_SECOND_ID -> 201 CROSS_FACILITY_AUTHORIZED
      spyActiveSession(USER_SUPERVISOR_ID, 'supervisor');
      const supAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_SECOND_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(supAtt.status).toBe(201);
      expect((await supAtt.json()).verification.facility_scope).toBe('CROSS_FACILITY_AUTHORIZED');

      const supScan = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
          checkpoint_id: CHECKPOINT_ALPHA_SECOND_ID,
          qr_token: 'SECRET-QR-ALPHA-02',
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(supScan.status).toBe(201);
      expect((await supScan.json()).verification.facility_scope).toBe('CROSS_FACILITY_AUTHORIZED');

      // 3. Supervisor STILL cannot access Tenant Beta's facility -> 403 CROSS_TENANT_FACILITY_FORBIDDEN
      const supBetaAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_BETA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(supBetaAtt.status).toBe(403);
      expect((await supBetaAtt.json()).error).toBe('CROSS_TENANT_FACILITY_FORBIDDEN');

      // 4. Canonical legacy DB role OWNER/MERCHANT/master_reseller with issued session role master_reseller -> 201
      for (const dbRole of ['OWNER', 'MERCHANT', 'master_reseller']) {
        const masterStore = createFixtureStore({
          getMembership: jest.fn(async () => ({
            data: {
              id: MEMBERSHIP_SUPERVISOR_ID,
              user_id: USER_SUPERVISOR_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              role: dbRole,
              is_active: true,
            },
            error: null,
          })),
        });
        spyActiveSession(USER_SUPERVISOR_ID, 'master_reseller');
        const ownerRes = await processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_SECOND_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          }),
          { store: masterStore }
        );
        expect(ownerRes.status).toBe(201);
        expect((await ownerRes.json()).verification.facility_scope).toBe('CROSS_FACILITY_AUTHORIZED');
      }

      // 5. OPERATOR/CS map strictly to field_personnel -> blocked from cross-facility even if personnel.role === 'supervisor'
      for (const dbFieldRole of ['OPERATOR', 'CS']) {
        const spoofedPersonnelRoleStore = createFixtureStore({
          getMembership: jest.fn(async () => ({
            data: {
              id: MEMBERSHIP_ALPHA_ID,
              user_id: USER_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              role: dbFieldRole,
              is_active: true,
            },
            error: null,
          })),
          getPersonnelByTenantAndUser: jest.fn(async () => ({
            data: {
              id: PERSONNEL_ALPHA_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              user_id: USER_ALPHA_ID,
              membership_id: MEMBERSHIP_ALPHA_ID,
              facility_id: FACILITY_ALPHA_ID,
              name: 'Officer Alpha',
              nik: 'NIK-ALPHA-01',
              role: 'supervisor',
              is_active: true,
            },
            error: null,
          })),
        });
        spyActiveSession(USER_ALPHA_ID, 'field_personnel');
        const opRes = await processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_SECOND_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          }),
          { store: spoofedPersonnelRoleStore }
        );
        expect(opRes.status).toBe(403);
        expect((await opRes.json()).error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');
      }

      // 6. Hidden/unissued DB roles + prototype property names ('constructor', 'toString', '__proto__') MUST fail closed
      expect(resolveAuthoritativeBwmRole('' as string)).toBeNull();
      expect(resolveAuthoritativeBwmRole({} as unknown)).toBeNull();
      for (const hiddenRole of [
        'admin',
        'branch_supervisor',
        'client_org_admin',
        'agency_superadmin',
        'super',
        'super_rogue',
        'constructor',
        'toString',
        '__proto__',
        'valueOf',
        'hasOwnProperty',
      ]) {
        expect(resolveAuthoritativeBwmRole(hiddenRole)).toBeNull();
        const hiddenRoleStore = createFixtureStore({
          getMembership: jest.fn(async () => ({
            data: {
              id: MEMBERSHIP_SUPERVISOR_ID,
              user_id: USER_SUPERVISOR_ID,
              tenant_id: TENANT_ALPHA_ID,
              tenant_slug: 'alpha-sec',
              role: hiddenRole,
              is_active: true,
            },
            error: null,
          })),
        });

        // Direct verifySessionAuthority() check via injected store
        const authCheck = await verifySessionAuthority(
          {
            userId: USER_SUPERVISOR_ID,
            tenantId: TENANT_ALPHA_ID,
            tenantSlug: 'alpha-sec',
            role: 'supervisor',
            nik: 'NIK-SUP-01',
            name: 'Supervisor Alpha',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            nonce: 'proto-check',
          },
          { store: hiddenRoleStore }
        );
        expect(authCheck).toEqual({
          authorized: false,
          error: 'UNRECOGNIZED_MEMBERSHIP_ROLE',
          status: 403,
        });

        spyActiveSession(USER_SUPERVISOR_ID, hiddenRole);
        const hiddenAtt = await processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_SECOND_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          }),
          { store: hiddenRoleStore }
        );
        expect(hiddenAtt.status).toBe(403);
        expect((await hiddenAtt.json()).error).toBe('UNRECOGNIZED_MEMBERSHIP_ROLE');
      }

      // 7. Session role vs DB membership role mismatch -> fail closed 403 ROLE_AUTHORITY_MISMATCH
      spyActiveSession(USER_ALPHA_ID, 'supervisor');
      const mismatchRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_SECOND_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store }
      );
      expect(mismatchRes.status).toBe(403);
      expect((await mismatchRes.json()).error).toBe('ROLE_AUTHORITY_MISMATCH');

      // 8. Mid-transaction RPC AUTHORITY_REVOKED & FACILITY_REJECTED propagation -> fail closed 4xx
      spyActiveSession(USER_ALPHA_ID, 'field_personnel');
      const rpcRevokedStore = createFixtureStore({
        recordAttendanceWithStateTransition: jest.fn(async () => ({
          kind: 'AUTHORITY_REVOKED' as const,
          errorCode: 'MEMBERSHIP_REVOKED' as const,
        })),
      });
      const revokedRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: rpcRevokedStore }
      );
      expect(revokedRes.status).toBe(403);
      expect((await revokedRes.json()).error).toBe('MEMBERSHIP_REVOKED');

      const rpcFacilityRejectedCases = [
        { errorCode: 'FACILITY_INACTIVE' as const, expectedStatus: 403 },
        { errorCode: 'CROSS_TENANT_FACILITY_FORBIDDEN' as const, expectedStatus: 403 },
        { errorCode: 'FACILITY_ASSIGNMENT_FORBIDDEN' as const, expectedStatus: 403 },
        { errorCode: 'FACILITY_NOT_FOUND' as const, expectedStatus: 404 },
        { errorCode: 'FACILITY_REQUIRED' as const, expectedStatus: 400 },
      ];
      for (const tc of rpcFacilityRejectedCases) {
        const rejStore = createFixtureStore({
          recordAttendanceWithStateTransition: jest.fn(async () => ({
            kind: 'FACILITY_REJECTED' as const,
            errorCode: tc.errorCode,
          })),
        });
        const rejRes = await processAttendanceSubmission(
          makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
            type: 'CLOCK_IN',
            facility_id: FACILITY_ALPHA_ID,
            latitude: -6.2088,
            longitude: 106.8456,
            accuracy_meters: 10,
          }),
          { store: rejStore }
        );
        expect(rejRes.status).toBe(tc.expectedStatus);
        expect((await rejRes.json()).error).toBe(tc.errorCode);
      }

      // 9. getAuthenticatedWorkforceSession DI passes injected store cleanly without calling global store
      jest.restoreAllMocks();
      const diRes = await getAuthenticatedWorkforceSession(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {}),
        { store }
      );
      expect(diRes.session?.userId).toBe(USER_ALPHA_ID);
      expect(diRes.session?.role).toBe('field_personnel');
      expect(store.getTenantById).toHaveBeenCalledWith(TENANT_ALPHA_ID);
      expect(store.getMembership).toHaveBeenCalledWith(TENANT_ALPHA_ID, USER_ALPHA_ID);
    });

    it('Biometric integrity: ignores client CAMERA_PREVIEW_VERIFIED and assigns server NONE_UNVERIFIED / PHOTO_URL_UNVERIFIED', async () => {
      spyActiveSession();
      const store = createFixtureStore();

      const noPhotoRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          biometric_mode: 'CAMERA_PREVIEW_VERIFIED',
        }),
        { store }
      );
      expect(noPhotoRes.status).toBe(201);
      const noPhotoBody = await noPhotoRes.json();
      expect(noPhotoBody.data.biometric_mode).toBe('NONE_UNVERIFIED');
      expect(noPhotoBody.verification.biometric_mode).toBe('NONE_UNVERIFIED');
      expect(noPhotoBody.verification.biometric_verified).toBe(false);
      expect(noPhotoBody.verification.camera_capture_verified).toBe(false);

      const withPhotoRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_OUT',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          photo_url: 'https://vault.example.com/evidence/selfie-1.jpg',
          biometric_mode: 'CAMERA_PREVIEW_VERIFIED',
        }),
        { store }
      );
      expect(withPhotoRes.status).toBe(201);
      const withPhotoBody = await withPhotoRes.json();
      expect(withPhotoBody.data.biometric_mode).toBe('PHOTO_URL_UNVERIFIED');
      expect(withPhotoBody.verification.biometric_mode).toBe('PHOTO_URL_UNVERIFIED');
      expect(withPhotoBody.verification.biometric_verified).toBe(false);
    });

    it('Canonical idempotency: replays ONLY identical business payload (200) and rejects relevant field changes (409)', async () => {
      spyActiveSession();
      const store = createFixtureStore();

      const baseAttBody = {
        type: 'CLOCK_IN',
        facility_id: FACILITY_ALPHA_ID,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
      };
      const firstAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', baseAttBody, { 'idempotency-key': 'att-canon-k1' }),
        { store }
      );
      expect(firstAtt.status).toBe(201);

      // Identical replay returns 200 idempotent_replay even though state is now CLOCK_IN
      const replayAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', baseAttBody, { 'idempotency-key': 'att-canon-k1' }),
        { store }
      );
      expect(replayAtt.status).toBe(200);
      expect((await replayAtt.json()).idempotent_replay).toBe(true);

      // Changing latitude, type, or photo_url with same key MUST return 409 IDEMPOTENCY_KEY_CONFLICT
      const diffCoordAtt = await processAttendanceSubmission(
        makeAuthedRequest(
          'https://workforce.boontrack.com/api/attendance',
          { ...baseAttBody, latitude: -6.2089 },
          { 'idempotency-key': 'att-canon-k1' }
        ),
        { store }
      );
      expect(diffCoordAtt.status).toBe(409);
      expect((await diffCoordAtt.json()).error).toBe('IDEMPOTENCY_KEY_CONFLICT');

      const diffPhotoAtt = await processAttendanceSubmission(
        makeAuthedRequest(
          'https://workforce.boontrack.com/api/attendance',
          { ...baseAttBody, photo_url: 'https://vault.example.com/other.jpg' },
          { 'idempotency-key': 'att-canon-k1' }
        ),
        { store }
      );
      expect(diffPhotoAtt.status).toBe(409);

      // Checkpoint scan canonical idempotency
      const baseScanBody = {
        checkpoint_id: CHECKPOINT_ALPHA_ID,
        qr_token: 'SECRET-QR-ALPHA-01',
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
      };
      const firstScan = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', baseScanBody, { 'idempotency-key': 'scan-canon-k1' }),
        { store }
      );
      expect(firstScan.status).toBe(201);

      const replayScan = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', baseScanBody, { 'idempotency-key': 'scan-canon-k1' }),
        { store }
      );
      expect(replayScan.status).toBe(200);
      expect((await replayScan.json()).idempotent_replay).toBe(true);

      const diffLatScan = await processCheckpointScanSubmission(
        makeAuthedRequest(
          'https://workforce.boontrack.com/api/checkpoints/scan',
          { ...baseScanBody, latitude: -6.2089 },
          { 'idempotency-key': 'scan-canon-k1' }
        ),
        { store }
      );
      expect(diffLatScan.status).toBe(409);
      expect((await diffLatScan.json()).error).toBe('IDEMPOTENCY_KEY_CONFLICT');
    });

    it('eliminates false-positive 201 on DB error and validates security boundaries (mock GPS, low accuracy, wrong QR, ambiguous QR, unassigned facility)', async () => {
      spyActiveSession();

      const attErrStore = createFixtureStore({
        recordAttendanceWithStateTransition: jest.fn(async () => ({
          kind: 'ERROR' as const,
          error: { code: '42P01', message: 'relation "workforce_staging.attendance_logs" does not exist' },
        })),
      });
      const attErrRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: attErrStore }
      );
      expect(attErrRes.status).toBe(500);
      expect((await attErrRes.json()).error).toBe('DB_INSERT_FAILED');

      const scanErrStore = createFixtureStore({
        insertCheckpointScan: jest.fn(async () => ({
          data: null,
          error: { code: '42P01', message: 'relation "workforce_staging.checkpoint_scans" does not exist' },
        })),
      });
      const scanErrRes = await processCheckpointScanSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
          qr_token: 'SECRET-QR-ALPHA-01',
          checkpoint_id: CHECKPOINT_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: scanErrStore }
      );
      expect(scanErrRes.status).toBe(500);
      expect((await scanErrRes.json()).error).toBe('DB_INSERT_FAILED');

      const baseStore = createFixtureStore();
      expect(
        (
          await processAttendanceSubmission(
            makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
              type: 'CLOCK_IN',
              facility_id: FACILITY_ALPHA_ID,
              latitude: -6.211,
              longitude: 106.8456,
              accuracy_meters: 10,
            }),
            { store: baseStore }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await processAttendanceSubmission(
            makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
              type: 'CLOCK_IN',
              facility_id: FACILITY_ALPHA_ID,
              latitude: -6.2088,
              longitude: 106.8456,
              accuracy_meters: 10,
              is_mock_gps: true,
            }),
            { store: baseStore }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await processAttendanceSubmission(
            makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
              type: 'CLOCK_IN',
              facility_id: FACILITY_ALPHA_ID,
              latitude: -6.2088,
              longitude: 106.8456,
              accuracy_meters: 250,
            }),
            { store: baseStore }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await processCheckpointScanSubmission(
            makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
              qr_token: 'WRONG-QR',
              checkpoint_id: CHECKPOINT_ALPHA_ID,
              latitude: -6.2088,
              longitude: 106.8456,
              accuracy_meters: 10,
            }),
            { store: baseStore }
          )
        ).status
      ).toBe(403);

      const noFacStore = createFixtureStore({
        getPersonnelByTenantAndUser: jest.fn(async () => ({
          data: {
            id: PERSONNEL_ALPHA_ID,
            tenant_id: TENANT_ALPHA_ID,
            tenant_slug: 'alpha-sec',
            user_id: USER_ALPHA_ID,
            membership_id: MEMBERSHIP_ALPHA_ID,
            facility_id: null,
            name: 'Officer Alpha',
            nik: 'NIK-ALPHA-01',
            role: 'field_personnel',
            is_active: true,
          },
          error: null,
        })),
      });
      const missingFacRes = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: noFacStore }
      );
      expect(missingFacRes.status).toBe(400);
      expect((await missingFacRes.json()).error).toBe('FACILITY_REQUIRED');

      const pickFacDenied = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
        }),
        { store: noFacStore }
      );
      expect(pickFacDenied.status).toBe(403);
      expect((await pickFacDenied.json()).error).toBe('FACILITY_ASSIGNMENT_FORBIDDEN');
    });
  });

  describe('M-1 Atomic Fallback Closure — Production Fail-Closed Matrix', () => {
    const savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      APP_ENV: process.env.APP_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };

    afterEach(() => {
      const envRecord = process.env as Record<string, string | undefined>;
      if (savedEnv.NODE_ENV === undefined) delete envRecord.NODE_ENV;
      else envRecord.NODE_ENV = savedEnv.NODE_ENV;
      if (savedEnv.APP_ENV === undefined) delete envRecord.APP_ENV;
      else envRecord.APP_ENV = savedEnv.APP_ENV;
      if (savedEnv.VERCEL_ENV === undefined) delete envRecord.VERCEL_ENV;
      else envRecord.VERCEL_ENV = savedEnv.VERCEL_ENV;
    });

    function buildScanRequest(keySuffix: string) {
      return makeAuthedRequest('https://workforce.boontrack.com/api/checkpoints/scan', {
        qr_token: 'SECRET-QR-ALPHA-01',
        checkpoint_id: CHECKPOINT_ALPHA_ID,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy_meters: 10,
        idempotency_key: `m1-guard-${keySuffix}-${Date.now()}`,
      });
    }

    it('1. MOCK_TEST_DOUBLE + NODE_ENV=test permits non-atomic fallback when recordCheckpointScanAtomic is absent', async () => {
      const envRecord = process.env as Record<string, string | undefined>;
      envRecord.NODE_ENV = 'test';
      delete envRecord.APP_ENV;
      delete envRecord.VERCEL_ENV;

      const store = createFixtureStore({ adapterKind: 'MOCK_TEST_DOUBLE' });
      delete store.recordCheckpointScanAtomic;

      expect(isStrictUnitTestRuntime()).toBe(true);
      expect(canUseNonAtomicCheckpointFallback(store)).toBe(true);

      const res = await processCheckpointScanSubmission(buildScanRequest('mock-test'), { store });
      expect(res.status).toBe(201);
      expect(store.findCheckpointScanByIdempotencyKey).toHaveBeenCalledTimes(1);
      expect(store.insertCheckpointScan).toHaveBeenCalledTimes(1);
    });

    it('2. MOCK_TEST_DOUBLE fails closed with ZERO writes when NODE_ENV=production or APP_ENV/VERCEL_ENV non-test', async () => {
      const envRecord = process.env as Record<string, string | undefined>;
      const envCases: Array<{ NODE_ENV: string; APP_ENV?: string; VERCEL_ENV?: string }> = [
        { NODE_ENV: 'production' },
        { NODE_ENV: 'development' },
        { NODE_ENV: 'test', APP_ENV: 'production' },
        { NODE_ENV: 'test', APP_ENV: 'staging' },
        { NODE_ENV: 'test', VERCEL_ENV: 'preview' },
      ];

      for (const ec of envCases) {
        envRecord.NODE_ENV = ec.NODE_ENV;
        if (ec.APP_ENV) envRecord.APP_ENV = ec.APP_ENV;
        else delete envRecord.APP_ENV;
        if (ec.VERCEL_ENV) envRecord.VERCEL_ENV = ec.VERCEL_ENV;
        else delete envRecord.VERCEL_ENV;

        const store = createFixtureStore({ adapterKind: 'MOCK_TEST_DOUBLE' });
        delete store.recordCheckpointScanAtomic;

        expect(canUseNonAtomicCheckpointFallback(store)).toBe(false);

        const res = await processCheckpointScanSubmission(buildScanRequest(`mock-${ec.NODE_ENV}`), { store });
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe('ATOMIC_CHECKPOINT_RPC_UNAVAILABLE');
        expect(body.verified).toBe(false);
        expect(store.findCheckpointScanByIdempotencyKey).not.toHaveBeenCalled();
        expect(store.insertCheckpointScan).not.toHaveBeenCalled();
      }
    });

    it('3. SUPABASE_SERVICE_ROLE executes recordCheckpointScanAtomic directly without touching non-atomic fallback', async () => {
      const atomicSpy = jest.fn(async ({ row }: { row: CheckpointScanRow }) => ({
        kind: 'CREATED' as const,
        row: { ...row, status: 'VERIFIED' },
        distanceM: 0,
        radiusM: 200,
      }));
      const store = createFixtureStore({
        adapterKind: 'SUPABASE_SERVICE_ROLE',
        recordCheckpointScanAtomic: atomicSpy,
      });

      const res = await processCheckpointScanSubmission(buildScanRequest('prod-atomic'), { store });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(atomicSpy).toHaveBeenCalledTimes(1);
      expect(store.findCheckpointScanByIdempotencyKey).not.toHaveBeenCalled();
      expect(store.insertCheckpointScan).not.toHaveBeenCalled();
    });

    it('4. SUPABASE_SERVICE_ROLE with missing recordCheckpointScanAtomic fails closed (500, ZERO writes) even in NODE_ENV=test', async () => {
      const envRecord = process.env as Record<string, string | undefined>;
      envRecord.NODE_ENV = 'test';

      const store = createFixtureStore({ adapterKind: 'SUPABASE_SERVICE_ROLE' });
      delete store.recordCheckpointScanAtomic;

      expect(canUseNonAtomicCheckpointFallback(store)).toBe(false);

      const res = await processCheckpointScanSubmission(buildScanRequest('prod-missing'), { store });
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toBe('ATOMIC_CHECKPOINT_RPC_UNAVAILABLE');
      expect(body.verified).toBe(false);
      expect(store.findCheckpointScanByIdempotencyKey).not.toHaveBeenCalled();
      expect(store.insertCheckpointScan).not.toHaveBeenCalled();
    });

    it('5. Unknown adapterKind & DISPOSABLE_PG_SUPERUSER_TEST fail closed with ZERO writes when atomic methods are absent', async () => {
      const envRecord = process.env as Record<string, string | undefined>;
      envRecord.NODE_ENV = 'test';

      const unknownStore = createFixtureStore({
        adapterKind: 'UNKNOWN_ADAPTER_KIND' as unknown as WorkforceOperationalStore['adapterKind'],
      });
      delete unknownStore.recordCheckpointScanAtomic;

      expect(canUseNonAtomicCheckpointFallback(unknownStore)).toBe(false);
      const resUnknown = await processCheckpointScanSubmission(buildScanRequest('unknown'), { store: unknownStore });
      expect(resUnknown.status).toBe(500);
      expect((await resUnknown.json()).error).toBe('ATOMIC_CHECKPOINT_RPC_UNAVAILABLE');
      expect(unknownStore.insertCheckpointScan).not.toHaveBeenCalled();

      const pgStore = createFixtureStore({ adapterKind: 'DISPOSABLE_PG_SUPERUSER_TEST' });
      delete pgStore.recordCheckpointScanAtomic;
      expect(canUseNonAtomicCheckpointFallback(pgStore)).toBe(false);
      const resPg = await processCheckpointScanSubmission(buildScanRequest('pg-missing'), { store: pgStore });
      expect(resPg.status).toBe(500);
      expect((await resPg.json()).error).toBe('ATOMIC_CHECKPOINT_RPC_UNAVAILABLE');
      expect(pgStore.insertCheckpointScan).not.toHaveBeenCalled();

      const brokenAttendanceStore = createFixtureStore({ adapterKind: 'SUPABASE_SERVICE_ROLE' });
      delete (brokenAttendanceStore as unknown as Record<string, unknown>).recordAttendanceWithStateTransition;
      const resAtt = await processAttendanceSubmission(
        makeAuthedRequest('https://workforce.boontrack.com/api/attendance', {
          type: 'CLOCK_IN',
          facility_id: FACILITY_ALPHA_ID,
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy_meters: 10,
          idempotency_key: `m1-att-missing-${Date.now()}`,
        }),
        { store: brokenAttendanceStore }
      );
      expect(resAtt.status).toBe(500);
      expect((await resAtt.json()).error).toBe('ATOMIC_ATTENDANCE_RPC_UNAVAILABLE');
      expect(brokenAttendanceStore.insertAttendanceLog).not.toHaveBeenCalled();
    });
  });
});
