/**
 * @file lib/studio/intelligence/freshness.ts
 * @description Freshness Evaluation Engine for Video Signals and Normalized Insights
 * Evaluates temporal degradation of viral signals:
 * - FRESH: < 48 hours (< 2 days)
 * - AGING: 48 hours to 7 days (2-7 days)
 * - STALE: 7 days to 14 days (7-14 days)
 * - EXPIRED: > 14 days or past explicit expiration date
 */

import { FreshnessStatus } from './contracts';

export const FRESHNESS_THRESHOLDS = {
  FRESH_MAX_MS: 48 * 60 * 60 * 1000,      // 48 hours
  AGING_MAX_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
  STALE_MAX_MS: 14 * 24 * 60 * 60 * 1000, // 14 days
};

/**
 * Evaluates the freshness status of an observed evidence signal.
 * @param observedAt Timestamp when the signal was observed/ingested.
 * @param expiresAt Optional hard expiration timestamp.
 * @returns FreshnessStatus ('FRESH' | 'AGING' | 'STALE' | 'EXPIRED')
 */
export function evaluateFreshness(
  observedAt: Date | string,
  expiresAt?: Date | string | null
): FreshnessStatus {
  const now = Date.now();

  // 1. Explicit expiration check
  if (expiresAt) {
    const expiresTime = new Date(expiresAt).getTime();
    if (!isNaN(expiresTime) && now >= expiresTime) {
      return 'EXPIRED';
    }
  }

  // 2. Parse observed timestamp
  const observedTime = new Date(observedAt).getTime();
  if (isNaN(observedTime)) {
    return 'STALE';
  }

  const ageMs = now - observedTime;

  // Signal from the future or just observed
  if (ageMs <= 0 || ageMs < FRESHNESS_THRESHOLDS.FRESH_MAX_MS) {
    return 'FRESH';
  }

  if (ageMs < FRESHNESS_THRESHOLDS.AGING_MAX_MS) {
    return 'AGING';
  }

  if (ageMs < FRESHNESS_THRESHOLDS.STALE_MAX_MS) {
    return 'STALE';
  }

  return 'EXPIRED';
}
