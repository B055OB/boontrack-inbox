/**
 * lib/workforce/billing-contract.ts
 * BWM Gate E1 — Commercial Compliance & Billing Lifecycle Contract
 *
 * CFO & CTO Mandates:
 * 1. One-Time Branch Activation Fee: Rp 500.000 per branch (Prepaid, strictly non-refundable).
 * 2. Monthly Per-Seat Snapshot Billing: Rp 30.000 per active personnel per rolling 30-day cycle.
 * 3. Grace Period & Hard Paywall Auto-Off:
 *    - Grace period: 3 calendar days post-due.
 *    - Status transition: ACTIVE -> DUE -> GRACE_PERIOD -> SUSPENDED (Hard Paywall).
 *    - Hard paywall immediately blocks attendance logging, GPS sync, and supervisor operations.
 */

export const BWM_PRICING = {
  BRANCH_ACTIVATION_FEE_IDR: 500_000,
  MONTHLY_PERSONNEL_SEAT_IDR: 30_000,
  BILLING_CYCLE_DAYS: 30,
  GRACE_PERIOD_DAYS: 3,
  MINIMUM_CREDIT_DEPOSIT_QUANTITY: 5,
  PPN_RATE: 0.11, // 11% PPN
} as const;

export type CreditStatus = 'AVAILABLE' | 'CONSUMED' | 'FROZEN' | 'REVERSED';

export interface BranchSeatState {
  active_seats: number;
  available_credits: number;
}

export interface SeatCreditLedgerEntry {
  credit_id: string;
  branch_id: string;
  purchase_reference: string;
  payment_reference: string;
  status: CreditStatus;
  consumed_by_personnel_id?: string;
  consumed_at?: string;
  created_at: string;
  idempotency_key?: string;
}

export interface CreditDepositQuote {
  quoteId: string;
  branchId: string;
  quantity: number;
  unitPriceIdr: number;
  subtotalIdr: number;
  taxRate: number;
  taxAmountIdr: number;
  totalAmountIdr: number;
  currency: 'IDR';
  createdAt: string;
}

export interface PersonnelSeatLicense {
  licenseId: string;
  personnelId: string;
  branchId: string;
  creditId: string;
  activatedAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  earlyRenewedAt?: string;
}

export type SubscriptionState =
  | 'PENDING_ACTIVATION'
  | 'ACTIVE'
  | 'PAYMENT_DUE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED_PAYWALL';

export interface BranchActivationInvoice {
  invoiceId: string;
  branchId: string;
  agencyId: string;
  amount: number;
  currency: 'IDR';
  feeType: 'BRANCH_SETUP_NON_REFUNDABLE';
  isPaid: boolean;
  paidAt?: Date;
  status: 'UNPAID' | 'PAID' | 'EXPIRED';
}

export interface MonthlyHeadcountBillingQuote {
  periodStartDate: Date;
  periodEndDate: Date;
  activeHeadcount: number;
  unitPricePerSeat: number;
  totalAmountIdr: number;
  billingCycleDays: number;
}

export interface BranchSubscriptionStatus {
  branchId: string;
  state: SubscriptionState;
  currentPeriodEnd: Date;
  gracePeriodEnd: Date;
  isActiveEntitlement: boolean;
  daysRemaining?: number;
  daysOverdue?: number;
  paywallReason?: string;
}

/**
 * Creates an authoritative activation invoice quote for a new branch.
 */
export function createBranchActivationQuote(params: {
  branchId: string;
  agencyId: string;
}): BranchActivationInvoice {
  return {
    invoiceId: `inv_bwm_act_${params.branchId}_${Date.now()}`,
    branchId: params.branchId,
    agencyId: params.agencyId,
    amount: BWM_PRICING.BRANCH_ACTIVATION_FEE_IDR,
    currency: 'IDR',
    feeType: 'BRANCH_SETUP_NON_REFUNDABLE',
    isPaid: false,
    status: 'UNPAID',
  };
}

/**
 * Calculates monthly per-seat headcount billing for a 30-day rolling cycle.
 */
export function calculateMonthlyHeadcountBilling(params: {
  activeHeadcount: number;
  periodStartDate: Date;
}): MonthlyHeadcountBillingQuote {
  const headcount = Math.max(0, Math.floor(params.activeHeadcount));
  const periodStartDate = new Date(params.periodStartDate);
  const periodEndDate = new Date(periodStartDate.getTime() + BWM_PRICING.BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);

  return {
    periodStartDate,
    periodEndDate,
    activeHeadcount: headcount,
    unitPricePerSeat: BWM_PRICING.MONTHLY_PERSONNEL_SEAT_IDR,
    totalAmountIdr: headcount * BWM_PRICING.MONTHLY_PERSONNEL_SEAT_IDR,
    billingCycleDays: BWM_PRICING.BILLING_CYCLE_DAYS,
  };
}

/**
 * Evaluates the subscription state of a branch at a given reference timestamp.
 * Enforces strict hard paywall when overdue past the grace period.
 */
export function evaluateBranchSubscriptionStatus(params: {
  branchId: string;
  isActivationFeePaid: boolean;
  lastPaymentDate?: Date;
  currentPeriodEnd: Date;
  currentEvaluationDate?: Date;
}): BranchSubscriptionStatus {
  const { branchId, isActivationFeePaid, currentPeriodEnd } = params;
  const now = params.currentEvaluationDate ? new Date(params.currentEvaluationDate) : new Date();

  // 1. Guard: Branch must have paid the non-refundable activation fee
  if (!isActivationFeePaid) {
    return {
      branchId,
      state: 'PENDING_ACTIVATION',
      currentPeriodEnd,
      gracePeriodEnd: currentPeriodEnd,
      isActiveEntitlement: false,
      paywallReason: 'Biaya aktivasi cabang Rp 500.000 belum dibayar. Operasional presensi belum diaktifkan.',
    };
  }

  const periodEndTime = new Date(currentPeriodEnd).getTime();
  const graceEndTime = periodEndTime + BWM_PRICING.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const nowTime = now.getTime();

  // 2. Active within valid 30-day window
  if (nowTime <= periodEndTime) {
    const daysRemaining = Math.ceil((periodEndTime - nowTime) / (24 * 60 * 60 * 1000));
    return {
      branchId,
      state: 'ACTIVE',
      currentPeriodEnd,
      gracePeriodEnd: new Date(graceEndTime),
      isActiveEntitlement: true,
      daysRemaining,
    };
  }

  // 3. In Grace Period (Overdue but within 3 days grace)
  if (nowTime <= graceEndTime) {
    const daysOverdue = Math.ceil((nowTime - periodEndTime) / (24 * 60 * 60 * 1000));
    return {
      branchId,
      state: 'GRACE_PERIOD',
      currentPeriodEnd,
      gracePeriodEnd: new Date(graceEndTime),
      isActiveEntitlement: true, // Masih dapat beroperasi sementara dalam masa tenggang
      daysOverdue,
      paywallReason: `Tagihan bulanan jatuh tempo. Masa tenggang tersisa ${Math.ceil((graceEndTime - nowTime) / (24 * 60 * 60 * 1000))} hari.`,
    };
  }

  // 4. Past Grace Period -> HARD PAYWALL AUTO-OFF
  const totalDaysOverdue = Math.ceil((nowTime - periodEndTime) / (24 * 60 * 60 * 1000));
  return {
    branchId,
    state: 'SUSPENDED_PAYWALL',
    currentPeriodEnd,
    gracePeriodEnd: new Date(graceEndTime),
    isActiveEntitlement: false,
    daysOverdue: totalDaysOverdue,
    paywallReason: `HARD PAYWALL: Masa tenggang terlewati (${totalDaysOverdue} hari overdue). Akses operasional presensi diputus otomatis.`,
  };
}

/**
 * Asserts that a branch has an active entitlement to operate.
 * Throws a HARD_PAYWALL_SUSPENSION error if inactive.
 */
export function assertActiveBranchEntitlement(status: BranchSubscriptionStatus): void {
  if (!status.isActiveEntitlement) {
    throw new Error(`SUBSCRIPTION_PAYWALL_BLOCKED: [Branch ${status.branchId}] ${status.paywallReason}`);
  }
}

/**
 * Creates an authoritative deposit quote for seat credits.
 * Invariants: Minimum 5 credits, Rp 30.000 / credit + PPN 11%.
 */
export function createCreditDepositQuote(params: {
  branchId: string;
  quantity: number;
}): CreditDepositQuote {
  const quantity = Math.floor(params.quantity);
  if (quantity < BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY) {
    throw new Error(
      `MINIMUM_DEPOSIT_NOT_MET: Minimum pembelian deposit adalah ${BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY} kredit (diajukan: ${quantity}).`
    );
  }

  const unitPriceIdr = BWM_PRICING.MONTHLY_PERSONNEL_SEAT_IDR;
  const subtotalIdr = quantity * unitPriceIdr;
  const taxRate = BWM_PRICING.PPN_RATE;
  const taxAmountIdr = Math.round(subtotalIdr * taxRate);
  const totalAmountIdr = subtotalIdr + taxAmountIdr;

  return {
    quoteId: `quote_dep_${params.branchId}_${Date.now()}`,
    branchId: params.branchId,
    quantity,
    unitPriceIdr,
    subtotalIdr,
    taxRate,
    taxAmountIdr,
    totalAmountIdr,
    currency: 'IDR',
    createdAt: new Date().toISOString(),
  };
}

