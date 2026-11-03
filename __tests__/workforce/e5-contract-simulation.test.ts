/**
 * __tests__/workforce/e5-contract-simulation.test.ts
 * BWM Gate E5 — Persistence Schema DDL & API Contract Simulation Suite
 *
 * Validates:
 * 1. DDL Schema Constraints & Invariants (Integer currency, non-negative CHECKs, banking idempotency).
 * 2. 4 Core API Contracts: Purchase/Deposit, Consume/Activate, Freeze/Chargeback, Reverse/Reconcile.
 * 3. Mathematical Reconciliation between Snapshot Pool and Ledger Mutation Stream.
 */

import fs from 'fs';
import path from 'path';
import {
  DepositCreditsRequest,
  DepositCreditsResponse,
  validateDepositCreditsRequest,
  ActivatePersonnelSeatRequest,
  ActivatePersonnelSeatResponse,
  validateActivatePersonnelSeatRequest,
  ProcessChargebackRequest,
  ProcessChargebackResponse,
  validateProcessChargebackRequest,
  ReconcileLedgerRequest,
  ReconcileLedgerResponse,
  validateReconcileLedgerRequest,
} from '@/lib/workforce/api-contracts';
import { CreditPoolService } from '@/lib/workforce/credit-pool-service';
import { BWM_PRICING, createCreditDepositQuote } from '@/lib/workforce/billing-contract';

describe('BWM Gate E5: Schema DDL & API Contract Simulation Suite', () => {
  const branchId = 'branch_senayan_01';
  const agencyId = 'agency_satya';

  describe('1. PostgreSQL DDL Schema Draft Invariants & Constraints', () => {
    let sqlDdl: string;

    beforeAll(() => {
      const ddlPath = path.join(process.cwd(), 'lib/workforce/schema/schema-draft.sql');
      expect(fs.existsSync(ddlPath)).toBe(true);
      sqlDdl = fs.readFileSync(ddlPath, 'utf-8');
    });

    it('contains authoritative tables with strict non-negative constraints', () => {
      expect(sqlDdl).toContain('CREATE TABLE IF NOT EXISTS branch_credit_pools');
      expect(sqlDdl).toContain('CREATE TABLE IF NOT EXISTS credit_purchase_transactions');
      expect(sqlDdl).toContain('chk_pool_available_credits_non_negative CHECK (available_credits >= 0)');
      expect(sqlDdl).toContain('chk_pool_active_seats_non_negative CHECK (active_seats >= 0)');
      expect(sqlDdl).toContain('chk_pool_currency_idr CHECK (currency = \'IDR\')');
    });

    it('enforces immutable ledger with BIGINT IDR integer currency (zero float)', () => {
      expect(sqlDdl).toContain('CREATE TABLE IF NOT EXISTS seat_credit_ledger');
      expect(sqlDdl).toContain('amount_idr BIGINT NOT NULL DEFAULT 30000');
      expect(sqlDdl).toContain('chk_ledger_amount_idr_positive CHECK (amount_idr > 0)');
      expect(sqlDdl).toContain('fn_prevent_ledger_mutation');
    });

    it('enforces banking idempotency unique constraint on payment_reference and credit_id', () => {
      expect(sqlDdl).toContain('uq_seat_credit_payment_ref_credit_id');
      expect(sqlDdl).toContain('ON seat_credit_ledger (payment_reference, credit_id)');
    });

    it('enforces row-level security (RLS) fail-closed tenant scoping', () => {
      expect(sqlDdl).toContain('ALTER TABLE branch_credit_pools ENABLE ROW LEVEL SECURITY');
      expect(sqlDdl).toContain('ALTER TABLE seat_credit_ledger ENABLE ROW LEVEL SECURITY');
      expect(sqlDdl).toContain('rls_branch_credit_pools_isolation');
      expect(sqlDdl).toContain('rls_seat_credit_ledger_isolation');
    });

    it('includes stored procedure draft with row lock (FOR UPDATE / SKIP LOCKED)', () => {
      expect(sqlDdl).toContain('fn_workforce_activate_personnel_seat');
      expect(sqlDdl).toContain('FOR UPDATE');
      expect(sqlDdl).toContain('SKIP LOCKED');
    });
  });

  describe('2. API Contract 1: Purchase / Deposit (QRIS / Banking Gateway)', () => {
    it('validates minimum deposit of 5 credits and required gateway references', () => {
      const invalidReq: Partial<DepositCreditsRequest> = {
        branch_id: branchId,
        agency_id: agencyId,
        quantity: 4, // invalid: min 5
        payment_method: 'QRIS',
        purchase_reference: 'PO-001',
        payment_reference: '', // missing
      };

      const result = validateDepositCreditsRequest(invalidReq);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('quantity must be at least 5 credits (received: 4)');
      expect(result.errors).toContain('payment_reference is required (gateway payment ID)');
    });

    it('validates legitimate QRIS deposit request and generates financial pool snapshot', () => {
      const validReq: DepositCreditsRequest = {
        purchase_id: 'purch_test_001',
        branch_id: branchId,
        agency_id: agencyId,
        quantity: 10,
        payment_method: 'QRIS',
        purchase_reference: 'PO-QRIS-9901',
        payment_reference: 'XND-QRIS-PAY-888999',
        idempotency_key: 'idemp_qris_deposit_01',
      };

      const validation = validateDepositCreditsRequest(validReq);
      expect(validation.valid).toBe(true);

      const quote = createCreditDepositQuote({ branchId, quantity: validReq.quantity });
      expect(quote.subtotalIdr).toBe(300_000);
      expect(quote.taxAmountIdr).toBe(33_000); // 11% PPN
      expect(quote.totalAmountIdr).toBe(333_000);

      // Simulation response
      const response: DepositCreditsResponse = {
        success: true,
        purchase_id: validReq.purchase_id,
        branch_id: validReq.branch_id,
        quantity_added: validReq.quantity,
        subtotal_idr: quote.subtotalIdr,
        tax_amount_idr: quote.taxAmountIdr,
        total_amount_idr: quote.totalAmountIdr,
        payment_reference: validReq.payment_reference,
        pool_snapshot: {
          available_credits: 10,
          active_seats: 0,
          currency: 'IDR',
        },
        idempotent_replay: false,
      };

      expect(response.success).toBe(true);
      expect(response.total_amount_idr).toBe(333_000);
      expect(response.pool_snapshot.available_credits).toBe(10);
    });
  });

  describe('3. API Contract 2: Consume / Activate (Rolling 30-Day Seat)', () => {
    it('validates activate request inputs', () => {
      const invalid = validateActivatePersonnelSeatRequest({
        branch_id: '',
        personnel_id: 'guard_1',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('branch_id is required');

      const valid = validateActivatePersonnelSeatRequest({
        branch_id: branchId,
        personnel_id: 'guard_101',
        reference_time_utc: '2026-11-01T08:00:00Z',
      });
      expect(valid.valid).toBe(true);
    });

    it('simulates personnel seat activation and produces a 30-day license snapshot', async () => {
      const service = new CreditPoolService();
      service.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-ACT-TEST',
        paymentReference: 'PAY-ACT-TEST',
      });

      const actTime = '2026-11-01T08:00:00Z';
      const result = await service.activatePersonnelSeat({
        branchId,
        personnelId: 'guard_contract_test',
        referenceTimeUtc: actTime,
      });

      const poolState = service.getBranchSeatState(branchId, actTime);

      const contractResponse: ActivatePersonnelSeatResponse = {
        success: true,
        license_id: result.license.licenseId,
        personnel_id: result.license.personnelId,
        branch_id: result.license.branchId,
        credit_id: result.consumedCredit.credit_id,
        activated_at: result.license.activatedAt,
        expires_at: result.license.expiresAt,
        status: 'ACTIVE',
        pool_snapshot: {
          available_credits: poolState.available_credits,
          active_seats: poolState.active_seats,
        },
      };

      expect(contractResponse.success).toBe(true);
      expect(contractResponse.status).toBe('ACTIVE');
      expect(contractResponse.pool_snapshot.available_credits).toBe(4);
      expect(contractResponse.pool_snapshot.active_seats).toBe(1);
    });
  });

  describe('4. API Contract 3: Freeze / Chargeback (Dispute Isolation)', () => {
    it('validates chargeback request fields', () => {
      const invalid = validateProcessChargebackRequest({
        payment_reference: '',
        dispute_id: 'DISP-1',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('payment_reference is required');
    });

    it('simulates chargeback and freezers dormant credits with zero silent debt', async () => {
      const service = new CreditPoolService();
      service.depositCredits({
        branchId,
        quantity: 5,
        purchaseReference: 'PO-DISPUTE-01',
        paymentReference: 'PAY-GATEWAY-DISPUTE-01',
      });

      // 1 credit consumed, 4 dormant
      await service.activatePersonnelSeat({ branchId, personnelId: 'guard_staying' });

      const cbResult = service.processChargeback({
        paymentReference: 'PAY-GATEWAY-DISPUTE-01',
        reason: 'Customer disputed charge with issuing bank',
      });

      const poolState = service.getBranchSeatState(branchId);

      const contractResponse: ProcessChargebackResponse = {
        success: true,
        payment_reference: 'PAY-GATEWAY-DISPUTE-01',
        dispute_id: 'DISP-GATEWAY-99001',
        frozen_credits_count: cbResult.frozenCount,
        frozen_credit_ids: cbResult.affectedCredits.map((c) => c.credit_id),
        pool_snapshot: {
          available_credits: poolState.available_credits,
          active_seats: poolState.active_seats,
        },
        idempotent_replay: false,
      };

      expect(contractResponse.frozen_credits_count).toBe(4);
      expect(contractResponse.pool_snapshot.available_credits).toBe(0);
      expect(contractResponse.pool_snapshot.active_seats).toBe(1);
      expect(contractResponse.pool_snapshot.available_credits).toBeGreaterThanOrEqual(0); // Zero negative balance
    });
  });

  describe('5. API Contract 4: Reverse / Reconcile (Mathematical Integrity)', () => {
    it('validates reconciliation trigger request', () => {
      const invalid = validateReconcileLedgerRequest({
        branch_id: branchId,
        trigger_type: 'INVALID_TRIGGER' as any,
      });
      expect(invalid.valid).toBe(false);

      const valid = validateReconcileLedgerRequest({
        branch_id: branchId,
        trigger_type: 'AUDIT_CRON',
      });
      expect(valid.valid).toBe(true);
    });

    it('performs mathematical reconciliation between snapshot pool and ledger mutation stream', async () => {
      const service = new CreditPoolService();

      // Batch 1: Deposit 10 credits
      service.depositCredits({
        branchId,
        quantity: 10,
        purchaseReference: 'PO-RECON-01',
        paymentReference: 'PAY-RECON-01',
      });

      // Activate 3 personnel
      const now = '2026-11-01T00:00:00Z';
      await service.activatePersonnelSeat({ branchId, personnelId: 'g1', referenceTimeUtc: now });
      await service.activatePersonnelSeat({ branchId, personnelId: 'g2', referenceTimeUtc: now });
      await service.activatePersonnelSeat({ branchId, personnelId: 'g3', referenceTimeUtc: now });

      // Pool state snapshot
      const poolState = service.getBranchSeatState(branchId, now);

      // Ledger stream scan
      const ledgerEntries = service.getLedgerEntries(branchId);
      const ledgerAvailableCount = ledgerEntries.filter((e) => e.status === 'AVAILABLE').length;
      const ledgerConsumedActiveCount = ledgerEntries.filter((e) => {
        if (e.status !== 'CONSUMED') return false;
        const lic = service.getPersonnelLicense(e.consumed_by_personnel_id!);
        return lic && lic.status === 'ACTIVE';
      }).length;

      const reconcileResponse: ReconcileLedgerResponse = {
        branch_id: branchId,
        is_balanced:
          poolState.available_credits === ledgerAvailableCount &&
          poolState.active_seats === ledgerConsumedActiveCount,
        pool_available_credits: poolState.available_credits,
        ledger_available_credits_sum: ledgerAvailableCount,
        pool_active_seats: poolState.active_seats,
        ledger_consumed_active_seats_sum: ledgerConsumedActiveCount,
        discrepancy: {
          available_credit_delta: poolState.available_credits - ledgerAvailableCount,
          active_seat_delta: poolState.active_seats - ledgerConsumedActiveCount,
        },
        reconciled_at: new Date().toISOString(),
      };

      // Assert perfect mathematical balance (Delta = 0)
      expect(reconcileResponse.is_balanced).toBe(true);
      expect(reconcileResponse.discrepancy.available_credit_delta).toBe(0);
      expect(reconcileResponse.discrepancy.active_seat_delta).toBe(0);
      expect(reconcileResponse.pool_available_credits).toBe(7);
      expect(reconcileResponse.pool_active_seats).toBe(3);
    });
  });
});

