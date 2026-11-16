/**
 * @file __tests__/inbox/inbox_pos_01_order_gateway.test.ts
 * @description Unit and Integration Test Suite for Custom POS Order Server Gateway
 *
 * Covers INBOX-POS-01 / Patch 2 & CTO Security Remediation Order (SEC-P5-01, SEC-P5-02, SEC-P5-03):
 * 1. Missing/invalid session -> 401
 * 2. Authenticated non-CS/unauthorized user -> 403
 * 3. CS without order permission -> 403
 * 4. CS from Tenant A attempting Tenant B -> 403
 * 5. Forged csUserId/csUserName -> overridden by session
 * 6. conversationId belonging to another tenant -> 403/404
 * 7. contactId belonging to another tenant -> 403/404
 * 8. Forged bankAccount -> ignored (uses DB tenant bank account)
 * 9. Invalid amounts ("25000abc", "25000.50", "-1000", "NaN", "500", "10000001" QRIS) -> 400
 * 10. Valid authorized POS order -> 200
 */

import { NextRequest } from 'next/server';
import { POST, parseStrictRupiahAmount, MAX_MANUAL_BANK_AMOUNT } from '@/app/api/inbox/orders/custom/route';
import { POST as POST_V1 } from '@/app/api/v1/inbox/orders/custom/route';
import * as supabaseClientModule from '@/lib/supabaseClient';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

describe('INBOX-POS-01: Custom POS Order Server Gateway Security & Functional Suite', () => {
  const originalEnv = process.env;

  const TEST_TENANT_ID = 'tenant-uuid-1234';
  const TEST_TENANT_SLUG = 'toko-kreatif';
  const ALIEN_TENANT_ID = 'tenant-uuid-9999';
  const ALIEN_TENANT_SLUG = 'toko-alien';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MERCHANT_SESSION_SECRET: 'test_dev_secret_32_characters_long_for_hmac!',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  // Helper to mint test tokens
  const mintTestToken = (params: {
    tenantSlug?: string;
    tenantId?: string;
    role?: 'OWNER' | 'MERCHANT' | 'CS' | 'OPERATOR' | string;
    userId?: string;
    name?: string;
    phone?: string;
    permissions?: string[];
    access_level?: string;
    canCreateOrders?: boolean;
    ttlMs?: number;
  }) => {
    return signMerchantSessionToken({
      tenantSlug: params.tenantSlug || TEST_TENANT_SLUG,
      tenantId: params.tenantId || TEST_TENANT_ID,
      role: (params.role as any) || 'OWNER',
      userId: params.userId || 'user-01',
      name: params.name || 'Test User',
      phone: params.phone || '628111222333',
      ttlMs: params.ttlMs || 3600000,
      ...(params.permissions ? { permissions: params.permissions } : {}),
      ...(params.access_level ? { access_level: params.access_level } : {}),
      ...(params.canCreateOrders !== undefined ? { canCreateOrders: params.canCreateOrders } : {}),
    } as any);
  };

  const createMockSupabase = (options: {
    tenantData?: any;
    tenantError?: any;
    insertError?: any;
    conversations?: Record<string, any>;
    contacts?: Record<string, any>;
    tenantUsers?: Record<string, any>;
  } = {}) => {
    const {
      tenantData = {
        id: TEST_TENANT_ID,
        slug: TEST_TENANT_SLUG,
        name: 'Toko Kreatif',
        metadata: {
          products: [
            { id: 'prod_video_1', name: 'Jasa Video Promosi', price: 150000 },
            { id: 'prod_logo_2', name: 'Desain Logo', price: 200000 },
          ],
          bank_accounts: [
            { bank_name: 'BCA', account_number: '1234567890', account_holder: 'PT Toko Kreatif' },
            { bank_name: 'Mandiri', account_number: '9876543210', account_holder: 'PT Toko Kreatif' },
          ],
        },
      },
      tenantError = null,
      insertError = null,
      conversations = {},
      contacts = {},
      tenantUsers = {},
    } = options;

    const resolvedTenantUsers: Record<string, any> = {
      'legitimate-cs-uuid-777': {
        id: 'legitimate-cs-uuid-777',
        tenant_id: TEST_TENANT_ID,
        role: 'CS',
        is_active: true,
        can_create_orders: true,
        name: 'Siti Legitimate CS',
      },
      'cs-auth-01': {
        id: 'cs-auth-01',
        tenant_id: TEST_TENANT_ID,
        role: 'CS',
        is_active: true,
        can_create_orders: true,
        name: 'Authorized CS Siti',
      },
      'cs-chat-only-1': {
        id: 'cs-chat-only-1',
        tenant_id: TEST_TENANT_ID,
        role: 'CS',
        is_active: true,
        can_create_orders: false,
        permissions: ['live_chat', 'view_messages'],
      },
      'cs-denied-1': {
        id: 'cs-denied-1',
        tenant_id: TEST_TENANT_ID,
        role: 'CS',
        is_active: true,
        can_create_orders: true,
      },
      ...tenantUsers,
    };

    let capturedOrderPayload: any = null;

    const mockSupabase: any = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: tenantData,
              error: tenantError,
            }),
          };
        }
        if (table === 'orders') {
          return {
            insert: jest.fn().mockImplementation((payload: any) => {
              capturedOrderPayload = payload;
              return {
                select: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: insertError ? null : { ...payload, id: payload.id || 'ord-generated-id' },
                  error: insertError,
                }),
              };
            }),
          };
        }
        if (table === 'conversations') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: conversations[val] || null,
                error: null,
              }),
            })),
          };
        }
        if (table === 'contacts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: contacts[val] || null,
                error: null,
              }),
            })),
          };
        }
        if (table === 'tenant_users') {
          const filters: Record<string, string> = {};
          const queryBuilder: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              filters[col] = String(val);
              return queryBuilder;
            }),
            maybeSingle: jest.fn().mockImplementation(() => {
              const compositeKey = `${filters.tenant_id}:${filters.id || filters.phone}`;
              if (resolvedTenantUsers[compositeKey] !== undefined) {
                return Promise.resolve({ data: resolvedTenantUsers[compositeKey], error: null });
              }
              const userById = filters.id ? resolvedTenantUsers[filters.id] : (filters.phone ? resolvedTenantUsers[filters.phone] : null);
              if (userById !== undefined && userById !== null) {
                if (!filters.tenant_id || userById.tenant_id === filters.tenant_id) {
                  return Promise.resolve({ data: userById, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              }
              const matchingUser = Object.values(resolvedTenantUsers).find((u: any) => {
                if (!u) return false;
                if (filters.tenant_id && u.tenant_id !== filters.tenant_id) return false;
                if (filters.id && u.id !== filters.id) return false;
                if (filters.phone && u.phone !== filters.phone) return false;
                return true;
              });
              return Promise.resolve({ data: matchingUser || null, error: null });
            }),
          };
          return queryBuilder;
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      _getCapturedOrderPayload: () => capturedOrderPayload,
    };

    return mockSupabase;
  };

  // ===========================================================================
  // CTO SECURITY REMEDIATION ORDER — 10 MANDATORY SCENARIOS
  // ===========================================================================
  describe('CTO SECURITY REMEDIATION ORDER — 10 MANDATORY SCENARIOS', () => {
    // -------------------------------------------------------------------------
    // Scenario 1: Missing or Invalid Session -> 401 Unauthorized
    // -------------------------------------------------------------------------
    it('Scenario 1: rejects requests with missing or invalid session with 401 Unauthorized', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // Case 1a: Completely missing token/cookie
      const reqMissing = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resMissing = await POST(reqMissing);
      const dataMissing = await resMissing.json();
      expect(resMissing.status).toBe(401);
      expect(dataMissing.success).toBe(false);
      expect(dataMissing.error).toContain('Unauthorized');

      // Case 1b: Invalid/forged signature token
      const reqForged = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'bt_merchant_token=forgedpayload.invalidhmacsignature12345',
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resForged = await POST(reqForged);
      const dataForged = await resForged.json();
      expect(resForged.status).toBe(401);
      expect(dataForged.success).toBe(false);
      expect(dataForged.error).toContain('Unauthorized');

      // Case 1c: Expired token
      const expiredToken = mintTestToken({ ttlMs: -10000 });
      const reqExpired = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${expiredToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resExpired = await POST(reqExpired);
      const dataExpired = await resExpired.json();
      expect(resExpired.status).toBe(401);
      expect(dataExpired.success).toBe(false);
      expect(dataExpired.error).toContain('Unauthorized');
    });

    // -------------------------------------------------------------------------
    // Scenario 2: Authenticated Non-CS / Unauthorized User -> 403 Forbidden
    // -------------------------------------------------------------------------
    it('Scenario 2: rejects authenticated users with unauthorized roles (e.g. VIEWER, GUEST) with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const unauthorizedRoles = ['VIEWER', 'GUEST', 'MEMBER', 'AFFILIATE', 'CUSTOMER'];

      for (const role of unauthorizedRoles) {
        const token = mintTestToken({ role });
        const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${token}`,
          },
          body: JSON.stringify({
            tenantSlug: TEST_TENANT_SLUG,
            customerPhone: '6281234567890',
            rawAmount: '50000',
          }),
        });

        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('tidak memiliki wewenang');
      }
    });

    // -------------------------------------------------------------------------
    // Scenario 3: CS Without Order Permission -> 403 Forbidden
    // -------------------------------------------------------------------------
    it('Scenario 3: rejects CS users without explicit POS order-creation permission with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // Case 3a: CS token with empty or read-only permissions
      const csNoPermToken = mintTestToken({
        role: 'CS',
        userId: 'cs-chat-only-1',
        permissions: ['live_chat', 'view_messages'],
      });
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csNoPermToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak memiliki izin');

      // Case 3b: CS token with explicit canCreateOrders: false
      const csExplicitDenied = mintTestToken({
        role: 'CS',
        userId: 'cs-denied-1',
        canCreateOrders: false,
      });
      const reqDenied = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csExplicitDenied}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resDenied = await POST(reqDenied);
      const dataDenied = await resDenied.json();
      expect(resDenied.status).toBe(403);
      expect(dataDenied.success).toBe(false);
    });

    // -------------------------------------------------------------------------
    // Scenario 4: CS from Tenant A Attempting Tenant B -> 403 Forbidden
    // -------------------------------------------------------------------------
    it('Scenario 4: blocks CS from Tenant A attempting to create order for Tenant B with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // CS token bound to Tenant A (toko-kreatif)
      const tokenTenantA = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        permissions: ['pos', 'orders'],
      });

      // Request body targets Tenant B (toko-alien)
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenTenantA}`,
        },
        body: JSON.stringify({
          tenantSlug: ALIEN_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak diizinkan mengakses tenant target');
    });

    // -------------------------------------------------------------------------
    // Scenario 5: Forged csUserId / csUserName -> Overridden by Session
    // -------------------------------------------------------------------------
    it('Scenario 5: overrides forged client-supplied csUserId and csUserName with authoritative session data', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const legitimateCsToken = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'legitimate-cs-uuid-777',
        name: 'Siti Legitimate CS',
        permissions: ['pos', 'orders'],
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${legitimateCsToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
          // Malicious client attempts to forge CS identity
          csUserId: 'attacker-forged-cs-id',
          csUserName: 'Attacker Forged Name',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.metadata.created_by_cs_id).toBe('legitimate-cs-uuid-777');
      expect(inserted.metadata.created_by_cs_name).toBe('Siti Legitimate CS');
      expect(inserted.metadata.created_by_cs_id).not.toBe('attacker-forged-cs-id');
      expect(inserted.metadata.created_by_cs_name).not.toBe('Attacker Forged Name');
    });

    // -------------------------------------------------------------------------
    // Scenario 6: conversationId Belonging to Another Tenant -> 403/404
    // -------------------------------------------------------------------------
    it('Scenario 6: rejects conversationId belonging to another tenant or non-existent with 403 or 404', async () => {
      const mockDb = createMockSupabase({
        conversations: {
          'conv-alien-store': {
            id: 'conv-alien-store',
            tenant_id: ALIEN_TENANT_ID,
            tenant_slug: ALIEN_TENANT_SLUG,
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      // Case 6a: Conversation belongs to alien tenant -> 403 Forbidden
      const reqAlienConv = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          conversationId: 'conv-alien-store',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resAlienConv = await POST(reqAlienConv);
      const dataAlienConv = await resAlienConv.json();
      expect(resAlienConv.status).toBe(403);
      expect(dataAlienConv.success).toBe(false);
      expect(dataAlienConv.error).toContain('Conversation tidak terdaftar pada tenant ini');

      // Case 6b: Conversation does not exist -> 404 Not Found
      const reqNotFoundConv = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          conversationId: 'conv-completely-unknown-999',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resNotFoundConv = await POST(reqNotFoundConv);
      const dataNotFoundConv = await resNotFoundConv.json();
      expect(resNotFoundConv.status).toBe(404);
      expect(dataNotFoundConv.success).toBe(false);
      expect(dataNotFoundConv.error).toContain('Conversation tidak ditemukan');
    });

    // -------------------------------------------------------------------------
    // Scenario 7: contactId Belonging to Another Tenant -> 403/404
    // -------------------------------------------------------------------------
    it('Scenario 7: rejects contactId belonging to another tenant or non-existent with 403 or 404', async () => {
      const mockDb = createMockSupabase({
        contacts: {
          'contact-alien-store': {
            id: 'contact-alien-store',
            tenant_id: ALIEN_TENANT_ID,
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      // Case 7a: Contact belongs to alien tenant -> 403 Forbidden
      const reqAlienContact = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          contactId: 'contact-alien-store',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resAlienContact = await POST(reqAlienContact);
      const dataAlienContact = await resAlienContact.json();
      expect(resAlienContact.status).toBe(403);
      expect(dataAlienContact.success).toBe(false);
      expect(dataAlienContact.error).toContain('Kontak tidak terdaftar pada tenant ini');

      // Case 7b: Contact does not exist -> 404 Not Found
      const reqNotFoundContact = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          contactId: 'contact-non-existent-888',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });
      const resNotFoundContact = await POST(reqNotFoundContact);
      const dataNotFoundContact = await resNotFoundContact.json();
      expect(resNotFoundContact.status).toBe(404);
      expect(dataNotFoundContact.success).toBe(false);
      expect(dataNotFoundContact.error).toContain('Kontak tidak ditemukan');
    });

    // -------------------------------------------------------------------------
    // Scenario 8: Forged bankAccount -> Ignored (Uses DB Tenant Bank Account)
    // -------------------------------------------------------------------------
    it('Scenario 8: ignores forged client bankAccount and selects trusted bank account strictly from DB tenant record', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '100000',
          billingType: 'MANUAL_BANK',
          bankAccountIndex: 1, // Requests 2nd account (Mandiri)
          // Forged bank account payload sent by attacker
          bankAccount: {
            bank_name: 'ATTACKER_BANK',
            account_number: '6666666666',
            account_holder: 'Attacker Account',
          },
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.metadata.bank_account).toBeDefined();
      // Must be Mandiri from DB (canonical uppercase), NOT ATTACKER_BANK
      expect(inserted.metadata.bank_account.bank_name).toBe('MANDIRI');
      expect(inserted.metadata.bank_account.account_number).toBe('9876543210');
      expect(inserted.metadata.bank_account.account_holder).toBe('PT Toko Kreatif');
      expect(inserted.metadata.bank_account.bank_name).not.toBe('ATTACKER_BANK');
    });

    // -------------------------------------------------------------------------
    // Scenario 9: Invalid Amounts -> 400 Bad Request
    // -------------------------------------------------------------------------
    it('Scenario 9: rejects invalid amounts ("25000abc", "25000.50", "-1000", "NaN", "500", "10000001" QRIS) with 400 Bad Request', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const invalidAmountCases: Array<{ amount: any; billingType?: string; errorSubstr?: string }> = [
        { amount: '25000abc', errorSubstr: 'non-angka' },
        { amount: '25000.50', errorSubstr: 'pecahan/desimal' },
        { amount: -1000, errorSubstr: 'negatif' },
        { amount: '-1000', errorSubstr: 'negatif' },
        { amount: 'NaN', errorSubstr: 'angka yang valid' },
        { amount: 500, errorSubstr: 'Minimal transaksi adalah Rp 1.000' },
        { amount: 10000001, billingType: 'QRIS', errorSubstr: '10.000.000' },
        { amount: 0, errorSubstr: 'Minimal transaksi adalah Rp 1.000' },
        { amount: '0', errorSubstr: 'Minimal transaksi adalah Rp 1.000' },
        { amount: '25000,50', errorSubstr: 'pecahan/desimal' },
      ];

      for (const tc of invalidAmountCases) {
        const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${validToken}`,
          },
          body: JSON.stringify({
            tenantSlug: TEST_TENANT_SLUG,
            customerPhone: '6281234567890',
            rawAmount: tc.amount,
            billingType: tc.billingType || 'QRIS',
          }),
        });

        const res = await POST(req);
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
        if (tc.errorSubstr) {
          expect(data.error).toContain(tc.errorSubstr);
        }
      }
    });

    // -------------------------------------------------------------------------
    // Scenario 10: Valid Authorized POS Order -> 200 OK
    // -------------------------------------------------------------------------
    it('Scenario 10: successfully creates authorized POS order with 200 OK for owner and authorized CS', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // Test with authorized CS
      const csToken = mintTestToken({
        role: 'CS',
        userId: 'cs-auth-01',
        name: 'Authorized CS Siti',
        permissions: ['pos', 'orders'],
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          customerName: 'Budi Pembeli',
          itemName: 'Jasa Video Promosi',
          rawAmount: '150.000', // Standard Indonesian thousands format
          billingType: 'QRIS',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(150000);
      expect(data.baseAmount).toBe(150000);
      expect(data.orderNumber).toMatch(/^ORD-POS-\d{6}-[0-9A-F]{6}$/);
      expect(data.orderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(data.paymentToken).toMatch(/^pay_[0-9a-f]{32}$/);
      expect(data.payUrl).toContain(data.paymentToken);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.product_id).toBe('prod_video_1');
      expect(inserted.gross_amount).toBe(150000);
      expect(inserted.customer_name).toBe('Budi Pembeli');
      expect(inserted.customer_phone).toBe('6281234567890');
      expect(inserted.metadata.created_by_cs_id).toBe('cs-auth-01');
      expect(inserted.metadata.created_by_cs_name).toBe('Authorized CS Siti');
    });
  });

  // ===========================================================================
  // ADDITIONAL REGRESSION & EDGE CASE SUITES
  // ===========================================================================
  describe('Standalone Unit Tests: parseStrictRupiahAmount', () => {
    it('accepts clean integers and thousand-separated formats', () => {
      expect(parseStrictRupiahAmount(25000)).toEqual({ valid: true, amount: 25000 });
      expect(parseStrictRupiahAmount('25000')).toEqual({ valid: true, amount: 25000 });
      expect(parseStrictRupiahAmount('25.000')).toEqual({ valid: true, amount: 25000 });
      expect(parseStrictRupiahAmount('25,000')).toEqual({ valid: true, amount: 25000 });
      expect(parseStrictRupiahAmount('Rp 25.000')).toEqual({ valid: true, amount: 25000 });
      expect(parseStrictRupiahAmount('IDR 1.500.000')).toEqual({ valid: true, amount: 1500000 });
    });

    it('rejects invalid, decimal, or negative inputs', () => {
      expect(parseStrictRupiahAmount('25000.50').valid).toBe(false);
      expect(parseStrictRupiahAmount('25000,50').valid).toBe(false);
      expect(parseStrictRupiahAmount(25000.5).valid).toBe(false);
      expect(parseStrictRupiahAmount('25000abc').valid).toBe(false);
      expect(parseStrictRupiahAmount(-500).valid).toBe(false);
      expect(parseStrictRupiahAmount('NaN').valid).toBe(false);
      expect(parseStrictRupiahAmount(null).valid).toBe(false);
      expect(parseStrictRupiahAmount('').valid).toBe(false);
    });
  });

  describe('MANUAL_BANK Edge Cases & Unique Code', () => {
    it('allows MANUAL_BANK amounts above Rp 10.000.000 with server-generated uniqueCode', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '25.000.000',
          billingType: 'MANUAL_BANK',
          uniqueCode: 250,
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(25000250);
      expect(data.baseAmount).toBe(25000000);
      expect(data.uniqueCode).toBe(250);
    });

    it('rejects MANUAL_BANK with invalid uniqueCode (e.g. 1500 or -5)', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
          billingType: 'MANUAL_BANK',
          uniqueCode: 1500, // Invalid: exceeds 999
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('antara 1 dan 999');
    });

    it('returns 400 when store has no bank accounts configured for MANUAL_BANK', async () => {
      const mockDb = createMockSupabase({
        tenantData: {
          id: TEST_TENANT_ID,
          slug: TEST_TENANT_SLUG,
          metadata: { products: [] }, // No bank accounts configured
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
          billingType: 'MANUAL_BANK',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('belum mengonfigurasi rekening bank');
    });
  });

  describe('Walk-in POS Orders', () => {
    it('marks walk-in orders with QUICK_POS_WALKIN and is_walk_in true', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281299998888',
          customerName: 'Tamu Toko',
          rawAmount: '35000',
          isWalkIn: true,
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.metadata.source).toBe('QUICK_POS_WALKIN');
      expect(inserted.metadata.is_walk_in).toBe(true);
      expect(inserted.metadata.conversation_id).toBeNull();
    });
  });

  describe('Database Error Handling & v1 API Alias Consistency', () => {
    it('returns 500 when Supabase order insertion encounters database error', async () => {
      const mockDb = createMockSupabase({
        insertError: { message: 'Database disk full or constraint violation' },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Gagal membuat data pesanan');
    });

    it('executes identical logic through /api/v1/inbox/orders/custom alias', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const validToken = mintTestToken({ role: 'OWNER' });

      const req = new NextRequest('http://localhost:3000/api/v1/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${validToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '75000',
        }),
      });

      const res = await POST_V1(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(75000);
      expect(data.orderNumber).toMatch(/^ORD-POS-\d{6}-[0-9A-F]{6}$/);
    });
  });

  describe('Patch 4: Server-Enforced Machine Principal Registry & Scope Isolation', () => {
    const TEST_ADMIN_SECRET = 'secret_internal_admin_token_super_long_32_bytes!';
    const PRINCIPAL_A_SECRET = 'machine_secret_principal_a_secure_token_32_bytes!';
    const PRINCIPAL_UNAUTH_SECRET = 'machine_secret_unauthorized_scope_32_bytes!';

    beforeEach(() => {
      process.env.INTERNAL_MACHINE_PRINCIPALS = JSON.stringify({
        'principal-a': {
          secret: PRINCIPAL_A_SECRET,
          allowedTenants: [TEST_TENANT_SLUG, TEST_TENANT_ID],
          allowedScopes: ['pos:create_order'],
          name: 'Machine Principal A',
        },
        'principal-unauth': {
          secret: PRINCIPAL_UNAUTH_SECRET,
          allowedTenants: [TEST_TENANT_SLUG],
          allowedScopes: ['crm:read'],
          name: 'Principal With Limited Scope',
        },
      });
      process.env.ADMIN_INTERNAL_SECRET = TEST_ADMIN_SECRET;
    });

    it('rejects legacy global shared secret (ADMIN_INTERNAL_SECRET) without server-side principal binding with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Legacy shared machine secret dilarang tanpa registrasi principal');
    });

    it('rejects unregistered machine principal or invalid secret with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'completely_unregistered_secret_1234567890!',
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Kredensial mesin tidak valid');
    });

    it('rejects registered machine principal attempting unauthorized operation scope with 403 Forbidden', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PRINCIPAL_UNAUTH_SECRET}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak diizinkan untuk operasi POS');
    });

    it('rejects registered Machine Principal A attempting Tenant B (even with matching x-target-tenant and body.tenantSlug) with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantData: {
          id: ALIEN_TENANT_ID,
          slug: ALIEN_TENANT_SLUG,
          name: 'Toko Alien',
          metadata: {
            products: [{ id: 'prod_alien', name: 'Alien Item', price: 99000 }],
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // Principal A only allowed for TEST_TENANT_SLUG, but attempts ALIEN_TENANT_SLUG
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PRINCIPAL_A_SECRET}`,
          'x-target-tenant': ALIEN_TENANT_SLUG,
        },
        body: JSON.stringify({
          tenantSlug: ALIEN_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak memiliki hak akses untuk tenant');
      expect(data.error).toContain('Akses lintas tenant ditolak');
    });

    it('allows registered Machine Principal A on authorized tenant with 200 OK and authoritative machine audit metadata', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PRINCIPAL_A_SECRET}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '60000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(60000);
      const captured = mockDb._getCapturedOrderPayload();
      expect(captured.metadata.created_by_cs_id).toBe('machine:principal-a');
      expect(captured.metadata.created_by_cs_name).toBe('Machine Principal A');
    });
  });

  describe('Patch 3: CS Tenant Membership DB Fallback Isolation', () => {
    it('blocks CS user with active order permission on Tenant A from creating order on Tenant B via DB fallback query with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantData: {
          id: ALIEN_TENANT_ID,
          slug: ALIEN_TENANT_SLUG,
          name: 'Toko Alien',
          metadata: {
            products: [{ id: 'prod_alien', name: 'Alien Item', price: 99000 }],
          },
        },
        tenantUsers: {
          'cs-alien-attacker': {
            id: 'cs-alien-attacker',
            tenant_id: TEST_TENANT_ID,
            role: 'CS',
            is_active: true,
            can_create_orders: true,
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const token = mintTestToken({
        tenantSlug: ALIEN_TENANT_SLUG,
        tenantId: ALIEN_TENANT_ID,
        role: 'CS',
        userId: 'cs-alien-attacker',
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${token}`,
        },
        body: JSON.stringify({
          tenantSlug: ALIEN_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/(tidak terdaftar sebagai anggota tenant target|tidak memiliki izin)/);
    });

    it('blocks CS user when membership record in DB has status SUSPENDED or is_active false with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantUsers: {
          'cs-inactive': {
            id: 'cs-inactive',
            tenant_id: TEST_TENANT_ID,
            role: 'CS',
            is_active: false,
            can_create_orders: true,
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const token = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'cs-inactive',
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${token}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/(tidak aktif atau ditangguhkan|tidak memiliki izin)/);
    });
  });

  describe('Patch 4: Mandatory Active DB Membership Enforcement for CS / OPERATOR', () => {
    it('(a) blocks CS token carrying order permissions when DB tenant_users row is SUSPENDED with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantUsers: {
          'cs-suspended-01': {
            id: 'cs-suspended-01',
            tenant_id: TEST_TENANT_ID,
            role: 'CS',
            status: 'SUSPENDED',
            is_active: true,
            can_create_orders: true,
            name: 'Suspended CS User',
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const csToken = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'cs-suspended-01',
        permissions: ['pos', 'orders'],
        canCreateOrders: true,
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak aktif atau ditangguhkan (SUSPENDED)');
    });

    it('(b) blocks CS token carrying order permissions when DB tenant_users row has is_active: false with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantUsers: {
          'cs-inactive-02': {
            id: 'cs-inactive-02',
            tenant_id: TEST_TENANT_ID,
            role: 'CS',
            is_active: false,
            can_create_orders: true,
            name: 'Inactive CS User',
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const csToken = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'cs-inactive-02',
        permissions: ['pos', 'orders'],
        canCreateOrders: true,
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak aktif atau ditangguhkan (SUSPENDED)');
    });

    it('(c) blocks CS token carrying order permissions when user is missing/not found in DB tenant_users with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantUsers: {
          'cs-unregistered-unknown': null,
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const csToken = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'cs-unregistered-unknown',
        permissions: ['pos', 'orders'],
        canCreateOrders: true,
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak terdaftar sebagai anggota tenant target');
    });

    it('(d) blocks CS token carrying order permissions belonging to Tenant A in DB attempting Tenant B with 403 Forbidden', async () => {
      const mockDb = createMockSupabase({
        tenantData: {
          id: ALIEN_TENANT_ID,
          slug: ALIEN_TENANT_SLUG,
          name: 'Toko Alien',
          metadata: {
            products: [{ id: 'prod_alien', name: 'Alien Item', price: 99000 }],
          },
        },
        tenantUsers: {
          'cs-tenant-a-only': {
            id: 'cs-tenant-a-only',
            tenant_id: TEST_TENANT_ID, // DB row is on Tenant A
            role: 'CS',
            is_active: true,
            can_create_orders: true,
            name: 'Tenant A CS',
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      // Token claims alien tenant, but DB row belongs to Tenant A
      const csToken = mintTestToken({
        tenantSlug: ALIEN_TENANT_SLUG,
        tenantId: ALIEN_TENANT_ID,
        role: 'CS',
        userId: 'cs-tenant-a-only',
        permissions: ['pos', 'orders'],
        canCreateOrders: true,
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: ALIEN_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak terdaftar sebagai anggota tenant target');
    });

    it('(e) allows valid active CS membership on target tenant with DB order permission with 200 OK', async () => {
      const mockDb = createMockSupabase({
        tenantUsers: {
          'cs-active-valid-99': {
            id: 'cs-active-valid-99',
            tenant_id: TEST_TENANT_ID,
            role: 'CS',
            is_active: true,
            can_create_orders: true,
            name: 'Valid Active CS',
          },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const csToken = mintTestToken({
        tenantSlug: TEST_TENANT_SLUG,
        tenantId: TEST_TENANT_ID,
        role: 'CS',
        userId: 'cs-active-valid-99',
        name: 'Valid Active CS',
        permissions: ['pos'],
        canCreateOrders: true,
      });

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${csToken}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '80000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(80000);
      const captured = mockDb._getCapturedOrderPayload();
      expect(captured.metadata.created_by_cs_id).toBe('cs-active-valid-99');
      expect(captured.metadata.created_by_cs_name).toBe('Valid Active CS');
    });
  });

  describe('Patch 3: Strict Safe-Integer, Overflow & MANUAL_BANK Cap', () => {
    it('parseStrictRupiahAmount rejects numbers above Number.MAX_SAFE_INTEGER with invalid status', () => {
      const resNum = parseStrictRupiahAmount(Number.MAX_SAFE_INTEGER + 100);
      expect(resNum.valid).toBe(false);
      expect(resNum.error).toContain('MAX_SAFE_INTEGER');

      const resStr = parseStrictRupiahAmount('9999999999999999999999999999');
      expect(resStr.valid).toBe(false);
      expect(resStr.error).toContain('MAX_SAFE_INTEGER');
    });

    it('rejects POST request with amount above Number.MAX_SAFE_INTEGER with 400 Bad Request', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const token = mintTestToken({ role: 'OWNER' });
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${token}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          customerPhone: '6281234567890',
          rawAmount: '9999999999999999999999999999',
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('MAX_SAFE_INTEGER');
    });

    it('rejects MANUAL_BANK amount exceeding MAX_MANUAL_BANK_AMOUNT (Rp 500.000.000) with 400 Bad Request', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const token = mintTestToken({ role: 'OWNER' });
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${token}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          billingType: 'MANUAL_BANK',
          customerPhone: '6281234567890',
          rawAmount: MAX_MANUAL_BANK_AMOUNT + 1,
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Batas maksimum transaksi transfer manual POS');
    });

    it('rejects amount + uniqueCode integer overflow with 400 Bad Request', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const token = mintTestToken({ role: 'OWNER' });
      const overflowAmount = Number.MAX_SAFE_INTEGER - 100;
      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${token}`,
        },
        body: JSON.stringify({
          tenantSlug: TEST_TENANT_SLUG,
          billingType: 'MANUAL_BANK',
          customerPhone: '6281234567890',
          rawAmount: overflowAmount,
          uniqueCode: 999,
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/(Batas maksimum transaksi transfer manual POS|safe integer)/);
    });
  });
});
