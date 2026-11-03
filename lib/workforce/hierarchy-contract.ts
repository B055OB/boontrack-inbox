/**
 * lib/workforce/hierarchy-contract.ts
 * BWM Gate E1 — Tenant Hierarchy Resolution Contract
 *
 * Strict 4-Tier Hierarchy:
 * Agency (Level 1) -> Client Organization (Level 2) -> Branch (Level 3) -> Personnel (Level 4)
 *
 * Security Invariants:
 * 1. Strict Parent-Child Integrity: Every level must reference an active, valid parent.
 * 2. Multi-Role Scoping: Role is evaluated strictly in the context of a specific branch/org.
 * 3. Cross-Tenant Barrier: A branch in Org A cannot access data or personnel in Org B.
 * 4. Zero Data Bleed: Queries without explicit branchId or orgId are rejected.
 */

export type WorkforceRole =
  | 'AGENCY_SUPERADMIN'
  | 'CLIENT_ORG_ADMIN'
  | 'BRANCH_SUPERVISOR'
  | 'FIELD_PERSONNEL';

export interface AgencyRecord {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface ClientOrganizationRecord {
  id: string;
  agencyId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface BranchRecord {
  id: string;
  orgId: string;
  agencyId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'PENDING_ACTIVATION' | 'SUSPENDED';
  locationCoordinates?: { lat: number; lng: number };
}

export interface PersonnelRecord {
  id: string;
  branchId: string;
  orgId: string;
  agencyId: string;
  nik: string;
  fullName: string;
  role: WorkforceRole;
  status: 'ACTIVE' | 'OFFLINE' | 'SUSPENDED';
}

export interface ResolvedHierarchyContext {
  valid: boolean;
  agency: AgencyRecord;
  org: ClientOrganizationRecord;
  branch: BranchRecord;
  personnel?: PersonnelRecord;
  error?: string;
  errorCode?: 'AGENCY_INACTIVE' | 'ORG_MISMATCH' | 'BRANCH_INACTIVE' | 'PERSONNEL_MISMATCH' | 'MALFORMED_HIERARCHY';
}

/**
 * Validates the full 4-tier hierarchy chain and asserts relational integrity.
 */
export function resolveHierarchyContext(params: {
  agency: AgencyRecord;
  org: ClientOrganizationRecord;
  branch: BranchRecord;
  personnel?: PersonnelRecord;
}): ResolvedHierarchyContext {
  const { agency, org, branch, personnel } = params;

  // 1. Agency validation
  if (!agency || agency.status !== 'ACTIVE') {
    return {
      valid: false,
      agency,
      org,
      branch,
      personnel,
      error: `Agency '${agency?.slug || 'unknown'}' tidak aktif atau tidak ditemukan.`,
      errorCode: 'AGENCY_INACTIVE',
    };
  }

  // 2. Organization belongs to Agency
  if (!org || org.agencyId !== agency.id || org.status !== 'ACTIVE') {
    return {
      valid: false,
      agency,
      org,
      branch,
      personnel,
      error: `Organisasi '${org?.id}' bukan bagian dari Agency '${agency.id}' atau tidak aktif.`,
      errorCode: 'ORG_MISMATCH',
    };
  }

  // 3. Branch belongs to Org and Agency
  if (
    !branch ||
    branch.orgId !== org.id ||
    branch.agencyId !== agency.id ||
    branch.status !== 'ACTIVE'
  ) {
    return {
      valid: false,
      agency,
      org,
      branch,
      personnel,
      error: `Cabang '${branch?.id}' tidak valid, tidak aktif, atau tidak cocok dengan Org '${org.id}'.`,
      errorCode: 'BRANCH_INACTIVE',
    };
  }

  // 4. Personnel belongs to Branch, Org, and Agency
  if (personnel) {
    if (
      personnel.branchId !== branch.id ||
      personnel.orgId !== org.id ||
      personnel.agencyId !== agency.id
    ) {
      return {
        valid: false,
        agency,
        org,
        branch,
        personnel,
        error: `Personel '${personnel.id}' terdaftar di cabang lain. Akses lintas cabang ditolak.`,
        errorCode: 'PERSONNEL_MISMATCH',
      };
    }
  }

  return {
    valid: true,
    agency,
    org,
    branch,
    personnel,
  };
}

/**
 * Asserts cross-tenant access boundary. Throws error if caller attempts cross-branch breach.
 */
export function assertCrossTenantBoundary(
  caller: { agencyId: string; orgId: string; branchId?: string; role: WorkforceRole },
  target: { agencyId: string; orgId: string; branchId: string }
): void {
  if (caller.agencyId !== target.agencyId) {
    throw new Error('SECURITY_VIOLATION: Cross-agency access is strictly prohibited.');
  }

  if (caller.role === 'AGENCY_SUPERADMIN') {
    return; // Agency Superadmin can inspect within their own agency
  }

  if (caller.orgId !== target.orgId) {
    throw new Error('SECURITY_VIOLATION: Cross-organization access is strictly prohibited.');
  }

  if (caller.role === 'CLIENT_ORG_ADMIN') {
    return; // Org Admin can inspect all branches in their org
  }

  // Branch Supervisor and Field Personnel are locked to their own branch
  if (caller.branchId !== target.branchId) {
    throw new Error(`SECURITY_VIOLATION: Caller branch '${caller.branchId}' cannot access branch '${target.branchId}'.`);
  }
}

