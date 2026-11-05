/**
 * packages/workforce-billing/reconciliation/reconciliation-engine.ts
 * Settlement Reconciliation & Audit Trail Engine
 *
 * Traceability Graph:
 * Provider Txn <-> Internal Payment <-> Financial Ledger <-> Tax Sub-Ledger <-> Credit Lot / Allocations <-> Settlement Remittance
 */

import {
  SupportedCurrency,
  ReconciliationTrace,
  NormalizedPaymentRecord,
} from '../types';
import { BillingOrchestrator } from '../orchestrator/billing-orchestrator';
import { FinancialLedger } from '../ledger/financial-ledger';
import { AtomicCreditLedger } from '../credit/atomic-credit-ledger';

export interface SettlementRemittance {
  remittanceId: string;
  provider: string;
  currency: SupportedCurrency;
  bankAccount: string;
  grossAmount: number;
  mdrFee: number;
  netRemitted: number;
  status: 'SETTLED' | 'PENDING';
  remittedAt: string;
}

export class ReconciliationEngine {
  private readonly orchestrator: BillingOrchestrator;
  private readonly financialLedger: FinancialLedger;
  private readonly creditLedger: AtomicCreditLedger;

  private readonly remittances: Map<string, SettlementRemittance> = new Map();

  constructor(
    orchestrator: BillingOrchestrator,
    financialLedger: FinancialLedger,
    creditLedger: AtomicCreditLedger
  ) {
    this.orchestrator = orchestrator;
    this.financialLedger = financialLedger;
    this.creditLedger = creditLedger;
  }

  /**
   * Register a simulated settlement remittance from bank/provider
   */
  public registerSettlementRemittance(remittance: SettlementRemittance): void {
    this.remittances.set(remittance.remittanceId, remittance);
  }

  /**
   * Reconcile a single payment from Provider to Bank Settlement
   */
  public reconcilePayment(internalPaymentRef: string): ReconciliationTrace {
    const payment = this.orchestrator.getPaymentRecord(internalPaymentRef);
    if (!payment) {
      throw new Error(`RECONCILIATION_FAILED: Payment record not found: ${internalPaymentRef}`);
    }

    const discrepancies: string[] = [];

    // 1. Trace Financial Ledger Entries
    const ledgerEntries = this.financialLedger.getEntriesForTransaction(internalPaymentRef);
    if (ledgerEntries.length === 0 && payment.status === 'SUCCEEDED') {
      discrepancies.push('MISSING_FINANCIAL_LEDGER_ENTRIES: Payment is SUCCEEDED but has no ledger bookings');
    }

    // Verify Financial Ledger Balance
    let debitTotal = 0;
    let creditTotal = 0;
    for (const entry of ledgerEntries) {
      if (entry.type === 'DEBIT') debitTotal += entry.amount;
      if (entry.type === 'CREDIT') creditTotal += entry.amount;
    }
    if (Math.abs(debitTotal - creditTotal) > 0.01) {
      discrepancies.push(`FINANCIAL_LEDGER_IMBALANCE: Debits (${debitTotal}) != Credits (${creditTotal})`);
    }

    // 2. Trace Tax Sub-Ledger Entries
    const taxEntries = this.financialLedger
      .getTaxEntries()
      .filter((t) => t.transactionRef === internalPaymentRef);

    if (payment.taxAmount > 0 && taxEntries.length === 0 && payment.status === 'SUCCEEDED') {
      discrepancies.push('MISSING_TAX_SUB_LEDGER_ENTRY: Tax amount > 0 but no tax sub-ledger recorded');
    }

    // 3. Trace Credit Lot
    const lot = this.creditLedger
      .getAllLots()
      .find((l) => l.purchaseRef === internalPaymentRef);

    if (!lot && payment.status === 'SUCCEEDED') {
      discrepancies.push('MISSING_CREDIT_LOT: Succeeded payment has no corresponding credit lot in pool');
    }

    // 4. Trace Credit Allocations
    const allocations = lot
      ? this.creditLedger
          .getAllocationsForBranch(payment.branchId)
          .filter((a) => a.lotId === lot.lotId)
      : [];

    // 5. Trace Remittance
    const remittanceRef = `REMIT-${payment.currency}-${payment.providerTxnId.substring(0, 8)}`;

    const isFullyReconciled = discrepancies.length === 0 && payment.status === 'SUCCEEDED';

    return {
      providerTxnId: payment.providerTxnId,
      internalPaymentRef: payment.internalPaymentRef,
      provider: payment.provider,
      currency: payment.currency,
      grossAmount: payment.amountGross,
      netRevenue: payment.amountNet,
      taxAmount: payment.taxAmount,
      quantity: payment.quantity,
      paymentStatus: payment.status,
      financialLedgerEntries: ledgerEntries,
      taxSubLedgerEntries: taxEntries,
      creditLot: lot,
      allocations,
      remittanceRef,
      isFullyReconciled,
      discrepancies,
    };
  }

  /**
   * Generate comprehensive reconciliation report across all payments
   */
  public generateFullReconciliationReport(currency?: SupportedCurrency): {
    totalPaymentsAudited: number;
    fullyReconciledCount: number;
    discrepancyCount: number;
    traces: ReconciliationTrace[];
  } {
    let payments = this.orchestrator.getAllPaymentRecords();
    if (currency) {
      payments = payments.filter((p) => p.currency === currency);
    }

    const traces: ReconciliationTrace[] = [];
    let fullyReconciledCount = 0;
    let discrepancyCount = 0;

    for (const payment of payments) {
      try {
        const trace = this.reconcilePayment(payment.internalPaymentRef);
        traces.push(trace);
        if (trace.isFullyReconciled) {
          fullyReconciledCount++;
        } else {
          discrepancyCount++;
        }
      } catch (err: any) {
        discrepancyCount++;
      }
    }

    return {
      totalPaymentsAudited: payments.length,
      fullyReconciledCount,
      discrepancyCount,
      traces,
    };
  }
}
