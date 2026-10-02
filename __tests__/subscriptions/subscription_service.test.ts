import {
  activateShopSubscription,
  activateSubscription,
  getActiveSubscription,
  renewPeriodQuota,
} from '@/lib/subscriptions/service';
import { SubscriptionTier, SubscriptionDurationMonths } from '@/lib/subscriptions/types';

describe('Subscription Service Layer & Idempotency Suite', () => {
  const mockTenantId = '11111111-2222-3333-4444-555555555555';
  const mockTenantSlug = 'tokoberkah';

  const mockTenant = {
    id: mockTenantId,
    slug: mockTenantSlug,
    name: 'Toko Berkah Sejahtera',
    tier: 'STARTER',
    status: 'TRIAL',
    subscription_tier: 'STARTER',
    subscription_status: 'TRIAL',
    metadata: {
      category: 'RETAIL',
    },
  };

  let mockSupabase: any;
  let tenantUpdatePayload: any = null;
  let subscriptionInsertPayload: any = null;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantUpdatePayload = null;
    subscriptionInsertPayload = null;

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn((col: string, val: string) => {
              if (
                (col === 'id' && val === mockTenantId) ||
                (col === 'slug' && val === mockTenantSlug)
              ) {
                return {
                  maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
                  single: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
                };
              }
              return {
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
              };
            }),
            update: jest.fn((payload: any) => {
              tenantUpdatePayload = payload;
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }

        if (table === 'shop_subscriptions') {
          const queryBuilder: any = {
            _eqs: {} as Record<string, any>,
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            eq: jest.fn(function (col: string, val: any) {
              queryBuilder._eqs[col] = val;
              return queryBuilder;
            }),
            maybeSingle: jest.fn(async function () {
              const eqs = queryBuilder._eqs;
              if (eqs.invoice_id === 'inv-duplicate-999') {
                return {
                  data: {
                    id: 'sub-existing-id',
                    tenant_id: mockTenantId,
                    tenant_slug: mockTenantSlug,
                    tier: 'PRO_SCALE',
                    duration_months: 1,
                    status: 'ACTIVE',
                    invoice_id: 'inv-duplicate-999',
                    amount_paid: 299000,
                    starts_at: '2026-10-03T10:00:00.000+07:00',
                    current_period_starts_at: '2026-10-03T10:00:00.000+07:00',
                    current_period_ends_at: '2026-11-02T10:00:00.000+07:00',
                    expires_at: '2026-11-03T10:00:00.000+07:00',
                  },
                  error: null,
                };
              }
              if (eqs.invoice_id === 'inv-db-error') {
                return {
                  data: null,
                  error: { message: 'Database connection error during lookup' },
                };
              }
              if (eqs.invoice_id) {
                // New invoice ID: does not exist yet!
                return { data: null, error: null };
              }

              if (eqs.id === 'sub-active-123' || (eqs.tenant_id === mockTenantId && eqs.status === 'ACTIVE')) {
                return {
                  data: {
                    id: 'sub-active-123',
                    tenant_id: mockTenantId,
                    tier: 'PRO_SCALE',
                    duration_months: 6,
                    starts_at: '2026-10-03T10:00:00.000+07:00',
                    current_period_starts_at: '2026-10-03T10:00:00.000+07:00',
                    current_period_ends_at: '2026-11-02T10:00:00.000+07:00',
                    expires_at: '2027-04-03T10:00:00.000+07:00',
                    status: 'ACTIVE',
                    invoice_id: 'inv-test-99',
                    amount_paid: 1614600,
                    metadata: {},
                  },
                  error: null,
                };
              }

              return { data: null, error: null };
            }),
            insert: jest.fn((payload: any) => {
              subscriptionInsertPayload = payload;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: 'sub-new-generated-uuid',
                      ...payload,
                    },
                    error: null,
                  }),
                }),
              };
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnThis(),
            }),
          };

          return queryBuilder;
        }

        return {};
      }),
    };
  });

  describe('1. Function Exports Alignment', () => {
    it('exports activateShopSubscription and backward-compatible alias activateSubscription', () => {
      expect(typeof activateShopSubscription).toBe('function');
      expect(typeof activateSubscription).toBe('function');
      expect(activateSubscription).toBe(activateShopSubscription);
    });
  });

  describe('2. Idempotency Handling via invoice_id', () => {
    it('returns existing subscription without inserting new record when invoice_id already processed', async () => {
      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 1,
          invoiceId: 'inv-duplicate-999',
          amountPaid: 299000,
        },
        mockSupabase
      );

      expect(res.success).toBe(true);
      expect(res.isExisting).toBe(true);
      expect(res.subscription?.id).toBe('sub-existing-id');
      expect(res.subscription?.invoice_id).toBe('inv-duplicate-999');
      expect(subscriptionInsertPayload).toBeNull(); // No insert happened!
      expect(tenantUpdatePayload).toBeNull(); // No redundant tenant update!
    });

    it('returns error when idempotency check database query fails', async () => {
      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 1,
          invoiceId: 'inv-db-error',
        },
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Error checking invoice idempotency');
    });
  });

  describe('3. Successful Subscription Activation Scenarios', () => {
    it('successfully activates a 1-month PRO_SCALE subscription with WIB (+07:00) timezone and updates tenants table', async () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z'); // 10:00 WIB
      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 1,
          invoiceId: 'inv-new-101',
          amountPaid: 299000,
          startDate,
        },
        mockSupabase
      );

      expect(res.success).toBe(true);
      expect(res.isExisting).toBeUndefined();
      expect(res.subscription).toBeDefined();
      expect(res.subscription?.id).toBe('sub-new-generated-uuid');
      expect(res.subscription?.status).toBe('ACTIVE');
      expect(res.subscription?.tier).toBe('PRO_SCALE');
      expect(res.subscription?.duration_months).toBe(1);

      // Verify Asia/Jakarta (+07:00) timezone timestamps
      expect(res.subscription?.starts_at).toBe('2026-10-03T10:00:00.000+07:00');
      expect(res.subscription?.current_period_starts_at).toBe('2026-10-03T10:00:00.000+07:00');
      expect(res.subscription?.current_period_ends_at).toBe('2026-11-02T10:00:00.000+07:00');
      expect(res.subscription?.expires_at).toBe('2026-11-03T10:00:00.000+07:00');

      // Verify tenant table synchronization
      expect(tenantUpdatePayload).toBeDefined();
      expect(tenantUpdatePayload.tier).toBe('PRO_SCALE');
      expect(tenantUpdatePayload.subscription_tier).toBe('PRO_SCALE');
      expect(tenantUpdatePayload.status).toBe('ACTIVE');
      expect(tenantUpdatePayload.subscription_status).toBe('ACTIVE');
      expect(tenantUpdatePayload.subscription_ends_at).toBe('2026-11-03T10:00:00.000+07:00');
      expect(tenantUpdatePayload.due_date).toBe('2026-11-03');
      expect(tenantUpdatePayload.metadata?.subscription?.ai_quota?.base_quota).toBe(300);
      expect(tenantUpdatePayload.metadata?.subscription?.ai_quota?.session_ttl_hours).toBe(2);
      expect(tenantUpdatePayload.metadata?.subscription?.ai_quota?.reset_cycle_days).toBe(30);
    });

    it('successfully activates a 6-month ENTERPRISE subscription (600 AI sessions)', async () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z');
      const res = await activateShopSubscription(
        {
          tenantId: mockTenantId,
          tier: 'ENTERPRISE',
          durationMonths: 6,
          invoiceId: 'inv-enterprise-6mo',
          amountPaid: 2694600,
          startDate,
        },
        mockSupabase
      );

      expect(res.success).toBe(true);
      expect(res.subscription?.tier).toBe('ENTERPRISE');
      expect(res.subscription?.duration_months).toBe(6);
      expect(res.subscription?.current_period_ends_at).toBe('2026-11-02T10:00:00.000+07:00');
      expect(res.subscription?.expires_at).toBe('2027-04-03T10:00:00.000+07:00');

      expect(tenantUpdatePayload.subscription_tier).toBe('ENTERPRISE');
      expect(tenantUpdatePayload.metadata?.subscription?.ai_quota?.base_quota).toBe(600);
    });

    it('successfully activates a 12-month STARTER subscription (0 AI sessions)', async () => {
      const startDate = new Date('2026-10-03T03:00:00.000Z');
      const res = await activateShopSubscription(
        {
          tenantId: mockTenantId,
          tier: 'STARTER',
          durationMonths: 12,
          amountPaid: 1910400,
          startDate,
        },
        mockSupabase
      );

      expect(res.success).toBe(true);
      expect(res.subscription?.tier).toBe('STARTER');
      expect(res.subscription?.duration_months).toBe(12);
      expect(res.subscription?.expires_at).toBe('2027-10-03T10:00:00.000+07:00');

      expect(tenantUpdatePayload.subscription_tier).toBe('STARTER');
      expect(tenantUpdatePayload.metadata?.subscription?.ai_quota?.base_quota).toBe(0);
    });
  });

  describe('4. Fail-Closed Error Handling & Query Failures', () => {
    it('fails closed when tenant is not found in database', async () => {
      const res = await activateShopSubscription(
        {
          tenantId: '00000000-0000-0000-0000-000000000000',
          tier: 'PRO_SCALE',
          durationMonths: 1,
        },
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Tenant not found');
    });

    it('fails closed when neither tenantId nor tenantSlug is provided', async () => {
      const res = await activateShopSubscription(
        {
          tier: 'PRO_SCALE',
          durationMonths: 1,
        } as any,
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Either tenantId or tenantSlug must be provided');
    });

    it('rejects invalid subscription durations', async () => {
      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 3 as any,
        },
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid subscription duration');
    });

    it('handles error when inserting into shop_subscriptions fails', async () => {
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
            }),
          };
        }
        if (table === 'shop_subscriptions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnThis(),
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Insert constraint error' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 1,
        },
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Insert constraint error');
    });

    it('handles error when updating tenants table fails', async () => {
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Tenant table lock timeout' },
              }),
            }),
          };
        }
        if (table === 'shop_subscriptions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnThis(),
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'sub-new-123' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await activateShopSubscription(
        {
          tenantSlug: mockTenantSlug,
          tier: 'PRO_SCALE',
          durationMonths: 1,
        },
        mockSupabase
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Subscription recorded but tenant sync failed');
    });
  });

  describe('5. Active Subscription Lookup & Renewal', () => {
    it('retrieves active subscription successfully', async () => {
      const sub = await getActiveSubscription(mockTenantId, mockSupabase);
      expect(sub).toBeDefined();
      expect(sub?.status).toBe('ACTIVE');
    });

    it('advances current period quota window on renewal', async () => {
      const res = await renewPeriodQuota('sub-active-123', mockSupabase);
      expect(res.success).toBe(true);
      expect(res.newPeriodEndsAt).toBeDefined();
    });
  });
});
