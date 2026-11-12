/**
 * workforce-web/lib/workforce/disposable-pg-test-store.ts
 * TEST-ONLY Direct PostgreSQL (postgres superuser) Disposable CI Store Adapter.
 *
 * STRICT BOUNDARY:
 * - Isolated strictly from production Supabase service_role persistence (`operational-store.ts`).
 * - Can ONLY run when `NODE_ENV === 'test'`, `WORKFORCE_USE_DISPOSABLE_PG === 'true'`,
 *   non-staging/non-production env, and URL passes `assertDisposableLoopbackUrl()`.
 * - Delegates atomic attendance state transitions & locking to Migration 013 SQL RPC
 *   (`workforce_staging.record_attendance_atomic`) using monotonic `state_seq` and
 *   deadlock-free lock ordering (`tenants -> tenant_memberships -> facilities -> personnel`).
 */

import { Pool, type PoolClient } from 'pg';
import {
  assertServerContext,
  isDisposablePgTestMode,
  mapAttendanceRow,
  mapCheckpointRow,
  mapCheckpointScanRow,
  mapFacilityRow,
  normalizeStoreError,
  parseAtomicAttendanceRpcResult,
  parseAtomicCheckpointScanRpcResult,
  type AttendanceLogRow,
  type AtomicAttendanceWriteResult,
  type AtomicCheckpointScanWriteResult,
  type MembershipAuthorityRecord,
  type PersonnelRecord,
  type TenantAuthorityRecord,
  type WorkforceOperationalStore,
} from '@/workforce-web/lib/workforce/operational-store';

export type PgTestDatabase = Pool | PoolClient;

/**
 * Validates that a PostgreSQL connection string strictly targets the local disposable CI container.
 */
export function assertDisposableLoopbackUrl(connStr: string): string {
  if (!connStr || typeof connStr !== 'string' || !connStr.trim()) {
    throw new Error('[DISPOSABLE GUARD FATAL] Database connection string is empty or invalid.');
  }

  let parsed: URL;
  try {
    parsed = new URL(connStr.trim());
  } catch {
    throw new Error('[DISPOSABLE GUARD FATAL] Malformed database connection URL. Abort.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid protocol (${parsed.protocol}). Expected postgres: or postgresql:.`);
  }

  const hostname = parsed.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `[DISPOSABLE GUARD FATAL] Unauthorized database host (${hostname}). Only localhost or 127.0.0.1 is authorized.`
    );
  }

  if (parsed.port !== '5432') {
    throw new Error(`[DISPOSABLE GUARD FATAL] Invalid database port (${parsed.port || 'default'}). Exactly 5432 is required.`);
  }

  if (parsed.pathname !== '/test_workforce_ci') {
    throw new Error(
      `[DISPOSABLE GUARD FATAL] Invalid database name (${parsed.pathname}). Disposable CI database must strictly be /test_workforce_ci.`
    );
  }

  const username = decodeURIComponent(parsed.username);
  if (username !== 'postgres' && username !== 'authenticator') {
    throw new Error(
      `[DISPOSABLE GUARD FATAL] Unauthorized database user (${username}). Only postgres or authenticator is permitted.`
    );
  }

  if (parsed.hash) {
    throw new Error('[DISPOSABLE GUARD FATAL] URL fragment identifier detected. Fragment identifiers are strictly forbidden.');
  }

  if (parsed.search && parsed.search.length > 1) {
    throw new Error('[DISPOSABLE GUARD FATAL] Query parameters are strictly forbidden on disposable database connection.');
  }

  return connStr.trim();
}

function assertDisposableTestAdapterAllowed(): void {
  assertServerContext();
  if (!isDisposablePgTestMode()) {
    throw new Error(
      '[DISPOSABLE GUARD FATAL] createDisposablePgTestStore is restricted strictly to isolated test mode (NODE_ENV=test and WORKFORCE_USE_DISPOSABLE_PG=true).'
    );
  }
}

function isSingleClient(db: PgTestDatabase): db is PoolClient {
  return typeof (db as Pool).connect !== 'function';
}

export function createDisposablePgTestStore(db: PgTestDatabase): WorkforceOperationalStore {
  assertDisposableTestAdapterAllowed();

  const store: WorkforceOperationalStore = {
    adapterKind: 'DISPOSABLE_PG_SUPERUSER_TEST',

    async getTenantById(tenantId) {
      try {
        const res = await db.query(
          `SELECT id, slug, name, tier, status, is_active, metadata
           FROM workforce_staging.tenants
           WHERE id = $1::uuid
           LIMIT 1`,
          [tenantId]
        );
        return { data: (res.rows[0] as TenantAuthorityRecord) || null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getMembership(tenantId, userId) {
      try {
        const res = await db.query(
          `SELECT id, user_id, tenant_id, tenant_slug, role, is_active
           FROM workforce_staging.tenant_memberships
           WHERE tenant_id = $1::text AND user_id = $2::uuid
           LIMIT 1`,
          [tenantId, userId]
        );
        return { data: (res.rows[0] as MembershipAuthorityRecord) || null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getPersonnelByTenantAndUser(tenantId, userId) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, role, is_active
           FROM workforce_staging.personnel
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid
           LIMIT 1`,
          [tenantId, userId]
        );
        return { data: (res.rows[0] as PersonnelRecord) || null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getFacilityById(facilityId) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, tenant_slug, name, code, latitude, longitude, geofence_radius_m, is_active
           FROM workforce_staging.facilities
           WHERE id = $1::uuid
           LIMIT 1`,
          [facilityId]
        );
        return { data: res.rows[0] ? mapFacilityRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getCheckpointById(checkpointId) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active
           FROM workforce_staging.checkpoints
           WHERE id = $1::uuid
           LIMIT 1`,
          [checkpointId]
        );
        return { data: res.rows[0] ? mapCheckpointRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getCheckpointByTenantAndCode(tenantId, code) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active
           FROM workforce_staging.checkpoints
           WHERE tenant_id = $1::uuid AND code = $2::text
           LIMIT 1`,
          [tenantId, code]
        );
        return { data: res.rows[0] ? mapCheckpointRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getCheckpointsByTenantAndQrToken(tenantId, qrToken) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, facility_id, name, code, zone, latitude, longitude, qr_token, sla_minutes, is_active
           FROM workforce_staging.checkpoints
           WHERE tenant_id = $1::uuid AND qr_token = $2::text
           LIMIT 2`,
          [tenantId, qrToken]
        );
        return { data: res.rows.map(mapCheckpointRow), error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async getLatestAttendanceByPersonnel(tenantId, personnelId) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude,
                  geofence_verified, biometric_mode, photo_url, idempotency_key, state_seq, created_at
           FROM workforce_staging.attendance_logs
           WHERE tenant_id = $1::uuid AND personnel_id = $2::uuid
           ORDER BY state_seq DESC, created_at DESC, id DESC
           LIMIT 1`,
          [tenantId, personnelId]
        );
        return { data: res.rows[0] ? mapAttendanceRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async recordAttendanceWithStateTransition({ row, expectedUserId }): Promise<AtomicAttendanceWriteResult> {
      try {
        // Invokes the identical database atomic RPC (Migration 015: SELECT ... FOR UPDATE on personnel + actor binding + state validation)
        const queryTarget = isSingleClient(db) ? db : db;
        const rpcRes = await queryTarget.query(
          `SELECT workforce_staging.record_attendance_atomic(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text, $7::timestamptz,
             $8::numeric, $9::numeric, $10::boolean, $11::text, $12::text, $13::text
           ) AS result`,
          [
            row.id,
            row.tenant_id,
            row.personnel_id,
            expectedUserId ?? null,
            row.facility_id,
            row.type,
            row.timestamp,
            row.latitude,
            row.longitude,
            row.geofence_verified,
            row.biometric_mode,
            row.photo_url,
            row.idempotency_key,
          ]
        );
        return parseAtomicAttendanceRpcResult(rpcRes.rows[0]?.result, row.type);
      } catch (err) {
        return { kind: 'ERROR', error: normalizeStoreError(err) };
      }
    },

    async insertAttendanceLog(row: AttendanceLogRow) {
      try {
        const res = await db.query(
          `INSERT INTO workforce_staging.attendance_logs (
             id, tenant_id, personnel_id, facility_id, type, timestamp,
             latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key
           )
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::timestamptz, $7::numeric, $8::numeric, $9::boolean, $10::text, $11::text, $12::text)
           RETURNING id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key, created_at`,
          [
            row.id,
            row.tenant_id,
            row.personnel_id,
            row.facility_id,
            row.type,
            row.timestamp,
            row.latitude,
            row.longitude,
            row.geofence_verified,
            row.biometric_mode,
            row.photo_url,
            row.idempotency_key,
          ]
        );
        if (!res.rows[0]) {
          return { data: null, error: { message: 'Persisted attendance row was not returned by PostgreSQL.' } };
        }
        return { data: mapAttendanceRow(res.rows[0]), error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async findAttendanceByIdempotencyKey(tenantId, idempotencyKey) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, personnel_id, facility_id, type, timestamp, latitude, longitude, geofence_verified, biometric_mode, photo_url, idempotency_key, created_at
           FROM workforce_staging.attendance_logs
           WHERE tenant_id = $1::uuid AND idempotency_key = $2::text
           LIMIT 1`,
          [tenantId, idempotencyKey]
        );
        return { data: res.rows[0] ? mapAttendanceRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async insertCheckpointScan(row) {
      try {
        const res = await db.query(
          `INSERT INTO workforce_staging.checkpoint_scans (
             id, tenant_id, checkpoint_id, personnel_id, scanned_at,
             latitude, longitude, distance_m, status, idempotency_key
           )
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::numeric, $7::numeric, $8::numeric, $9::text, $10::text)
           RETURNING id, tenant_id, checkpoint_id, personnel_id, scanned_at, latitude, longitude, distance_m, status, idempotency_key, created_at`,
          [
            row.id,
            row.tenant_id,
            row.checkpoint_id,
            row.personnel_id,
            row.scanned_at,
            row.latitude,
            row.longitude,
            row.distance_m,
            row.status,
            row.idempotency_key,
          ]
        );
        if (!res.rows[0]) {
          return { data: null, error: { message: 'Persisted checkpoint scan row was not returned by PostgreSQL.' } };
        }
        return { data: mapCheckpointScanRow(res.rows[0]), error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async findCheckpointScanByIdempotencyKey(tenantId, idempotencyKey) {
      try {
        const res = await db.query(
          `SELECT id, tenant_id, checkpoint_id, personnel_id, scanned_at, latitude, longitude, distance_m, status, idempotency_key, created_at
           FROM workforce_staging.checkpoint_scans
           WHERE tenant_id = $1::uuid AND idempotency_key = $2::text
           LIMIT 1`,
          [tenantId, idempotencyKey]
        );
        return { data: res.rows[0] ? mapCheckpointScanRow(res.rows[0]) : null, error: null };
      } catch (err) {
        return { data: null, error: normalizeStoreError(err) };
      }
    },

    async recordCheckpointScanAtomic({ row, qrToken, expectedUserId }): Promise<AtomicCheckpointScanWriteResult> {
      try {
        // Invokes the identical database atomic RPC (Migration 014: topological lock hierarchy 1 -> 2 -> 3 -> 3.5 -> 4 + actor binding + fresh geofence & authority validation)
        const queryTarget = isSingleClient(db) ? db : db;
        const rpcRes = await queryTarget.query(
          `SELECT workforce_staging.record_checkpoint_scan_atomic(
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text, $7::timestamptz,
             $8::numeric, $9::numeric, $10::numeric, $11::text, $12::text
           ) AS result`,
          [
            row.id,
            row.tenant_id,
            row.personnel_id,
            expectedUserId ?? null,
            row.checkpoint_id,
            qrToken,
            row.scanned_at,
            row.latitude,
            row.longitude,
            row.distance_m,
            row.status,
            row.idempotency_key,
          ]
        );
        return parseAtomicCheckpointScanRpcResult(rpcRes.rows[0]?.result);
      } catch (err) {
        return { kind: 'ERROR', error: normalizeStoreError(err) };
      }
    },
  };

  return store;
}

let cachedDisposablePool: Pool | null = null;
let cachedDisposableConnStr: string | null = null;

export function getDisposablePgPool(): Pool {
  assertDisposableTestAdapterAllowed();
  const rawConnStr = process.env.DISPOSABLE_POSTGRES_URL || process.env.WORKFORCE_DATABASE_DIRECT_URL || '';
  const safeConnStr = assertDisposableLoopbackUrl(rawConnStr);

  if (!cachedDisposablePool || cachedDisposableConnStr !== safeConnStr) {
    cachedDisposableConnStr = safeConnStr;
    cachedDisposablePool = new Pool({ connectionString: safeConnStr, max: 10 });
  }
  return cachedDisposablePool;
}

export async function closeDisposablePgPool(): Promise<void> {
  if (cachedDisposablePool) {
    const pool = cachedDisposablePool;
    cachedDisposablePool = null;
    cachedDisposableConnStr = null;
    await pool.end().catch(() => {});
  }
}
