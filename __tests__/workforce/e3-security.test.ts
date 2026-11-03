/**
 * __tests__/workforce/e3-security.test.ts
 * BWM Gate E3 — Local Security Verification & Attack Vector Suite
 *
 * Strictly Isolated Runtime Testing — Zero External Network / Zero DB Mutation
 */

import {
  resolveWorkforceHost,
  assertCrossTenantBoundary,
  validateStorageUrlSafety,
} from '@/lib/workforce';
import {
  calculateDistanceMeters,
  evaluateGeofence,
  processAttendanceEvent,
} from '@/packages/attendance';
import {
  WorkforceAttendanceAdapter,
  WorkforceAttendanceRepository,
  authorizeRoleAction,
  authorizeWorkforceAction,
  assertWorkforceActionAllowed,
  Branch,
  Personnel,
  BranchBillingEntitlement,
  WorkforceClockInRequest,
} from '@/apps/workforce';

class MockAsyncAttendanceRepo implements WorkforceAttendanceRepository {
  public states = new Map<string, any>();
  public events: any[] = [];

  async getLastAttendanceState(personnelId: string) {
    // Add artificial delay to simulate async database roundtrip and expose race condition windows
    await new Promise((res) => setTimeout(res, 20));
    return this.states.get(personnelId) || 'INITIAL';
  }

  async saveAttendanceEvent(event: any) {
    await new Promise((res) => setTimeout(res, 10));
    this.events.push(event);
    this.states.set(event.personnelId, event.type);
  }
}

describe('BWM Gate E3: Local Security Verification Suite', () => {
  const centerCoord = { latitude: -6.2146, longitude: 106.8214 }; // Sudirman Center
  const activeBranch: Branch = {
    id: 'branch_sudirman',
    orgId: 'org_mitra_01',
    agencyId: 'agency_satya',
    code: 'SDR-01',
    name: 'Cabang Sudirman Central',
    status: 'ACTIVE',
    geofence: { center: centerCoord, radiusMeters: 50 },
  };

  const personnelAgus: Personnel = {
    id: 'pers_agus',
    branchId: 'branch_sudirman',
    orgId: 'org_mitra_01',
    agencyId: 'agency_satya',
    nik: '3201019901001',
    fullName: 'Agus Pratama',
    role: 'FIELD_PERSONNEL',
    status: 'ACTIVE',
  };

  const supervisorBudi: Personnel = {
    id: 'pers_budi_spv',
    branchId: 'branch_sudirman',
    orgId: 'org_mitra_01',
    agencyId: 'agency_satya',
    nik: '3201019901002',
    fullName: 'Budi Santoso',
    role: 'BRANCH_SUPERVISOR',
    status: 'ACTIVE',
  };

  const activeEntitlement: BranchBillingEntitlement = {
    branchId: 'branch_sudirman',
    status: 'ACTIVE',
    currentPeriodStartUtc: '2026-11-01T00:00:00Z',
    currentPeriodEndUtc: '2026-12-01T00:00:00Z',
    gracePeriodEndUtc: '2026-12-04T00:00:00Z', // 72-hour grace period ends at Dec 4 00:00:00 UTC
    isActivationPaid: true,
    activeHeadcount: 10,
  };

  // =========================================================================
  // Attack Vector 1: Cross-Agency Breach
  // =========================================================================
  describe('Attack Vector 1: Cross-Agency Breach', () => {
    it('strictly throws 403 / security violation on attempted cross-agency resource access', () => {
      const callerSatya = { agencyId: 'agency_satya', orgId: 'org_mitra_01', role: 'AGENCY_SUPERADMIN' as const };
      const targetCompetitor = { agencyId: 'agency_competitor_corp', orgId: 'org_foreign', branchId: 'branch_foreign' };

      expect(() => {
        assertCrossTenantBoundary(callerSatya, targetCompetitor);
      }).toThrow('Cross-agency access is strictly prohibited');
    });

    it('rejects cross-agency supervisor approval with explicit failure code', () => {
      const adapter = new WorkforceAttendanceAdapter();
      const res = adapter.approveAttendance({
        supervisor: supervisorBudi,
        targetAgencyId: 'agency_competitor_corp',
        targetBranchId: 'branch_sudirman',
        eventId: 'att_001',
      });

      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe('CROSS_AGENCY_BREACH');
      expect(res.error).toContain('Akses antar-agensi dilarang keras');
    });
  });

  // =========================================================================
  // Attack Vector 2: Cross-Branch Breach
  // =========================================================================
  describe('Attack Vector 2: Cross-Branch Breach', () => {
    it('strictly throws security violation when branch supervisor attempts to mutate another branch', () => {
      const supervisorSudirman = {
        agencyId: 'agency_satya',
        orgId: 'org_mitra_01',
        branchId: 'branch_sudirman',
        role: 'BRANCH_SUPERVISOR' as const,
      };
      const targetCengkareng = {
        agencyId: 'agency_satya',
        orgId: 'org_mitra_01',
        branchId: 'branch_cengkareng',
      };

      expect(() => {
        assertCrossTenantBoundary(supervisorSudirman, targetCengkareng);
      }).toThrow(/cannot access branch/);
    });

    it('rejects supervisor approval for attendance record originating from another branch', () => {
      const adapter = new WorkforceAttendanceAdapter();
      const res = adapter.approveAttendance({
        supervisor: supervisorBudi, // assigned to branch_sudirman
        targetAgencyId: 'agency_satya',
        targetBranchId: 'branch_cengkareng', // foreign branch
        eventId: 'att_cgk_999',
      });

      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe('CROSS_BRANCH_BREACH');
      expect(res.error).toContain('CROSS_BRANCH_VIOLATION');
    });
  });

  // =========================================================================
  // Attack Vector 3: Host Header Spoofing
  // =========================================================================
  describe('Attack Vector 3: Host Header Spoofing', () => {
    it('fails closed when presented with arbitrary spoofed or malicious host headers', () => {
      const maliciousHosts = [
        'evil-hacker.com',
        'spoofed-workforce.xyz',
        'workforce.boontrack.com.attacker-proxy.io',
        'subdomain.workforce.boontrack.com@attacker.com',
      ];

      for (const host of maliciousHosts) {
        const res = resolveWorkforceHost(host);
        expect(res.allowed).toBe(false);
        expect(res.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      }
    });

    it('strictly denies retired gateway host app.boontrack.com', () => {
      const res = resolveWorkforceHost('app.boontrack.com');
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('REJECTED_RETIRED_GATEWAY');
      expect(res.error).toContain('dipensiunkan');
    });

    it('shields against cross-product host traversal (shop, creator, studio, dashboard, admin)', () => {
      const crossProductHosts = [
        'shop.boontrack.com',
        'creator.boontrack.com',
        'studio.boontrack.com',
        'dashboard.boontrack.com',
        'admin.boontrack.com',
        'api.boontrack.com',
      ];

      for (const host of crossProductHosts) {
        const res = resolveWorkforceHost(host);
        expect(res.allowed).toBe(false);
        expect(res.status).toBe('REJECTED_CROSS_DOMAIN_HOST');
      }
    });
  });

  // =========================================================================
  // Attack Vector 4: Privilege Escalation
  // =========================================================================
  describe('Attack Vector 4: Privilege Escalation', () => {
    it('rejects field personnel attempts to access billing management with 403 reason', () => {
      const auth = authorizeRoleAction('FIELD_PERSONNEL', 'MANAGE_BILLING');
      expect(auth.allowed).toBe(false);
      expect(auth.errorCode).toBe('PRIVILEGE_ESCALATION_BLOCKED');
      expect(auth.reason).toContain('dilarang mengakses modul penagihan');
    });

    it('rejects field personnel attempts to add or manipulate headcount seats', () => {
      const auth = authorizeRoleAction('FIELD_PERSONNEL', 'MANAGE_PERSONNEL');
      expect(auth.allowed).toBe(false);
      expect(auth.errorCode).toBe('PRIVILEGE_ESCALATION_BLOCKED');
    });

    it('rejects branch supervisor attempts to manipulate commercial billing settings', () => {
      const auth = authorizeRoleAction('BRANCH_SUPERVISOR', 'MANAGE_BILLING');
      expect(auth.allowed).toBe(false);
      expect(auth.errorCode).toBe('PRIVILEGE_ESCALATION_BLOCKED');
    });
  });

  // =========================================================================
  // Attack Vector 5: Attendance Race Condition (Simultaneous Millisecond Requests)
  // =========================================================================
  describe('Attack Vector 5: Attendance Race Condition (Simultaneous Double Clock-in)', () => {
    it('locks concurrent execution: allows exactly one request and rejects simultaneous duplicate', async () => {
      const repo = new MockAsyncAttendanceRepo();
      const adapter = new WorkforceAttendanceAdapter(repo);

      const request1: WorkforceClockInRequest = {
        personnelId: personnelAgus.id,
        branchId: activeBranch.id,
        coordinates: centerCoord,
        timestampUtc: '2026-11-03T08:00:00.000Z',
      };

      const request2: WorkforceClockInRequest = {
        personnelId: personnelAgus.id,
        branchId: activeBranch.id,
        coordinates: centerCoord,
        timestampUtc: '2026-11-03T08:00:00.001Z',
      };

      // Dispatch two concurrent clock-ins simultaneously at the exact same millisecond window
      const [res1, res2] = await Promise.all([
        adapter.recordAttendance({ request: request1, personnel: personnelAgus, branch: activeBranch, entitlement: activeEntitlement }),
        adapter.recordAttendance({ request: request2, personnel: personnelAgus, branch: activeBranch, entitlement: activeEntitlement }),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const rejections = [res1, res2].filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(1);
      expect(rejections[0].errorCode).toBe('CONCURRENT_ATTENDANCE_CONFLICT');
      expect(rejections[0].error).toContain('Konflik konkurensi');

      // Verify that after the initial success, subsequent clock-in is rejected by state machine
      const secondAttempt = await adapter.recordAttendance({
        request: request2,
        personnel: personnelAgus,
        branch: activeBranch,
        entitlement: activeEntitlement,
      });

      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.errorCode).toBe('INVALID_STATE_TRANSITION');
    });
  });

  // =========================================================================
  // Attack Vector 6: Geofence Perimeter Attack (Exact 1-Meter Boundary Breach)
  // =========================================================================
  describe('Attack Vector 6: Geofence Perimeter Attack (1-Meter Breach)', () => {
    it('approves attendance when distance is within 50.0m and strictly blocks at 51.0m (1m breach)', () => {
      const boundary = { id: 'geo_sdr', center: centerCoord, radiusMeters: 50 };

      // 1 degree of latitude is ~111,000 meters.
      // 50 meters north is ~0.00045045 degrees
      // 51 meters north is ~0.00045946 degrees
      const exactlyInsideCoord = {
        latitude: centerCoord.latitude + 0.00043, // ~47.7 meters
        longitude: centerCoord.longitude,
      };

      const oneMeterOutsideCoord = {
        latitude: centerCoord.latitude + 0.000465, // ~51.6 meters (1+ meter breach)
        longitude: centerCoord.longitude,
      };

      const distInside = calculateDistanceMeters(centerCoord, exactlyInsideCoord);
      expect(distInside).toBeLessThanOrEqual(50);
      const evalInside = evaluateGeofence(exactlyInsideCoord, boundary);
      expect(evalInside.isWithinBoundary).toBe(true);

      const distOutside = calculateDistanceMeters(centerCoord, oneMeterOutsideCoord);
      expect(distOutside).toBeGreaterThan(50);
      const evalOutside = evaluateGeofence(oneMeterOutsideCoord, boundary);
      expect(evalOutside.isWithinBoundary).toBe(false);

      // Verify end-to-end event processor rejects the 1-meter breach
      const breachAttempt = processAttendanceEvent({
        subjectId: personnelAgus.id,
        locationId: activeBranch.id,
        type: 'CLOCK_IN',
        timestampUtc: '2026-11-03T08:00:00Z',
        coordinates: oneMeterOutsideCoord,
        currentState: 'INITIAL',
        boundary,
        options: { enforceGeofence: true },
      });

      expect(breachAttempt.success).toBe(false);
      expect(breachAttempt.errorCode).toBe('GEOFENCE_BREACH');
      expect(breachAttempt.error).toContain('Di luar radius presensi');
    });
  });

  // =========================================================================
  // Attack Vector 7: Storage Expiry Hardening (901s Over-Limit & Missing Signature)
  // =========================================================================
  describe('Attack Vector 7: Storage Expiry Hardening (> 900s / 15m & Unsigned URLs)', () => {
    it('accepts valid 900s URL, but strictly rejects signed URL with expiry of 901s (1s breach)', () => {
      const valid900sUrl =
        'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg?X-Amz-Expires=900&X-Amz-Signature=sig123';
      expect(validateStorageUrlSafety(valid900sUrl).safe).toBe(true);

      const invalid901sUrl =
        'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg?X-Amz-Expires=901&X-Amz-Signature=sig123';
      const check901 = validateStorageUrlSafety(invalid901sUrl);
      expect(check901.safe).toBe(false);
      expect(check901.reason).toContain('melebihi batas toleransi maksimal (900s / 15 menit)');
    });

    it('rejects URLs missing cryptographic authorization parameters (missing signature)', () => {
      const unsignedUrl = 'https://vault.workforce.boontrack.internal/boontrack-workforce-private/key.jpg';
      const check = validateStorageUrlSafety(unsignedUrl);
      expect(check.safe).toBe(false);
      expect(check.reason).toContain('Missing signature');
    });

    it('prohibits direct public CDN domains (assets.boontrack.com / .r2.dev)', () => {
      const publicCdnUrl = 'https://assets.boontrack.com/workforce/evidence.jpg?X-Amz-Signature=sig123';
      const check = validateStorageUrlSafety(publicCdnUrl);
      expect(check.safe).toBe(false);
      expect(check.reason).toContain('CRITICAL PRIVACY VIOLATION');
    });
  });

  // =========================================================================
  // Attack Vector 8: 72-Hour Grace Cutoff Simulation (grace_ends_at + 1 second)
  // =========================================================================
  describe('Attack Vector 8: 72-Hour Grace Cutoff Simulation (grace_ends_at + 1s)', () => {
    // Grace period ends at: '2026-12-04T00:00:00Z'
    it('allows clock-in 1 second before cutoff, then triggers HARD PAYWALL exactly at grace_ends_at + 1s', () => {
      // 1. One second BEFORE grace cutoff (2026-12-03T23:59:59Z)
      const oneSecBeforeCutoff = '2026-12-03T23:59:59Z';
      const authBefore = authorizeWorkforceAction('CLOCK_ATTENDANCE', activeEntitlement, oneSecBeforeCutoff);

      expect(authBefore.allowed).toBe(true);
      expect(authBefore.status).toBe('GRACE_PERIOD');
      expect(() => assertWorkforceActionAllowed('CLOCK_ATTENDANCE', activeEntitlement, oneSecBeforeCutoff)).not.toThrow();

      // 2. Exactly ONE second AFTER grace cutoff (2026-12-04T00:00:01Z) -> HARD PAYWALL CUTOFF
      const oneSecAfterCutoff = '2026-12-04T00:00:01Z';
      const authAfter = authorizeWorkforceAction('CLOCK_ATTENDANCE', activeEntitlement, oneSecAfterCutoff);

      expect(authAfter.allowed).toBe(false);
      expect(authAfter.status).toBe('EXPIRED');
      expect(authAfter.errorCode).toBe('SUBSCRIPTION_EXPIRED');
      expect(authAfter.reason).toContain('HARD PAYWALL (402 Payment Required)');

      // Verify assertWorkforceActionAllowed throws server-side fail-closed exception
      expect(() => {
        assertWorkforceActionAllowed('CLOCK_ATTENDANCE', activeEntitlement, oneSecAfterCutoff);
      }).toThrow(/SUBSCRIPTION_EXPIRED.*HARD PAYWALL/);
    });

    it('rejects client-side forged timestamps by anchoring to authoritative server reference', () => {
      // Attacker client passes a stale/forged timestamp in the past ('2026-11-15T00:00:00Z')
      // but server evaluates against current real-world timestamp past cutoff ('2026-12-05T12:00:00Z')
      const serverCutoffTimestamp = '2026-12-05T12:00:00Z';
      const authServerEnforced = authorizeWorkforceAction('CLOCK_ATTENDANCE', activeEntitlement, serverCutoffTimestamp);

      expect(authServerEnforced.allowed).toBe(false);
      expect(authServerEnforced.status).toBe('EXPIRED');
      expect(authServerEnforced.errorCode).toBe('SUBSCRIPTION_EXPIRED');
    });
  });
});

