/**
 * __tests__/workforce/credit-pool-ledger.test.ts
 * BWM Post-E4 Test Suite: Credit Pool & Atomic Ledger Engine
 *
 * Validates CTO & Founder Ratified Invariants:
 * 1. packages/attendance/ zero coupling to billing/credit.
 * 2. 1 Credit = 1 Personnel License (30-day rolling window from activation).
 * 3. Minimum deposit: 5 credits (Rp 150.000 + PPN 11%).
 * 4. Dormant credits have NO 30-day expiration (remain AVAILABLE indefinitely).
 * 5. Edge-Cases:
 *    - Personnel exit before 30 days: credit non-refundable, license non-transferable.
 *    - Expired personnel: requires 1 new credit from pool to reactivate.
 *    - Chargeback: dormant credits FROZEN, zero silent debt / zero negative balance.
 *    - Concurrency: atomic branch mutex, exactly 1 activation succeeds if pool = 1.
 *    - Early renewal: consumes 1 credit, extends +30 days from previous expiration.
 */

import {
  BWM_PRICING,
  createCreditDepositQuote,
} from '@/lib/workforce/billing-contract';
import { CreditPoolService } from '@/lib/workforce/credit-pool-service';
import { WorkforceAttendanceAdapter } from '@/apps/workforce/attendance-adapter';
import { Branch, Personnel, BranchBillingEntitlement, WorkforceClockInRequest } from '@/apps/workforce/types';

describe('BWM Post-E4: Credit Pool & Atomic Ledger Specifications', () => {
  let creditService: CreditPoolService;
  const branchId = 'branch_monas_01';
  const agencyId = 'agency_satya';

  beforeEach(() => {
    creditService = new CreditPoolService();
  });

  describe('1. Minimum Deposit & Financial Quotation (CFO / Commercial)', () => {
    it('enforces minimum deposit of 5 credits (Rp 150.000 + PPN 11%)', () => {
      const quote = createCreditDepositQuote({ branchId, quantity: 5 });

      expect(quote.quantity).toBe(5);
      expect(quote.unitPriceIdr).toBe(30_000);
      expect(quote.subtotalIdr).toBe(150_000);
      expect(quote.taxRate).toBe(0.11);
      expect(quote.taxAmountIdr).toBe(16_500); // 11% of 150k
      expect(quote.totalAmountIdr).toBe(166_500); // 150k + 16.5k
      expect(quote.currency).toBe('IDR');
    });

    it('rejects deposit quantity below 5 credits with MINIMUM_DEPOSIT_NOT_MET', () => {
      expect(() => createCreditDepositQuote({ branchId, quantity: 4 })).toThrow(
        /MINIMUM_DEPOSIT_NOT_MET.*Minimum pembelian deposit adalah 5 kredit/
      );
      expect(() => createCreditDepositQuote({ branchId, quantity: 1 })).toThrow('MINIMUM_DEPOSIT_NOT_MET');
      expect(() =>
        creditService.depositCredits({
          branchId,
          quantity: 3,
          purchaseReference: 'PO-001',
          paymentReference: 'PAY-001',
        })
      ).toThrow('MINIMUM_DEPOSIT_NOT_MET');
    });

    it('scales accurately for larger deposit orders (e.g. 20 credits)', () => {
      const quote = createCreditDepositQuote({ branchId, quantity: 20 });
      expect(quote.subtotalIdr).toBe(600_000);
      expect(quote.taxAmountIdr).toBe(66_000);
      expect(quote.totalAmountIdr).toBe(666_000);
    });

    it('is idempotent on deposit with the same idempotencyKey', () => {
      const entries1 = creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-IDEMP-01',
        paymentReference: 'PAY-IDEMP-01',
        idempotencyKey: 'idemp_key_deposit_123',
      });
      expect(entries1.length).toBe(5);

      const entries2 = creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-IDEMP-01',
        paymentReference: 'PAY-IDEMP-01',
        idempotencyKey: 'idemp_key_deposit_123',
      });

      // Does not create 5 more credits
      expect(entries2.length).toBe(5);
      const state = creditService.getBranchSeatState(branchId);
      expect(state.available_credits).toBe(5);
    });

    it('binds paymentReference as authoritative banking idempotency key even without client idempotencyKey', () => {
      const entriesA = creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-BANK-REF-01',
        paymentReference: 'XND-INV-9908123', // Authoritative Gateway Reference
      });
      expect(entriesA.length).toBe(5);

      // Webhook retry with the same paymentReference
      const entriesB = creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-BANK-REF-01',
        paymentReference: 'XND-INV-9908123',
      });

      // Exactly 5 credits in pool, duplicate webhook dropped safely
      expect(entriesB.length).toBe(5);
      const state = creditService.getBranchSeatState(branchId);
      expect(state.available_credits).toBe(5);
    });
  });

  describe('2. Dormant Credits Non-Expiry & Pool Invariants', () => {
    it('dormant (AVAILABLE) credits have NO 30-day expiration and remain available indefinitely', () => {
      creditService.depositCredits({
        branchId,
        quantity: 10,
        purchaseReference: 'PO-DORMANT-01',
        paymentReference: 'PAY-DORMANT-01',
      });

      // Evaluate 60 days later
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const state = creditService.getBranchSeatState(branchId, futureDate);

      expect(state.available_credits).toBe(10);
      expect(state.active_seats).toBe(0);
    });
  });

  describe('3. Seat Activation & 30-Day Rolling Window', () => {
    it('consumes 1 credit atomically and activates a personnel license for exactly 30 days', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-ACT-01',
        paymentReference: 'PAY-ACT-01',
      });

      const activationDate = new Date('2026-11-01T08:00:00Z').toISOString();
      const result = await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_joko_01',
        referenceTimeUtc: activationDate,
      });

      expect(result.license.status).toBe('ACTIVE');
      expect(result.license.personnelId).toBe('guard_joko_01');
      expect(result.license.activatedAt).toBe(activationDate);

      // Verify exact 30-day rolling expiration
      const expectedEnd = new Date(new Date(activationDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(result.license.expiresAt).toBe(expectedEnd);

      // Verify consumed credit record
      expect(result.consumedCredit.status).toBe('CONSUMED');
      expect(result.consumedCredit.consumed_by_personnel_id).toBe('guard_joko_01');
      expect(result.consumedCredit.consumed_at).toBe(activationDate);

      // Verify pool state: 4 available, 1 active seat
      const state = creditService.getBranchSeatState(branchId, activationDate);
      expect(state.available_credits).toBe(4);
      expect(state.active_seats).toBe(1);
    });

    it('rejects double-activation for personnel with already active license', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-ACT-02',
        paymentReference: 'PAY-ACT-02',
      });

      await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_budi_01',
      });

      await expect(
        creditService.activatePersonnelSeat({
          branchId,
          personnelId: 'guard_budi_01',
        })
      ).rejects.toThrow(/PERSONNEL_ALREADY_ACTIVE/);
    });

    it('rejects activation when branch has 0 available credits', async () => {
      await expect(
        creditService.activatePersonnelSeat({
          branchId: 'empty_branch',
          personnelId: 'guard_agus_01',
        })
      ).rejects.toThrow(/INSUFFICIENT_CREDITS.*0 available credits/);
    });
  });

  describe('4. Edge-Case 1: Personnel Exits Before 30 Days (Non-Refundable & Non-Transferable)', () => {
    it('terminates license immediately without refunding credit or moving quota automatically', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-EXIT-01',
        paymentReference: 'PAY-EXIT-01',
      });

      const actDate = new Date('2026-11-01T08:00:00Z').toISOString();
      const { license, consumedCredit } = await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_exit_01',
        referenceTimeUtc: actDate,
      });

      // Guard exits at day 10
      const termResult = creditService.terminatePersonnelSeat({
        branchId,
        personnelId: 'guard_exit_01',
        reason: 'Resigned voluntarily at day 10',
      });

      expect(termResult.success).toBe(true);
      expect(termResult.license.status).toBe('TERMINATED');

      // Invariant Check 1: Consumed credit remains CONSUMED (NOT reverted to AVAILABLE)
      const ledgerEntry = creditService.getLedgerEntries(branchId).find((e) => e.credit_id === consumedCredit.credit_id);
      expect(ledgerEntry?.status).toBe('CONSUMED');

      // Invariant Check 2: Available credits remain 4 (no refund), active seats drop to 0
      const state = creditService.getBranchSeatState(branchId, '2026-11-10T08:00:00Z');
      expect(state.available_credits).toBe(4);
      expect(state.active_seats).toBe(0);

      // Invariant Check 3: A new personnel must consume a NEW credit
      await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_replacement_01',
        referenceTimeUtc: '2026-11-10T08:00:00Z',
      });

      const updatedState = creditService.getBranchSeatState(branchId, '2026-11-10T08:00:00Z');
      expect(updatedState.available_credits).toBe(3); // dropped to 3
      expect(updatedState.active_seats).toBe(1);
    });
  });

  describe('5. Edge-Case 2: Expired Personnel Re-Activation', () => {
    it('evaluates past-30-day personnel as EXPIRED and requires a new credit for re-activation', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-EXP-01',
        paymentReference: 'PAY-EXP-01',
      });

      const startDate = new Date('2026-11-01T00:00:00Z').toISOString();
      await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_rehire_01',
        referenceTimeUtc: startDate,
      });

      // Day 31: License is expired
      const day31Date = new Date('2026-12-02T00:00:00Z').toISOString();
      const stateDay31 = creditService.getBranchSeatState(branchId, day31Date);
      expect(stateDay31.active_seats).toBe(0);
      expect(creditService.getPersonnelLicense('guard_rehire_01')?.status).toBe('EXPIRED');

      // Re-activate guard consumes 1 more credit
      const reActivation = await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_rehire_01',
        referenceTimeUtc: day31Date,
      });

      expect(reActivation.license.status).toBe('ACTIVE');
      expect(reActivation.license.activatedAt).toBe(day31Date);

      const stateAfterRehire = creditService.getBranchSeatState(branchId, day31Date);
      expect(stateAfterRehire.available_credits).toBe(3); // 5 - 1 - 1 = 3
      expect(stateAfterRehire.active_seats).toBe(1);
    });
  });

  describe('6. Edge-Case 3: Payment Chargeback (Freeze Dormant, Zero Silent Debt)', () => {
    it('freezes dormant AVAILABLE credits upon chargeback without creating debt for already consumed seats', async () => {
      // Branch purchases 5 credits
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-CHARGEBACK-99',
        paymentReference: 'PAY-CB-99',
      });

      // Branch consumes 2 credits
      await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_a',
      });
      await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_b',
      });

      expect(creditService.getBranchSeatState(branchId).available_credits).toBe(3);
      expect(creditService.getBranchSeatState(branchId).active_seats).toBe(2);

      // Payment chargeback occurs on PO-CHARGEBACK-99
      const cbResult = creditService.processChargeback({
        purchaseReference: 'PO-CHARGEBACK-99',
        reason: 'Credit card unauthorized transaction dispute',
      });

      // Exactly 3 dormant credits are FROZEN
      expect(cbResult.frozenCount).toBe(3);
      expect(cbResult.affectedCredits.every((c) => c.status === 'FROZEN')).toBe(true);

      // Invariant: Pool now has 0 available credits (frozen credits cannot be used)
      const postCbState = creditService.getBranchSeatState(branchId);
      expect(postCbState.available_credits).toBe(0);

      // Invariant: Zero silent debt. Balance does NOT become negative (-2).
      // Available credits is exactly 0, not negative!
      expect(postCbState.available_credits).toBeGreaterThanOrEqual(0);

      // Subsequent activation fails cleanly because frozen credits are not AVAILABLE
      await expect(
        creditService.activatePersonnelSeat({
          branchId,
          personnelId: 'guard_c',
        })
      ).rejects.toThrow(/INSUFFICIENT_CREDITS/);
    });

    it('is idempotent on duplicate chargeback notifications for the same paymentReference', () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-CB-IDEMP-01',
        paymentReference: 'PAY-CB-IDEMP-01',
      });

      const cb1 = creditService.processChargeback({
        paymentReference: 'PAY-CB-IDEMP-01',
        chargebackReference: 'DISPUTE-9901',
        reason: 'Duplicate billing claim',
      });
      expect(cb1.frozenCount).toBe(5);
      expect(cb1.alreadyProcessed).toBe(false);

      // Duplicate webhook delivery
      const cb2 = creditService.processChargeback({
        paymentReference: 'PAY-CB-IDEMP-01',
        chargebackReference: 'DISPUTE-9901',
        reason: 'Duplicate billing claim',
      });
      expect(cb2.alreadyProcessed).toBe(true);
      expect(cb2.frozenCount).toBe(5);
      expect(creditService.getBranchSeatState(branchId).available_credits).toBe(0);
    });
  });

  describe('7. Edge-Case 4: Concurrency & Atomic Mutex Lock', () => {
    it('guarantees exactly 1 successful activation when pool has only 1 available credit under race conditions', async () => {
      // Deposit exactly 5 credits
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-RACE-01',
        paymentReference: 'PAY-RACE-01',
      });

      // Consume 4 credits
      for (let i = 1; i <= 4; i++) {
        await creditService.activatePersonnelSeat({
          branchId,
          personnelId: `guard_pre_${i}`,
        });
      }

      // Exactly 1 credit remaining in pool
      expect(creditService.getBranchSeatState(branchId).available_credits).toBe(1);

      // 2 concurrent activation requests triggered simultaneously via Promise.allSettled
      const concurrentRequests = [
        creditService.activatePersonnelSeat({ branchId, personnelId: 'guard_concurrent_ALPHA' }),
        creditService.activatePersonnelSeat({ branchId, personnelId: 'guard_concurrent_BETA' }),
      ];

      const results = await Promise.allSettled(concurrentRequests);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Atomic lock guarantee: Exactly 1 succeeds, exactly 1 fails
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Rejection reason is strictly INSUFFICIENT_CREDITS
      if (rejected[0].status === 'rejected') {
        expect(rejected[0].reason.message).toContain('INSUFFICIENT_CREDITS');
      }

      // Pool state is exactly 0 available, 5 active seats
      const finalState = creditService.getBranchSeatState(branchId);
      expect(finalState.available_credits).toBe(0);
      expect(finalState.active_seats).toBe(5);
    });

    it('handles heavy concurrent burst (10 simultaneous activations for 5 credits)', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-BURST-01',
        paymentReference: 'PAY-BURST-01',
      });

      const burstRequests = Array.from({ length: 10 }).map((_, idx) =>
        creditService.activatePersonnelSeat({
          branchId,
          personnelId: `guard_burst_${idx + 1}`,
        })
      );

      const results = await Promise.allSettled(burstRequests);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(5);
      expect(failed.length).toBe(5);

      const finalState = creditService.getBranchSeatState(branchId);
      expect(finalState.available_credits).toBe(0);
      expect(finalState.active_seats).toBe(5);
    });
  });

  describe('8. Edge-Case 5: Early Renewal (+30 Days from Previous Expiry)', () => {
    it('extends expiration +30 days from previous expiration date, preserving remaining days', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-RENEW-01',
        paymentReference: 'PAY-RENEW-01',
      });

      const day1 = new Date('2026-11-01T00:00:00Z').toISOString();
      const initial = await creditService.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_early_renew',
        referenceTimeUtc: day1,
      });

      const initialExpiry = new Date(initial.license.expiresAt);
      expect(initialExpiry.toISOString()).toBe('2026-12-01T00:00:00.000Z');

      // Personnel renews early at Day 25 (5 days before expiration)
      const day25 = new Date('2026-11-25T00:00:00Z').toISOString();
      const renewal = await creditService.earlyRenewPersonnelSeat({
        branchId,
        personnelId: 'guard_early_renew',
        referenceTimeUtc: day25,
      });

      // New expiration must be December 1 + 30 days = December 31, NOT November 25 + 30 days (December 25)!
      const expectedNewExpiry = new Date('2026-12-31T00:00:00.000Z').toISOString();
      expect(renewal.license.expiresAt).toBe(expectedNewExpiry);
      expect(renewal.license.earlyRenewedAt).toBe(day25);

      // Verify pool deducted 1 credit for renewal
      const state = creditService.getBranchSeatState(branchId, day25);
      expect(state.available_credits).toBe(3); // 5 - 1 (init) - 1 (renew) = 3
      expect(state.active_seats).toBe(1);
    });

    it('rejects early renewal if personnel has no active license', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-RENEW-ERR',
        paymentReference: 'PAY-RENEW-ERR',
      });

      await expect(
        creditService.earlyRenewPersonnelSeat({
          branchId,
          personnelId: 'non_existent_guard',
        })
      ).rejects.toThrow('NO_ACTIVE_LICENSE');
    });
  });

  describe('9. Attendance Adapter Licensing Guardrail Integration', () => {
    const branch: Branch = {
      id: branchId,
      orgId: 'org_indorama',
      agencyId,
      code: 'MONAS-01',
      name: 'Monas Sector 1',
      status: 'ACTIVE',
      geofence: {
        center: { latitude: -6.175392, longitude: 106.827153 },
        radiusMeters: 200,
      },
    };

    const personnel: Personnel = {
      id: 'guard_licensed_01',
      branchId,
      orgId: 'org_indorama',
      agencyId,
      nik: 'NIK-99001',
      fullName: 'Slamet Riyadi',
      role: 'FIELD_PERSONNEL',
      status: 'ACTIVE',
    };

    const entitlement: BranchBillingEntitlement = {
      branchId,
      status: 'ACTIVE',
      currentPeriodStartUtc: '2026-11-01T00:00:00Z',
      currentPeriodEndUtc: '2026-12-01T00:00:00Z',
      gracePeriodEndUtc: '2026-12-04T00:00:00Z',
      isActivationPaid: true,
      activeHeadcount: 5,
    };

    const baseRequest: WorkforceClockInRequest = {
      personnelId: personnel.id,
      branchId,
      coordinates: { latitude: -6.175392, longitude: 106.827153 }, // Within geofence
      timestampUtc: '2026-11-05T08:00:00Z',
    };

    it('allows clock-in for personnel with ACTIVE seat license', async () => {
      creditService.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-ATT-01',
        paymentReference: 'PAY-ATT-01',
      });

      const { license } = await creditService.activatePersonnelSeat({
        branchId,
        personnelId: personnel.id,
        referenceTimeUtc: baseRequest.timestampUtc,
      });

      const adapter = new WorkforceAttendanceAdapter();
      const response = await adapter.recordAttendance({
        request: baseRequest,
        personnel,
        branch,
        entitlement,
        license,
      });

      expect(response.success).toBe(true);
      expect(response.type).toBe('CLOCK_IN');
    });

    it('rejects clock-in when personnel seat license is EXPIRED or TERMINATED', async () => {
      const adapter = new WorkforceAttendanceAdapter();

      // Test EXPIRED license
      const expiredLicense = {
        licenseId: 'lic_exp',
        personnelId: personnel.id,
        branchId,
        creditId: 'cred_old',
        activatedAt: '2026-10-01T00:00:00Z',
        expiresAt: '2026-10-31T00:00:00Z',
        status: 'EXPIRED' as const,
      };

      const responseExpired = await adapter.recordAttendance({
        request: baseRequest,
        personnel,
        branch,
        entitlement,
        license: expiredLicense,
      });

      expect(responseExpired.success).toBe(false);
      expect(responseExpired.errorCode).toBe('PERSONNEL_LICENSE_INACTIVE');
      expect(responseExpired.error).toContain('EXPIRED');

      // Test TERMINATED license
      const terminatedLicense = {
        ...expiredLicense,
        status: 'TERMINATED' as const,
      };

      const responseTerminated = await adapter.recordAttendance({
        request: baseRequest,
        personnel,
        branch,
        entitlement,
        license: terminatedLicense,
      });

      expect(responseTerminated.success).toBe(false);
      expect(responseTerminated.errorCode).toBe('PERSONNEL_LICENSE_INACTIVE');
      expect(responseTerminated.error).toContain('TERMINATED');
    });
  });
});

