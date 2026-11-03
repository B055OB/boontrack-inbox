/**
 * __tests__/workforce/e2-scaffolding.test.ts
 * BWM Gate E2 — Verification Suite: Structural Scaffolding & Pure Attendance Decoupling
 */

import fs from 'fs';
import path from 'path';
import {
  calculateDistanceMeters,
  evaluateGeofence,
  processAttendanceEvent,
  evaluateShiftCompliance,
  AttendanceEventType,
} from '@/packages/attendance';
import {
  WorkforceAttendanceAdapter,
  WorkforceAttendanceRepository,
  authorizeWorkforceAction,
  Branch,
  Personnel,
  BranchBillingEntitlement,
  WorkforceClockInRequest,
} from '@/apps/workforce';

/**
 * In-Memory Mock Attendance Repository for zero-network testing.
 */
class InMemoryAttendanceRepository implements WorkforceAttendanceRepository {
  public events: any[] = [];
  public states = new Map<string, AttendanceEventType | 'INITIAL'>();

  async getLastAttendanceState(personnelId: string): Promise<AttendanceEventType | 'INITIAL'> {
    return this.states.get(personnelId) || 'INITIAL';
  }

  async saveAttendanceEvent(event: any): Promise<void> {
    this.events.push(event);
    this.states.set(event.personnelId, event.type);
  }
}

/**
 * In-Memory Mock Storage Adapter for biometric evidence.
 */
class InMemoryStorageAdapter {
  public files = new Map<string, { buffer: Buffer; contentType: string }>();

  async saveEvidence(key: string, buffer: Buffer, contentType: string) {
    this.files.set(key, { buffer, contentType });
    return {
      key,
      signedUrl: `https://vault.workforce.boontrack.internal/${key}?X-Amz-Expires=300&X-Amz-Signature=mock_sig`,
    };
  }
}

describe('BWM Gate E2: Scaffolding & Attendance Decoupling Suite', () => {
  // Test Fixtures
  const branchCenter = { latitude: -6.2146, longitude: 106.8214 }; // Jakarta Sudirman
  const testBranch: Branch = {
    id: 'branch_sdr_01',
    orgId: 'org_mitra_01',
    agencyId: 'agency_satya_01',
    code: 'SDR-01',
    name: 'Cabang Sudirman Central',
    status: 'ACTIVE',
    geofence: {
      center: branchCenter,
      radiusMeters: 100, // 100 meter radius
    },
  };

  const testPersonnel: Personnel = {
    id: 'pers_agus_01',
    branchId: 'branch_sdr_01',
    orgId: 'org_mitra_01',
    agencyId: 'agency_satya_01',
    nik: '3201019901001',
    fullName: 'Agus Pratama',
    role: 'FIELD_PERSONNEL',
    status: 'ACTIVE',
  };

  const validEntitlement: BranchBillingEntitlement = {
    branchId: 'branch_sdr_01',
    status: 'ACTIVE',
    currentPeriodStartUtc: '2026-11-01T00:00:00Z',
    currentPeriodEndUtc: '2026-12-01T00:00:00Z',
    gracePeriodEndUtc: '2026-12-04T00:00:00Z',
    isActivationPaid: true,
    activeHeadcount: 20,
  };

  describe('1. Pure Attendance Engine Decoupling', () => {
    it('calculates Haversine distance accurately between two coordinates', () => {
      const coordA = { latitude: -6.2146, longitude: 106.8214 };
      const coordB = { latitude: -6.2150, longitude: 106.8218 };

      const distance = calculateDistanceMeters(coordA, coordB);
      expect(distance).toBeGreaterThan(50);
      expect(distance).toBeLessThan(80);
    });

    it('approves clock-in within geofence radius and blocks out-of-boundary coordinates', () => {
      const insideCoords = { latitude: -6.21462, longitude: 106.82142 }; // ~3 meters away
      const outsideCoords = { latitude: -6.22000, longitude: 106.83000 }; // ~1 km away

      const boundary = {
        id: 'geo_test',
        center: branchCenter,
        radiusMeters: 50,
      };

      const evalInside = evaluateGeofence(insideCoords, boundary);
      expect(evalInside.isWithinBoundary).toBe(true);

      const evalOutside = evaluateGeofence(outsideCoords, boundary);
      expect(evalOutside.isWithinBoundary).toBe(false);
      expect(evalOutside.distanceMeters).toBeGreaterThan(50);
    });

    it('rejects clock-in when mock GPS signal is detected and anti-mock is enforced', () => {
      const result = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'CLOCK_IN',
        timestampUtc: '2026-11-03T08:00:00Z',
        coordinates: branchCenter,
        currentState: 'INITIAL',
        boundary: { id: 'geo_1', center: branchCenter, radiusMeters: 100 },
        evidence: {
          capturedAtUtc: '2026-11-03T08:00:00Z',
          isMockGpsDetected: true,
        },
        options: { enforceGeofence: true, rejectMockGps: true },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MOCK_GPS_DETECTED');
    });

    it('enforces sequential state machine transitions (CLOCK_IN -> BREAK_START -> BREAK_END -> CLOCK_OUT)', () => {
      // 1. Valid Clock In from INITIAL
      const clockIn = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'CLOCK_IN',
        timestampUtc: '2026-11-03T08:00:00Z',
        coordinates: branchCenter,
        currentState: 'INITIAL',
      });
      expect(clockIn.success).toBe(true);

      // 2. Invalid Double Clock In
      const doubleClockIn = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'CLOCK_IN',
        timestampUtc: '2026-11-03T08:05:00Z',
        coordinates: branchCenter,
        currentState: 'CLOCK_IN',
      });
      expect(doubleClockIn.success).toBe(false);
      expect(doubleClockIn.errorCode).toBe('INVALID_STATE_TRANSITION');

      // 3. Valid Break Start
      const breakStart = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'BREAK_START',
        timestampUtc: '2026-11-03T12:00:00Z',
        coordinates: branchCenter,
        currentState: 'CLOCK_IN',
      });
      expect(breakStart.success).toBe(true);

      // 4. Valid Break End
      const breakEnd = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'BREAK_END',
        timestampUtc: '2026-11-03T13:00:00Z',
        coordinates: branchCenter,
        currentState: 'BREAK_START',
      });
      expect(breakEnd.success).toBe(true);

      // 5. Valid Clock Out
      const clockOut = processAttendanceEvent({
        subjectId: 'sub_001',
        locationId: 'loc_001',
        type: 'CLOCK_OUT',
        timestampUtc: '2026-11-03T17:00:00Z',
        coordinates: branchCenter,
        currentState: 'BREAK_END',
      });
      expect(clockOut.success).toBe(true);
    });

    it('evaluates shift schedule punctuality and grace period', () => {
      const shift = {
        shiftId: 'shift_morning',
        scheduledStartUtc: '2026-11-03T08:00:00Z',
        scheduledEndUtc: '2026-11-03T17:00:00Z',
        gracePeriodMinutes: 15, // 15 mins grace
      };

      // 08:10 -> On time (within 15 min grace)
      const onTimeEval = evaluateShiftCompliance('2026-11-03T08:10:00Z', shift, 'CLOCK_IN');
      expect(onTimeEval.isOnTime).toBe(true);
      expect(onTimeEval.isLate).toBe(false);

      // 08:25 -> Late by 25 mins
      const lateEval = evaluateShiftCompliance('2026-11-03T08:25:00Z', shift, 'CLOCK_IN');
      expect(lateEval.isOnTime).toBe(false);
      expect(lateEval.isLate).toBe(true);
      expect(lateEval.lateDurationMinutes).toBe(25);
    });
  });

  describe('2. Workforce Vertical Adapter Orchestration', () => {
    it('wraps and records attendance event with complete 4-tier context into repository', async () => {
      const repo = new InMemoryAttendanceRepository();
      const adapter = new WorkforceAttendanceAdapter(repo);

      const request: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: testBranch.id,
        coordinates: branchCenter,
        timestampUtc: '2026-11-03T08:00:00Z',
        evidence: {
          capturedAtUtc: '2026-11-03T08:00:00Z',
          photoUrl: 'https://vault.workforce.boontrack.internal/evidence.jpg',
        },
      };

      const response = await adapter.recordAttendance({
        request,
        personnel: testPersonnel,
        branch: testBranch,
        entitlement: validEntitlement,
      });

      expect(response.success).toBe(true);
      expect(response.personnelId).toBe('pers_agus_01');
      expect(response.branchId).toBe('branch_sdr_01');
      expect(response.attendanceEventId).toBeDefined();

      // Verify event was saved to repository with multi-tier tags
      expect(repo.events).toHaveLength(1);
      const saved = repo.events[0];
      expect(saved.agencyId).toBe('agency_satya_01');
      expect(saved.orgId).toBe('org_mitra_01');
      expect(saved.branchId).toBe('branch_sdr_01');
      expect(saved.personnelId).toBe('pers_agus_01');
    });

    it('rejects attendance if personnel attempts to clock-in on a mismatched branch', async () => {
      const repo = new InMemoryAttendanceRepository();
      const adapter = new WorkforceAttendanceAdapter(repo);

      const foreignBranch: Branch = { ...testBranch, id: 'branch_other_cengkareng' };
      const request: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: foreignBranch.id,
        coordinates: branchCenter,
        timestampUtc: '2026-11-03T08:00:00Z',
      };

      const response = await adapter.recordAttendance({
        request,
        personnel: testPersonnel, // assigned to branch_sdr_01
        branch: foreignBranch,    // target is branch_other_cengkareng
        entitlement: validEntitlement,
      });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('BRANCH_MEMBERSHIP_MISMATCH');
    });
  });

  describe('3. Billing Policy & Grace Period Enforcement', () => {
    it('authorizes full permissions when status is ACTIVE (Day 1-30)', () => {
      const authClock = authorizeWorkforceAction('CLOCK_ATTENDANCE', validEntitlement, '2026-11-15T00:00:00Z');
      expect(authClock.allowed).toBe(true);

      const authAddPersonnel = authorizeWorkforceAction('MANAGE_PERSONNEL', validEntitlement, '2026-11-15T00:00:00Z');
      expect(authAddPersonnel.allowed).toBe(true);
    });

    it('in GRACE_PERIOD (Day 31-33): permits field clock-in but locks personnel seat expansion', () => {
      // Reference date: Dec 2 (1 day past periodEnd Dec 1, within grace period until Dec 4)
      const graceTimeUtc = '2026-12-02T10:00:00Z';

      // 1. Clock attendance is permitted
      const authClock = authorizeWorkforceAction('CLOCK_ATTENDANCE', validEntitlement, graceTimeUtc);
      expect(authClock.allowed).toBe(true);
      expect(authClock.status).toBe('GRACE_PERIOD');

      // 2. View reports is permitted (Desk Portal read-only)
      const authReports = authorizeWorkforceAction('VIEW_REPORTS', validEntitlement, graceTimeUtc);
      expect(authReports.allowed).toBe(true);

      // 3. Manage personnel (seat expansion) is strictly BLOCKED
      const authExpansion = authorizeWorkforceAction('MANAGE_PERSONNEL', validEntitlement, graceTimeUtc);
      expect(authExpansion.allowed).toBe(false);
      expect(authExpansion.errorCode).toBe('SEAT_EXPANSION_LOCKED');
      expect(authExpansion.reason).toContain('Locked Seat Expansion');
    });

    it('in EXPIRED / HARD PAYWALL (Day 34+): enforces fail-closed cutoff for all actions', () => {
      // Reference date: Dec 5 (past gracePeriodEnd Dec 4)
      const expiredTimeUtc = '2026-12-05T08:00:00Z';

      const authClock = authorizeWorkforceAction('CLOCK_ATTENDANCE', validEntitlement, expiredTimeUtc);
      expect(authClock.allowed).toBe(false);
      expect(authClock.errorCode).toBe('SUBSCRIPTION_EXPIRED');
      expect(authClock.reason).toContain('HARD PAYWALL');

      const authReports = authorizeWorkforceAction('VIEW_REPORTS', validEntitlement, expiredTimeUtc);
      expect(authReports.allowed).toBe(false);

      const authPersonnel = authorizeWorkforceAction('MANAGE_PERSONNEL', validEntitlement, expiredTimeUtc);
      expect(authPersonnel.allowed).toBe(false);
    });

    it('blocks all operations when branch activation fee is unpaid', () => {
      const unpaidEntitlement: BranchBillingEntitlement = {
        ...validEntitlement,
        isActivationPaid: false,
      };

      const auth = authorizeWorkforceAction('CLOCK_ATTENDANCE', unpaidEntitlement, '2026-11-10T00:00:00Z');
      expect(auth.allowed).toBe(false);
      expect(auth.errorCode).toBe('ACTIVATION_UNPAID');
    });
  });

  describe('4. Boundary Isolation & Architectural Decoupling Audit', () => {
    it('verifies packages/attendance has ZERO imports from apps/workforce or shop runtime', () => {
      const attendanceDir = path.resolve('packages/attendance');
      const files = fs.readdirSync(attendanceDir).filter((f) => f.endsWith('.ts'));

      expect(files.length).toBeGreaterThan(0);

      const forbiddenPatterns = [
        /from\s+['"].*apps\/workforce/i,
        /from\s+['"].*satya/i,
        /from\s+['"].*shop/i,
        /from\s+['"].*creator/i,
        /from\s+['"].*studio/i,
        /from\s+['"].*tenants/i,
        /from\s+['"]@\/lib\//i,
      ];

      for (const file of files) {
        const fullPath = path.join(attendanceDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          expect(match).toBeNull();
        }
      }
    });

    it('verifies in-memory storage adapter handles evidence without external network calls', async () => {
      const storage = new InMemoryStorageAdapter();
      const mockPhotoBuffer = Buffer.from('fake_image_data_probe');
      const key = 'workforce/agency_1/org_1/branch_1/pers_1/evidence.jpg';

      const res = await storage.saveEvidence(key, mockPhotoBuffer, 'image/jpeg');
      expect(res.key).toBe(key);
      expect(res.signedUrl).toContain('vault.workforce.boontrack.internal');
      expect(storage.files.has(key)).toBe(true);
    });
  });
});

