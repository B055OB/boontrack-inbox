/**
 * workforce-web/lib/workforce/operational-store.ts
 * Authoritative Production / Staging Operational Store Adapter (Supabase service_role).
 *
 * Strictly separates production/staging Supabase PostgREST (`service_role`) persistence
 * from the disposable test-only direct-pg superuser adapter (`./disposable-pg-test-store.ts`).
 *
 * DISTRIBUTED CONCURRENCY ARCHITECTURE (R3):
 * Attendance state transitions + persistence execute atomically inside PostgreSQL via the
 * `workforce_staging.record_attendance_atomic` SQL RPC (Migration 013), which acquires a
 * transactional row lock (`SELECT ... FOR UPDATE` on `workforce_staging.personnel`), checks
 * idempotency (`uq_attendance_tenant_idempotency`), validates latest event transitions, and
 * inserts inside one ACID transaction boundary across all workers/processes.
 * No in-process JavaScript mutex is used or claimed as a distributed lock.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttendanceEventType } from '@/packages/attendance';

export type OperationalStoreAdapterKind =
  | 'SUPABASE_SERVICE_ROLE'
  | 'DISPOSABLE_PG_SUPERUSER_TEST'
  | 'MOCK_TEST_DOUBLE';

export interface StoreError {
  code?: string;
  message: string;
}

export interface StoreResult<T> {
  data: T | null;
  error: StoreError | null;
}

export interface TenantAuthorityRecord {
  id: string;
  slug: string;
  name?: string;
  tier?: string;
  status?: string | null;
  is_active?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface MembershipAuthorityRecord {
  id: string;
  user_id: string;
  tenant_id: string;
  tenant_slug: string;
  role: string;
  is_active: boolean;
}

export interface PersonnelRecord {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  user_id: string;
  membership_id: string | null;
  facility_id: string | null;
  name: string;
  nik: string;
  role: string;
  is_active: boolean;
}

export interface FacilityRecord {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  is_active: boolean;
}

export interface CheckpointRecord {
  id: string;
  tenant_id: string;
  facility_id: string;
  name: string;
  code: string;
  zone: string;
  latitude: number;
  longitude: number;
  qr_token: string;
  sla_minutes: number;
  is_active: boolean;
}

export interface AttendanceLogRow {
  id: string;
  tenant_id: string;
  personnel_id: string;
  facility_id: string | null;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  timestamp: string;
  latitude: number;
  longitude: number;
  geofence_verified: boolean;
  biometric_mode: string;
  photo_url: string | null;
  idempotency_key: string;
  state_seq?: number;
  created_at?: string;
}

export interface CheckpointScanRow {
  id: string;
  tenant_id: string;
  checkpoint_id: string;
  personnel_id: string;
  scanned_at: string;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  status: string;
  idempotency_key: string;
  created_at?: string;
}

export type AttendanceTransitionCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type AtomicFacilityRejectionCode =
  | 'FACILITY_REQUIRED'
  | 'FACILITY_NOT_FOUND'
  | 'CROSS_TENANT_FACILITY_FORBIDDEN'
  | 'FACILITY_INACTIVE'
  | 'FACILITY_ASSIGNMENT_FORBIDDEN';

export type AtomicAuthorityRevokedCode =
  | 'TENANT_INACTIVE'
  | 'MEMBERSHIP_REVOKED'
  | 'PERSONNEL_INACTIVE'
  | 'UNRECOGNIZED_MEMBERSHIP_ROLE';

export type AtomicCheckpointRejectCode =
  | 'CHECKPOINT_NOT_FOUND'
  | 'CROSS_TENANT_CHECKPOINT_FORBIDDEN'
  | 'CHECKPOINT_INACTIVE'
  | 'QR_TOKEN_MISMATCH'
  | 'CROSS_TENANT_FACILITY_FORBIDDEN'
  | 'FACILITY_INACTIVE'
  | 'FACILITY_ASSIGNMENT_FORBIDDEN'
  | 'INVALID_GEOFENCE_CONFIGURATION'
  | 'GEOFENCE_VIOLATION';

export type AtomicCheckpointScanWriteResult =
  | {
      kind: 'CREATED';
      row: CheckpointScanRow;
      distanceM?: number;
      radiusM?: number;
    }
  | {
      kind: 'IDEMPOTENCY_EXISTING';
      row: CheckpointScanRow;
      distanceM?: number;
      radiusM?: number;
    }
  | {
      kind: 'PERSONNEL_NOT_PROVISIONED';
    }
  | {
      kind: 'AUTHORITY_REVOKED';
      errorCode: AtomicAuthorityRevokedCode;
    }
  | {
      kind: 'CHECKPOINT_REJECTED';
      errorCode: AtomicCheckpointRejectCode;
      distanceM?: number;
      radiusM?: number;
    }
  | {
      kind: 'ERROR';
      error: StoreError;
    };

export type AtomicAttendanceWriteResult =
  | {
      kind: 'CREATED';
      row: AttendanceLogRow;
      previousState: AttendanceEventType | 'INITIAL';
      stateSeq?: number;
    }
  | {
      kind: 'IDEMPOTENCY_EXISTING';
      row: AttendanceLogRow;
    }
  | {
      kind: 'INVALID_STATE_TRANSITION';
      currentState: AttendanceEventType | 'INITIAL';
      attemptedType: 'CLOCK_IN' | 'CLOCK_OUT';
      reason: string;
    }
  | {
      kind: 'PERSONNEL_NOT_PROVISIONED';
    }
  | {
      kind: 'AUTHORITY_REVOKED';
      errorCode: AtomicAuthorityRevokedCode;
    }
  | {
      kind: 'FACILITY_REJECTED';
      errorCode: AtomicFacilityRejectionCode;
    }
  | {
      kind: 'ERROR';
      error: StoreError;
    };

export interface WorkforceOperationalStore {
  readonly adapterKind: OperationalStoreAdapterKind;
  getTenantById(tenantId: string): Promise<StoreResult<TenantAuthorityRecord>>;
  getMembership(tenantId: string, userId: string): Promise<StoreResult<MembershipAuthorityRecord>>;
  getPersonnelByTenantAndUser(tenantId: string, userId: string): Promise<StoreResult<PersonnelRecord>>;
  getFacilityById(facilityId: string): Promise<StoreResult<FacilityRecord>>;
  getCheckpointById(checkpointId: string): Promise<StoreResult<CheckpointRecord>>;
  getCheckpointByTenantAndCode(tenantId: string, code: string): Promise<StoreResult<CheckpointRecord>>;
  getCheckpointsByTenantAndQrToken(tenantId: string, qrToken: string): Promise<StoreResult<CheckpointRecord[]>>;
  getLatestAttendanceByPersonnel(
    tenantId: string,
    personnelId: string
  ): Promise<StoreResult<AttendanceLogRow>>;
  recordAttendanceWithStateTransition(params: {
    row: AttendanceLogRow;
    expectedUserId?: string;
    checkTransition: (
      currentState: AttendanceEventType | 'INITIAL',
      attemptedType: 'CLOCK_IN' | 'CLOCK_OUT'
    ) => AttendanceTransitionCheckResult;
  }): Promise<AtomicAttendanceWriteResult>;
  insertAttendanceLog(row: AttendanceLogRow): Promise<StoreResult<AttendanceLogRow>>;
  findAttendanceByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<StoreResult<AttendanceLogRow>>;
  insertCheckpointScan(row: CheckpointScanRow): Promise<StoreResult<CheckpointScanRow>>;
  findCheckpointScanByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<StoreResult<CheckpointScanRow>>;
  recordCheckpointScanAtomic?(params: {
    row: CheckpointScanRow;
    qrToken: string;
    expectedUserId?: string;
  }): Promise<AtomicCheckpointScanWriteResult>;
}

export function assertServerContext(): void {
  if (typeof window !== 'undefined') {
    throw new Error('[WORKFORCE STORE FATAL] Operational store cannot be invoked in browser context.');
  }
}

export function isDisposablePgTestMode(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    process.env.WORKFORCE_USE_DISPOSABLE_PG === 'true' &&
    process.env.VERCEL_ENV !== 'production' &&
    process.env.APP_ENV !== 'staging'
  );
}

export function mapFacilityRow(row: Record<string, unknown>): FacilityRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    tenant_slug: String(row.tenant_slug),
    name: String(row.name),
    code: String(row.code),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    geofence_radius_m: Number(row.geofence_radius_m),
    is_active: Boolean(row.is_active),
  };
}

export function mapCheckpointRow(row: Record<string, unknown>): CheckpointRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    facility_id: String(row.facility_id),
    name: String(row.name),
    code: String(row.code),
    zone: String(row.zone),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    qr_token: String(row.qr_token),
    sla_minutes: Number(row.sla_minutes),
    is_active: Boolean(row.is_active),
  };
}

export function mapAttendanceRow(row: Record<string, unknown>): AttendanceLogRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    personnel_id: String(row.personnel_id),
    facility_id: row.facility_id ? String(row.facility_id) : null,
    type: row.type === 'CLOCK_OUT' ? 'CLOCK_OUT' : 'CLOCK_IN',
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    geofence_verified: Boolean(row.geofence_verified),
    biometric_mode: String(row.biometric_mode),
    photo_url: row.photo_url ? String(row.photo_url) : null,
    idempotency_key: String(row.idempotency_key),
    state_seq: row.state_seq !== undefined && row.state_seq !== null ? Number(row.state_seq) : undefined,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : undefined,
  };
}

export function mapCheckpointScanRow(row: Record<string, unknown>): CheckpointScanRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    checkpoint_id: String(row.checkpoint_id),
    personnel_id: String(row.personnel_id),
    scanned_at: row.scanned_at instanceof Date ? row.scanned_at.toISOString() : String(row.scanned_at),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_m: row.distance_m !== null && row.distance_m !== undefined ? Number(row.distance_m) : null,
    status: String(row.status),
    idempotency_key: String(row.idempotency_key),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : undefined,
  };
}

export function normalizeStoreError(err: unknown): StoreError {
  const errObj = err as { code?: unknown; message?: unknown } | null | undefined;
  return {
    code: typeof errObj?.code === 'string' ? errObj.code : undefined,
    message: typeof errObj?.message === 'string' ? errObj.message : 'Database operation failed',
  };
}

export function parseAtomicAttendanceRpcResult(
  payload: unknown,
  attemptedType: 'CLOCK_IN' | 'CLOCK_OUT'
): AtomicAttendanceWriteResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      kind: 'ERROR',
      error: { message: 'Malformed or empty response from record_attendance_atomic RPC.' },
    };
  }

  const resObj = payload as Record<string, unknown>;
  const outcome = typeof resObj.outcome === 'string' ? resObj.outcome : '';

  if (outcome === 'CREATED') {
    if (!resObj.row || typeof resObj.row !== 'object' || Array.isArray(resObj.row)) {
      return {
        kind: 'ERROR',
        error: { message: 'Persisted attendance row was missing from record_attendance_atomic response.' },
      };
    }
    const prevRaw = resObj.previous_state;
    const previousState: AttendanceEventType | 'INITIAL' =
      prevRaw === 'CLOCK_IN' || prevRaw === 'CLOCK_OUT' ? prevRaw : 'INITIAL';
    return {
      kind: 'CREATED',
      row: mapAttendanceRow(resObj.row as Record<string, unknown>),
      previousState,
      stateSeq: typeof resObj.state_seq === 'number' ? resObj.state_seq : undefined,
    };
  }

  if (outcome === 'IDEMPOTENCY_EXISTING') {
    if (!resObj.row || typeof resObj.row !== 'object' || Array.isArray(resObj.row)) {
      return {
        kind: 'ERROR',
        error: { message: 'Existing idempotency row was missing from record_attendance_atomic response.' },
      };
    }
    return {
      kind: 'IDEMPOTENCY_EXISTING',
      row: mapAttendanceRow(resObj.row as Record<string, unknown>),
    };
  }

  if (outcome === 'INVALID_STATE_TRANSITION') {
    const curRaw = resObj.current_state;
    const currentState: AttendanceEventType | 'INITIAL' =
      curRaw === 'CLOCK_IN' || curRaw === 'CLOCK_OUT' ? curRaw : 'INITIAL';
    return {
      kind: 'INVALID_STATE_TRANSITION',
      currentState,
      attemptedType,
      reason:
        typeof resObj.reason === 'string' && resObj.reason
          ? resObj.reason
          : `Transisi status tidak valid: '${currentState}' -> '${attemptedType}'.`,
    };
  }

  if (outcome === 'PERSONNEL_NOT_PROVISIONED') {
    return { kind: 'PERSONNEL_NOT_PROVISIONED' };
  }

  if (
    outcome === 'TENANT_INACTIVE' ||
    outcome === 'MEMBERSHIP_REVOKED' ||
    outcome === 'PERSONNEL_INACTIVE' ||
    outcome === 'UNRECOGNIZED_MEMBERSHIP_ROLE'
  ) {
    return { kind: 'AUTHORITY_REVOKED', errorCode: outcome };
  }

  if (
    outcome === 'FACILITY_REQUIRED' ||
    outcome === 'FACILITY_NOT_FOUND' ||
    outcome === 'CROSS_TENANT_FACILITY_FORBIDDEN' ||
    outcome === 'FACILITY_INACTIVE' ||
    outcome === 'FACILITY_ASSIGNMENT_FORBIDDEN'
  ) {
    return { kind: 'FACILITY_REJECTED', errorCode: outcome };
  }

  return {
    kind: 'ERROR',
    error: { message: `Unexpected outcome '${outcome || 'UNKNOWN'}' from record_attendance_atomic RPC.` },
  };
}

export function parseAtomicCheckpointScanRpcResult(payload: unknown): AtomicCheckpointScanWriteResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      kind: 'ERROR',
      error: { message: 'Malformed or empty response from record_checkpoint_scan_atomic RPC.' },
    };
  }

  const resObj = payload as Record<string, unknown>;
  const outcome = typeof resObj.outcome === 'string' ? resObj.outcome : '';
  const distanceM =
    resObj.distance_m !== undefined && resObj.distance_m !== null && Number.isFinite(Number(resObj.distance_m))
      ? Number(resObj.distance_m)
      : undefined;
  const radiusM =
    resObj.radius_m !== undefined && resObj.radius_m !== null && Number.isFinite(Number(resObj.radius_m))
      ? Number(resObj.radius_m)
      : undefined;

  if (outcome === 'CREATED') {
    if (!resObj.row || typeof resObj.row !== 'object' || Array.isArray(resObj.row)) {
      return {
        kind: 'ERROR',
        error: { message: 'Persisted checkpoint scan row was missing from record_checkpoint_scan_atomic response.' },
      };
    }
    return {
      kind: 'CREATED',
      row: mapCheckpointScanRow(resObj.row as Record<string, unknown>),
      distanceM,
      radiusM,
    };
  }

  if (outcome === 'IDEMPOTENCY_EXISTING') {
    if (!resObj.row || typeof resObj.row !== 'object' || Array.isArray(resObj.row)) {
      return {
        kind: 'ERROR',
        error: { message: 'Existing idempotency row was missing from record_checkpoint_scan_atomic response.' },
      };
    }
    return {
      kind: 'IDEMPOTENCY_EXISTING',
      row: mapCheckpointScanRow(resObj.row as Record<string, unknown>),
      distanceM,
      radiusM,
    };
  }

  if (outcome === 'PERSONNEL_NOT_PROVISIONED') {
    return { kind: 'PERSONNEL_NOT_PROVISIONED' };
  }

  if (
    outcome === 'TENANT_INACTIVE' ||
    outcome === 'MEMBERSHIP_REVOKED' ||
    outcome === 'PERSONNEL_INACTIVE' ||
    outcome === 'UNRECOGNIZED_MEMBERSHIP_ROLE'
  ) {
    return { kind: 'AUTHORITY_REVOKED', errorCode: outcome };
  }

  if (
    outcome === 'CHECKPOINT_NOT_FOUND' ||
    outcome === 'CROSS_TENANT_CHECKPOINT_FORBIDDEN' ||
    outcome === 'CHECKPOINT_INACTIVE' ||
    outcome === 'QR_TOKEN_MISMATCH' ||
    outcome === 'CROSS_TENANT_FACILITY_FORBIDDEN' ||
    outcome === 'FACILITY_INACTIVE' ||
    outcome === 'FACILITY_ASSIGNMENT_FORBIDDEN' ||
    outcome === 'INVALID_GEOFENCE_CONFIGURATION' ||
    outcome === 'GEOFENCE_VIOLATION'
  ) {
    return {
      kind: 'CHECKPOINT_REJECTED',
      errorCode: outcome,
      distanceM,
      radiusM,
    };
  }

  return {
    kind: 'ERROR',
    error: { message: `Unexpected outcome '${outcome || 'UNKNOWN'}' from record_checkpoint_scan_atomic RPC.` },
  };
}

/**
 * Production / Staging Operational Store backed strictly by Supabase Service Role client.
 */
export function createSupabaseServiceRoleOperationalStore(supabaseAdmin: SupabaseClient): WorkforceOperationalStore {
  assertServerContext();

  const store: WorkforceOperationalStore = {
    adapterKind: 'SUPABASE_SERVICE_ROLE',

    async getTenantById(tenantId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('tenants')
        .select('id, slug, name, tier, status, is_active, metadata')
        .eq('id', tenantId)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: (data as TenantAuthorityRecord) || null, error: null };
    },

    async getMembership(tenantId, userId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('tenant_memberships')
        .select('id, user_id, tenant_id, tenant_slug, role, is_active')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: (data as MembershipAuthorityRecord) || null, error: null };
    },

    async getPersonnelByTenantAndUser(tenantId, userId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('personnel')
        .select('id, tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: (data as PersonnelRecord) || null, error: null };
    },

    async getFacilityById(facilityId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('facilities')
        .select('id, tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active')
        .eq('id', facilityId)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapFacilityRow(data) : null, error: null };
    },

    async getCheckpointById(checkpointId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('checkpoints')
        .select('id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active')
        .eq('id', checkpointId)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapCheckpointRow(data) : null, error: null };
    },

    async getCheckpointByTenantAndCode(tenantId, code) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('checkpoints')
        .select('id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active')
        .eq('tenant_id', tenantId)
        .eq('code', code)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapCheckpointRow(data) : null, error: null };
    },

    async getCheckpointsByTenantAndQrToken(tenantId, qrToken) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('checkpoints')
        .select('id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active')
        .eq('tenant_id', tenantId)
        .eq('qr_token', qrToken)
        .limit(2);
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: Array.isArray(data) ? data.map(mapCheckpointRow) : [], error: null };
    },

    async getLatestAttendanceByPersonnel(tenantId, personnelId) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('attendance_logs')
        .select(
          'id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key, created_at'
        )
        .eq('tenant_id', tenantId)
        .eq('personnel_id', personnelId)
        .order('created_at', { ascending: false })
        .order('timestamp', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapAttendanceRow(data) : null, error: null };
    },

    async recordAttendanceWithStateTransition({ row, expectedUserId }) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .rpc('record_attendance_atomic', {
          p_id: row.id,
          p_tenant_id: row.tenant_id,
          p_personnel_id: row.personnel_id,
          p_expected_user_id: expectedUserId ?? null,
          p_facility_id: row.facility_id,
          p_type: row.type,
          p_timestamp: row.timestamp,
          p_latitude: row.latitude,
          p_longitude: row.longitude,
          p_geofence_verified: row.geofence_verified,
          p_biometric_mode: row.biometric_mode,
          p_photo_url: row.photo_url,
          p_idempotency_key: row.idempotency_key,
        });

      if (error) {
        return { kind: 'ERROR', error: normalizeStoreError(error) };
      }

      return parseAtomicAttendanceRpcResult(data, row.type);
    },

    async insertAttendanceLog(row) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('attendance_logs')
        .insert(row)
        .select(
          'id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key, created_at'
        )
        .single();
      if (error) return { data: null, error: normalizeStoreError(error) };
      if (!data) return { data: null, error: { message: 'Persisted attendance row was not returned by database.' } };
      return { data: mapAttendanceRow(data), error: null };
    },

    async findAttendanceByIdempotencyKey(tenantId, idempotencyKey) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('attendance_logs')
        .select(
          'id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key, created_at'
        )
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapAttendanceRow(data) : null, error: null };
    },

    async insertCheckpointScan(row) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('checkpoint_scans')
        .insert(row)
        .select(
          'id, tenant_id, checkpoint_id, personnel_id, scanned_at, latitude, longitude, distance_m, status, idempotency_key, created_at'
        )
        .single();
      if (error) return { data: null, error: normalizeStoreError(error) };
      if (!data) return { data: null, error: { message: 'Persisted checkpoint scan row was not returned by database.' } };
      return { data: mapCheckpointScanRow(data), error: null };
    },

    async findCheckpointScanByIdempotencyKey(tenantId, idempotencyKey) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .from('checkpoint_scans')
        .select(
          'id, tenant_id, checkpoint_id, personnel_id, scanned_at, latitude, longitude, distance_m, status, idempotency_key, created_at'
        )
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) return { data: null, error: normalizeStoreError(error) };
      return { data: data ? mapCheckpointScanRow(data) : null, error: null };
    },

    async recordCheckpointScanAtomic({ row, qrToken, expectedUserId }) {
      const { data, error } = await supabaseAdmin
        .schema('workforce_staging')
        .rpc('record_checkpoint_scan_atomic', {
          p_id: row.id,
          p_tenant_id: row.tenant_id,
          p_personnel_id: row.personnel_id,
          p_expected_user_id: expectedUserId ?? null,
          p_checkpoint_id: row.checkpoint_id,
          p_qr_token: qrToken,
          p_scanned_at: row.scanned_at,
          p_latitude: row.latitude,
          p_longitude: row.longitude,
          p_distance_m: row.distance_m,
          p_status: row.status,
          p_idempotency_key: row.idempotency_key,
        });

      if (error) {
        return { kind: 'ERROR', error: normalizeStoreError(error) };
      }

      return parseAtomicCheckpointScanRpcResult(data);
    },
  };

  return store;
}

export const createSupabaseOperationalStore = createSupabaseServiceRoleOperationalStore;

export async function getWorkforceOperationalStore(): Promise<WorkforceOperationalStore> {
  assertServerContext();

  if (isDisposablePgTestMode()) {
    const pgMod = await import('./disposable-pg-test-store');
    return pgMod.createDisposablePgTestStore(pgMod.getDisposablePgPool());
  }

  // Lazy dynamic import prevents module-load failures when test runners set loopback PostgREST URLs
  // while strictly preserving assertExactWorkforceUrl() for runtime Supabase initialization.
  const { getSupabaseAdmin } = await import('@/workforce-web/lib/supabase');
  return createSupabaseServiceRoleOperationalStore(getSupabaseAdmin());
}
