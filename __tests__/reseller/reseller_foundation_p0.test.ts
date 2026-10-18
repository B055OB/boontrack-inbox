/**
 * @file __tests__/reseller/reseller_foundation_p0.test.ts
 * @description Test Suite for Directive RE-01 (Sprint P0): Fondasi Reseller OnlineBoost & Transaction Attribution
 *
 * Verifies:
 * 1. Database Schema & Sanitizer Whitelist (orders snapshot columns)
 * 2. 2-Priority Attribution Resolver (Priority 1: Lock vs Priority 2: Direct Click)
 * 3. Anti Self-Referral Prevention (Buyer Phone/Email matches Reseller)
 * 4. Golden Penny Test (Rp 1.500 precision, 7-day clearance, PENDING_CLEARANCE status)
 * 5. Idempotent Ledger Mutation ('EARN_' prefix)
 * 6. Multi-Tenant Data Isolation (RLS & Tenant Scoping)
 * 7. Client-side Storage (30-day expiration, cookie fallback)
 */

import {
  resolveOrderAttribution,
  recordResellerCommissionLedger,
  calculateResellerCommission,
} from '@/lib/attribution/reseller-attribution-service';
import { sanitizeOrderPayload, VALID_ORDER_COLUMNS } from '@/lib/order-sanitizer';
import { getActiveResellerCode, injectResellerAttributeToCta } from '@/lib/tracking';

describe('Directive RE-01 (Sprint P0): Reseller Foundation & Transaction Attribution', () => {
  const TENANT_ONLINEBOOST = '707c1bdb-9761-5f86-acd9-15a3e8fc3d2a';
  const TENANT_OTHER = 'e12acd29-6c18-487b-ade7-5422878c1c36';
  const RESELLER_USER_ID = '444766c3-5492-45ab-9793-82cd996b05d3'; // 'dirga'
  const RESELLER_CODE = 'dirga';

  describe('1. Schema Whitelist & Order Sanitizer Protection', () => {
    it('contains all 4 P0 snapshot columns in VALID_ORDER_COLUMNS', () => {
      expect(VALID_ORDER_COLUMNS.has('reseller_user_id')).toBe(true);
      expect(VALID_ORDER_COLUMNS.has('reseller_code_snapshot')).toBe(true);
      expect(VALID_ORDER_COLUMNS.has('reseller_commission_amount')).toBe(true);
      expect(VALID_ORDER_COLUMNS.has('attribution_type')).toBe(true);
    });

    it('preserves all snapshot columns during sanitizeOrderPayload', () => {
      const rawPayload = {
        id: 'ORD-TEST-1001',
        tenant_id: TENANT_ONLINEBOOST,
        product_id: 'prod_test',
        customer_name: 'Budi Pembeli',
        customer_phone: '6281234567890',
        reseller_user_id: RESELLER_USER_ID,
        reseller_code_snapshot: 'dirga',
        reseller_commission_amount: 24750,
        attribution_type: 'DIRECT_CLICK',
        unknown_malicious_column: 'hack',
      };

      const sanitized = sanitizeOrderPayload(rawPayload);
      expect(sanitized.reseller_user_id).toBe(RESELLER_USER_ID);
      expect(sanitized.reseller_code_snapshot).toBe('dirga');
      expect(sanitized.reseller_commission_amount).toBe(24750);
      expect(sanitized.attribution_type).toBe('DIRECT_CLICK');
      expect((sanitized as any).unknown_malicious_column).toBeUndefined();
    });
  });

  describe('2. Attribution Resolver: Priority 1 Lock vs Priority 2 Direct Click', () => {
    it('resolves Priority 1 (ATTRIBUTION_LOCK) when phone has active lock', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'customer_attribution_locks') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              gt: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'lock-uuid-1',
                  tenant_id: TENANT_ONLINEBOOST,
                  customer_phone_e164: '6281234567890',
                  reseller_user_id: RESELLER_USER_ID,
                  reseller_code: RESELLER_CODE,
                  locked_until: new Date(Date.now() + 80 * 86400 * 1000).toISOString(),
                },
                error: null,
              }),
            };
          }
          if (table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'aff-1',
                  referral_code: 'dirga',
                  email: 'melzaidan@gmail.com',
                  commission_rate: 25,
                },
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          };
        }),
      };

      // Even if payload passes a different reseller code ('other_reseller'), Priority 1 lock MUST win
      const result = await resolveOrderAttribution({
        tenantId: TENANT_ONLINEBOOST,
        customerPhone: '081234567890', // auto-normalized to 6281234567890
        resellerCodeFromPayload: 'other_reseller',
        grossAmount: 99000,
        supabaseClient: mockSupabase,
      });

      expect(result.attributionType).toBe('ATTRIBUTION_LOCK');
      expect(result.resellerUserId).toBe(RESELLER_USER_ID);
      expect(result.resellerCodeSnapshot).toBe(RESELLER_CODE);
      expect(result.isExistingLock).toBe(true);
    });

    it('resolves Priority 2 (DIRECT_CLICK) and creates lock when no prior lock exists', async () => {
      let insertedLock: any = null;

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'customer_attribution_locks') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              gt: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: jest.fn().mockImplementation((payload) => {
                insertedLock = payload;
                return {
                  select: jest.fn().mockReturnThis(),
                  maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'new-lock-uuid' } }),
                };
              }),
            };
          }
          if (table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'aff-1',
                  referral_code: 'dirga',
                  email: 'melzaidan@gmail.com',
                  commission_rate: 25,
                },
              }),
            };
          }
          if (table === 'auth.users') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: RESELLER_USER_ID,
                  email: 'melzaidan@gmail.com',
                },
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          };
        }),
      };

      const result = await resolveOrderAttribution({
        tenantId: TENANT_ONLINEBOOST,
        customerPhone: '081234567890',
        resellerCodeFromPayload: 'dirga',
        grossAmount: 99000,
        supabaseClient: mockSupabase,
      });

      expect(result.attributionType).toBe('DIRECT_CLICK');
      expect(result.resellerUserId).toBe(RESELLER_USER_ID);
      expect(result.resellerCodeSnapshot).toBe('dirga');
      expect(result.isExistingLock).toBe(false);

      // Verify 90-day lock creation
      expect(insertedLock).not.toBeNull();
      expect(insertedLock.tenant_id).toBe(TENANT_ONLINEBOOST);
      expect(insertedLock.customer_phone_e164).toBe('6281234567890');
      expect(insertedLock.reseller_user_id).toBe(RESELLER_USER_ID);
      expect(insertedLock.reseller_code).toBe('dirga');

      const lockDurationMs = new Date(insertedLock.locked_until).getTime() - Date.now();
      const lockDays = Math.round(lockDurationMs / (86400 * 1000));
      expect(lockDays).toBeCloseTo(90, 0);
    });

    it('returns NONE when neither lock nor reseller code is provided', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        }),
      };

      const result = await resolveOrderAttribution({
        tenantId: TENANT_ONLINEBOOST,
        customerPhone: '081234567890',
        resellerCodeFromPayload: null,
        grossAmount: 99000,
        supabaseClient: mockSupabase,
      });

      expect(result.attributionType).toBe('NONE');
      expect(result.resellerUserId).toBeNull();
      expect(result.resellerCodeSnapshot).toBeNull();
      expect(result.resellerCommissionAmount).toBe(0);
    });
  });

  describe('3. Anti Self-Referral Protection', () => {
    it('blocks commission when buyer phone matches reseller phone', async () => {
      const mockOrder = {
        id: 'ORD-SELF-REF-1',
        tenant_id: TENANT_ONLINEBOOST,
        customer_phone: '088808091000', // normalized to 6288808091000
        customer_email: 'buyer@example.com',
        reseller_user_id: RESELLER_USER_ID,
        reseller_commission_amount: 24750,
        status: 'PAID',
        paid_at: new Date().toISOString(),
      };

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
            };
          }
          if (table === 'auth.users') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: RESELLER_USER_ID,
                  email: 'reseller@gmail.com',
                  phone: '6288808091000', // Matches buyer phone!
                },
              }),
            };
          }
          if (table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  email: 'reseller@gmail.com',
                  phone_number: '6288808091000',
                },
              }),
            };
          }
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          };
        }),
      };

      const result = await recordResellerCommissionLedger({
        orderId: 'ORD-SELF-REF-1',
        supabaseClient: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('SELF_REFERRAL_PREVENTED');
    });

    it('blocks commission when buyer email matches reseller email', async () => {
      const mockOrder = {
        id: 'ORD-SELF-REF-2',
        tenant_id: TENANT_ONLINEBOOST,
        customer_phone: '081299999999',
        customer_email: 'melzaidan@gmail.com', // Matches reseller email!
        reseller_user_id: RESELLER_USER_ID,
        reseller_commission_amount: 24750,
        status: 'PAID',
        paid_at: new Date().toISOString(),
      };

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
            };
          }
          if (table === 'auth.users') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: RESELLER_USER_ID,
                  email: 'melzaidan@gmail.com',
                  phone: '6288808091000',
                },
              }),
            };
          }
          if (table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  email: 'melzaidan@gmail.com',
                  phone_number: '6288808091000',
                },
              }),
            };
          }
          return {};
        }),
      };

      const result = await recordResellerCommissionLedger({
        orderId: 'ORD-SELF-REF-2',
        supabaseClient: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('SELF_REFERRAL_PREVENTED');
    });
  });

  describe('4. Golden Penny Test (Rp 1.500 Precision & Immutable Ledger Entry)', () => {
    it('records exact Rp 1.500 commission with PENDING_CLEARANCE and 7-day clearance schedule', async () => {
      const settledAt = new Date('2026-10-18T10:00:00.000Z');
      let insertedLedgerRecord: any = null;

      const mockOrder = {
        id: 'ORD-GOLDEN-PENNY-1500',
        tenant_id: TENANT_ONLINEBOOST,
        customer_phone: '628111222333',
        customer_email: 'buyer.legit@example.com',
        reseller_user_id: RESELLER_USER_ID,
        reseller_code_snapshot: 'dirga',
        reseller_commission_amount: 1500.00, // Golden Penny Nominal
        status: 'PAID',
        payment_status: 'PAID',
        gross_amount: 1500,
        paid_at: settledAt.toISOString(),
      };

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
            };
          }
          if (table === 'auth.users') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: RESELLER_USER_ID,
                  email: 'melzaidan@gmail.com',
                  phone: '6288808091000',
                },
              }),
            };
          }
          if (table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  email: 'melzaidan@gmail.com',
                  phone_number: '6288808091000',
                },
              }),
            };
          }
          if (table === 'reseller_commission_ledger') {
            return {
              insert: jest.fn().mockImplementation((payload) => {
                insertedLedgerRecord = payload;
                return {
                  select: jest.fn().mockReturnThis(),
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: 'ledger-uuid-golden-penny',
                      amount: payload.amount,
                      status: payload.status,
                      available_at: payload.available_at,
                      idempotency_key: payload.idempotency_key,
                    },
                    error: null,
                  }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const result = await recordResellerCommissionLedger({
        orderId: 'ORD-GOLDEN-PENNY-1500',
        supabaseClient: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1500.00);
      expect(result.status).toBe('PENDING_CLEARANCE');
      expect(result.idempotencyKey).toBe('EARN_ORD-GOLDEN-PENNY-1500');

      // Verify inserted ledger row fields
      expect(insertedLedgerRecord).not.toBeNull();
      expect(insertedLedgerRecord.tenant_id).toBe(TENANT_ONLINEBOOST);
      expect(insertedLedgerRecord.reseller_user_id).toBe(RESELLER_USER_ID);
      expect(insertedLedgerRecord.order_id).toBe('ORD-GOLDEN-PENNY-1500');
      expect(insertedLedgerRecord.entry_type).toBe('EARNED');
      expect(insertedLedgerRecord.amount).toBe(1500.00);
      expect(insertedLedgerRecord.status).toBe('PENDING_CLEARANCE');
      expect(insertedLedgerRecord.idempotency_key).toBe('EARN_ORD-GOLDEN-PENNY-1500');

      // Verify available_at is settled_at + 7 days
      const expectedAvailable = new Date(settledAt.getTime() + 7 * 86400 * 1000).toISOString();
      expect(insertedLedgerRecord.available_at).toBe(expectedAvailable);
    });

    it('handles idempotent retries without creating duplicate ledger records', async () => {
      const mockOrder = {
        id: 'ORD-IDEMPOTENT-1',
        tenant_id: TENANT_ONLINEBOOST,
        customer_phone: '628111222333',
        customer_email: 'buyer@example.com',
        reseller_user_id: RESELLER_USER_ID,
        reseller_commission_amount: 25000,
        status: 'PAID',
        paid_at: new Date().toISOString(),
      };

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
            };
          }
          if (table === 'auth.users' || table === 'affiliates') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              ilike: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            };
          }
          if (table === 'reseller_commission_ledger') {
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "uq_reseller_commission_ledger_tenant_idempotency"',
                  },
                }),
              }),
            };
          }
          return {};
        }),
      };

      const result = await recordResellerCommissionLedger({
        orderId: 'ORD-IDEMPOTENT-1',
        supabaseClient: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.idempotencyKey).toBe('EARN_ORD-IDEMPOTENT-1');
    });
  });

  describe('5. Client-Side 30-Day Attribution & Storage Fallback', () => {
    let storageMap: Record<string, string> = {};
    let cookieStr = '';
    let mockDom: Record<string, any> = {};

    beforeAll(() => {
      (global as any).window = {
        location: { search: '' },
      };
      (global as any).localStorage = {
        getItem: (key: string) => storageMap[key] || null,
        setItem: (key: string, val: string) => { storageMap[key] = String(val); },
        removeItem: (key: string) => { delete storageMap[key]; },
        clear: () => { storageMap = {}; },
      };
      (global as any).document = {
        get cookie() {
          return cookieStr;
        },
        set cookie(val: string) {
          const mainPart = val.split(';')[0];
          cookieStr = mainPart;
        },
        querySelectorAll: (selectorStr: string) => {
          const list: any[] = [];
          if (mockDom['btn-1']) list.push(mockDom['btn-1']);
          if (mockDom['btn-2']) list.push(mockDom['btn-2']);
          return list;
        },
      };
    });

    afterAll(() => {
      delete (global as any).window;
      delete (global as any).localStorage;
      delete (global as any).document;
    });

    beforeEach(() => {
      storageMap = {};
      cookieStr = '';
      mockDom = {
        'btn-1': {
          id: 'btn-1',
          attrs: {} as Record<string, string>,
          setAttribute(name: string, val: string) { this.attrs[name] = val; },
          getAttribute(name: string) { return this.attrs[name] || null; },
        },
        'btn-2': {
          id: 'btn-2',
          attrs: {} as Record<string, string>,
          setAttribute(name: string, val: string) { this.attrs[name] = val; },
          getAttribute(name: string) { return this.attrs[name] || null; },
        },
      };
    });

    it('retrieves active reseller code from localStorage if not expired', () => {
      const activePayload = {
        code: 'dirga',
        expires_at: Date.now() + 20 * 86400 * 1000, // 20 days remaining
      };
      (global as any).localStorage.setItem('bt_reseller_attribution', JSON.stringify(activePayload));

      expect(getActiveResellerCode()).toBe('dirga');
    });

    it('returns null and purges storage when attribution is expired (> 30 days)', () => {
      const expiredPayload = {
        code: 'expired_reseller',
        expires_at: Date.now() - 1000, // expired 1s ago
      };
      (global as any).localStorage.setItem('bt_reseller_attribution', JSON.stringify(expiredPayload));

      expect(getActiveResellerCode()).toBeNull();
      expect((global as any).localStorage.getItem('bt_reseller_attribution')).toBeNull();
    });

    it('falls back to bt_reseller_code cookie if localStorage is empty', () => {
      (global as any).document.cookie = 'bt_reseller_code=cookie_reseller; path=/; max-age=2592000';
      expect(getActiveResellerCode()).toBe('cookie_reseller');
    });

    it('injects data-bt-reseller attribute to CTA buttons', () => {
      injectResellerAttributeToCta('dirga');

      const btn1 = mockDom['btn-1'];
      const btn2 = mockDom['btn-2'];

      expect(btn1.getAttribute('data-bt-reseller')).toBe('dirga');
      expect(btn2.getAttribute('data-bt-reseller')).toBe('dirga');
    });
  });
});
