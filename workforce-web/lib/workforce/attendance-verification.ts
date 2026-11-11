/**
 * workforce-web/lib/workforce/attendance-verification.ts
 * Authoritative Server-Side Verification & Execution Pipeline for Attendance and Checkpoint Scans.
 *
 * Security & Integrity Guarantees:
 * 1. Canonical Principal Mapping: verified session.userId -> active tenant_memberships -> active personnel.id.
 * 2. Multi-Site Facility Assignment Enforcement: field personnel bound to personnel.facility_id cannot
 *    switch facilities within the same tenant; only explicitly authorized cross-facility roles may operate across sites.
 * 3. Attendance State Machine Integration: executes processAttendanceEvent() & ALLOWED_TRANSITIONS from
 *    @/packages/attendance under concurrency-safe serialization / SQL row lock.
 * 4. Honest GPS Telemetry Classification: client-reported coordinates & accuracy_meters (never defaulted to 0)
 *    are validated arithmetically against server boundaries and explicitly classified as CLIENT_REPORTED_UNATTESTED
 *    (never claimed as hardware anti-spoof or physical presence proof).
 * 5. Server-Derived Biometric Mode: ignores client-supplied biometric_mode (including CAMERA_PREVIEW_VERIFIED)
 *    and sets unverified server labels (NONE_UNVERIFIED / PHOTO_URL_UNVERIFIED) with biometric_verified: false.
 * 6. Canonical Business Payload Idempotency: replays (HTTP 200) strictly when full canonical business payload matches;
 *    returns HTTP 409 IDEMPOTENCY_KEY_CONFLICT on any relevant business field mutation.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ALLOWED_TRANSITIONS,
  evaluateGeofence,
  processAttendanceEvent,
  type AttendanceEventType,
  type GeofenceEvaluation,
} from '@/packages/attendance';
import { isValidUuid } from '@/lib/uuid-guard';
import {
  getAuthenticatedWorkforceSession,
  resolveAuthoritativeBwmRole,
  type BwmRole,
  type BwmSessionPayload,
} from '@/workforce-web/lib/auth/session';
import {
  getWorkforceOperationalStore,
  type AttendanceLogRow,
  type CheckpointRecord,
  type CheckpointScanRow,
  type FacilityRecord,
  type MembershipAuthorityRecord,
  type PersonnelRecord,
  type TenantAuthorityRecord,
  type WorkforceOperationalStore,
} from '@/workforce-web/lib/workforce/operational-store';

export interface AttendancePayload {
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  facility_id?: string | null;
  personnel_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  is_mock_gps?: boolean;
  photo_url?: string | null;
  biometric_mode?: string;
  idempotency_key?: string;
}

export interface CheckpointScanPayload {
  qr_token: string;
  checkpoint_id?: string | null;
  personnel_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  is_mock_gps?: boolean;
  idempotency_key?: string;
}

export type ServerBiometricMode = 'NONE_UNVERIFIED' | 'PHOTO_URL_UNVERIFIED';
export type FacilityAccessScope = 'ASSIGNED_FACILITY' | 'CROSS_FACILITY_AUTHORIZED';

export interface CanonicalAttendancePayload {
  tenant_id: string;
  personnel_id: string;
  facility_id: string | null;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  latitude_e7: string;
  longitude_e7: string;
  biometric_mode: string;
  photo_url: string | null;
}

export interface CanonicalCheckpointScanPayload {
  tenant_id: string;
  personnel_id: string;
  checkpoint_id: string;
  latitude_e7: string;
  longitude_e7: string;
  status: string;
}

type FailureResult = {
  ok: false;
  response: NextResponse;
};

type SuccessResult<T> = { ok: true } & T;

const SUSPENDED_STATUSES = new Set(['suspended', 'inactive', 'revoked', 'disabled']);
const MAX_GPS_ACCURACY_METERS = 100;

/**
 * Authoritative runtime roles allowed to execute attendance/checkpoint operations across
 * multiple active facilities within their own tenant.
 *
 * Strictly matched to canonical roles issued by `verifySessionAuthority()`:
 * - `'supervisor'`      <- DB `tenant_memberships.role`: `'supervisor'`
 * - `'master_reseller'` <- DB `tenant_memberships.role`: `'owner' | 'merchant' | 'master_reseller'`
 *
 * Single-site role `'field_personnel'` (`'field_personnel' | 'operator' | 'cs'`) cannot
 * switch facilities. Any unissued/unrecognized role fails closed (403).
 */
export const CROSS_FACILITY_AUTHORIZED_ROLES: ReadonlySet<BwmRole> = new Set<BwmRole>([
  'supervisor',
  'master_reseller',
]);

export function isCrossFacilityAuthorizedRole(issuedOrDbRole: string): boolean {
  const resolved = resolveAuthoritativeBwmRole(issuedOrDbRole);
  return resolved !== null && CROSS_FACILITY_AUTHORIZED_ROLES.has(resolved);
}

function jsonError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      message,
      ...(extra || {}),
    },
    { status }
  );
}

function isTenantInactive(tenant: TenantAuthorityRecord): boolean {
  if (tenant.is_active === false) return true;
  if (tenant.status && SUSPENDED_STATUSES.has(String(tenant.status).trim().toLowerCase())) {
    return true;
  }
  const meta = tenant.metadata || {};
  if (meta.is_active === false || meta.suspended === true) return true;
  if (meta.status && SUSPENDED_STATUSES.has(String(meta.status).trim().toLowerCase())) {
    return true;
  }
  return false;
}

function timingSafeEqualStrings(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedDigest = crypto.createHash('sha256').update(expectedBuf).digest();
  const providedDigest = crypto.createHash('sha256').update(providedBuf).digest();
  const digestMatch = crypto.timingSafeEqual(expectedDigest, providedDigest);
  return digestMatch && expectedBuf.length === providedBuf.length;
}

/**
 * Validates client-reported GPS coordinates and accuracy_meters.
 * Never defaults omitted accuracy_meters to 0 (fails closed with 400 GPS_ACCURACY_REQUIRED).
 */
function validateGpsCoordinates(
  latitude: unknown,
  longitude: unknown,
  accuracyMeters: unknown
): SuccessResult<{ latitude: number; longitude: number; accuracyMeters: number }> | FailureResult {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      ok: false,
      response: jsonError(
        400,
        'INVALID_COORDINATES',
        'Koordinat GPS latitude (-90..90) dan longitude (-180..180) numerik yang valid diperlukan.'
      ),
    };
  }

  if (accuracyMeters === undefined || accuracyMeters === null) {
    return {
      ok: false,
      response: jsonError(
        400,
        'GPS_ACCURACY_REQUIRED',
        'Parameter client-reported accuracy_meters GPS wajib disertakan (tidak boleh di-default ke 0).'
      ),
    };
  }

  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_GPS_ACCURACY', 'Nilai client-reported accuracy_meters GPS tidak valid.'),
    };
  }

  return {
    ok: true,
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
    accuracyMeters,
  };
}

function resolveIdempotencyKey(
  req: NextRequest,
  bodyKey: unknown,
  prefix: 'att' | 'scan',
  personnelId: string
): SuccessResult<{ idempotencyKey: string }> | FailureResult {
  const headerKey = req.headers.get('idempotency-key');
  const candidate = headerKey !== null ? headerKey : bodyKey;

  if (candidate !== undefined && candidate !== null) {
    if (typeof candidate !== 'string') {
      return {
        ok: false,
        response: jsonError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key harus berupa string non-kosong (maks 128 karakter).'),
      };
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || trimmed.length > 128) {
      return {
        ok: false,
        response: jsonError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key harus berukuran 1 sampai 128 karakter.'),
      };
    }
    return { ok: true, idempotencyKey: trimmed };
  }

  return { ok: true, idempotencyKey: `${prefix}_${personnelId}_${crypto.randomUUID()}` };
}

function validateOptionalPhotoUrl(photoUrl: unknown): SuccessResult<{ photoUrl: string | null }> | FailureResult {
  if (photoUrl === undefined || photoUrl === null || photoUrl === '') {
    return { ok: true, photoUrl: null };
  }
  if (typeof photoUrl !== 'string') {
    return { ok: false, response: jsonError(400, 'INVALID_PHOTO_URL', 'URL foto tidak valid.') };
  }
  const trimmed = photoUrl.trim();
  if (trimmed.length > 2048) {
    return { ok: false, response: jsonError(400, 'INVALID_PHOTO_URL', 'URL foto melebihi batas panjang.') };
  }
  try {
    const parsed = new URL(trimmed);
    const isAllowedLocalHttp =
      parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !isAllowedLocalHttp) {
      return { ok: false, response: jsonError(400, 'INVALID_PHOTO_URL', 'URL foto wajib menggunakan HTTPS.') };
    }
    return { ok: true, photoUrl: trimmed };
  } catch {
    return { ok: false, response: jsonError(400, 'INVALID_PHOTO_URL', 'Format URL foto tidak valid.') };
  }
}

/**
 * Derives biometric_mode strictly on the server based on verifiable request artifacts.
 * Client-supplied biometric_mode claims (e.g., CAMERA_PREVIEW_VERIFIED) are never trusted.
 */
export function resolveServerBiometricMode(photoUrl: string | null): ServerBiometricMode {
  return photoUrl !== null ? 'PHOTO_URL_UNVERIFIED' : 'NONE_UNVERIFIED';
}

export function buildCanonicalAttendancePayload(record: {
  tenant_id: string;
  personnel_id: string;
  facility_id: string | null;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  latitude: number;
  longitude: number;
  biometric_mode: string;
  photo_url: string | null;
}): CanonicalAttendancePayload {
  return {
    tenant_id: record.tenant_id,
    personnel_id: record.personnel_id,
    facility_id: record.facility_id || null,
    type: record.type,
    latitude_e7: Number(record.latitude).toFixed(7),
    longitude_e7: Number(record.longitude).toFixed(7),
    biometric_mode: record.biometric_mode,
    photo_url: record.photo_url || null,
  };
}

export function isSameCanonicalAttendancePayload(
  existing: AttendanceLogRow,
  candidate: CanonicalAttendancePayload
): boolean {
  const existingCanonical = buildCanonicalAttendancePayload(existing);
  return (
    existingCanonical.tenant_id === candidate.tenant_id &&
    existingCanonical.personnel_id === candidate.personnel_id &&
    existingCanonical.facility_id === candidate.facility_id &&
    existingCanonical.type === candidate.type &&
    existingCanonical.latitude_e7 === candidate.latitude_e7 &&
    existingCanonical.longitude_e7 === candidate.longitude_e7 &&
    existingCanonical.biometric_mode === candidate.biometric_mode &&
    existingCanonical.photo_url === candidate.photo_url
  );
}

export function buildCanonicalCheckpointScanPayload(record: {
  tenant_id: string;
  personnel_id: string;
  checkpoint_id: string;
  latitude: number;
  longitude: number;
  status: string;
}): CanonicalCheckpointScanPayload {
  return {
    tenant_id: record.tenant_id,
    personnel_id: record.personnel_id,
    checkpoint_id: record.checkpoint_id,
    latitude_e7: Number(record.latitude).toFixed(7),
    longitude_e7: Number(record.longitude).toFixed(7),
    status: record.status,
  };
}

export function isSameCanonicalCheckpointScanPayload(
  existing: CheckpointScanRow,
  candidate: CanonicalCheckpointScanPayload
): boolean {
  const existingCanonical = buildCanonicalCheckpointScanPayload(existing);
  return (
    existingCanonical.tenant_id === candidate.tenant_id &&
    existingCanonical.personnel_id === candidate.personnel_id &&
    existingCanonical.checkpoint_id === candidate.checkpoint_id &&
    existingCanonical.latitude_e7 === candidate.latitude_e7 &&
    existingCanonical.longitude_e7 === candidate.longitude_e7 &&
    existingCanonical.status === candidate.status
  );
}

function evaluateAuthoritativeBoundary(
  coords: { latitude: number; longitude: number; accuracyMeters: number },
  boundary: { id: string; name: string; latitude: number; longitude: number; radiusMeters: number },
  isMockGps: boolean,
  extraFailureFields?: Record<string, unknown>
): SuccessResult<{ geofence: GeofenceEvaluation }> | FailureResult {
  if (
    !Number.isFinite(boundary.latitude) ||
    !Number.isFinite(boundary.longitude) ||
    !Number.isFinite(boundary.radiusMeters) ||
    boundary.radiusMeters <= 0
  ) {
    return {
      ok: false,
      response: jsonError(
        500,
        'INVALID_GEOFENCE_CONFIGURATION',
        'Konfigurasi koordinat atau radius geofence lokasi pada database tidak valid.',
        extraFailureFields
      ),
    };
  }

  const geofence = evaluateGeofence(
    coords,
    {
      id: boundary.id,
      name: boundary.name,
      center: { latitude: boundary.latitude, longitude: boundary.longitude },
      radiusMeters: boundary.radiusMeters,
    },
    {
      rejectMockGps: true,
      isMockGpsSignal: isMockGps,
      maxAccuracyMeters: MAX_GPS_ACCURACY_METERS,
      requireAccuracyMeters: true,
    }
  );

  if (geofence.mockGpsDetected) {
    return {
      ok: false,
      response: jsonError(
        403,
        'MOCK_GPS_DETECTED',
        'Klien melaporkan indikator mock GPS; operasi ditolak (catatan: indikator klien bukan bukti anti-spoof perangkat keras).',
        {
          geofence_verified: false,
          distance_m: geofence.distanceMeters,
          radius_m: geofence.radiusMeters,
          client_reported_accuracy_m: coords.accuracyMeters,
          location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
          anti_spoof_verified: false,
          ...(extraFailureFields || {}),
        }
      ),
    };
  }

  if (!geofence.accuracyProvided) {
    return {
      ok: false,
      response: jsonError(
        400,
        'GPS_ACCURACY_REQUIRED',
        'Parameter client-reported accuracy_meters GPS wajib disertakan.',
        {
          geofence_verified: false,
          distance_m: geofence.distanceMeters,
          radius_m: geofence.radiusMeters,
          location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
          anti_spoof_verified: false,
          ...(extraFailureFields || {}),
        }
      ),
    };
  }

  if (geofence.accuracyAcceptable === false) {
    return {
      ok: false,
      response: jsonError(
        403,
        'GPS_ACCURACY_TOO_LOW',
        `Akurasi GPS yang dilaporkan klien (${coords.accuracyMeters}m) melebihi batas maksimal ${MAX_GPS_ACCURACY_METERS}m.`,
        {
          geofence_verified: false,
          distance_m: geofence.distanceMeters,
          radius_m: geofence.radiusMeters,
          client_reported_accuracy_m: coords.accuracyMeters,
          location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
          anti_spoof_verified: false,
          ...(extraFailureFields || {}),
        }
      ),
    };
  }

  if (!geofence.isWithinBoundary) {
    return {
      ok: false,
      response: jsonError(
        403,
        'GEOFENCE_VIOLATION',
        `Koordinat yang dilaporkan klien berada di luar radius geofence lokasi target (${geofence.distanceMeters}m > ${geofence.radiusMeters}m).`,
        {
          geofence_verified: false,
          distance_m: geofence.distanceMeters,
          radius_m: geofence.radiusMeters,
          client_reported_accuracy_m: coords.accuracyMeters,
          location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
          anti_spoof_verified: false,
          ...(extraFailureFields || {}),
        }
      ),
    };
  }

  return { ok: true, geofence };
}

function verifyPersonnelFacilityAssignment(
  personnel: PersonnelRecord,
  membership: MembershipAuthorityRecord,
  targetFacilityId: string,
  sessionRole?: BwmRole,
  extraFailureFields?: Record<string, unknown>
): SuccessResult<{ facilityScope: FacilityAccessScope; issuedRole: BwmRole }> | FailureResult {
  const issuedRole = resolveAuthoritativeBwmRole(membership.role);
  if (!issuedRole) {
    return {
      ok: false,
      response: jsonError(
        403,
        'UNRECOGNIZED_MEMBERSHIP_ROLE',
        'Peran keanggotaan pada database tidak dikenali oleh otoritas resmi sesi BWM.',
        extraFailureFields
      ),
    };
  }

  if (sessionRole && sessionRole !== issuedRole) {
    return {
      ok: false,
      response: jsonError(
        403,
        'ROLE_AUTHORITY_MISMATCH',
        'Peran sesi tidak cocok dengan otoritas keanggotaan di database.',
        extraFailureFields
      ),
    };
  }

  if (CROSS_FACILITY_AUTHORIZED_ROLES.has(issuedRole)) {
    const scope: FacilityAccessScope =
      personnel.facility_id === targetFacilityId ? 'ASSIGNED_FACILITY' : 'CROSS_FACILITY_AUTHORIZED';
    return { ok: true, facilityScope: scope, issuedRole };
  }

  if (!personnel.facility_id) {
    return {
      ok: false,
      response: jsonError(
        403,
        'FACILITY_ASSIGNMENT_FORBIDDEN',
        'Personel belum memiliki penugasan fasilitas tetap dan tidak memiliki otorisasi lintas-fasilitas.',
        extraFailureFields
      ),
    };
  }

  if (personnel.facility_id !== targetFacilityId) {
    return {
      ok: false,
      response: jsonError(
        403,
        'FACILITY_ASSIGNMENT_FORBIDDEN',
        'Akses ditolak: Personel terikat pada fasilitas penugasan resmi dan tidak diizinkan berpindah ke fasilitas lain dalam tenant yang sama.',
        extraFailureFields
      ),
    };
  }

  return { ok: true, facilityScope: 'ASSIGNED_FACILITY', issuedRole };
}

/**
 * Verifies tenant active status, membership active status, and maps session.userId -> personnel.id
 * strictly scoped to session.tenantId before any privileged write.
 */
export async function verifyActiveWorkforcePrincipal(
  store: WorkforceOperationalStore,
  session: BwmSessionPayload,
  requestedPersonnelId?: unknown
): Promise<
  | SuccessResult<{
      tenant: TenantAuthorityRecord;
      membership: MembershipAuthorityRecord;
      personnel: PersonnelRecord;
    }>
  | FailureResult
> {
  if (!isValidUuid(session.tenantId) || !isValidUuid(session.userId)) {
    return {
      ok: false,
      response: jsonError(403, 'INVALID_SESSION_IDENTITY', 'Identitas tenant atau pengguna pada sesi tidak valid.'),
    };
  }

  const tenantRes = await store.getTenantById(session.tenantId);
  if (tenantRes.error) {
    return {
      ok: false,
      response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi status organisasi di database.'),
    };
  }
  if (!tenantRes.data) {
    return {
      ok: false,
      response: jsonError(404, 'TENANT_NOT_FOUND', 'Organisasi pada sesi tidak ditemukan.'),
    };
  }
  if (isTenantInactive(tenantRes.data)) {
    return {
      ok: false,
      response: jsonError(403, 'TENANT_INACTIVE', 'Organisasi sedang disuspensi atau tidak aktif.'),
    };
  }

  const memRes = await store.getMembership(session.tenantId, session.userId);
  if (memRes.error) {
    return {
      ok: false,
      response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi keanggotaan organisasi di database.'),
    };
  }
  if (!memRes.data) {
    return {
      ok: false,
      response: jsonError(403, 'MEMBERSHIP_NOT_FOUND', 'Pengguna tidak memiliki keanggotaan terdaftar pada organisasi ini.'),
    };
  }
  if (memRes.data.is_active !== true) {
    return {
      ok: false,
      response: jsonError(403, 'MEMBERSHIP_REVOKED', 'Keanggotaan pengguna telah dicabut atau dinonaktifkan.'),
    };
  }
  const issuedRole = resolveAuthoritativeBwmRole(memRes.data.role);
  if (!issuedRole) {
    return {
      ok: false,
      response: jsonError(
        403,
        'UNRECOGNIZED_MEMBERSHIP_ROLE',
        'Peran keanggotaan pada database tidak dikenali oleh otoritas resmi sesi BWM.'
      ),
    };
  }
  if (session.role !== issuedRole) {
    return {
      ok: false,
      response: jsonError(
        403,
        'ROLE_AUTHORITY_MISMATCH',
        'Peran sesi tidak cocok dengan otoritas keanggotaan di database.'
      ),
    };
  }

  const persRes = await store.getPersonnelByTenantAndUser(session.tenantId, session.userId);
  if (persRes.error) {
    return {
      ok: false,
      response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi profil personel di database.'),
    };
  }
  if (!persRes.data) {
    return {
      ok: false,
      response: jsonError(
        403,
        'PERSONNEL_NOT_PROVISIONED',
        'Profil personel untuk akun ini belum terdaftar pada organisasi.'
      ),
    };
  }

  const personnel = persRes.data;
  if (personnel.tenant_id !== session.tenantId) {
    return {
      ok: false,
      response: jsonError(403, 'CROSS_TENANT_PERSONNEL_FORBIDDEN', 'Profil personel bukan milik tenant sesi.'),
    };
  }
  if (personnel.is_active !== true) {
    return {
      ok: false,
      response: jsonError(403, 'PERSONNEL_INACTIVE', 'Status personel sedang dinonaktifkan.'),
    };
  }
  if (personnel.membership_id && personnel.membership_id !== memRes.data.id) {
    return {
      ok: false,
      response: jsonError(403, 'PERSONNEL_MEMBERSHIP_MISMATCH', 'Relasi membership personel tidak konsisten.'),
    };
  }

  if (requestedPersonnelId !== undefined && requestedPersonnelId !== null && String(requestedPersonnelId).trim() !== '') {
    if (String(requestedPersonnelId).trim().toLowerCase() !== personnel.id.toLowerCase()) {
      return {
        ok: false,
        response: jsonError(
          403,
          'PERSONNEL_IMPERSONATION_FORBIDDEN',
          'Parameter personnel_id tidak cocok dengan identitas personel terautentikasi.'
        ),
      };
    }
  }

  return {
    ok: true,
    tenant: tenantRes.data,
    membership: memRes.data,
    personnel,
  };
}

/**
 * Verifies facility existence, strict tenant ownership, active status, multi-site assignment policy,
 * and client-reported GPS geofence boundary.
 */
export async function verifyFacilityAndGeofence(
  store: WorkforceOperationalStore,
  tenantId: string,
  facilityIdCandidate: unknown,
  coords: { latitude: number; longitude: number; accuracyMeters: number },
  isMockGps: boolean,
  assignmentContext?: { sessionRole?: BwmRole; personnel: PersonnelRecord; membership: MembershipAuthorityRecord }
): Promise<SuccessResult<{ facility: FacilityRecord; geofence: GeofenceEvaluation; facilityScope: FacilityAccessScope }> | FailureResult> {
  if (!facilityIdCandidate || typeof facilityIdCandidate !== 'string' || !facilityIdCandidate.trim()) {
    return {
      ok: false,
      response: jsonError(
        400,
        'FACILITY_REQUIRED',
        'Fasilitas penugasan wajib ditentukan atau ditautkan ke profil personel untuk validasi geofence.'
      ),
    };
  }

  const facilityId = facilityIdCandidate.trim();
  if (!isValidUuid(facilityId)) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_FACILITY_ID', 'Format facility_id wajib berupa UUID kanonis.'),
    };
  }

  const facRes = await store.getFacilityById(facilityId);
  if (facRes.error) {
    return {
      ok: false,
      response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi fasilitas di database.'),
    };
  }
  if (!facRes.data) {
    return {
      ok: false,
      response: jsonError(404, 'FACILITY_NOT_FOUND', 'Fasilitas target tidak ditemukan.'),
    };
  }

  const facility = facRes.data;
  if (facility.tenant_id !== tenantId) {
    return {
      ok: false,
      response: jsonError(403, 'CROSS_TENANT_FACILITY_FORBIDDEN', 'Akses ditolak: Fasilitas berada di luar otoritas tenant Anda.'),
    };
  }
  if (facility.is_active !== true) {
    return {
      ok: false,
      response: jsonError(403, 'FACILITY_INACTIVE', 'Fasilitas target sedang dinonaktifkan.'),
    };
  }

  let facilityScope: FacilityAccessScope = 'ASSIGNED_FACILITY';
  if (assignmentContext) {
    const assignmentCheck = verifyPersonnelFacilityAssignment(
      assignmentContext.personnel,
      assignmentContext.membership,
      facility.id,
      assignmentContext.sessionRole
    );
    if (!assignmentCheck.ok) {
      return assignmentCheck;
    }
    facilityScope = assignmentCheck.facilityScope;
  }

  const boundaryCheck = evaluateAuthoritativeBoundary(
    coords,
    {
      id: facility.id,
      name: facility.name,
      latitude: facility.latitude,
      longitude: facility.longitude,
      radiusMeters: facility.geofence_radius_m,
    },
    isMockGps
  );

  if (!boundaryCheck.ok) {
    return boundaryCheck;
  }

  return {
    ok: true,
    facility,
    geofence: boundaryCheck.geofence,
    facilityScope,
  };
}

/**
 * Resolves checkpoint by UUID or tenant-scoped code/qr_token, verifies active status,
 * constant-time QR token match, parent facility ownership/activity, multi-site assignment policy,
 * and client-reported GPS geofence distance.
 */
export async function verifyCheckpointAndGeofence(
  store: WorkforceOperationalStore,
  tenantId: string,
  params: {
    checkpointId?: unknown;
    qrToken: string;
    coords: { latitude: number; longitude: number; accuracyMeters: number };
    isMockGps: boolean;
    assignmentContext?: { sessionRole?: BwmRole; personnel: PersonnelRecord; membership: MembershipAuthorityRecord };
  }
): Promise<
  | SuccessResult<{
      checkpoint: CheckpointRecord;
      facility: FacilityRecord;
      geofence: GeofenceEvaluation;
      facilityScope: FacilityAccessScope;
    }>
  | FailureResult
> {
  const cleanQrToken = params.qrToken.trim();
  if (!cleanQrToken || cleanQrToken.length > 255) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_QR_TOKEN', 'QR token checkpoint tidak valid.', { verified: false }),
    };
  }

  let checkpoint: CheckpointRecord | null = null;

  if (params.checkpointId !== undefined && params.checkpointId !== null && String(params.checkpointId).trim() !== '') {
    if (typeof params.checkpointId !== 'string') {
      return {
        ok: false,
        response: jsonError(400, 'INVALID_CHECKPOINT_ID', 'Format checkpoint_id tidak valid.', { verified: false }),
      };
    }

    const cleanCpId = params.checkpointId.trim();
    if (cleanCpId.length > 64) {
      return {
        ok: false,
        response: jsonError(400, 'INVALID_CHECKPOINT_ID', 'Panjang checkpoint_id melebihi batas.', { verified: false }),
      };
    }

    if (isValidUuid(cleanCpId)) {
      const cpRes = await store.getCheckpointById(cleanCpId);
      if (cpRes.error) {
        return {
          ok: false,
          response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi checkpoint di database.', { verified: false }),
        };
      }
      if (!cpRes.data) {
        return {
          ok: false,
          response: jsonError(404, 'CHECKPOINT_NOT_FOUND', 'Checkpoint target tidak ditemukan.', { verified: false }),
        };
      }
      if (cpRes.data.tenant_id !== tenantId) {
        return {
          ok: false,
          response: jsonError(
            403,
            'CROSS_TENANT_CHECKPOINT_FORBIDDEN',
            'Akses ditolak: Checkpoint berada di luar otoritas tenant Anda.',
            { verified: false }
          ),
        };
      }
      checkpoint = cpRes.data;
    } else {
      const cpRes = await store.getCheckpointByTenantAndCode(tenantId, cleanCpId);
      if (cpRes.error) {
        return {
          ok: false,
          response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi kode checkpoint di database.', { verified: false }),
        };
      }
      if (!cpRes.data) {
        return {
          ok: false,
          response: jsonError(404, 'CHECKPOINT_NOT_FOUND', 'Checkpoint tidak ditemukan pada organisasi Anda.', { verified: false }),
        };
      }
      checkpoint = cpRes.data;
    }
  } else {
    const cpListRes = await store.getCheckpointsByTenantAndQrToken(tenantId, cleanQrToken);
    if (cpListRes.error) {
      return {
        ok: false,
        response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi QR checkpoint di database.', { verified: false }),
      };
    }
    const matches = cpListRes.data || [];
    if (matches.length === 0) {
      return {
        ok: false,
        response: jsonError(403, 'INVALID_QR_TOKEN', 'QR token checkpoint tidak valid untuk organisasi Anda.', { verified: false }),
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        response: jsonError(
          409,
          'AMBIGUOUS_CHECKPOINT_QR',
          'QR token cocok dengan lebih dari satu checkpoint; sertakan checkpoint_id secara eksplisit.',
          { verified: false }
        ),
      };
    }
    checkpoint = matches[0];
  }

  if (checkpoint.tenant_id !== tenantId) {
    return {
      ok: false,
      response: jsonError(
        403,
        'CROSS_TENANT_CHECKPOINT_FORBIDDEN',
        'Akses ditolak: Checkpoint berada di luar otoritas tenant Anda.',
        { verified: false }
      ),
    };
  }

  if (checkpoint.is_active !== true) {
    return {
      ok: false,
      response: jsonError(403, 'CHECKPOINT_INACTIVE', 'Checkpoint patroli sedang dinonaktifkan.', { verified: false }),
    };
  }

  if (!timingSafeEqualStrings(checkpoint.qr_token, cleanQrToken)) {
    return {
      ok: false,
      response: jsonError(403, 'QR_TOKEN_MISMATCH', 'QR token tidak cocok dengan otoritas checkpoint.', { verified: false }),
    };
  }

  const facRes = await store.getFacilityById(checkpoint.facility_id);
  if (facRes.error) {
    return {
      ok: false,
      response: jsonError(503, 'DATABASE_LOOKUP_FAILED', 'Gagal memverifikasi fasilitas induk checkpoint.', { verified: false }),
    };
  }
  if (!facRes.data || facRes.data.tenant_id !== tenantId) {
    return {
      ok: false,
      response: jsonError(
        403,
        'CROSS_TENANT_FACILITY_FORBIDDEN',
        'Fasilitas induk checkpoint tidak valid atau lintas tenant.',
        { verified: false }
      ),
    };
  }
  if (facRes.data.is_active !== true) {
    return {
      ok: false,
      response: jsonError(403, 'FACILITY_INACTIVE', 'Fasilitas induk checkpoint sedang dinonaktifkan.', { verified: false }),
    };
  }

  let facilityScope: FacilityAccessScope = 'ASSIGNED_FACILITY';
  if (params.assignmentContext) {
    const assignmentCheck = verifyPersonnelFacilityAssignment(
      params.assignmentContext.personnel,
      params.assignmentContext.membership,
      facRes.data.id,
      params.assignmentContext.sessionRole,
      { verified: false }
    );
    if (!assignmentCheck.ok) {
      return assignmentCheck;
    }
    facilityScope = assignmentCheck.facilityScope;
  }

  const boundaryCheck = evaluateAuthoritativeBoundary(
    params.coords,
    {
      id: checkpoint.id,
      name: checkpoint.name,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      radiusMeters: facRes.data.geofence_radius_m,
    },
    params.isMockGps,
    { verified: false }
  );

  if (!boundaryCheck.ok) {
    return boundaryCheck;
  }

  return {
    ok: true,
    checkpoint,
    facility: facRes.data,
    geofence: boundaryCheck.geofence,
    facilityScope,
  };
}

/**
 * Full HTTP handler logic for POST /api/attendance.
 */
export async function processAttendanceSubmission(
  req: NextRequest,
  deps?: { store?: WorkforceOperationalStore }
): Promise<NextResponse> {
  const auth = await getAuthenticatedWorkforceSession(req, deps?.store ? { store: deps.store } : undefined);
  if (!auth.session) {
    return jsonError(auth.status || 401, auth.error || 'UNAUTHORIZED', 'Autentikasi sesi BWM diperlukan.');
  }

  let body: Partial<AttendancePayload>;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError(400, 'INVALID_REQUEST_BODY', 'Payload JSON objek yang valid diperlukan.');
    }
  } catch {
    return jsonError(400, 'INVALID_REQUEST_BODY', 'Body JSON request tidak dapat diparse.');
  }

  const { type, facility_id, personnel_id, latitude, longitude, accuracy_meters, is_mock_gps, photo_url } = body;

  if (!type || !['CLOCK_IN', 'CLOCK_OUT'].includes(type)) {
    return jsonError(400, 'INVALID_ATTENDANCE_TYPE', 'Tipe absensi harus CLOCK_IN atau CLOCK_OUT.');
  }

  const coordsCheck = validateGpsCoordinates(latitude, longitude, accuracy_meters);
  if (!coordsCheck.ok) return coordsCheck.response;

  const photoCheck = validateOptionalPhotoUrl(photo_url);
  if (!photoCheck.ok) return photoCheck.response;

  // Strictly ignore client-supplied biometric_mode and assign server-determined unverified label
  const serverBiometricMode = resolveServerBiometricMode(photoCheck.photoUrl);

  const store = deps?.store || (await getWorkforceOperationalStore());

  // 1. Verify active tenant, membership, and map session.userId -> personnel.id
  const principalCheck = await verifyActiveWorkforcePrincipal(store, auth.session, personnel_id);
  if (!principalCheck.ok) return principalCheck.response;

  const { personnel, membership } = principalCheck;
  const tenantId = auth.session.tenantId;

  // 2. Resolve target facility from explicit body.facility_id or DB personnel.facility_id (never stale JWT siteId)
  const targetFacilityId: unknown =
    facility_id === undefined || facility_id === null ? personnel.facility_id : facility_id;

  const facilityCheck = await verifyFacilityAndGeofence(
    store,
    tenantId,
    targetFacilityId,
    {
      latitude: coordsCheck.latitude,
      longitude: coordsCheck.longitude,
      accuracyMeters: coordsCheck.accuracyMeters,
    },
    Boolean(is_mock_gps),
    { sessionRole: auth.session.role, personnel, membership }
  );
  if (!facilityCheck.ok) return facilityCheck.response;

  const idempCheck = resolveIdempotencyKey(req, body.idempotency_key, 'att', personnel.id);
  if (!idempCheck.ok) return idempCheck.response;

  const nowIso = new Date().toISOString();
  const attendanceRecord: AttendanceLogRow = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    personnel_id: personnel.id,
    facility_id: facilityCheck.facility.id,
    type,
    timestamp: nowIso,
    latitude: coordsCheck.latitude,
    longitude: coordsCheck.longitude,
    geofence_verified: facilityCheck.geofence.isWithinBoundary === true,
    biometric_mode: serverBiometricMode,
    photo_url: photoCheck.photoUrl,
    idempotency_key: idempCheck.idempotencyKey,
  };

  const canonicalCandidate = buildCanonicalAttendancePayload(attendanceRecord);

  // 3. Execute idempotency-first + atomic state transition check via processAttendanceEvent() & ALLOWED_TRANSITIONS
  const writeRes = await store.recordAttendanceWithStateTransition({
    row: attendanceRecord,
    checkTransition: (currentState: AttendanceEventType | 'INITIAL', attemptedType: 'CLOCK_IN' | 'CLOCK_OUT') => {
      const allowedNext = ALLOWED_TRANSITIONS[currentState] || [];
      if (!allowedNext.includes(attemptedType)) {
        return {
          allowed: false,
          reason: `Transisi absensi ditolak oleh ALLOWED_TRANSITIONS: '${currentState}' tidak dapat berpindah ke '${attemptedType}'.`,
        };
      }

      const eventEval = processAttendanceEvent({
        subjectId: personnel.id,
        locationId: facilityCheck.facility.id,
        type: attemptedType,
        timestampUtc: nowIso,
        coordinates: {
          latitude: coordsCheck.latitude,
          longitude: coordsCheck.longitude,
          accuracyMeters: coordsCheck.accuracyMeters,
        },
        currentState,
        boundary: {
          id: facilityCheck.facility.id,
          name: facilityCheck.facility.name,
          center: {
            latitude: facilityCheck.facility.latitude,
            longitude: facilityCheck.facility.longitude,
          },
          radiusMeters: facilityCheck.facility.geofence_radius_m,
        },
        evidence: {
          capturedAtUtc: nowIso,
          photoUrl: photoCheck.photoUrl || undefined,
          isMockGpsDetected: Boolean(is_mock_gps),
        },
        options: {
          enforceGeofence: true,
          rejectMockGps: true,
          maxAccuracyMeters: MAX_GPS_ACCURACY_METERS,
          requireAccuracyMeters: true,
        },
      });

      if (!eventEval.success) {
        return {
          allowed: false,
          reason: eventEval.error || `Transisi '${currentState}' -> '${attemptedType}' ditolak.`,
        };
      }
      return { allowed: true };
    },
  });

  if (writeRes.kind === 'IDEMPOTENCY_EXISTING') {
    if (isSameCanonicalAttendancePayload(writeRes.row, canonicalCandidate)) {
      return NextResponse.json(
        {
          success: true,
          idempotent_replay: true,
          message: 'Permintaan duplikat dengan payload bisnis identik dikembalikan dari catatan absensi tersimpan.',
          data: writeRes.row,
        },
        { status: 200 }
      );
    }

    return jsonError(
      409,
      'IDEMPOTENCY_KEY_CONFLICT',
      'Idempotency-Key telah digunakan untuk payload bisnis atau personel absensi yang berbeda.'
    );
  }

  if (writeRes.kind === 'INVALID_STATE_TRANSITION') {
    return jsonError(409, 'INVALID_STATE_TRANSITION', writeRes.reason, {
      previous_state: writeRes.currentState,
      attempted_type: writeRes.attemptedType,
    });
  }

  if (writeRes.kind === 'PERSONNEL_NOT_PROVISIONED') {
    return jsonError(403, 'PERSONNEL_NOT_PROVISIONED', 'Profil personel tidak ditemukan saat mengunci transaksi.');
  }

  if (writeRes.kind === 'AUTHORITY_REVOKED') {
    return jsonError(403, writeRes.errorCode, 'Otoritas tenant, keanggotaan, atau personel tidak lagi aktif saat transaksi.');
  }

  if (writeRes.kind === 'FACILITY_REJECTED') {
    const status =
      writeRes.errorCode === 'FACILITY_REQUIRED'
        ? 400
        : writeRes.errorCode === 'FACILITY_NOT_FOUND'
          ? 404
          : 403;
    return jsonError(status, writeRes.errorCode, 'Validasi fasilitas atau otorisasi lokasi ditolak di dalam transaksi database.');
  }

  if (writeRes.kind === 'ERROR') {
    console.error('[BWM ATTENDANCE] DB insert failed:', writeRes.error.code || 'UNKNOWN');
    return jsonError(500, 'DB_INSERT_FAILED', 'Gagal menyimpan catatan absensi ke database.');
  }

  return NextResponse.json(
    {
      success: true,
      message: `${type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'} dicatat setelah verifikasi otoritas, status transisi, dan koordinat yang dilaporkan klien.`,
      data: writeRes.row,
      verification: {
        personnel_id: personnel.id,
        facility_id: facilityCheck.facility.id,
        facility_scope: facilityCheck.facilityScope,
        attendance_state_before: writeRes.previousState,
        attendance_state_after: type,
        distance_m: facilityCheck.geofence.distanceMeters,
        radius_m: facilityCheck.geofence.radiusMeters,
        geofence_verified: true,
        geofence_evaluation_basis: 'CLIENT_REPORTED_COORDINATE_MATH_ONLY',
        client_reported_accuracy_m: coordsCheck.accuracyMeters,
        location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
        anti_spoof_verified: false,
        biometric_mode: serverBiometricMode,
        biometric_verified: false,
        camera_capture_verified: false,
        store_adapter: store.adapterKind,
      },
    },
    { status: 201 }
  );
}

/**
 * Full HTTP handler logic for POST /api/checkpoints/scan.
 */
export async function processCheckpointScanSubmission(
  req: NextRequest,
  deps?: { store?: WorkforceOperationalStore }
): Promise<NextResponse> {
  const auth = await getAuthenticatedWorkforceSession(req, deps?.store ? { store: deps.store } : undefined);
  if (!auth.session) {
    return jsonError(auth.status || 401, auth.error || 'UNAUTHORIZED', 'Autentikasi sesi BWM diperlukan.');
  }

  let body: Partial<CheckpointScanPayload>;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError(400, 'INVALID_REQUEST_BODY', 'Payload JSON objek yang valid diperlukan.');
    }
  } catch {
    return jsonError(400, 'INVALID_REQUEST_BODY', 'Body JSON request tidak dapat diparse.');
  }

  const { qr_token, checkpoint_id, personnel_id, latitude, longitude, accuracy_meters, is_mock_gps } = body;

  if (!qr_token || typeof qr_token !== 'string' || !qr_token.trim()) {
    return jsonError(400, 'INVALID_QR_TOKEN', 'QR token dari hasil pemindaian kamera diperlukan.', { verified: false });
  }

  const coordsCheck = validateGpsCoordinates(latitude, longitude, accuracy_meters);
  if (!coordsCheck.ok) return coordsCheck.response;

  const store = deps?.store || (await getWorkforceOperationalStore());

  // 1. Verify active tenant, membership, and map session.userId -> personnel.id
  const principalCheck = await verifyActiveWorkforcePrincipal(store, auth.session, personnel_id);
  if (!principalCheck.ok) return principalCheck.response;

  const { personnel, membership } = principalCheck;
  const tenantId = auth.session.tenantId;

  // 2. Verify checkpoint, QR token, parent facility, multi-site assignment policy, and GPS boundary
  const cpCheck = await verifyCheckpointAndGeofence(store, tenantId, {
    checkpointId: checkpoint_id,
    qrToken: qr_token,
    coords: {
      latitude: coordsCheck.latitude,
      longitude: coordsCheck.longitude,
      accuracyMeters: coordsCheck.accuracyMeters,
    },
    isMockGps: Boolean(is_mock_gps),
    assignmentContext: { sessionRole: auth.session.role, personnel, membership },
  });
  if (!cpCheck.ok) return cpCheck.response;

  const idempCheck = resolveIdempotencyKey(req, body.idempotency_key, 'scan', personnel.id);
  if (!idempCheck.ok) return idempCheck.response;

  const scanRecord: CheckpointScanRow = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    checkpoint_id: cpCheck.checkpoint.id,
    personnel_id: personnel.id,
    scanned_at: new Date().toISOString(),
    latitude: coordsCheck.latitude,
    longitude: coordsCheck.longitude,
    distance_m: cpCheck.geofence.distanceMeters,
    status: 'VERIFIED',
    idempotency_key: idempCheck.idempotencyKey,
  };

  const canonicalCandidate = buildCanonicalCheckpointScanPayload(scanRecord);

  // Pre-check idempotency so exact canonical retries return 200 and conflicts fail 409 immediately
  const preExisting = await store.findCheckpointScanByIdempotencyKey(tenantId, idempCheck.idempotencyKey);
  if (preExisting.error) {
    console.error('[BWM SCAN] DB idempotency lookup failed:', preExisting.error.code || 'UNKNOWN');
    return jsonError(500, 'DB_IDEMPOTENCY_LOOKUP_FAILED', 'Gagal memverifikasi idempotency checkpoint pada database.', {
      verified: false,
    });
  }
  if (preExisting.data) {
    if (isSameCanonicalCheckpointScanPayload(preExisting.data, canonicalCandidate)) {
      return NextResponse.json(
        {
          success: true,
          verified: preExisting.data.status === 'VERIFIED',
          idempotent_replay: true,
          message: 'Pemindaian duplikat dengan payload bisnis identik dikembalikan dari catatan checkpoint tersimpan.',
          data: preExisting.data,
        },
        { status: 200 }
      );
    }
    return jsonError(
      409,
      'IDEMPOTENCY_KEY_CONFLICT',
      'Idempotency-Key telah digunakan untuk pemindaian checkpoint dengan payload atau personel berbeda.',
      { verified: false }
    );
  }

  const insertRes = await store.insertCheckpointScan(scanRecord);
  if (insertRes.error) {
    if (insertRes.error.code === '23505') {
      const existingRes = await store.findCheckpointScanByIdempotencyKey(tenantId, idempCheck.idempotencyKey);
      if (existingRes.error || !existingRes.data) {
        return jsonError(500, 'DB_IDEMPOTENCY_LOOKUP_FAILED', 'Konflik idempotency terjadi tetapi catatan tersimpan gagal diverifikasi.', {
          verified: false,
        });
      }
      if (isSameCanonicalCheckpointScanPayload(existingRes.data, canonicalCandidate)) {
        return NextResponse.json(
          {
            success: true,
            verified: existingRes.data.status === 'VERIFIED',
            idempotent_replay: true,
            message: 'Pemindaian duplikat dengan payload bisnis identik dikembalikan dari catatan checkpoint tersimpan.',
            data: existingRes.data,
          },
          { status: 200 }
        );
      }
      return jsonError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency-Key telah digunakan untuk pemindaian checkpoint dengan payload atau personel berbeda.',
        { verified: false }
      );
    }

    console.error('[BWM SCAN] DB insert failed:', insertRes.error.code || 'UNKNOWN');
    return jsonError(500, 'DB_INSERT_FAILED', 'Gagal menyimpan pemindaian checkpoint ke database.', { verified: false });
  }

  if (!insertRes.data) {
    return jsonError(500, 'DB_PERSISTENCE_UNCONFIRMED', 'Database tidak mengonfirmasi penyimpanan pemindaian checkpoint.', {
      verified: false,
    });
  }

  return NextResponse.json(
    {
      success: true,
      verified: true,
      message: 'Pemindaian checkpoint patroli dicatat setelah validasi QR token dan koordinat yang dilaporkan klien.',
      data: insertRes.data,
      verification: {
        personnel_id: personnel.id,
        checkpoint_id: cpCheck.checkpoint.id,
        facility_id: cpCheck.facility.id,
        facility_scope: cpCheck.facilityScope,
        distance_m: cpCheck.geofence.distanceMeters,
        radius_m: cpCheck.geofence.radiusMeters,
        geofence_evaluation_basis: 'CLIENT_REPORTED_COORDINATE_MATH_ONLY',
        client_reported_accuracy_m: coordsCheck.accuracyMeters,
        location_evidence_tier: 'CLIENT_REPORTED_UNATTESTED',
        anti_spoof_verified: false,
        store_adapter: store.adapterKind,
      },
    },
    { status: 201 }
  );
}
