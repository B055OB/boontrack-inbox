/**
 * apps/workforce/attendance-adapter.ts
 * BWM Workforce Vertical Adapter — Attendance Orchestrator Bridge
 *
 * Connects Vertical Domain (Agency -> Org -> Branch -> Personnel) to Pure Attendance Capability.
 */

import {
  processAttendanceEvent,
  AttendanceEventType,
  GeofenceBoundary,
} from '@/packages/attendance';
import {
  Branch,
  Personnel,
  BranchBillingEntitlement,
  WorkforceClockInRequest,
  WorkforceClockInResponse,
} from './types';
import { authorizeWorkforceAction } from './entitlement-guard';
import { PersonnelSeatLicense } from '@/lib/workforce/billing-contract';

export interface WorkforceAttendanceRepository {
  getLastAttendanceState(personnelId: string): Promise<AttendanceEventType | 'INITIAL'>;
  saveAttendanceEvent(event: any): Promise<void>;
}

export class WorkforceAttendanceAdapter {
  private readonly activeLocks = new Set<string>();

  constructor(private readonly repository?: WorkforceAttendanceRepository) {}

  /**
   * Processes a vertical clock-in/out request through the pure attendance engine.
   * Defends against simultaneous race conditions via atomic transaction locking.
   */
  async recordAttendance(params: {
    request: WorkforceClockInRequest;
    personnel: Personnel;
    branch: Branch;
    entitlement: BranchBillingEntitlement;
    type?: AttendanceEventType;
    currentState?: AttendanceEventType | 'INITIAL';
    license?: PersonnelSeatLicense;
  }): Promise<WorkforceClockInResponse> {
    const { request, personnel, branch, entitlement } = params;
    const eventType: AttendanceEventType = params.type || 'CLOCK_IN';
    const lockKey = `${personnel.id}:${eventType}`;

    // Concurrency Lock: Prevents simultaneous duplicate clock-ins at the exact same millisecond
    if (this.activeLocks.has(lockKey)) {
      return {
        success: false,
        personnelId: personnel.id,
        branchId: branch.id,
        type: eventType,
        timestampUtc: request.timestampUtc,
        error: 'Konflik konkurensi: Transaksi presensi untuk personel ini sedang diproses. Permintaan ganda ditolak.',
        errorCode: 'CONCURRENT_ATTENDANCE_CONFLICT',
      };
    }

    this.activeLocks.add(lockKey);

    try {
      // 1. Authorize action against branch billing entitlement
      const billingAuth = authorizeWorkforceAction('CLOCK_ATTENDANCE', entitlement, request.timestampUtc);
      if (!billingAuth.allowed) {
        return {
          success: false,
          personnelId: personnel.id,
          branchId: branch.id,
          type: eventType,
          timestampUtc: request.timestampUtc,
          error: billingAuth.reason,
          errorCode: billingAuth.errorCode,
        };
      }

      // 2. Validate Personnel - Branch Association
      if (personnel.branchId !== branch.id) {
        return {
          success: false,
          personnelId: personnel.id,
          branchId: branch.id,
          type: eventType,
          timestampUtc: request.timestampUtc,
          error: `Personel '${personnel.id}' terdaftar di cabang '${personnel.branchId}', bukan cabang target '${branch.id}'.`,
          errorCode: 'BRANCH_MEMBERSHIP_MISMATCH',
        };
      }

      // 2b. Validate Personnel Seat License (fail-closed if license is inactive/expired/terminated)
      if (params.license && params.license.status !== 'ACTIVE') {
        return {
          success: false,
          personnelId: personnel.id,
          branchId: branch.id,
          type: eventType,
          timestampUtc: request.timestampUtc,
          error: `Lisensi kursi personel '${personnel.id}' berstatus ${params.license.status}. Presensi ditolak.`,
          errorCode: 'PERSONNEL_LICENSE_INACTIVE',
        };
      }

      // 3. Map Branch Geofence to Pure Attendance GeofenceBoundary
      const pureBoundary: GeofenceBoundary = {
        id: `geo_${branch.id}`,
        name: branch.name,
        center: branch.geofence.center,
        radiusMeters: branch.geofence.radiusMeters,
      };

      // 4. Resolve current state from repository if available
      let currentState = params.currentState;
      if (!currentState && this.repository) {
        currentState = await this.repository.getLastAttendanceState(personnel.id);
      }

      // 5. Invoke Pure Attendance Engine
      const result = processAttendanceEvent({
        subjectId: personnel.id,
        locationId: branch.id,
        type: eventType,
        timestampUtc: request.timestampUtc,
        coordinates: request.coordinates,
        currentState: currentState || 'INITIAL',
        boundary: pureBoundary,
        evidence: request.evidence,
        options: {
          enforceGeofence: true,
          rejectMockGps: true,
        },
      });

      if (!result.success || !result.event) {
        return {
          success: false,
          personnelId: personnel.id,
          branchId: branch.id,
          type: eventType,
          timestampUtc: request.timestampUtc,
          error: result.error,
          errorCode: result.errorCode,
        };
      }

      // 6. Persist to repository if attached
      if (this.repository) {
        await this.repository.saveAttendanceEvent({
          ...result.event,
          agencyId: personnel.agencyId,
          orgId: personnel.orgId,
          branchId: branch.id,
          personnelId: personnel.id,
        });
      }

      return {
        success: true,
        attendanceEventId: result.event.id,
        personnelId: personnel.id,
        branchId: branch.id,
        type: result.event.type,
        timestampUtc: result.event.timestampUtc,
      };
    } finally {
      this.activeLocks.delete(lockKey);
    }
  }

  /**
   * Approves an attendance record with strict cross-agency and cross-branch boundary enforcement.
   */
  approveAttendance(params: {
    supervisor: Personnel;
    targetAgencyId: string;
    targetBranchId: string;
    eventId: string;
  }): { allowed: boolean; error?: string; errorCode?: string } {
    const { supervisor, targetAgencyId, targetBranchId } = params;

    // 1. Cross-Agency check
    if (supervisor.agencyId !== targetAgencyId) {
      return {
        allowed: false,
        error: 'CROSS_AGENCY_VIOLATION: Akses antar-agensi dilarang keras.',
        errorCode: 'CROSS_AGENCY_BREACH',
      };
    }

    // 2. Role permission check
    if (
      supervisor.role !== 'BRANCH_SUPERVISOR' &&
      supervisor.role !== 'CLIENT_ORG_ADMIN' &&
      supervisor.role !== 'AGENCY_SUPERADMIN'
    ) {
      return {
        allowed: false,
        error: `Role '${supervisor.role}' tidak memiliki hak persetujuan presensi.`,
        errorCode: 'INSUFFICIENT_ROLE',
      };
    }

    // 3. Cross-Branch check for branch supervisor
    if (supervisor.role === 'BRANCH_SUPERVISOR' && supervisor.branchId !== targetBranchId) {
      return {
        allowed: false,
        error: `CROSS_BRANCH_VIOLATION: Supervisor Cabang '${supervisor.branchId}' dilarang menyetujui presensi Cabang '${targetBranchId}'.`,
        errorCode: 'CROSS_BRANCH_BREACH',
      };
    }

    return { allowed: true };
  }
}
