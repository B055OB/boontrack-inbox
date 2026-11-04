/**
 * __tests__/workforce/e6-workforce-e2e.test.ts
 * BWM Gate E6-E: Workforce End-to-End Integration Suite
 *
 * Connects all three core architectural layers:
 * 1. Pure Universal Attendance Engine (packages/attendance/)
 * 2. Vertical Industry Adapter (apps/workforce/)
 * 3. Prepaid Credit Pool & Immutable Ledger Persistence (lib/workforce/ & live database)
 *
 * Verifies End-to-End Flow:
 * - Flow 1: Admin Onboarding & Purchase Deposit (Billing Contract & Live Database SSOT).
 * - Flow 2: Personnel Registration & Seat Activation (Rolling 30-Day Window).
 * - Flow 3: Field Attendance Clock-in & Clock-out (Geofence, State Transition, & Active License).
 * - Flow 4: Expiry Rejection & Financial Ledger Immutability (Fail-closed on expired entitlement).
 * - Flow 5: Complete Audit Trail Verification (Zero Delta, Gateway SSOT to Attendance Evidence).
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import {
  AttendanceEventType,
} from '@/packages/attendance';
import {
  WorkforceAttendanceAdapter,
  WorkforceAttendanceRepository,
  Branch,
  Personnel,
  BranchBillingEntitlement,
  WorkforceClockInRequest,
} from '@/apps/workforce';
import {
  createBranchActivationQuote,
  createCreditDepositQuote,
  PersonnelSeatLicense,
} from '@/lib/workforce/billing-contract';

jest.setTimeout(35000);

class TestAttendanceRepository implements WorkforceAttendanceRepository {
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

describe('BWM Gate E6-E: Workforce End-to-End Integration Suite', () => {
  let client: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Isolated E2E fixture namespace
  const timestamp = Date.now();
  const agencyId = `test_e6e_${timestamp}_agency`;
  const branchId = `test_e6e_${timestamp}_branch`;
  const paymentReference = `test_e6e_${timestamp}_payref`;
  const purchaseReference = `test_e6e_${timestamp}_poref`;

  // Domain Entity Fixtures
  const branchCenter = { latitude: -6.2146, longitude: 106.8214 }; // Jakarta Sudirman
  const testBranch: Branch = {
    id: branchId,
    orgId: `org_satya_${timestamp}`,
    agencyId: agencyId,
    code: `SUD-${timestamp.toString().slice(-4)}`,
    name: 'Sudirman Central Branch',
    status: 'ACTIVE',
    geofence: {
      center: branchCenter,
      radiusMeters: 100, // 100 meters boundary
    },
  };

  const testPersonnel: Personnel = {
    id: `guard_satya_${timestamp}`,
    branchId: branchId,
    orgId: testBranch.orgId,
    agencyId: agencyId,
    nik: `317101${timestamp.toString().slice(-10)}`,
    fullName: 'Bhayangkara Satya',
    role: 'FIELD_PERSONNEL',
    status: 'ACTIVE',
  };

  let attendanceRepo: TestAttendanceRepository;
  let adapter: WorkforceAttendanceAdapter;
  let activeLicense: PersonnelSeatLicense;
  let entitlement: BranchBillingEntitlement;

  /**
   * Resolves connection string prioritizing Port 5432 Direct / Session Mode
   */
  async function createLiveClient(): Promise<Client> {
    const envDirect = process.env.WORKFORCE_DATABASE_DIRECT_URL;
    const envPooler = process.env.WORKFORCE_DATABASE_URL;

    let directUrl = envDirect;
    let poolerUrl = envPooler;
    if (!directUrl || !poolerUrl) {
      try {
        const envFile = fs.readFileSync(path.resolve('.env.local'), 'utf8');
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        const matchPooler = envFile.match(/^WORKFORCE_DATABASE_URL=(.*)$/m);
        if (matchDirect) directUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
        if (matchPooler) poolerUrl = matchPooler[1].trim().replace(/^["']|["']$/g, '');
      } catch {
        // ignore read error
      }
    }

    const candidates: string[] = [];
    if (directUrl) candidates.push(directUrl);
    if (poolerUrl) {
      candidates.push(poolerUrl.replace(':6543', ':5432'));
      candidates.push(poolerUrl);
    }

    for (const connStr of candidates) {
      try {
        const c = new Client({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        await c.connect();
        return c;
      } catch {
        // try next candidate
      }
    }
    throw new Error('Failed to connect to staging database via candidate connection strings');
  }

  async function cleanFixtureData(dbClient: Client) {
    try {
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;');
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;');
      await dbClient.query("DELETE FROM seat_credit_ledger WHERE branch_id LIKE 'test_e6e_%' OR agency_id LIKE 'test_e6e_%';");
      await dbClient.query("DELETE FROM credit_purchase_transactions WHERE branch_id LIKE 'test_e6e_%' OR agency_id LIKE 'test_e6e_%';");
      await dbClient.query("DELETE FROM branch_credit_pools WHERE branch_id LIKE 'test_e6e_%' OR agency_id LIKE 'test_e6e_%';");
    } finally {
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;').catch(() => {});
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;').catch(() => {});
    }
  }

  beforeAll(async () => {
    client = await createLiveClient();
    await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
    await cleanFixtureData(client);

    attendanceRepo = new TestAttendanceRepository();
    adapter = new WorkforceAttendanceAdapter(attendanceRepo);

    // Initial branch billing entitlement setup
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const graceEnd = new Date(now.getTime() + 33 * 24 * 60 * 60 * 1000);

    entitlement = {
      branchId: branchId,
      status: 'ACTIVE',
      currentPeriodStartUtc: now.toISOString(),
      currentPeriodEndUtc: periodEnd.toISOString(),
      gracePeriodEndUtc: graceEnd.toISOString(),
      isActivationPaid: true,
      activeHeadcount: 1,
    };
  });

  afterAll(async () => {
    if (client) {
      try {
        await cleanFixtureData(client);
      } catch (err) {
        console.error('Teardown error:', (err as Error).message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Admin Onboarding & Purchase
  // ---------------------------------------------------------------------------
  describe('Flow 1: Admin Onboarding & Credit Deposit Purchase', () => {
    it('generates commercial quotes and commits deposit to live PostgreSQL staging', async () => {
      // 1. Commercial setup quotation check
      const setupQuote = createBranchActivationQuote({ branchId, agencyId });
      expect(setupQuote.amount).toBe(500000);
      expect(setupQuote.feeType).toBe('BRANCH_SETUP_NON_REFUNDABLE');

      // 2. Deposit quote check (5 credits = Rp 150.000 + 11% PPN = Rp 166.500)
      const depositQuote = createCreditDepositQuote({ branchId, quantity: 5 });
      expect(depositQuote.subtotalIdr).toBe(150000);
      expect(depositQuote.taxAmountIdr).toBe(16500);
      expect(depositQuote.totalAmountIdr).toBe(166500);

      // 3. Execute authoritative deposit in live PostgreSQL database
      const depositRes = await client.query(
        `SELECT workforce_staging.fn_workforce_deposit_credits($1, $2, $3, $4, $5) AS result;`,
        [branchId, agencyId, 5, purchaseReference, paymentReference]
      );
      const res = depositRes.rows[0].result;

      expect(res.success).toBe(true);
      expect(res.idempotent).toBe(false);
      expect(res.total_idr).toBe(166500);
      expect(res.available_credits).toBe(5);
      expect(res.active_seats).toBe(0);

      // 4. Verify Database Persistence State
      const tx = await client.query(
        `SELECT * FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [paymentReference]
      );
      expect(tx.rows.length).toBe(1);
      expect(tx.rows[0].status).toBe('SETTLED');

      const pool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(pool.rows[0].available_credits).toBe(5);
      expect(pool.rows[0].active_seats).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Personnel Registration & Seat Activation
  // ---------------------------------------------------------------------------
  describe('Flow 2: Personnel Registration & Seat Activation', () => {
    it('activates 1 seat in database and generates 30-day rolling license', async () => {
      // Activate seat for testPersonnel in database
      const actRes = await client.query(
        `SELECT workforce_staging.fn_workforce_activate_personnel_seat($1, $2) AS result;`,
        [branchId, testPersonnel.id]
      );
      const res = actRes.rows[0].result;

      expect(res.success).toBe(true);
      expect(res.personnel_id).toBe(testPersonnel.id);
      expect(res.available_credits).toBe(4);
      expect(res.active_seats).toBe(1);
      expect(res.credit_row_id).toBeDefined();

      // Construct authoritative PersonnelSeatLicense
      activeLicense = {
        licenseId: `lic_${res.credit_row_id}`,
        personnelId: testPersonnel.id,
        branchId: branchId,
        creditRowId: res.credit_row_id,
        validFrom: res.activated_at,
        validUntil: res.expires_at,
        status: 'ACTIVE',
      };

      expect(activeLicense.status).toBe('ACTIVE');
      expect(new Date(activeLicense.validUntil).getTime()).toBeGreaterThan(new Date(activeLicense.validFrom).getTime());
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Attendance Clock-in/Clock-out (Adapter & Pure Engine Integration)
  // ---------------------------------------------------------------------------
  describe('Flow 3: Field Attendance Clock-in & Clock-out', () => {
    it('successfully processes clock-in inside branch geofence with active license', async () => {
      const clockInRequest: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: branchId,
        coordinates: {
          latitude: -6.21461, // Inside 100m geofence
          longitude: 106.82142,
          accuracy: 5,
        },
        timestampUtc: new Date().toISOString(),
        evidence: {
          photoHash: 'hash_selfie_evidence_01',
          faceConfidence: 0.98,
        },
      };

      const clockInResult = await adapter.recordAttendance({
        request: clockInRequest,
        personnel: testPersonnel,
        branch: testBranch,
        entitlement: entitlement,
        license: activeLicense,
        type: 'CLOCK_IN',
      });

      expect(clockInResult.success).toBe(true);
      expect(clockInResult.type).toBe('CLOCK_IN');
      expect(clockInResult.personnelId).toBe(testPersonnel.id);

      // Verify repository recorded CLOCK_IN event
      const lastState = await attendanceRepo.getLastAttendanceState(testPersonnel.id);
      expect(lastState).toBe('CLOCK_IN');
      expect(attendanceRepo.events.length).toBe(1);
    });

    it('successfully processes clock-out 8 hours later and transitions state cleanly', async () => {
      const eightHoursLater = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

      const clockOutRequest: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: branchId,
        coordinates: {
          latitude: -6.21460, // Inside geofence
          longitude: 106.82141,
          accuracy: 4,
        },
        timestampUtc: eightHoursLater,
      };

      const clockOutResult = await adapter.recordAttendance({
        request: clockOutRequest,
        personnel: testPersonnel,
        branch: testBranch,
        entitlement: entitlement,
        license: activeLicense,
        type: 'CLOCK_OUT',
      });

      expect(clockOutResult.success).toBe(true);
      expect(clockOutResult.type).toBe('CLOCK_OUT');

      // Verify state transitioned to CLOCK_OUT
      const finalState = await attendanceRepo.getLastAttendanceState(testPersonnel.id);
      expect(finalState).toBe('CLOCK_OUT');
      expect(attendanceRepo.events.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Expiry Rejection & Financial Immutability
  // ---------------------------------------------------------------------------
  describe('Flow 4: Expiry Rejection & Financial Ledger Immutability', () => {
    it('fails-closed when personnel seat license status is EXPIRED without corrupting financial ledger', async () => {
      const expiredLicense: PersonnelSeatLicense = {
        ...activeLicense,
        status: 'EXPIRED',
      };

      const request: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: branchId,
        coordinates: { latitude: -6.2146, longitude: 106.8214 },
        timestampUtc: new Date().toISOString(),
      };

      const result = await adapter.recordAttendance({
        request,
        personnel: testPersonnel,
        branch: testBranch,
        entitlement: entitlement,
        license: expiredLicense,
        type: 'CLOCK_IN',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PERSONNEL_LICENSE_INACTIVE');
      expect(result.error).toContain('EXPIRED');

      // Financial Immutability Check: Database ledger remains intact
      const ledgerCount = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1;`,
        [branchId]
      );
      expect(Number(ledgerCount.rows[0].count)).toBe(5);

      const poolCheck = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(poolCheck.rows[0].available_credits).toBe(4);
      expect(poolCheck.rows[0].active_seats).toBe(1);
    });

    it('fails-closed when branch subscription entitlement is EXPIRED', async () => {
      const expiredEntitlement: BranchBillingEntitlement = {
        ...entitlement,
        status: 'EXPIRED',
        currentPeriodEndUtc: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        gracePeriodEndUtc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const request: WorkforceClockInRequest = {
        personnelId: testPersonnel.id,
        branchId: branchId,
        coordinates: { latitude: -6.2146, longitude: 106.8214 },
        timestampUtc: new Date().toISOString(),
      };

      const result = await adapter.recordAttendance({
        request,
        personnel: testPersonnel,
        branch: testBranch,
        entitlement: expiredEntitlement,
        license: activeLicense,
        type: 'CLOCK_IN',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SUBSCRIPTION_EXPIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Audit Trail Verification
  // ---------------------------------------------------------------------------
  describe('Flow 5: Complete Audit Trail Verification', () => {
    it('validates the complete chain of custody from purchase to attendance evidence', async () => {
      // 1. Authoritative Purchase Snapshot
      const tx = await client.query(
        `SELECT purchase_id, payment_reference, quantity, total_idr, status FROM credit_purchase_transactions WHERE payment_reference = $1;`,
        [paymentReference]
      );
      expect(tx.rows.length).toBe(1);
      expect(tx.rows[0].payment_reference).toBe(paymentReference);
      expect(tx.rows[0].quantity).toBe(5);
      expect(Number(tx.rows[0].total_idr)).toBe(166500);
      expect(tx.rows[0].status).toBe('SETTLED');

      // 2. Authoritative Pool Snapshot
      const pool = await client.query(
        `SELECT available_credits, active_seats FROM branch_credit_pools WHERE branch_id = $1;`,
        [branchId]
      );
      expect(pool.rows[0].available_credits).toBe(4);
      expect(pool.rows[0].active_seats).toBe(1);

      // 3. Authoritative Ledger Snapshot: Exactly 1 CONSUMED, 4 AVAILABLE
      const consumed = await client.query(
        `SELECT id, credit_id, consumed_by_personnel_id, status FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'CONSUMED';`,
        [branchId]
      );
      expect(consumed.rows.length).toBe(1);
      expect(consumed.rows[0].consumed_by_personnel_id).toBe(testPersonnel.id);

      const available = await client.query(
        `SELECT count(*) as count FROM seat_credit_ledger WHERE branch_id = $1 AND status = 'AVAILABLE';`,
        [branchId]
      );
      expect(Number(available.rows[0].count)).toBe(4);

      // 4. Attendance Repository Evidence
      expect(attendanceRepo.events.length).toBe(2); // 1 CLOCK_IN, 1 CLOCK_OUT
      expect(attendanceRepo.events[0].subjectId).toBe(testPersonnel.id);
      expect(attendanceRepo.events[0].type).toBe('CLOCK_IN');
      expect(attendanceRepo.events[1].subjectId).toBe(testPersonnel.id);
      expect(attendanceRepo.events[1].type).toBe('CLOCK_OUT');
    });
  });
});
