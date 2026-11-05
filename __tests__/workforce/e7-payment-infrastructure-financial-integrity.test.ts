/**
 * __tests__/workforce/e7-payment-infrastructure-financial-integrity.test.ts
 * BWM Gate E7: Payment Infrastructure & Financial Integrity Test Suite
 *
 * Mandate:
 * 1. Duplicate Webhook       -> Idempotent delivery, zero duplicate credit/ledger.
 * 2. Webhook Replay          -> Stale timestamp / replay attack rejected.
 * 3. Concurrent Consumption  -> Race condition between 2 admins; zero double allocation.
 * 4. Insufficient Balance    -> Immediate rejection; balance cannot be negative.
 * 5. Payment Failure         -> Failed payment = zero credits allocated.
 * 6. Chargeback              -> Unused credits in disputed lot frozen safely.
 * 7. Currency Isolation      -> IDR, USD, MYR strictly segregated without cross-pooling.
 * 8. Tax Separation          -> Base price (Rp30.000) and PPN (11%) segregated in ledger.
 * 9. Reconciliation          -> Unbroken trace from provider txn to credit allocation.
 * 10. Audit Trail            -> Permanent immutable state transition audit history.
 */

import crypto from 'crypto';
import {
  BillingOrchestrator,
  XenditAdapter,
  DodoPaymentsAdapter,
  FinancialLedger,
  WebhookInbox,
  AtomicCreditLedger,
  ReconciliationEngine,
  CURRENCY_CONFIGS,
} from '@/packages/workforce-billing';

describe('BWM Gate E7: Payment Infrastructure & Financial Integrity (CTO Directive)', () => {
  let orchestrator: BillingOrchestrator;
  let xenditAdapter: XenditAdapter;
  let dodoAdapter: DodoPaymentsAdapter;
  let financialLedger: FinancialLedger;
  let webhookInbox: WebhookInbox;
  let creditLedger: AtomicCreditLedger;
  let reconciliationEngine: ReconciliationEngine;

  const testBranchId = 'branch_satya_bandung_01';
  const testAgencyId = 'agency_satya_garda_001';

  beforeEach(() => {
    xenditAdapter = new XenditAdapter({
      callbackToken: 'xnd_test_token_2026',
      webhookSecret: 'xnd_test_hmac_secret_2026',
    });

    dodoAdapter = new DodoPaymentsAdapter({
      webhookSecret: 'dodo_test_hmac_secret_2026',
      maxClockDriftSeconds: 300,
    });

    orchestrator = new BillingOrchestrator({
      xenditAdapter,
      dodoAdapter,
    });

    financialLedger = new FinancialLedger();
    webhookInbox = new WebhookInbox();
    creditLedger = new AtomicCreditLedger();
    reconciliationEngine = new ReconciliationEngine(orchestrator, financialLedger, creditLedger);
  });

  // =========================================================================
  // 1. DUPLICATE WEBHOOK (IDEMPOTENCY & ZERO SIDE-EFFECTS)
  // =========================================================================
  describe('1. Duplicate Webhook Handling', () => {
    test('Identical webhook delivered twice executes exactly once with zero extra credits', async () => {
      // 1. Create Payment Intent
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 25,
        currency: 'IDR',
        customerEmail: 'hendra.ops@satya.id',
        customerName: 'Hendra Ops',
      });

      const eventPayload = {
        id: 'xnd_evt_1001',
        event: 'invoice.paid',
        invoice_id: intent.providerPaymentId,
        external_id: intent.paymentReference,
        status: 'PAID',
        paid_amount: intent.amountGross,
        paid_at: new Date().toISOString(),
      };

      const headers = { 'x-callback-token': 'xnd_test_token_2026' };

      // First Delivery
      const ingest1 = webhookInbox.ingest({
        provider: 'XENDIT',
        eventId: 'xnd_evt_1001',
        eventType: 'invoice.paid',
        rawPayload: eventPayload,
        headers,
      });

      expect(ingest1.accepted).toBe(true);
      expect(ingest1.isDuplicate).toBe(false);

      // Downstream execution for first delivery
      const paymentRecord = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED', intent.providerPaymentId);
      financialLedger.recordPaymentSettlement(paymentRecord);
      await creditLedger.createLotFromPayment(paymentRecord);
      webhookInbox.markProcessed(ingest1.inboxId!);

      const balanceAfterFirst = creditLedger.getBranchBalance(testBranchId);
      expect(balanceAfterFirst).toBe(25);

      // Second Delivery (Duplicate Webhook)
      const ingest2 = webhookInbox.ingest({
        provider: 'XENDIT',
        eventId: 'xnd_evt_1001',
        eventType: 'invoice.paid',
        rawPayload: eventPayload,
        headers,
      });

      expect(ingest2.accepted).toBe(true);
      expect(ingest2.isDuplicate).toBe(true);
      expect(ingest2.message).toContain('ZERO_SIDE_EFFECTS');

      // Invariant: Balance and ledger entries remain strictly unchanged
      const balanceAfterSecond = creditLedger.getBranchBalance(testBranchId);
      expect(balanceAfterSecond).toBe(25);
      expect(creditLedger.getAllLots().length).toBe(1);
      expect(financialLedger.getEntriesByCurrency('IDR').length).toBe(3); // 1 Debit, 2 Credits
    });
  });

  // =========================================================================
  // 2. WEBHOOK REPLAY & STALE TIMESTAMP PROTECTION
  // =========================================================================
  describe('2. Webhook Replay & Timestamp Protection', () => {
    test('Replay with expired timestamp (> 300 seconds) is cryptographically rejected', () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago
      const rawBody = JSON.stringify({
        event_id: 'dodo_evt_stale_01',
        type: 'payment.succeeded',
        data: {
          payment_id: 'dodo_pay_stale',
          amount: 50.0,
          currency: 'USD',
        },
      });

      const signature = crypto
        .createHmac('sha256', 'dodo_test_hmac_secret_2026')
        .update(`${staleTimestamp}.${rawBody}`)
        .digest('hex');

      const headers = {
        'webhook-id': 'dodo_evt_stale_01',
        'webhook-timestamp': staleTimestamp.toString(),
        'webhook-signature': signature,
      };

      const isValid = orchestrator.verifyWebhookSignature('DODO_PAYMENTS', rawBody, headers);
      expect(isValid).toBe(false); // Rejected due to replay drift
    });

    test('Valid timestamp and signature within tolerance (< 300 seconds) is accepted', () => {
      const freshTimestamp = Math.floor(Date.now() / 1000) - 30; // 30s ago
      const rawBody = JSON.stringify({
        event_id: 'dodo_evt_fresh_01',
        type: 'payment.succeeded',
        data: {
          payment_id: 'dodo_pay_fresh',
          amount: 50.0,
          currency: 'USD',
        },
      });

      const signature = crypto
        .createHmac('sha256', 'dodo_test_hmac_secret_2026')
        .update(`${freshTimestamp}.${rawBody}`)
        .digest('hex');

      const headers = {
        'webhook-id': 'dodo_evt_fresh_01',
        'webhook-timestamp': freshTimestamp.toString(),
        'webhook-signature': signature,
      };

      const isValid = orchestrator.verifyWebhookSignature('DODO_PAYMENTS', rawBody, headers);
      expect(isValid).toBe(true);
    });
  });

  // =========================================================================
  // 3. CONCURRENT CONSUMPTION (ATOMIC RACE CONDITION PREVENTION)
  // =========================================================================
  describe('3. Concurrent Consumption (Race Condition Protection)', () => {
    test('Two simultaneous allocation requests for the last remaining pass results in exactly 1 success and 1 rejection', async () => {
      // 1. Setup payment with exactly 1 pass
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 1,
        currency: 'IDR',
        customerEmail: 'hendra.ops@satya.id',
        customerName: 'Hendra Ops',
      });

      const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
      await creditLedger.createLotFromPayment(payment);

      expect(creditLedger.getBranchBalance(testBranchId)).toBe(1);

      // 2. Race 2 admin workers simultaneously trying to allocate the single pass
      const workerA = creditLedger.allocateCredit({
        branchId: testBranchId,
        personnelId: 'PERS_CINDY_001',
        personnelName: 'Cindy Aurini',
      });

      const workerB = creditLedger.allocateCredit({
        branchId: testBranchId,
        personnelId: 'PERS_BAMBANG_002',
        personnelName: 'Bambang Prakoso',
      });

      const results = await Promise.allSettled([workerA, workerB]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Invariant: Exactly 1 worker gets the credit, exactly 1 worker is rejected with INSUFFICIENT_CREDITS
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason.message;
      expect(rejectedReason).toContain('INSUFFICIENT_CREDITS');

      // Final balance must be exactly 0, never negative
      expect(creditLedger.getBranchBalance(testBranchId)).toBe(0);
      expect(creditLedger.getAllocationsForBranch(testBranchId).length).toBe(1);
    });
  });

  // =========================================================================
  // 4. INSUFFICIENT BALANCE & NON-NEGATIVE HARD CONSTRAINT
  // =========================================================================
  describe('4. Insufficient Balance & Invariant Check', () => {
    test('Allocation attempt on empty pool is rejected and balance remains strictly >= 0', async () => {
      expect(creditLedger.getBranchBalance('empty_branch_999')).toBe(0);

      await expect(
        creditLedger.allocateCredit({
          branchId: 'empty_branch_999',
          personnelId: 'PERS_UNKNOWN',
          personnelName: 'Unknown Guard',
        })
      ).rejects.toThrow('INSUFFICIENT_CREDITS');

      expect(creditLedger.getBranchBalance('empty_branch_999')).toBe(0);
    });
  });

  // =========================================================================
  // 5. PAYMENT FAILURE (ZERO ENTITLEMENT ALLOCATED)
  // =========================================================================
  describe('5. Payment Failure Handling', () => {
    test('Failed payment updates status to FAILED and allocates 0 credits to pool', async () => {
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 50,
        currency: 'IDR',
        customerEmail: 'hendra.ops@satya.id',
        customerName: 'Hendra Ops',
      });

      // Update to FAILED
      const failedPayment = orchestrator.updatePaymentStatus(intent.paymentReference, 'FAILED');
      expect(failedPayment.status).toBe('FAILED');

      // Invariant: Credit pool remains 0, financial ledger has 0 revenue booked
      expect(creditLedger.getBranchBalance(testBranchId)).toBe(0);
      expect(financialLedger.getEntriesByCurrency('IDR').length).toBe(0);
    });
  });

  // =========================================================================
  // 6. CHARGEBACK & FREEZING UNUSED CREDITS
  // =========================================================================
  describe('6. Chargeback Handling & Lot Freezing', () => {
    test('Disputed purchase freezes unused credits without causing negative balance', async () => {
      // 1. Purchase 10 passes
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 10,
        currency: 'IDR',
        customerEmail: 'hendra.ops@satya.id',
        customerName: 'Hendra Ops',
      });

      const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
      financialLedger.recordPaymentSettlement(payment);
      const lot = await creditLedger.createLotFromPayment(payment);

      expect(creditLedger.getBranchBalance(testBranchId)).toBe(10);

      // 2. Consume 3 passes
      for (let i = 1; i <= 3; i++) {
        await creditLedger.allocateCredit({
          branchId: testBranchId,
          personnelId: `PERS_AGENT_00${i}`,
          personnelName: `Personnel ${i}`,
        });
      }

      expect(creditLedger.getBranchBalance(testBranchId)).toBe(7);

      // 3. Provider issues a chargeback/dispute
      orchestrator.updatePaymentStatus(intent.paymentReference, 'DISPUTED');
      const freezeResult = await creditLedger.handleChargeback(intent.paymentReference);

      expect(freezeResult.frozenCredits).toBe(7); // The 7 unused credits are frozen
      expect(freezeResult.newBalance).toBe(0); // Branch available balance becomes 0

      const updatedLot = creditLedger.getLot(lot.lotId);
      expect(updatedLot?.status).toBe('FROZEN');
      expect(updatedLot?.frozenCredits).toBe(7);
      expect(updatedLot?.consumedCredits).toBe(3);
      expect(updatedLot?.availableCredits).toBe(0);

      // Subsequent allocation attempt must fail
      await expect(
        creditLedger.allocateCredit({
          branchId: testBranchId,
          personnelId: 'PERS_FAIL_AFTER_CHARGEBACK',
          personnelName: 'Blocked Officer',
        })
      ).rejects.toThrow('INSUFFICIENT_CREDITS');
    });
  });

  // =========================================================================
  // 7. CURRENCY ISOLATION (ZERO CROSS-CURRENCY POOLING)
  // =========================================================================
  describe('7. Currency Partition Isolation', () => {
    test('IDR, USD, and MYR ledger partitions are strictly segregated', async () => {
      // 1. Book IDR payment
      const idrPayment = await orchestrator.createPaymentIntent({
        branchId: 'branch_idr',
        agencyId: testAgencyId,
        quantity: 10,
        currency: 'IDR',
        customerEmail: 'idr@satya.id',
        customerName: 'IDR Client',
      });
      const settledIdr = orchestrator.updatePaymentStatus(idrPayment.paymentReference, 'SUCCEEDED');
      financialLedger.recordPaymentSettlement(settledIdr);

      // 2. Book USD payment
      const usdPayment = await orchestrator.createPaymentIntent({
        branchId: 'branch_usd',
        agencyId: testAgencyId,
        quantity: 20,
        currency: 'USD',
        customerEmail: 'usd@satya.id',
        customerName: 'USD Client',
      });
      const settledUsd = orchestrator.updatePaymentStatus(usdPayment.paymentReference, 'SUCCEEDED');
      financialLedger.recordPaymentSettlement(settledUsd);

      // 3. Book MYR payment
      const myrPayment = await orchestrator.createPaymentIntent({
        branchId: 'branch_myr',
        agencyId: testAgencyId,
        quantity: 15,
        currency: 'MYR',
        customerEmail: 'myr@satya.id',
        customerName: 'MYR Client',
      });
      const settledMyr = orchestrator.updatePaymentStatus(myrPayment.paymentReference, 'SUCCEEDED');
      financialLedger.recordPaymentSettlement(settledMyr);

      // Invariant: Ledger entries for each partition are 100% mutually exclusive
      const idrEntries = financialLedger.getEntriesByCurrency('IDR');
      const usdEntries = financialLedger.getEntriesByCurrency('USD');
      const myrEntries = financialLedger.getEntriesByCurrency('MYR');

      expect(idrEntries.every((e) => e.currency === 'IDR')).toBe(true);
      expect(usdEntries.every((e) => e.currency === 'USD')).toBe(true);
      expect(myrEntries.every((e) => e.currency === 'MYR')).toBe(true);

      // Validate partition balance equations: sum(Debits) == sum(Credits)
      const idrBal = financialLedger.calculatePartitionBalance('IDR');
      const usdBal = financialLedger.calculatePartitionBalance('USD');
      const myrBal = financialLedger.calculatePartitionBalance('MYR');

      expect(idrBal.isBalanced).toBe(true);
      expect(usdBal.isBalanced).toBe(true);
      expect(myrBal.isBalanced).toBe(true);
    });
  });

  // =========================================================================
  // 8. TAX SEPARATION (PPN 11% & SST 8%)
  // =========================================================================
  describe('8. Tax Sub-Ledger Segregation', () => {
    test('Base subscription revenue and sovereign tax are strictly separated in double-entry accounts', async () => {
      // 25 passes in IDR: 25 * 30.000 = 750.000 net, PPN 11% = 82.500, Gross = 832.500
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 25,
        currency: 'IDR',
        customerEmail: 'tax@satya.id',
        customerName: 'Tax Audit Client',
      });

      expect(intent.amountNet).toBe(750000);
      expect(intent.taxAmount).toBe(82500);
      expect(intent.amountGross).toBe(832500);

      const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
      const { entries, taxEntry } = financialLedger.recordPaymentSettlement(payment);

      // Check double-entry bookings
      const clearingEntry = entries.find((e) => e.accountCode === '1010-IDR');
      const revenueEntry = entries.find((e) => e.accountCode === '4010-IDR');
      const taxEntryLedger = entries.find((e) => e.accountCode === '2020-IDR');

      expect(clearingEntry?.amount).toBe(832500);
      expect(clearingEntry?.type).toBe('DEBIT');

      expect(revenueEntry?.amount).toBe(750000);
      expect(revenueEntry?.type).toBe('CREDIT');

      expect(taxEntryLedger?.amount).toBe(82500);
      expect(taxEntryLedger?.type).toBe('CREDIT');

      // Verify Tax Sub-Ledger metadata
      expect(taxEntry).toBeDefined();
      expect(taxEntry?.taxType).toBe('PPN');
      expect(taxEntry?.taxRate).toBe(0.11);
      expect(taxEntry?.taxAmount).toBe(82500);
      expect(taxEntry?.jurisdiction).toBe('ID');
    });
  });

  // =========================================================================
  // 9. SETTLEMENT RECONCILIATION INTERFACE
  // =========================================================================
  describe('9. Settlement Reconciliation & Full Traceability', () => {
    test('Produces unbroken bi-directional trace from Provider Txn to Credit Allocation', async () => {
      // 1. Initiate & Settle Payment
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 10,
        currency: 'IDR',
        customerEmail: 'reconcile@satya.id',
        customerName: 'Reconciliation Test',
      });

      const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED', intent.providerPaymentId);
      financialLedger.recordPaymentSettlement(payment);
      await creditLedger.createLotFromPayment(payment);

      // 2. Allocate 1 Credit
      const allocResult = await creditLedger.allocateCredit({
        branchId: testBranchId,
        personnelId: 'PERS_CINDY_TRACE',
        personnelName: 'Cindy Aurini',
      });

      // 3. Reconcile
      const trace = reconciliationEngine.reconcilePayment(intent.paymentReference);

      expect(trace.isFullyReconciled).toBe(true);
      expect(trace.discrepancies.length).toBe(0);
      expect(trace.providerTxnId).toBe(intent.providerPaymentId);
      expect(trace.internalPaymentRef).toBe(intent.paymentReference);
      expect(trace.financialLedgerEntries.length).toBe(3);
      expect(trace.taxSubLedgerEntries.length).toBe(1);
      expect(trace.creditLot).toBeDefined();
      expect(trace.allocations.length).toBe(1);
      expect(trace.allocations[0].allocationId).toBe(allocResult.allocationId);
    });
  });

  // =========================================================================
  // 10. AUDIT TRAIL IMMUTABILITY
  // =========================================================================
  describe('10. Audit Trail Immutability', () => {
    test('State transitions are permanently logged with actor and timestamp', async () => {
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 5,
        currency: 'IDR',
        customerEmail: 'audit@satya.id',
        customerName: 'Audit Client',
      });

      orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
      orchestrator.updatePaymentStatus(intent.paymentReference, 'DISPUTED');

      const logs = orchestrator.getAuditLogs().filter((l) => l.entityId === intent.paymentReference);

      expect(logs.length).toBe(3);
      expect(logs[0].previousState).toBe('NONE');
      expect(logs[0].newState).toBe('PENDING');

      expect(logs[1].previousState).toBe('PENDING');
      expect(logs[1].newState).toBe('SUCCEEDED');

      expect(logs[2].previousState).toBe('SUCCEEDED');
      expect(logs[2].newState).toBe('DISPUTED');

      // Every log must have timestamp and actor
      logs.forEach((log) => {
        expect(log.timestamp).toBeDefined();
        expect(log.actor).toBeDefined();
      });
    });
  });
});
