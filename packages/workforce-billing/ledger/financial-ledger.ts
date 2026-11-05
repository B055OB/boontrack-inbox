/**
 * packages/workforce-billing/ledger/financial-ledger.ts
 * Append-Only Multi-Currency Financial Ledger & Tax Sub-Ledger Engine
 *
 * Core Principles:
 * - Strict Currency Isolation (IDR, USD, MYR)
 * - Zero Cross-Currency Pooling
 * - Segregated Tax Sub-Ledger (PPN 11% / SST 8%)
 * - Double-Entry Booking with Balance Verification: Debits == Credits
 */

import {
  SupportedCurrency,
  FinancialLedgerEntry,
  TaxSubLedgerEntry,
  NormalizedPaymentRecord,
} from '../types';

export class FinancialLedger {
  // Partitioned storage by currency
  private readonly ledgerEntriesByCurrency: Record<SupportedCurrency, FinancialLedgerEntry[]> = {
    IDR: [],
    USD: [],
    MYR: [],
  };

  private readonly taxSubLedger: TaxSubLedgerEntry[] = [];

  /**
   * Post double-entry financial transaction for a settled payment.
   * Books:
   *  DEBIT  1010-<CURR> (Gateway Clearing)       Gross Amount
   *  CREDIT 4010-<CURR> (BWM Operating Revenue)   Net Base Amount
   *  CREDIT 2020-<CURR> (Tax Payable)            Tax Amount (if > 0)
   */
  public recordPaymentSettlement(payment: NormalizedPaymentRecord): {
    entries: FinancialLedgerEntry[];
    taxEntry?: TaxSubLedgerEntry;
  } {
    const { currency, amountGross, amountNet, taxAmount, internalPaymentRef, branchId } = payment;

    // Strict validation: Debits must equal Credits
    const totalCredits = Number((amountNet + taxAmount).toFixed(2));
    if (Math.abs(amountGross - totalCredits) > 0.01) {
      throw new Error(
        `LEDGER_IMBALANCE: Gross amount (${amountGross}) does not match Net (${amountNet}) + Tax (${taxAmount})`
      );
    }

    const timestamp = new Date().toISOString();
    const createdEntries: FinancialLedgerEntry[] = [];

    // 1. DEBIT: Gateway Clearing (Asset increases)
    const debitEntry: FinancialLedgerEntry = {
      entryId: `ent_${Date.now()}_deb_${Math.random().toString(36).substring(2, 6)}`,
      transactionRef: internalPaymentRef,
      branchId,
      currency,
      accountCode: `1010-${currency}`,
      accountName: `Gateway Clearing (${payment.provider})`,
      type: 'DEBIT',
      amount: amountGross,
      description: `Settled payment ${internalPaymentRef} from ${payment.provider}`,
      createdAt: timestamp,
    };
    createdEntries.push(debitEntry);

    // 2. CREDIT: Operating Revenue (Revenue increases)
    const revenueCreditEntry: FinancialLedgerEntry = {
      entryId: `ent_${Date.now()}_rev_${Math.random().toString(36).substring(2, 6)}`,
      transactionRef: internalPaymentRef,
      branchId,
      currency,
      accountCode: `4010-${currency}`,
      accountName: 'BWM License Operating Revenue',
      type: 'CREDIT',
      amount: amountNet,
      description: `Operating revenue for ${payment.quantity} BWM Credit Passes (${currency})`,
      createdAt: timestamp,
    };
    createdEntries.push(revenueCreditEntry);

    // 3. CREDIT: Tax Payable (Liability increases, only if tax > 0)
    let taxEntry: TaxSubLedgerEntry | undefined;
    if (taxAmount > 0) {
      const taxCreditEntry: FinancialLedgerEntry = {
        entryId: `ent_${Date.now()}_tax_${Math.random().toString(36).substring(2, 6)}`,
        transactionRef: internalPaymentRef,
        branchId,
        currency,
        accountCode: `2020-${currency}`,
        accountName: currency === 'IDR' ? 'PPN Tax Payable (11%)' : 'SST Tax Payable (8%)',
        type: 'CREDIT',
        amount: taxAmount,
        description: `Sovereign tax payable on transaction ${internalPaymentRef}`,
        createdAt: timestamp,
      };
      createdEntries.push(taxCreditEntry);

      // Record in dedicated Tax Sub-Ledger
      taxEntry = {
        taxEntryId: `tax_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        transactionRef: internalPaymentRef,
        branchId,
        currency,
        taxType: currency === 'IDR' ? 'PPN' : 'SST',
        taxRate: currency === 'IDR' ? 0.11 : 0.08,
        baseAmount: amountNet,
        taxAmount,
        taxInvoiceRef: `FP-${Date.now()}-${branchId.substring(0, 4).toUpperCase()}`,
        jurisdiction: currency === 'IDR' ? 'ID' : currency === 'MYR' ? 'MY' : 'US',
        createdAt: timestamp,
      };
      this.taxSubLedger.push(taxEntry);
    }

    // Append to strict currency partition
    this.ledgerEntriesByCurrency[currency].push(...createdEntries);

    return { entries: createdEntries, taxEntry };
  }

  /**
   * Currency Partition Isolation Queries
   * Prohibits mixed currency summation.
   */
  public getEntriesByCurrency(currency: SupportedCurrency): FinancialLedgerEntry[] {
    return [...this.ledgerEntriesByCurrency[currency]];
  }

  public getTaxEntries(currency?: SupportedCurrency): TaxSubLedgerEntry[] {
    if (currency) {
      return this.taxSubLedger.filter((t) => t.currency === currency);
    }
    return [...this.taxSubLedger];
  }

  public calculatePartitionBalance(currency: SupportedCurrency): {
    currency: SupportedCurrency;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    clearingAsset: number;
    operatingRevenue: number;
    taxPayable: number;
  } {
    const entries = this.ledgerEntriesByCurrency[currency];

    let totalDebits = 0;
    let totalCredits = 0;
    let clearingAsset = 0;
    let operatingRevenue = 0;
    let taxPayable = 0;

    for (const entry of entries) {
      if (entry.type === 'DEBIT') {
        totalDebits += entry.amount;
        if (entry.accountCode.startsWith('1010')) {
          clearingAsset += entry.amount;
        }
      } else {
        totalCredits += entry.amount;
        if (entry.accountCode.startsWith('4010')) {
          operatingRevenue += entry.amount;
        } else if (entry.accountCode.startsWith('2020')) {
          taxPayable += entry.amount;
        }
      }
    }

    totalDebits = Number(totalDebits.toFixed(2));
    totalCredits = Number(totalCredits.toFixed(2));

    return {
      currency,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      clearingAsset: Number(clearingAsset.toFixed(2)),
      operatingRevenue: Number(operatingRevenue.toFixed(2)),
      taxPayable: Number(taxPayable.toFixed(2)),
    };
  }

  public getEntriesForTransaction(transactionRef: string): FinancialLedgerEntry[] {
    const all = [
      ...this.ledgerEntriesByCurrency.IDR,
      ...this.ledgerEntriesByCurrency.USD,
      ...this.ledgerEntriesByCurrency.MYR,
    ];
    return all.filter((e) => e.transactionRef === transactionRef);
  }
}

