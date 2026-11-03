/**
 * __tests__/workforce/tenant-hierarchy.test.ts
 * BWM Gate E1 — Test Suite: 4-Tier Tenant Hierarchy Resolution Contracts
 */

import {
  resolveHierarchyContext,
  assertCrossTenantBoundary,
  AgencyRecord,
  ClientOrganizationRecord,
  BranchRecord,
  PersonnelRecord,
} from '@/lib/workforce/hierarchy-contract';

describe('BWM Gate E1: Tenant Hierarchy Resolution Contract', () => {
  const satyaAgency: AgencyRecord = {
    id: 'agency_satya',
    slug: 'satya-system',
    name: 'PT Satya Karya Mandiri',
    status: 'ACTIVE',
  };

  const clientOrgA: ClientOrganizationRecord = {
    id: 'org_mitra_logistik',
    agencyId: 'agency_satya',
    slug: 'mitra-logistik',
    name: 'PT Mitra Logistik Nusantara',
    status: 'ACTIVE',
  };

  const clientOrgB: ClientOrganizationRecord = {
    id: 'org_retail_mart',
    agencyId: 'agency_satya',
    slug: 'retail-mart',
    name: 'PT Retail Mart Indonesia',
    status: 'ACTIVE',
  };

  const branchSudirman: BranchRecord = {
    id: 'branch_sudirman',
    orgId: 'org_mitra_logistik',
    agencyId: 'agency_satya',
    code: 'SDR-01',
    name: 'Cabang Sudirman Central',
    status: 'ACTIVE',
    locationCoordinates: { lat: -6.2146, lng: 106.8214 },
  };

  const branchCengkareng: BranchRecord = {
    id: 'branch_cengkareng',
    orgId: 'org_mitra_logistik',
    agencyId: 'agency_satya',
    code: 'CGK-02',
    name: 'Cabang Hub Cengkareng',
    status: 'ACTIVE',
    locationCoordinates: { lat: -6.1287, lng: 106.6854 },
  };

  const officerAgus: PersonnelRecord = {
    id: 'pers_agus_001',
    branchId: 'branch_sudirman',
    orgId: 'org_mitra_logistik',
    agencyId: 'agency_satya',
    nik: '3201019901001',
    fullName: 'Agus Pratama',
    role: 'FIELD_PERSONNEL',
    status: 'ACTIVE',
  };

  describe('1. 4-Tier Hierarchy Context Resolution', () => {
    it('validates and resolves a fully legitimate hierarchy chain', () => {
      const result = resolveHierarchyContext({
        agency: satyaAgency,
        org: clientOrgA,
        branch: branchSudirman,
        personnel: officerAgus,
      });

      expect(result.valid).toBe(true);
      expect(result.agency.slug).toBe('satya-system');
      expect(result.org.slug).toBe('mitra-logistik');
      expect(result.branch.code).toBe('SDR-01');
      expect(result.personnel?.fullName).toBe('Agus Pratama');
    });

    it('rejects hierarchy when agency is suspended', () => {
      const suspendedAgency: AgencyRecord = { ...satyaAgency, status: 'SUSPENDED' };
      const result = resolveHierarchyContext({
        agency: suspendedAgency,
        org: clientOrgA,
        branch: branchSudirman,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('AGENCY_INACTIVE');
      expect(result.error).toContain('tidak aktif');
    });

    it('rejects hierarchy when organization does not belong to the target agency', () => {
      const foreignOrg: ClientOrganizationRecord = { ...clientOrgA, agencyId: 'agency_other_vendor' };
      const result = resolveHierarchyContext({
        agency: satyaAgency,
        org: foreignOrg,
        branch: branchSudirman,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('ORG_MISMATCH');
    });

    it('rejects hierarchy when branch does not match the client organization', () => {
      const mismatchedBranch: BranchRecord = { ...branchSudirman, orgId: 'org_retail_mart' };
      const result = resolveHierarchyContext({
        agency: satyaAgency,
        org: clientOrgA,
        branch: mismatchedBranch,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('BRANCH_INACTIVE');
    });

    it('strictly rejects when personnel attempts to clock-in on a different branch', () => {
      // Officer Agus is registered at Sudirman, but context attempts Cengkareng
      const result = resolveHierarchyContext({
        agency: satyaAgency,
        org: clientOrgA,
        branch: branchCengkareng,
        personnel: officerAgus,
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PERSONNEL_MISMATCH');
      expect(result.error).toContain('lintas cabang ditolak');
    });
  });

  describe('2. Cross-Tenant Barrier Enforcement', () => {
    it('prevents cross-agency access unconditionally', () => {
      expect(() => {
        assertCrossTenantBoundary(
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', role: 'AGENCY_SUPERADMIN' },
          { agencyId: 'agency_competitor', orgId: 'org_competitor_client', branchId: 'branch_x' }
        );
      }).toThrow('Cross-agency access is strictly prohibited');
    });

    it('allows Agency Superadmin to inspect all orgs and branches within their agency', () => {
      expect(() => {
        assertCrossTenantBoundary(
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', role: 'AGENCY_SUPERADMIN' },
          { agencyId: 'agency_satya', orgId: 'org_retail_mart', branchId: 'branch_mart_01' }
        );
      }).not.toThrow();
    });

    it('allows Client Org Admin to inspect all branches within their organization', () => {
      expect(() => {
        assertCrossTenantBoundary(
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', role: 'CLIENT_ORG_ADMIN' },
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', branchId: 'branch_cengkareng' }
        );
      }).not.toThrow();
    });

    it('prevents Client Org Admin from accessing another organization', () => {
      expect(() => {
        assertCrossTenantBoundary(
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', role: 'CLIENT_ORG_ADMIN' },
          { agencyId: 'agency_satya', orgId: 'org_retail_mart', branchId: 'branch_mart_01' }
        );
      }).toThrow('Cross-organization access is strictly prohibited');
    });

    it('strictly locks Branch Supervisor and Personnel to their designated branch', () => {
      expect(() => {
        assertCrossTenantBoundary(
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', branchId: 'branch_sudirman', role: 'BRANCH_SUPERVISOR' },
          { agencyId: 'agency_satya', orgId: 'org_mitra_logistik', branchId: 'branch_cengkareng' }
        );
      }).toThrow('cannot access branch');
    });
  });
});

