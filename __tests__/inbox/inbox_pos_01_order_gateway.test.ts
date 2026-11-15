/**
 * @file __tests__/inbox/inbox_pos_01_order_gateway.test.ts
 * @description Unit and Integration Test Suite for Custom POS Order Server Gateway
 *
 * Covers INBOX-POS-01 / Patch 2:
 * 1. SEC-01 & SEC-03: Eliminates client-side direct orders DB insertion.
 * 2. ASPI & Bank Indonesia Standards: Min Rp 1.000, Max Rp 10.000.000 for QRIS.
 * 3. Decimal parsing anti-spike: prevents "25000.50" from becoming 2500050.
 * 4. Collision-proof IDs: ORD-POS-{YYMMDD}-{HEX6} and UUID orderId.
 * 5. 1:1 Omnichannel conversation_id & contact_id linkage in orders.metadata.
 * 6. Dynamic Tenant Resolution (Zero Hardcoding).
 * 7. Manual Bank Transfer unique code calculation.
 * 8. v1 API alias consistency.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/inbox/orders/custom/route';
import { POST as POST_V1 } from '@/app/api/v1/inbox/orders/custom/route';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('INBOX-POS-01: Custom POS Order Server Gateway', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  const createMockSupabase = (options: {
    tenantData?: any;
    tenantError?: any;
    insertError?: any;
  } = {}) => {
    const {
      tenantData = {
        id: 'tenant-uuid-1234',
        slug: 'toko-kreatif',
        name: 'Toko Kreatif',
        metadata: {
          products: [
            { id: 'prod_video_1', name: 'Jasa Video Promosi', price: 150000 },
            { id: 'prod_logo_2', name: 'Desain Logo', price: 200000 },
          ],
        },
      },
      tenantError = null,
      insertError = null,
    } = options;

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

  describe('1. Input Validation & ASPI / BI Standards', () => {
    it('returns 500 when Supabase admin client is unavailable', async () => {
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(null);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Database admin unavailable');
    });

    it('rejects missing or empty tenantSlug with 400', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: '',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tenant slug');
    });

    it('rejects missing or empty customerPhone with 400', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '   ',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('WhatsApp');
    });

    it('rejects amount below Rp 1.000 (ASPI minimum limit) with 400', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const testAmounts = [0, 500, '999', 'Rp 500', -1000, null, ''];
      for (const amount of testAmounts) {
        const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug: 'toko-kreatif',
            customerPhone: '6281234567890',
            rawAmount: amount,
          }),
        });

        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Minimal transaksi adalah Rp 1.000');
      }
    });

    it('rejects QRIS amount exceeding Rp 10.000.000 (ASPI / BI maximum limit) with 400', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: 10000001,
          billingType: 'QRIS',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('10.000.000');
      expect(data.error).toContain('BI/ASPI');
    });

    it('allows MANUAL_BANK amount exceeding Rp 10.000.000 without QRIS restriction', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: '25000000',
          billingType: 'MANUAL_BANK',
          uniqueCode: 150,
          bankAccount: { bank_name: 'BCA', account_number: '1234567890', account_holder: 'Owner' },
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(25000150);
      expect(data.baseAmount).toBe(25000000);
      expect(data.uniqueCode).toBe(150);
    });
  });

  describe('2. Anti-Spike Decimal Handling', () => {
    it('properly truncates decimals without 100x spike ("25000.50" -> 25000)', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: '25000.50',
          billingType: 'QRIS',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(25000); // NOT 2500050!
      expect(data.baseAmount).toBe(25000);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.gross_amount).toBe(25000);
    });

    it('handles comma-formatted currency strings cleanly ("25,000.00" -> 25000)', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: '25,000.00',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.amount).toBe(25000);
    });
  });

  describe('3. Dynamic Tenant Resolution & Catalog Matching (Zero Hardcoding)', () => {
    it('returns 404 when tenant is not found in database', async () => {
      const mockDb = createMockSupabase({ tenantData: null });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'non-existent-store',
          customerPhone: '6281234567890',
          rawAmount: '75000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('tidak ditemukan');
    });

    it('resolves product_id from tenant catalog when item name matches', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          itemName: 'Jasa Video Promosi Instagram',
          rawAmount: '150000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.product_id).toBe('prod_video_1');
      expect(inserted.product_title).toBe('Jasa Video Promosi Instagram');
    });

    it('falls back to srv_custom_chat when no catalog products match', async () => {
      const mockDb = createMockSupabase({
        tenantData: {
          id: 'tenant-uuid-1234',
          slug: 'toko-kreatif',
          metadata: { products: [] },
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          itemName: 'Paket Kustom Konsultasi',
          rawAmount: '500000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.product_id).toBe('srv_custom_chat');
    });
  });

  describe('4. Cryptographic ID Generation & Collision Proofing', () => {
    it('generates compliant ORD-POS-{YYMMDD}-{HEX6} order number and UUID internal ID', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281234567890',
          rawAmount: '50000',
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify order number format: ORD-POS-YYMMDD-HEX6
      expect(data.orderNumber).toMatch(/^ORD-POS-\d{6}-[0-9A-F]{6}$/);

      // Verify internal orderId format: UUID v4
      expect(data.orderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Verify paymentToken format: pay_{32 hex chars}
      expect(data.paymentToken).toMatch(/^pay_[0-9a-f]{32}$/);

      // Verify payUrl contains tenant slug and token
      expect(data.payUrl).toContain('toko-kreatif');
      expect(data.payUrl).toContain(data.paymentToken);

      // Verify inserted payload matches
      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.id).toBe(data.orderId);
      expect(inserted.order_number).toBe(data.orderNumber);
      expect(inserted.correlation_id).toBe(data.paymentToken);
    });
  });

  describe('5. 1:1 Conversation & Contact Linkage (SEC-01 & Fulfillment Routing)', () => {
    it('embeds conversation_id and contact_id into orders.metadata for webhook fulfillment', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          conversationId: 'conv-uuid-998877',
          contactId: 'crm-contact-554433',
          customerPhone: '6281234567890',
          customerName: 'Budi Santoso',
          rawAmount: '120000',
          csUserId: 'cs-user-01',
          csUserName: 'Siti Aminah',
          isWalkIn: false,
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);

      const inserted = mockDb._getCapturedOrderPayload();
      expect(inserted.metadata).toBeDefined();
      expect(inserted.metadata.conversation_id).toBe('conv-uuid-998877');
      expect(inserted.metadata.contact_id).toBe('crm-contact-554433');
      expect(inserted.metadata.created_by_cs_id).toBe('cs-user-01');
      expect(inserted.metadata.created_by_cs_name).toBe('Siti Aminah');
      expect(inserted.metadata.source).toBe('INBOX_QUICK_POS');
      expect(inserted.metadata.is_walk_in).toBe(false);
      expect(inserted.customer_name).toBe('Budi Santoso');
      expect(inserted.customer_phone).toBe('6281234567890');
    });

    it('marks walk-in orders with QUICK_POS_WALKIN and is_walk_in true', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
          customerPhone: '6281299998888',
          customerName: 'Walk-in Guest',
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

  describe('6. Database Insert Error Handling', () => {
    it('returns 500 when Supabase order insertion encounters database error', async () => {
      const mockDb = createMockSupabase({
        insertError: { message: 'Database disk full or constraint violation' },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
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
  });

  describe('7. v1 API Re-export Consistency', () => {
    it('executes identical logic through /api/v1/inbox/orders/custom alias', async () => {
      const mockDb = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockDb as any);

      const req = new NextRequest('http://localhost:3000/api/v1/inbox/orders/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'toko-kreatif',
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
});
