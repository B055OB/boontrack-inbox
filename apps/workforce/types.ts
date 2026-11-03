/**
 * apps/workforce/types.ts
 * BWM Workforce Vertical Adapter — Types & 4-Tier Hierarchy Specifications
 */

import { Coordinates, AttendanceEventType, AttendanceEvidence } from '@/packages/attendance/types';

export type WorkforceRole =
  | 'AGENCY_SUPERADMIN'
  | 'CLIENT_ORG_ADMIN'
  | 'BRANCH_SUPERVISOR'
  | 'FIELD_PERSONNEL';

export interface WorkforcePermissions {
  clock_attendance: boolean;
  view_reports: boolean;
  manage_personnel: boolean;
  manage_billing: boolean;
}

export interface WorkforceAgency {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface ClientOrganization {
  id: string;
  agencyId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface Branch {
  id: string;
  orgId: string;
  agencyId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'PENDING_ACTIVATION' | 'SUSPENDED';
  geofence: {
    center: Coordinates;
    radiusMeters: number;
  };
}

export interface Personnel {
  id: string;
  branchId: string;
  orgId: string;
  agencyId: string;
  nik: string;
  fullName: string;
  role: WorkforceRole;
  status: 'ACTIVE' | 'SUSPENDED';
}

export type BillingCycleStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED';

export interface BranchBillingEntitlement {
  branchId: string;
  status: BillingCycleStatus;
  currentPeriodStartUtc: string;
  currentPeriodEndUtc: string;
  gracePeriodEndUtc: string;
  isActivationPaid: boolean;
  activeHeadcount: number;
}

export interface WorkforceClockInRequest {
  personnelId: string;
  branchId: string;
  coordinates: Coordinates;
  timestampUtc: string;
  evidence?: AttendanceEvidence;
  shiftId?: string;
}

export interface WorkforceClockInResponse {
  success: boolean;
  attendanceEventId?: string;
  personnelId: string;
  branchId: string;
  type: AttendanceEventType;
  timestampUtc: string;
  error?: string;
  errorCode?: string;
}

