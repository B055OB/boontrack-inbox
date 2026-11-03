/**
 * __tests__/workforce/e5-persistence-hardening.test.ts
 * BWM Gate E5 — Database Persistence Hardening & Concurrency Test Suite
 *
 * Verifies:
 * 1. Idempotency & Concurrent Webhooks: 10 concurrent deposits with identical payment_reference.
 * 2. Concurrency & Atomicity: 7-step activation with mutex lock and mid-transaction rollback.
 * 3. Ledger Immutability Enforcement: Fail-closed rejection of direct UPDATE/DELETE operations.
 * 4. Multi-Tenant RLS & Boundary Enforcement: Cross-agency access denied with TENANT_ISOLATION_BREACH.
 * 5. Chargeback / Dispute Hardening: Dormant credits frozen, parent transaction DISPUTED, zero silent debt.
 */

import { CreditPoolService } from '@/lib/workforce/credit-pool-service';
import { BWM_PRICING } from '@/lib/workforce/billing-contract';

describe('BWM Gate E5: Database Persistence Hardening & Concurrency Suite', () => {
  let service: CreditPoolService;
  const branchId = 'branch_security_hq';
  const agencyId = 'agency_satya_bwm';

  beforeEach(() => {
    service = new CreditPoolService();
  });

  describe('1. Idempotency & Concurrent Webhooks (Authoritative Payment Reference)', () => {
    it('handles 10 concurrent webhook deposits with the same payment_reference without credit inflation', async () => {
      const paymentReference = 'PAY-GATEWAY-IDEMP-99998';
      const purchaseReference = 'PO-2026-CONCURRENT-001';
      const quantity = 10;

      // Simulate 10 concurrent webhook deliveries arriving simultaneously
      const depositPromises = Array.from({ length: 10 }, async (_, index) => {
        return service.depositCredits({
          branchId,
          agencyId,
          quantity,
          purchaseReference,
          paymentReference,
          purchaseId: 'purch_fixed_uuid_001',
          idempotencyKey: `webhook_call_${index}`,
        });
      });

      const results = await Promise.all(depositPromises);

      // Verify all 10 calls returned the identical 10 ledger entries
      expect(results.length).toBe(10);
      for (let i = 0; i < results.length; i++) {
        expect(results[i].length).toBe(quantity);
        expect(results[i][0].payment_reference).toBe(paymentReference);
      }

      // Authoritative State Check: Pool must contain EXACTLY 10 available credits (not 100)
      const seatState = service.getBranchSeatState(branchId);
      expect(seatState.available_credits).toBe(10);
      expect(seatState.active_seats).toBe(0);

      // Authoritative Transaction Check: Exactly 1 parent purchase transaction recorded
      const purchaseTxs = service.getPurchaseTransactions(branchId);
      expect(purchaseTxs.length).toBe(1);
      expect(purchaseTxs[0].payment_reference).toBe(paymentReference);
      expect(purchaseTxs[0].quantity).toBe(10);
      expect(purchaseTxs[0].total_idr).toBe(333000); // 10 * 30000 + 11% PPN
      expect(purchaseTxs[0].status).toBe('SETTLED');

      // Authoritative Ledger Check: Exactly 10 ledger entries in database
      const ledgerEntries = service.getLedgerEntries(branchId);
      expect(ledgerEntries.length).toBe(10);
      expect(ledgerEntries.every((e) => e.status === 'AVAILABLE')).toBe(true);
    });

    it('rejects deposit if minimum quantity is less than 5', () => {
      expect(() => {
        service.depositCredits({
          branchId,
          agencyId,
          quantity: 4,
          purchaseReference: 'PO-FAIL',
          paymentReference: 'PAY-FAIL',
        });
      }).toThrow('MINIMUM_DEPOSIT_NOT_MET: Minimum pembelian deposit adalah 5 kredit');
    });
  });

  describe('2. Concurrency & Atomicity: 7-Step Activation & Rollback Safety', () => {
    beforeEach(() => {
      // Seed pool with 5 credits
      service.depositCredits({
        branchId,
        agencyId,
        quantity: 5,
        purchaseReference: 'PO-SEED-01',
        paymentReference: 'PAY-SEED-01',
      });
    });

    it('rolls back completely if a failure occurs at mid-transaction (Step 5)', async () => {
      const initialPool = service.getBranchSeatState(branchId);
      expect(initialPool.available_credits).toBe(5);

      // Attempt activation with simulated failure at Step 5
      await expect(
        service.activatePersonnelSeat({
          branchId,
          personnelId: 'guard_fail_midway',
          agencyId,
          simulateFailureStep: 5,
        })
      ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE_AT_STEP_5');

      // Verify 100% Rollback: Pool balance is untouched
      const rolledBackPool = service.getBranchSeatState(branchId);
      expect(rolledBackPool.available_credits).toBe(5);
      expect(rolledBackPool.active_seats).toBe(0);

      // Verify no orphaned license was issued
      const license = service.getPersonnelLicense('guard_fail_midway');
      expect(license).toBeUndefined();

      // Verify all 5 ledger entries remain AVAILABLE
      const ledger = service.getLedgerEntries(branchId);
      expect(ledger.filter((e) => e.status === 'AVAILABLE').length).toBe(5);
    });

    it('handles race condition when pool has fewer credits than concurrent activation requests', async () => {
      // 5 available credits in pool, 7 concurrent activation requests
      const candidateGuardIds = [
        'guard_conc_1',
        'guard_conc_2',
        'guard_conc_3',
        'guard_conc_4',
        'guard_conc_5',
        'guard_conc_6',
        'guard_conc_7',
      ];

      const activationPromises = candidateGuardIds.map((guardId) =>
        service.activatePersonnelSeat({
          branchId,
          personnelId: guardId,
          agencyId,
        })
      );

      const settled = await Promise.allSettled(activationPromises);

      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      // Exactly 5 activations must succeed
      expect(fulfilled.length).toBe(5);
      // Exactly 2 activations must fail closed
      expect(rejected.length).toBe(2);

      // Verify rejection error message
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('INSUFFICIENT_CREDITS');
        }
      }

      // Final pool state must be exactly 0 available credits and 5 active seats
      const finalState = service.getBranchSeatState(branchId);
      expect(finalState.available_credits).toBe(0);
      expect(finalState.active_seats).toBe(5);
    });

    it('prevents double activation of an already active personnel', async () => {
      await service.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_double_check',
        agencyId,
      });

      await expect(
        service.activatePersonnelSeat({
          branchId,
          personnelId: 'guard_double_check',
          agencyId,
        })
      ).rejects.toThrow('PERSONNEL_ALREADY_ACTIVE');
    });
  });

  describe('3. Ledger Immutability Enforcement (Fail-Closed Database Simulation)', () => {
    let creditId: string;

    beforeEach(() => {
      const entries = service.depositCredits({
        branchId,
        agencyId,
        quantity: 5,
        purchaseReference: 'PO-IMMUTABLE-01',
        paymentReference: 'PAY-IMMUTABLE-01',
      });
      creditId = entries[0].credit_id;
    });

    it('rejects direct DELETE operations on seat_credit_ledger fail-closed', () => {
      expect(() => {
        service.mutateLedgerEntryDirectly(creditId, 'DELETE');
      }).toThrow('LEDGER_IMMUTABILITY_VIOLATION: DELETE on seat_credit_ledger is strictly prohibited.');
    });

    it('rejects direct UPDATE on already CONSUMED credit rows', async () => {
      // Consume the credit
      await service.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_consumed_immutability',
        agencyId,
      });

      // Attempt to modify the consumed row directly
      expect(() => {
        service.mutateLedgerEntryDirectly(creditId, 'UPDATE', 'AVAILABLE');
      }).toThrow('LEDGER_IMMUTABILITY_VIOLATION: Credit row');
    });

    it('rejects direct UPDATE with invalid target status', () => {
      expect(() => {
        service.mutateLedgerEntryDirectly(creditId, 'UPDATE', 'INVALID_STATUS' as any);
      }).toThrow("LEDGER_IMMUTABILITY_VIOLATION: Invalid target status 'INVALID_STATUS'");
    });
  });

  describe('4. Multi-Tenant RLS & Security Boundary Enforcement', () => {
    beforeEach(() => {
      service.depositCredits({
        branchId,
        agencyId: 'agency_satya_corp',
        quantity: 5,
        purchaseReference: 'PO-TENANT-01',
        paymentReference: 'PAY-TENANT-01',
      });
    });

    it('denies activation when caller agencyId does not match credit agencyId (Fail-Closed RLS)', async () => {
      await expect(
        service.activatePersonnelSeat({
          branchId,
          personnelId: 'guard_cross_tenant_intruder',
          agencyId: 'agency_competitor_corp', // Mismatching agency
        })
      ).rejects.toThrow(
        "TENANT_ISOLATION_BREACH: Caller agency 'agency_competitor_corp' does not match credit agency 'agency_satya_corp'"
      );

      // Verify that pool was NOT touched by unauthorized agency
      const pool = service.getBranchSeatState(branchId);
      expect(pool.available_credits).toBe(5);
      expect(pool.active_seats).toBe(0);
    });
  });

  describe('5. Chargeback / Dispute Hardening & Non-Penalization of Active Seats', () => {
    const payRef = 'PAY-DISPUTE-999';

    beforeEach(async () => {
      service.depositCredits({
        branchId,
        agencyId,
        quantity: 6,
        purchaseReference: 'PO-DISPUTE-01',
        paymentReference: payRef,
      });

      // Activate 2 guards (consuming 2 credits), leaving 4 dormant (AVAILABLE)
      await service.activatePersonnelSeat({ branchId, personnelId: 'guard_active_1', agencyId });
      await service.activatePersonnelSeat({ branchId, personnelId: 'guard_active_2', agencyId });
    });

    it('freezes dormant credits, marks purchase DISPUTED, and protects active seats without negative debt', () => {
      const initialPool = service.getBranchSeatState(branchId);
      expect(initialPool.available_credits).toBe(4);
      expect(initialPool.active_seats).toBe(2);

      // Process chargeback
      const cbResult = service.processChargeback({
        paymentReference: payRef,
        chargebackReference: 'CB-STRIPE-001',
        reason: 'Bank chargeback fraud claim',
      });

      expect(cbResult.frozenCount).toBe(4);
      expect(cbResult.affectedCredits.length).toBe(4);
      expect(cbResult.affectedCredits.every((c) => c.status === 'FROZEN')).toBe(true);

      // Post-chargeback pool check
      const postPool = service.getBranchSeatState(branchId);
      // Available credits drop from 4 to 0 (all dormant credits frozen)
      expect(postPool.available_credits).toBe(0);
      // Active seats remain ACTIVE (2 guards are NOT interrupted mid-month, no negative debt)
      expect(postPool.active_seats).toBe(2);

      // Parent purchase transaction status must be DISPUTED
      const purchaseTx = service.getPurchaseTransactionByPaymentRef(payRef);
      expect(purchaseTx?.status).toBe('DISPUTED');

      // Second chargeback webhook must be idempotent
      const replayResult = service.processChargeback({
        paymentReference: payRef,
        chargebackReference: 'CB-STRIPE-001',
      });
      expect(replayResult.alreadyProcessed).toBe(true);
      expect(replayResult.frozenCount).toBe(4);
    });
  });
});

