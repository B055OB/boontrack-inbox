/**
 * @file lib/subscriptions/entitlement.ts
 * @description Domain helpers for multi-duration subscriptions, WIB (+07:00) calendar math,
 * and 30-day AI session quota entitlement reset cycles.
 */

import {
  SubscriptionTier,
  SubscriptionDurationMonths,
  SubscriptionStatus,
  SubscriptionDatesResult,
  AiSessionQuota,
  TierPricingConfig,
} from './types';

export const WIB_TIMEZONE = 'Asia/Jakarta';
export const WIB_OFFSET_HOURS = 7;
export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;
export const RESET_CYCLE_DAYS = 30;
export const AI_SESSION_TTL_HOURS = 2;

export const VALID_DURATIONS: readonly SubscriptionDurationMonths[] = [1, 6, 12] as const;

/**
 * Parses and returns a valid Date instance, defaulting to the current timestamp if omitted or invalid.
 */
export function getWIBDate(inputDate?: Date | string | number | null): Date {
  if (!inputDate) return new Date();
  const d = new Date(inputDate);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Formats a Date object into an ISO-8601 string preserving the Asia/Jakarta (+07:00 / WIB) offset.
 * Example: '2026-10-03T10:00:00.000+07:00'
 */
export function formatWIBIsoString(date: Date): string {
  const wibTime = new Date(date.getTime() + WIB_OFFSET_MS);
  const y = wibTime.getUTCFullYear();
  const m = String(wibTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wibTime.getUTCDate()).padStart(2, '0');
  const h = String(wibTime.getUTCHours()).padStart(2, '0');
  const min = String(wibTime.getUTCMinutes()).padStart(2, '0');
  const s = String(wibTime.getUTCSeconds()).padStart(2, '0');
  const ms = String(wibTime.getUTCMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+07:00`;
}

/**
 * Calculates deterministic subscription billing and cycle dates in Asia/Jakarta (WIB) timezone:
 * - current_period_starts_at: Equals starts_at (WIB).
 * - current_period_ends_at: Exactly +30 calendar days (AI quota reset window).
 * - expires_at: Exactly +N calendar months (1, 6, or 12 months) with end-of-month day clamping.
 *
 * @throws {Error} If durationMonths is not 1, 6, or 12.
 */
export function calculateSubscriptionDates(
  durationMonths: SubscriptionDurationMonths | number,
  startDate?: Date | string | number | null
): SubscriptionDatesResult {
  if (!VALID_DURATIONS.includes(durationMonths as SubscriptionDurationMonths)) {
    throw new Error(
      `Invalid subscription duration: ${durationMonths}. Allowed durations are 1, 6, or 12 months.`
    );
  }

  const validDuration = durationMonths as SubscriptionDurationMonths;
  const start = getWIBDate(startDate);

  // current_period_ends_at is strictly +30 calendar days (720 hours)
  const currentPeriodEndUtcMs = start.getTime() + RESET_CYCLE_DAYS * 24 * 60 * 60 * 1000;
  const currentPeriodEndDate = new Date(currentPeriodEndUtcMs);

  // expires_at is +N calendar months in WIB
  const wibStart = new Date(start.getTime() + WIB_OFFSET_MS);
  const startYear = wibStart.getUTCFullYear();
  const startMonth = wibStart.getUTCMonth(); // 0 - 11
  const startDay = wibStart.getUTCDate();
  const startH = wibStart.getUTCHours();
  const startM = wibStart.getUTCMinutes();
  const startS = wibStart.getUTCSeconds();
  const startMs = wibStart.getUTCMilliseconds();

  let targetYear = startYear;
  let targetMonth = startMonth + validDuration;
  if (targetMonth > 11) {
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;
  }

  // Days in target month (0th day of next month gives the last day of target month)
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(startDay, daysInTargetMonth);

  const targetUtcMs =
    Date.UTC(targetYear, targetMonth, targetDay, startH, startM, startS, startMs) - WIB_OFFSET_MS;
  const expiresDate = new Date(targetUtcMs);

  return {
    starts_at: formatWIBIsoString(start),
    current_period_starts_at: formatWIBIsoString(start),
    current_period_ends_at: formatWIBIsoString(currentPeriodEndDate),
    expires_at: formatWIBIsoString(expiresDate),
    startDate: start,
    currentPeriodStartDate: start,
    currentPeriodEndDate,
    expiresDate,
  };
}

/**
 * Returns the AI session quota configuration for a given subscription tier.
 * Quotas reset every 30 calendar days; sessions expire after 2 hours of inactivity.
 */
export function getTierAiSessionQuota(tier: SubscriptionTier): AiSessionQuota {
  switch (tier) {
    case 'PRO_SCALE':
      return {
        baseQuota: 300,
        sessionTtlHours: AI_SESSION_TTL_HOURS,
        resetCycleDays: RESET_CYCLE_DAYS,
        description: '300 sesi AI per 30 hari kalender (TTL 2 jam per sesi)',
      };
    case 'ENTERPRISE':
      return {
        baseQuota: 600,
        sessionTtlHours: AI_SESSION_TTL_HOURS,
        resetCycleDays: RESET_CYCLE_DAYS,
        description: '600 sesi AI per 30 hari kalender (TTL 2 jam per sesi)',
      };
    case 'CHECKOUT_LITE':
    case 'STARTER':
    default:
      return {
        baseQuota: 0,
        sessionTtlHours: AI_SESSION_TTL_HOURS,
        resetCycleDays: RESET_CYCLE_DAYS,
        description: '0 sesi AI (Auto-reply dasar deterministik / tanpa LLM)',
      };
  }
}

/**
 * Determines whether a subscription is currently active and within its valid lifecycle.
 */
export function isSubscriptionActive(
  status: SubscriptionStatus,
  expiresAt: Date | string | number | null
): boolean {
  if (status === 'EXPIRED') return false;
  if (!['ACTIVE', 'TRIAL', 'GRACE_PERIOD'].includes(status)) return false;

  const expiry = getWIBDate(expiresAt);
  return expiry.getTime() > Date.now();
}

/**
 * Commercial pricing structure for multi-duration subscriptions (1, 6, 12 months).
 */
export const SUBSCRIPTION_PRICING: Record<SubscriptionTier, TierPricingConfig> = {
  CHECKOUT_LITE: {
    tier: 'CHECKOUT_LITE',
    name: 'Paket Checkout Lite',
    durations: {
      1: {
        durationMonths: 1,
        priceTotal: 59000,
        pricePerMonth: 59000,
        discountPercentage: 0,
      },
      6: {
        durationMonths: 6,
        priceTotal: 318600, // 10% discount: 59k * 6 * 0.9
        pricePerMonth: 53100,
        discountPercentage: 10,
      },
      12: {
        durationMonths: 12,
        priceTotal: 566400, // 20% discount: 59k * 12 * 0.8
        pricePerMonth: 47200,
        discountPercentage: 20,
      },
    },
  },
  STARTER: {
    tier: 'STARTER',
    name: 'Solo / Starter',
    durations: {
      1: {
        durationMonths: 1,
        priceTotal: 199000,
        pricePerMonth: 199000,
        discountPercentage: 0,
      },
      6: {
        durationMonths: 6,
        priceTotal: 1074600, // 10% discount: 199k * 6 * 0.9
        pricePerMonth: 179100,
        discountPercentage: 10,
      },
      12: {
        durationMonths: 12,
        priceTotal: 1910400, // 20% discount: 199k * 12 * 0.8
        pricePerMonth: 159200,
        discountPercentage: 20,
      },
    },
  },
  PRO_SCALE: {
    tier: 'PRO_SCALE',
    name: 'Ads Performance',
    durations: {
      1: {
        durationMonths: 1,
        priceTotal: 299000,
        pricePerMonth: 299000,
        discountPercentage: 0,
      },
      6: {
        durationMonths: 6,
        priceTotal: 1614600, // 10% discount: 299k * 6 * 0.9
        pricePerMonth: 269100,
        discountPercentage: 10,
      },
      12: {
        durationMonths: 12,
        priceTotal: 2870400, // 20% discount: 299k * 12 * 0.8
        pricePerMonth: 239200,
        discountPercentage: 20,
      },
    },
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Team Scale',
    durations: {
      1: {
        durationMonths: 1,
        priceTotal: 499000,
        pricePerMonth: 499000,
        discountPercentage: 0,
      },
      6: {
        durationMonths: 6,
        priceTotal: 2694600, // 10% discount: 499k * 6 * 0.9
        pricePerMonth: 449100,
        discountPercentage: 10,
      },
      12: {
        durationMonths: 12,
        priceTotal: 4790400, // 20% discount: 499k * 12 * 0.8
        pricePerMonth: 399200,
        discountPercentage: 20,
      },
    },
  },
};
