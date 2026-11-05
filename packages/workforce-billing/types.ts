/**
 * packages/workforce-billing/types.ts
 * BWM Payment Infrastructure & Financial Integrity - Core Type Definitions
 *
 * Mandate:
 * - Strict Currency Isolation (IDR, USD, MYR)
 * - Separation of Financial, Tax, and Entitlement Ledgers
 * - Immutable Audit Trail & Idempotent Webhook Processing
 */

export type SupportedCurrency = 'IDR' | 'USD' | 'MYR';

export type PaymentProvider = 'XENDIT' | 'DODO_PAYMENTS';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'DISPUTED' | 'EXPIRED';

export type LotStatus = 'ACTIVE' | 'DEPLETED' | 'FROZEN' | 'DISPUTED';

export type AllocationStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export type WebhookStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';

export interface CurrencyConfig {
  currency: SupportedCurrency;
  symbol: string;
  unitPrice: number;
  taxRate: number; // e.g. 0.11 for 11% PPN, 0.08 for 8% SST, 0 for export/B2B USD
  taxLabel: string;
}

export const CURRENCY_CONFIGS: Record<SupportedCurrency, CurrencyConfig> = {
  IDR: {
    currency: 'IDR',
    symbol: 'Rp',
    unitPrice: 30_000,
    taxRate: 0.11, // 11% PPN
    taxLabel: 'PPN 11%',
  },
  USD: {
    currency: 'USD',
    symbol: '$',
    unitPrice: 2.0,
    taxRate: 0.0, // 0% B2B Cross-border Export
    taxLabel: 'Zero-rated Export',
  },
  MYR: {
    currency: 'MYR',
    symbol: 'RM',
    unitPrice: 9.0,
    taxRate: 0.08, // 8% SST
    taxLabel: 'SST 8%',
  },
};

// -------------------------------------------------------------
// INITIATION & PAYMENT RECORDS
// -------------------------------------------------------------
export interface PaymentIntentRequest {
  tenantId?: string;
  branchId: string;
  agencyId: string;
  quantity: number;
  currency: SupportedCurrency;
  customerEmail: string;
  customerName: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResult {
  paymentReference: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  checkoutUrl: string;
  amountGross: number;
  amountNet: number;
  taxAmount: number;
  currency: SupportedCurrency;
  quantity: number;
  status: PaymentStatus;
  createdAt: string;
  expiresAt: string;
}

export interface NormalizedPaymentRecord {
  internalPaymentRef: string;
  provider: PaymentProvider;
  providerTxnId: string;
  tenantId?: string;
  branchId: string;
  agencyId: string;
  currency: SupportedCurrency;
  quantity: number;
  amountGross: number;
  amountNet: number;
  taxAmount: number;
  status: PaymentStatus;
  createdAt: string;
  confirmedAt?: string;
  disputedAt?: string;
}

// -------------------------------------------------------------
// FINANCIAL & TAX LEDGER
// -------------------------------------------------------------
export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export interface FinancialLedgerEntry {
  entryId: string;
  transactionRef: string;
  branchId: string;
  currency: SupportedCurrency;
  accountCode: string;
  accountName: string;
  type: LedgerEntryType;
  amount: number;
  description: string;
  createdAt: string;
}

export interface TaxSubLedgerEntry {
  taxEntryId: string;
  transactionRef: string;
  branchId: string;
  currency: SupportedCurrency;
  taxType: 'PPN' | 'SST' | 'WITHHOLDING';
  taxRate: number;
  baseAmount: number;
  taxAmount: number;
  taxInvoiceRef: string;
  jurisdiction: 'ID' | 'MY' | 'US';
  createdAt: string;
}

// -------------------------------------------------------------
// CREDIT LOTS & ATOMIC ALLOCATION
// -------------------------------------------------------------
export interface CreditLot {
  lotId: string;
  purchaseRef: string;
  providerTxnId: string;
  tenantId: string; // Commercial owner of the credit lot
  branchId: string; // Operational deployment target
  agencyId: string;
  currency: SupportedCurrency;
  totalPurchased: number;
  availableCredits: number;
  consumedCredits: number;
  frozenCredits: number;
  unitPrice: number;
  status: LotStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreditAllocation {
  allocationId: string;
  lotId: string;
  tenantId: string; // Scoped to commercial tenant
  branchId: string;
  personnelId: string;
  personnelName: string;
  activatedAt: string;
  expiresAt: string; // activatedAt + 30 days
  status: AllocationStatus;
}

export interface CreditLedgerEntry {
  id: string;
  branchId: string;
  lotId: string;
  currency: SupportedCurrency;
  delta: number; // + for purchase, - for consumption, 0 for status freeze
  balanceAfter: number;
  reason: 'PURCHASE' | 'CONSUMPTION' | 'CHARGEBACK_FREEZE' | 'UNFREEZE' | 'REVERSAL';
  referenceId: string;
  createdAt: string;
}

// -------------------------------------------------------------
// WEBHOOK INBOX & RECONCILIATION
// -------------------------------------------------------------
export interface WebhookInboxRecord {
  id: string;
  provider: PaymentProvider;
  eventId: string;
  idempotencyKey: string;
  eventType: string;
  rawPayload: any;
  headers: Record<string, string>;
  status: WebhookStatus;
  receivedAt: string;
  processedAt?: string;
  errorMessage?: string;
  retryCount: number;
}

export interface DeadLetterQueueEntry {
  id: string;
  inboxId?: string;
  provider: PaymentProvider;
  payload: any;
  failureReason: string;
  stackTrace?: string;
  createdAt: string;
  resolved: boolean;
}

export interface AuditLogEntry {
  logId: string;
  entityType: 'PAYMENT' | 'LOT' | 'ALLOCATION' | 'LEDGER' | 'TAX';
  entityId: string;
  previousState: string;
  newState: string;
  actor: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface ReconciliationTrace {
  providerTxnId: string;
  internalPaymentRef: string;
  provider: PaymentProvider;
  currency: SupportedCurrency;
  grossAmount: number;
  netRevenue: number;
  taxAmount: number;
  quantity: number;
  paymentStatus: PaymentStatus;
  financialLedgerEntries: FinancialLedgerEntry[];
  taxSubLedgerEntries: TaxSubLedgerEntry[];
  creditLot?: CreditLot;
  allocations: CreditAllocation[];
  remittanceRef: string;
  isFullyReconciled: boolean;
  discrepancies: string[];
}

