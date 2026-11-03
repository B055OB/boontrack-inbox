/**
 * apps/workforce/entitlement-guard.ts
 * BWM Workforce Vertical Adapter — Billing Policy & Grace Period Enforcement Engine
 *
 * Ratified Billing Rules:
 * - ACTIVE (Day 1–30): Full operation for mobile & desk portal.
 * - GRACE_PERIOD (Day 31–33 / max 72h): Clock-in field attendance permitted, Desk Portal read-only, personnel seat expansion locked.
 * - EXPIRED (Day 34+): Server-side hard cutoff fail-closed (HTTP 402/403), GPS sync halted, all operations revoked.
 * - Deterministic server-side UTC timestamps.
 */

import { BillingCycleStatus, BranchBillingEntitlement, WorkforceRole, WorkforcePermissions } from './types';

export type WorkforceAction =
  | 'CLOCK_ATTENDANCE'
  | 'VIEW_REPORTS'
  | 'MANAGE_PERSONNEL'
  | 'MANAGE_BILLING';

export interface ActionAuthorizationResult {
  allowed: boolean;
  status: BillingCycleStatus;
  action: WorkforceAction;
  reason?: string;
  errorCode?: 'SUBSCRIPTION_EXPIRED' | 'SEAT_EXPANSION_LOCKED' | 'ACTIVATION_UNPAID' | 'PRIVILEGE_ESCALATION_BLOCKED';
}

export const ROLE_PERMISSIONS: Record<WorkforceRole, WorkforcePermissions> = {
  AGENCY_SUPERADMIN: {
    clock_attendance: true,
    view_reports: true,
    manage_personnel: true,
    manage_billing: true,
  },
  CLIENT_ORG_ADMIN: {
    clock_attendance: true,
    view_reports: true,
    manage_personnel: true,
    manage_billing: true,
  },
  BRANCH_SUPERVISOR: {
    clock_attendance: true,
    view_reports: true,
    manage_personnel: true,
    manage_billing: false,
  },
  FIELD_PERSONNEL: {
    clock_attendance: true,
    view_reports: false,
    manage_personnel: false,
    manage_billing: false,
  },
};

/**
 * Authorizes role permissions against specific workforce actions.
 * Thwarts privilege escalation attacks.
 */
export function authorizeRoleAction(
  role: WorkforceRole,
  action: WorkforceAction
): { allowed: boolean; reason?: string; errorCode?: string } {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return {
      allowed: false,
      reason: `Role '${role}' tidak dikenal. Akses ditolak.`,
      errorCode: 'PRIVILEGE_ESCALATION_BLOCKED',
    };
  }

  switch (action) {
    case 'CLOCK_ATTENDANCE':
      return permissions.clock_attendance
        ? { allowed: true }
        : { allowed: false, reason: `Role '${role}' tidak memiliki izin presensi.`, errorCode: 'PRIVILEGE_ESCALATION_BLOCKED' };
    case 'VIEW_REPORTS':
      return permissions.view_reports
        ? { allowed: true }
        : { allowed: false, reason: `Role '${role}' dilarang melihat laporan eksekutif.`, errorCode: 'PRIVILEGE_ESCALATION_BLOCKED' };
    case 'MANAGE_PERSONNEL':
      return permissions.manage_personnel
        ? { allowed: true }
        : { allowed: false, reason: `PRIVILEGE_ESCALATION_BLOCKED: Role '${role}' dilarang menambah atau memanipulasi personel.`, errorCode: 'PRIVILEGE_ESCALATION_BLOCKED' };
    case 'MANAGE_BILLING':
      return permissions.manage_billing
        ? { allowed: true }
        : { allowed: false, reason: `PRIVILEGE_ESCALATION_BLOCKED: Role '${role}' dilarang mengakses modul penagihan & keuangan.`, errorCode: 'PRIVILEGE_ESCALATION_BLOCKED' };
    default:
      return { allowed: false, reason: 'Aksi tidak dikenal.', errorCode: 'PRIVILEGE_ESCALATION_BLOCKED' };
  }
}

/**
 * Deterministically evaluates the billing status of a branch against a reference UTC timestamp.
 */
export function evaluateBillingStatus(
  entitlement: BranchBillingEntitlement,
  referenceUtc: string = new Date().toISOString()
): BillingCycleStatus {
  if (!entitlement.isActivationPaid) {
    return 'EXPIRED';
  }

  const nowMs = new Date(referenceUtc).getTime();
  const periodEndMs = new Date(entitlement.currentPeriodEndUtc).getTime();
  const graceEndMs = new Date(entitlement.gracePeriodEndUtc).getTime();

  if (nowMs <= periodEndMs) {
    return 'ACTIVE';
  }

  if (nowMs <= graceEndMs) {
    return 'GRACE_PERIOD';
  }

  return 'EXPIRED';
}

/**
 * Enforces action permissions based on the active billing status.
 */
export function authorizeWorkforceAction(
  action: WorkforceAction,
  entitlement: BranchBillingEntitlement,
  referenceUtc?: string
): ActionAuthorizationResult {
  const currentStatus = evaluateBillingStatus(entitlement, referenceUtc);

  // 1. Activation guard
  if (!entitlement.isActivationPaid) {
    return {
      allowed: false,
      status: currentStatus,
      action,
      reason: 'Biaya aktivasi cabang Rp 500.000 belum dibayar. Operasional presensi ditolak.',
      errorCode: 'ACTIVATION_UNPAID',
    };
  }

  // 2. ACTIVE: Full permissions
  if (currentStatus === 'ACTIVE') {
    return {
      allowed: true,
      status: 'ACTIVE',
      action,
    };
  }

  // 3. GRACE_PERIOD: Clock-in permitted, reports read-only, seat expansion LOCKED
  if (currentStatus === 'GRACE_PERIOD') {
    if (action === 'MANAGE_PERSONNEL') {
      return {
        allowed: false,
        status: 'GRACE_PERIOD',
        action,
        reason: 'Penambahan personel dikunci selama masa tenggang (Locked Seat Expansion). Segera lunasi tagihan bulanan.',
        errorCode: 'SEAT_EXPANSION_LOCKED',
      };
    }

    // CLOCK_ATTENDANCE, VIEW_REPORTS, MANAGE_BILLING allowed in grace period
    return {
      allowed: true,
      status: 'GRACE_PERIOD',
      action,
    };
  }

  // 4. EXPIRED / HARD PAYWALL: Fail-closed for all operational actions
  return {
    allowed: false,
    status: 'EXPIRED',
    action,
    reason: 'HARD PAYWALL (402 Payment Required): Masa tenggang telah habis. Seluruh operasional presensi dan akses portal diputus.',
    errorCode: 'SUBSCRIPTION_EXPIRED',
  };
}

/**
 * Asserts action is allowed, throwing error on unauthorized attempts.
 */
export function assertWorkforceActionAllowed(
  action: WorkforceAction,
  entitlement: BranchBillingEntitlement,
  referenceUtc?: string
): void {
  const auth = authorizeWorkforceAction(action, entitlement, referenceUtc);
  if (!auth.allowed) {
    throw new Error(`[PAYWALL_ENFORCEMENT:${auth.errorCode || 'BLOCKED'}] Action '${action}' blocked: ${auth.reason}`);
  }
}
