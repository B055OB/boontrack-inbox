/**
 * __tests__/workforce/billing-lifecycle.test.ts
 * BWM Gate E1 — Test Suite: Commercial Compliance & Billing Lifecycle Contracts
 */

import {
  BWM_PRICING,
  createBranchActivationQuote,
  calculateMonthlyHeadcountBilling,
  evaluateBranchSubscriptionStatus,
  assertActiveBranchEntitlement,
} from '@/lib/workforce/billing-contract';

describe('BWM Gate E1: Billing Lifecycle & Commercial Compliance Contract', () => {
  const branchId = 'branch_sudirman_01';
  const agencyId = 'agency_satya';

  describe('1. Non-Refundable Branch Setup Fee Quotation', () => {
    it('generates an exact Rp 500.000 non-refundable setup invoice', () => {
      const quote = createBranchActivationQuote({ branchId, agencyId });

      expect(quote.amount).toBe(500_000);
      expect(quote.currency).toBe('IDR');
      expect(quote.feeType).toBe('BRANCH_SETUP_NON_REFUNDABLE');
      expect(quote.isPaid).toBe(false);
      expect(quote.status).toBe('UNPAID');
    });
  });

  describe('2. Monthly Per-Seat Headcount Billing (Rolling 30 Days)', () => {
    it('calculates monthly headcount billing at Rp 30.000 per seat for 30-day window', () => {
      const startDate = new Date('2026-11-01T00:00:00Z');
      const billing25 = calculateMonthlyHeadcountBilling({
        activeHeadcount: 25,
        periodStartDate: startDate,
      });

      expect(billing25.activeHeadcount).toBe(25);
      expect(billing25.unitPricePerSeat).toBe(30_000);
      expect(billing25.totalAmountIdr).toBe(750_000); // 25 * 30k
      expect(billing25.billingCycleDays).toBe(30);

      // Verify 30-day end timestamp
      const expectedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(billing25.periodEndDate.toISOString()).toBe(expectedEnd.toISOString());
    });

    it('scales accurately for large workforce headcounts (100 seats = Rp 3.000.000)', () => {
      const billing100 = calculateMonthlyHeadcountBilling({
        activeHeadcount: 100,
        periodStartDate: new Date('2026-11-01T00:00:00Z'),
      });

      expect(billing100.totalAmountIdr).toBe(3_000_000);
    });

    it('handles zero or negative headcount gracefully without negative billing', () => {
      const billingZero = calculateMonthlyHeadcountBilling({
        activeHeadcount: -5,
        periodStartDate: new Date('2026-11-01T00:00:00Z'),
      });

      expect(billingZero.activeHeadcount).toBe(0);
      expect(billingZero.totalAmountIdr).toBe(0);
    });
  });

  describe('3. Lifecycle Transitions & Hard Paywall Auto-Off', () => {
    const periodStart = new Date('2026-11-01T00:00:00Z');
    const periodEnd = new Date('2026-12-01T00:00:00Z'); // 30 days later

    it('blocks activation when Rp 500.000 setup fee is unpaid', () => {
      const status = evaluateBranchSubscriptionStatus({
        branchId,
        isActivationFeePaid: false,
        currentPeriodEnd: periodEnd,
        currentEvaluationDate: new Date('2026-11-05T00:00:00Z'),
      });

      expect(status.state).toBe('PENDING_ACTIVATION');
      expect(status.isActiveEntitlement).toBe(false);
      expect(status.paywallReason).toContain('Rp 500.000 belum dibayar');
      expect(() => assertActiveBranchEntitlement(status)).toThrow('SUBSCRIPTION_PAYWALL_BLOCKED');
    });

    it('maintains ACTIVE status while within legitimate 30-day period', () => {
      const status = evaluateBranchSubscriptionStatus({
        branchId,
        isActivationFeePaid: true,
        currentPeriodEnd: periodEnd,
        currentEvaluationDate: new Date('2026-11-15T00:00:00Z'), // Day 15
      });

      expect(status.state).toBe('ACTIVE');
      expect(status.isActiveEntitlement).toBe(true);
      expect(status.daysRemaining).toBe(16);
      expect(() => assertActiveBranchEntitlement(status)).not.toThrow();
    });

    it('enters GRACE_PERIOD within 3 days post-expiry while keeping operational entitlement temporarily', () => {
      // 2 days past periodEnd (Dec 3)
      const evaluationDate = new Date('2026-12-03T00:00:00Z');
      const status = evaluateBranchSubscriptionStatus({
        branchId,
        isActivationFeePaid: true,
        currentPeriodEnd: periodEnd,
        currentEvaluationDate: evaluationDate,
      });

      expect(status.state).toBe('GRACE_PERIOD');
      expect(status.isActiveEntitlement).toBe(true);
      expect(status.daysOverdue).toBe(2);
      expect(status.paywallReason).toContain('Masa tenggang tersisa 1 hari');
      expect(() => assertActiveBranchEntitlement(status)).not.toThrow();
    });

    it('strictly triggers SUSPENDED_PAYWALL (Hard Paywall Auto-Off) after 3-day grace period expires', () => {
      // 4 days past periodEnd (Dec 5)
      const evaluationDate = new Date('2026-12-05T00:00:00Z');
      const status = evaluateBranchSubscriptionStatus({
        branchId,
        isActivationFeePaid: true,
        currentPeriodEnd: periodEnd,
        currentEvaluationDate: evaluationDate,
      });

      expect(status.state).toBe('SUSPENDED_PAYWALL');
      expect(status.isActiveEntitlement).toBe(false);
      expect(status.daysOverdue).toBe(4);
      expect(status.paywallReason).toContain('HARD PAYWALL');

      // Assert hard paywall immediately throws to block attendance
      expect(() => assertActiveBranchEntitlement(status)).toThrow(/SUBSCRIPTION_PAYWALL_BLOCKED.*HARD PAYWALL/);
    });
  });
});

