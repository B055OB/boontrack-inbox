/**
 * @file __tests__/payment/test_trial_guard.test.ts
 * @description Unit tests for BATCH 1 / Ticket 1.2 — Strict Trial Quota Guard.
 *
 * Test scenarios:
 *   1. Trial tenant below limit → allowed: true
 *   2. Trial tenant at 30 orders → allowed: false, TRIAL_LIMIT_EXCEEDED
 *   3. Non-trial (paid / active subscription) tenant → always allowed: true (bypass)
 *   4. Trial tenant at 50 interactions → allowed: false, TRIAL_LIMIT_EXCEEDED
 *   5. Trial tenant below interaction limit → allowed: true
 *   6. resolveTenantTrialStatus logic: various signal combinations
 *   7. Expired trial → not treated as trial
 *   8. TENANT_NOT_FOUND when tenant doesn't exist
 */

// ---------------------------------------------------------------------------
// Mocks — defined before imports
// ---------------------------------------------------------------------------

const mockOrderCount = { count: 0, error: null };
const mockInteractionCount = { count: 0, error: null };
const mockTenantRow: Record<string, unknown> | null = {
  id: 'tenant-trial-uuid',
  tier: 'PRO_SCALE',
  trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
  subscription_ends_at: null,
  metadata: {
    is_trial: true,
    subscription_status: 'trial',
  },
};

// We use a mutable reference so tests can override per-test
let _tenantOverride: Record<string, unknown> | null = { ...mockTenantRow as Record<string, unknown> };
let _orderCountOverride = 0;
let _interactionCountOverride = 0;
let _tenantNotFound = false;

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => buildMockSupabase()),
  getSupabase: jest.fn(() => buildMockSupabase()),
}));

function buildMockSupabase() {
  return {
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: _tenantNotFound ? null : _tenantOverride,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'orders') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(async () => ({
                count: _orderCountOverride,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'conversation_logs') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(async () => ({
                count: _interactionCountOverride,
                error: null,
              })),
            })),
          })),
        };
      }

      return { select: jest.fn(() => ({ eq: jest.fn(() => ({ gte: jest.fn(async () => ({ count: 0, error: null })) })) })) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  checkTrialQuota,
  resolveTenantTrialStatus,
  getTrialUsageSummary,
  TRIAL_ORDER_LIMIT,
  TRIAL_INTERACTION_LIMIT,
} from '@/lib/entitlements/trial-guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  _tenantNotFound = false;
  _orderCountOverride = 0;
  _interactionCountOverride = 0;
  _tenantOverride = {
    id: 'tenant-trial-uuid',
    tier: 'PRO_SCALE',
    trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_ends_at: null,
    metadata: { is_trial: true, subscription_status: 'trial' },
  };
}

// ---------------------------------------------------------------------------
// Test Suite 1: checkTrialQuota — order resource
// ---------------------------------------------------------------------------

describe('checkTrialQuota("order")', () => {
  beforeEach(resetMocks);

  it('Trial tenant below order limit → allowed: true', async () => {
    _orderCountOverride = 10; // well below 30
    const result = await checkTrialQuota('tenant-trial-uuid', 'order');

    expect(result.allowed).toBe(true);
    expect(result.isTrial).toBe(true);
    expect(result.currentUsage).toBe(10);
    expect(result.limit).toBe(TRIAL_ORDER_LIMIT);
    expect(result.errorCode).toBeUndefined();
  });

  it('Trial tenant exactly at order limit (30) → allowed: false, TRIAL_LIMIT_EXCEEDED', async () => {
    _orderCountOverride = TRIAL_ORDER_LIMIT; // exactly 30
    const result = await checkTrialQuota('tenant-trial-uuid', 'order');

    expect(result.allowed).toBe(false);
    expect(result.isTrial).toBe(true);
    expect(result.errorCode).toBe('TRIAL_LIMIT_EXCEEDED');
    expect(result.currentUsage).toBe(TRIAL_ORDER_LIMIT);
    expect(result.limit).toBe(TRIAL_ORDER_LIMIT);
    expect(result.message).toContain('Batas kuota uji coba 7 hari telah tercapai');
    expect(result.message).toContain('upgrade');
  });

  it('Trial tenant exceeding limit (31 orders) → allowed: false', async () => {
    _orderCountOverride = 31;
    const result = await checkTrialQuota('tenant-trial-uuid', 'order');

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('TRIAL_LIMIT_EXCEEDED');
  });

  it('Trial tenant at 0 orders → allowed: true (fresh trial)', async () => {
    _orderCountOverride = 0;
    const result = await checkTrialQuota('tenant-trial-uuid', 'order');

    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: checkTrialQuota — non-trial tenants always bypass
// ---------------------------------------------------------------------------

describe('checkTrialQuota — non-trial tenant bypass', () => {
  beforeEach(resetMocks);

  it('Paid tenant (no trial signals) → always allowed: true regardless of order count', async () => {
    // Override to a non-trial tenant
    _tenantOverride = {
      id: 'tenant-paid-uuid',
      tier: 'PRO_SCALE',
      trial_ends_at: null, // no trial
      subscription_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { is_trial: false, subscription_status: 'active' },
    };
    _orderCountOverride = 999; // Simulate very high order count

    const result = await checkTrialQuota('tenant-paid-uuid', 'order');

    expect(result.allowed).toBe(true);
    expect(result.isTrial).toBe(false);
    expect(result.errorCode).toBeUndefined();
    // Non-trial does not expose usage counts
    expect(result.currentUsage).toBeUndefined();
  });

  it('Tenant with ENTERPRISE tier and no trial_ends_at → bypassed', async () => {
    _tenantOverride = {
      id: 'tenant-enterprise',
      tier: 'ENTERPRISE',
      trial_ends_at: null,
      subscription_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { is_trial: false, subscription_status: 'active' },
    };

    const result = await checkTrialQuota('tenant-enterprise', 'order');
    expect(result.allowed).toBe(true);
    expect(result.isTrial).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: checkTrialQuota — interaction resource
// ---------------------------------------------------------------------------

describe('checkTrialQuota("interaction")', () => {
  beforeEach(resetMocks);

  it('Trial tenant below interaction limit → allowed: true', async () => {
    _interactionCountOverride = 20;
    const result = await checkTrialQuota('tenant-trial-uuid', 'interaction');

    expect(result.allowed).toBe(true);
    expect(result.isTrial).toBe(true);
    expect(result.currentUsage).toBe(20);
    expect(result.limit).toBe(TRIAL_INTERACTION_LIMIT);
  });

  it('Trial tenant at exactly 50 interactions → allowed: false, TRIAL_LIMIT_EXCEEDED', async () => {
    _interactionCountOverride = TRIAL_INTERACTION_LIMIT;
    const result = await checkTrialQuota('tenant-trial-uuid', 'interaction');

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('TRIAL_LIMIT_EXCEEDED');
    expect(result.currentUsage).toBe(TRIAL_INTERACTION_LIMIT);
    expect(result.message).toContain('percakapan');
  });

  it('Trial tenant exceeding interaction limit (51) → allowed: false', async () => {
    _interactionCountOverride = 51;
    const result = await checkTrialQuota('tenant-trial-uuid', 'interaction');

    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: TENANT_NOT_FOUND scenario
// ---------------------------------------------------------------------------

describe('checkTrialQuota — TENANT_NOT_FOUND', () => {
  it('Unknown tenant UUID → allowed: false, TENANT_NOT_FOUND', async () => {
    _tenantNotFound = true;
    const result = await checkTrialQuota('non-existent-uuid', 'order');

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('TENANT_NOT_FOUND');
    expect(result.message).toContain('tidak ditemukan');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: resolveTenantTrialStatus — signal detection logic
// ---------------------------------------------------------------------------

describe('resolveTenantTrialStatus()', () => {
  it('is_trial=true in metadata → isTrial: true', () => {
    const result = resolveTenantTrialStatus({
      trial_ends_at: null,
      metadata: { is_trial: true },
    });
    expect(result.isTrial).toBe(true);
  });

  it('subscription_status=trial in metadata → isTrial: true', () => {
    const result = resolveTenantTrialStatus({
      trial_ends_at: null,
      metadata: { subscription_status: 'trial', is_trial: false },
    });
    expect(result.isTrial).toBe(true);
  });

  it('trial_ends_at in future → isTrial: true', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = resolveTenantTrialStatus({
      trial_ends_at: futureDate,
      metadata: {},
    });
    expect(result.isTrial).toBe(true);
    expect(result.trialEndsAt).toBe(futureDate);
  });

  it('trial_ends_at in the past → isTrial: false (expired trial)', () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = resolveTenantTrialStatus({
      trial_ends_at: pastDate,
      metadata: {},
    });
    expect(result.isTrial).toBe(false);
  });

  it('No trial signals at all → isTrial: false', () => {
    const result = resolveTenantTrialStatus({
      trial_ends_at: null,
      metadata: { is_trial: false, subscription_status: 'active' },
    });
    expect(result.isTrial).toBe(false);
    expect(result.trialEndsAt).toBeNull();
  });

  it('Empty metadata → isTrial: false', () => {
    const result = resolveTenantTrialStatus({
      trial_ends_at: null,
      metadata: null,
    });
    expect(result.isTrial).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: getTrialUsageSummary
// ---------------------------------------------------------------------------

describe('getTrialUsageSummary()', () => {
  beforeEach(resetMocks);

  it('Returns correct quota summary for trial tenant', async () => {
    _orderCountOverride = 12;
    _interactionCountOverride = 25;

    const summary = await getTrialUsageSummary('tenant-trial-uuid');

    expect(summary.isTrial).toBe(true);
    expect(summary.orders.current).toBe(12);
    expect(summary.orders.limit).toBe(TRIAL_ORDER_LIMIT);
    expect(summary.orders.exceeded).toBe(false);
    expect(summary.interactions.current).toBe(25);
    expect(summary.interactions.limit).toBe(TRIAL_INTERACTION_LIMIT);
    expect(summary.interactions.exceeded).toBe(false);
  });

  it('Marks exceeded=true when order count hits limit', async () => {
    _orderCountOverride = TRIAL_ORDER_LIMIT; // 30
    const summary = await getTrialUsageSummary('tenant-trial-uuid');

    expect(summary.orders.exceeded).toBe(true);
    expect(summary.interactions.exceeded).toBe(false);
  });

  it('Non-trial tenant returns isTrial=false with zeroed counters', async () => {
    _tenantOverride = {
      id: 'tenant-paid-uuid',
      tier: 'ENTERPRISE',
      trial_ends_at: null,
      subscription_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { is_trial: false, subscription_status: 'active' },
    };

    const summary = await getTrialUsageSummary('tenant-paid-uuid');
    expect(summary.isTrial).toBe(false);
    expect(summary.orders.current).toBe(0);
    expect(summary.orders.exceeded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 7: Quota constants — CFO hard-cap values
// ---------------------------------------------------------------------------

describe('CFO hard-cap constants', () => {
  it('TRIAL_ORDER_LIMIT is exactly 30', () => {
    expect(TRIAL_ORDER_LIMIT).toBe(30);
  });

  it('TRIAL_INTERACTION_LIMIT is exactly 50', () => {
    expect(TRIAL_INTERACTION_LIMIT).toBe(50);
  });
});
