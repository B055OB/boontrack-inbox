import {
  calculateSubscriptionDates,
  getTierAiSessionQuota,
  isSubscriptionActive,
  formatWIBIsoString,
  getWIBDate,
  SUBSCRIPTION_PRICING,
  VALID_DURATIONS,
  WIB_OFFSET_HOURS,
  RESET_CYCLE_DAYS,
  AI_SESSION_TTL_HOURS,
} from '@/lib/subscriptions/entitlement';
import { SubscriptionTier, SubscriptionDurationMonths, SubscriptionStatus } from '@/lib/subscriptions/types';
import { sanitizeOrderPayload, VALID_ORDER_COLUMNS } from '@/lib/order-sanitizer';

describe('Multi-Duration Subscriptions Schema & Entitlement Suite', () => {
  describe('1. Duration Constraints & Validation', () => {
    it('allows valid durations 1, 6, and 12 months', () => {
      expect(VALID_DURATIONS).toEqual([1, 6, 12]);

      expect(() => calculateSubscriptionDates(1)).not.toThrow();
      expect(() => calculateSubscriptionDates(6)).not.toThrow();
      expect(() => calculateSubscriptionDates(12)).not.toThrow();
    });

    it('rejects invalid subscription durations', () => {
      const invalidDurations = [0, 2, 3, 4, 5, 7, 24, -1, 99];
      for (const duration of invalidDurations) {
        expect(() => calculateSubscriptionDates(duration as any)).toThrow(
          /Invalid subscription duration/i
        );
      }
    });
  });

  describe('2. WIB (+07:00) Timezone & Deterministic Date Calculations', () => {
    it('formats ISO strings with strict +07:00 timezone offset', () => {
      const date = new Date('2026-10-03T03:00:00.000Z'); // 10:00:00 in WIB
      const wibIso = formatWIBIsoString(date);
      expect(wibIso).toBe('2026-10-03T10:00:00.000+07:00');
      expect(wibIso.endsWith('+07:00')).toBe(true);
    });

    it('calculates current_period_ends_at as strictly +30 calendar days', () => {
      // Base: 2026-10-03T03:00:00.000Z (10:00:00 WIB)
      const startDate = new Date('2026-10-03T03:00:00.000Z');
      const result = calculateSubscriptionDates(1, startDate);

      // +30 days = 30 * 24 * 60 * 60 * 1000 ms
      const expectedEndMs = startDate.getTime() + 30 * 24 * 60 * 60 * 1000;
      expect(result.currentPeriodEndDate.getTime()).toBe(expectedEndMs);

      // October has 31 days, so 30 days after Oct 3 is Nov 2
      expect(result.current_period_ends_at).toBe('2026-11-02T10:00:00.000+07:00');
    });

    it('calculates expires_at for 1 month accurately in calendar months (WIB)', () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z'); // 10:00:00 WIB
      const result = calculateSubscriptionDates(1, startDate);

      // 1 calendar month from Oct 3 is Nov 3
      expect(result.expires_at).toBe('2026-11-03T10:00:00.000+07:00');
    });

    it('calculates expires_at for 6 months accurately across year boundary (WIB)', () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z'); // 10:00:00 WIB
      const result = calculateSubscriptionDates(6, startDate);

      // 6 calendar months from Oct 3, 2026 is April 3, 2027
      expect(result.expires_at).toBe('2027-04-03T10:00:00.000+07:00');
    });

    it('calculates expires_at for 12 months accurately (WIB)', () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z'); // 10:00:00 WIB
      const result = calculateSubscriptionDates(12, startDate);

      // 12 calendar months from Oct 3, 2026 is Oct 3, 2027
      expect(result.expires_at).toBe('2027-10-03T10:00:00.000+07:00');
    });

    it('clamps to end of month for short months (e.g. Jan 31 -> Feb 28 in non-leap year)', () => {
      // 2027 is not a leap year. Start: 2027-01-31T03:00:00.000Z (10:00:00 WIB)
      const startDate = new Date('2027-01-31T03:00:00.000Z');
      const result = calculateSubscriptionDates(1, startDate);

      // February 2027 has 28 days -> clamped to Feb 28
      expect(result.expires_at).toBe('2027-02-28T10:00:00.000+07:00');
    });

    it('clamps to end of month for leap years (e.g. Jan 31 -> Feb 29 in 2028 leap year)', () => {
      // 2028 is a leap year. Start: 2028-01-31T03:00:00.000Z (10:00:00 WIB)
      const startDate = new Date('2028-01-31T03:00:00.000Z');
      const result = calculateSubscriptionDates(1, startDate);

      // February 2028 has 29 days -> clamped to Feb 29
      expect(result.expires_at).toBe('2028-02-29T10:00:00.000+07:00');
    });

    it('defaults to current time when startDate is omitted or null', () => {
      const before = Date.now();
      const result = calculateSubscriptionDates(1);
      const after = Date.now();

      expect(result.startDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.startDate.getTime()).toBeLessThanOrEqual(after);
      expect(result.current_period_starts_at.endsWith('+07:00')).toBe(true);
    });
  });

  describe('3. AI Session Quotas & Entitlement Policies', () => {
    it('returns 0 AI session quota for STARTER tier', () => {
      const quota = getTierAiSessionQuota('STARTER');
      expect(quota.baseQuota).toBe(0);
      expect(quota.sessionTtlHours).toBe(AI_SESSION_TTL_HOURS);
      expect(quota.resetCycleDays).toBe(RESET_CYCLE_DAYS);
      expect(quota.description).toContain('0 sesi AI');
    });

    it('returns 300 AI session quota for PRO_SCALE tier', () => {
      const quota = getTierAiSessionQuota('PRO_SCALE');
      expect(quota.baseQuota).toBe(300);
      expect(quota.sessionTtlHours).toBe(AI_SESSION_TTL_HOURS);
      expect(quota.resetCycleDays).toBe(RESET_CYCLE_DAYS);
      expect(quota.description).toContain('300 sesi AI per 30 hari kalender');
    });

    it('returns 600 AI session quota for ENTERPRISE tier', () => {
      const quota = getTierAiSessionQuota('ENTERPRISE');
      expect(quota.baseQuota).toBe(600);
      expect(quota.sessionTtlHours).toBe(AI_SESSION_TTL_HOURS);
      expect(quota.resetCycleDays).toBe(RESET_CYCLE_DAYS);
      expect(quota.description).toContain('600 sesi AI per 30 hari kalender');
    });
  });

  describe('4. Lifecycle State & Expiration Invariants', () => {
    it('identifies ACTIVE subscription with future expiry as active', () => {
      const futureDate = new Date(Date.now() + 86400000);
      expect(isSubscriptionActive('ACTIVE', futureDate)).toBe(true);
      expect(isSubscriptionActive('TRIAL', futureDate)).toBe(true);
      expect(isSubscriptionActive('GRACE_PERIOD', futureDate)).toBe(true);
    });

    it('identifies EXPIRED status as inactive even if timestamp is in future', () => {
      const futureDate = new Date(Date.now() + 86400000);
      expect(isSubscriptionActive('EXPIRED', futureDate)).toBe(false);
    });

    it('identifies ACTIVE status with past expiry timestamp as inactive', () => {
      const pastDate = new Date(Date.now() - 86400000);
      expect(isSubscriptionActive('ACTIVE', pastDate)).toBe(false);
    });
  });

  describe('5. Pricing Matrix Consistency', () => {
    it('has valid pricing entries for all tiers and durations', () => {
      const tiers: SubscriptionTier[] = ['STARTER', 'PRO_SCALE', 'ENTERPRISE'];
      const durations: SubscriptionDurationMonths[] = [1, 6, 12];

      for (const tier of tiers) {
        const config = SUBSCRIPTION_PRICING[tier];
        expect(config).toBeDefined();
        expect(config.tier).toBe(tier);

        for (const duration of durations) {
          const pricing = config.durations[duration];
          expect(pricing).toBeDefined();
          expect(pricing.durationMonths).toBe(duration);
          expect(pricing.priceTotal).toBeGreaterThan(0);
          expect(pricing.pricePerMonth).toBeGreaterThan(0);

          if (duration === 1) {
            expect(pricing.discountPercentage).toBe(0);
          } else if (duration === 6) {
            expect(pricing.discountPercentage).toBe(10);
          } else if (duration === 12) {
            expect(pricing.discountPercentage).toBe(20);
          }
        }
      }
    });
  });

  describe('6. Order Sanitizer Whitelist Alignment', () => {
    it('includes subscription_id in VALID_ORDER_COLUMNS whitelist', () => {
      expect(VALID_ORDER_COLUMNS.has('subscription_id')).toBe(true);
    });

    it('preserves subscription_id during sanitizeOrderPayload', () => {
      const payload = {
        tenant_id: '11111111-1111-1111-1111-111111111111',
        customer_name: 'Merchant Test',
        subscription_id: 'sub-20261003-9999',
        invalid_field: 'should_be_stripped',
      };

      const sanitized = sanitizeOrderPayload(payload);
      expect(sanitized.subscription_id).toBe('sub-20261003-9999');
      expect((sanitized as any).invalid_field).toBeUndefined();
    });
  });
});
