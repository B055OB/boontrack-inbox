/**
 * @jest-environment node
 *
 * Unit tests — Ziad Medika Tenant QRIS Payload Checkout & Dynamic Generation
 *
 * Verifies that:
 * 1. Base static string of Ziad Medika is properly transformed into dynamic QRIS with Tag 54 nominal injection.
 * 2. Recalculated CRC16 is valid and conforms to EMVCo / ASPI standard.
 * 3. The rendered QR string 100% contains 'Ziad medika, Service' and does NOT fall back to BoonTrack platform DANA.
 * 4. The checkout route (/api/v1/payments/qris/create) and createOrderAndInvoice prioritize tenant qris_payload.
 */

import { generateDynamicQRIS, crc16ccitt } from '@/lib/qris-dynamic';
import { NextRequest } from 'next/server';

const ZIAD_MEDIKA_STATIC_QRIS =
  '00020101021126570011ID.DANA.WWW011893600915303581514802090358151480303UMI51440014ID.CO.QRIS.WWW0215ID10266110544730303UMI5204899953033605802ID5920Ziad medika, Service6012Kota Cirebon610545141630458FF';

// ---------------------------------------------------------------------------
// Mocks for Checkout & API Handlers
// ---------------------------------------------------------------------------

const mockOrdersDb: Record<string, any> = {};

const mockTenantClinic = {
  id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
  slug: 'tumbuh-kembang-anak',
  name: 'Tumbuh Kembang Anak',
  category: 'KLINIK_KONSULTASI',
  qris_payload: ZIAD_MEDIKA_STATIC_QRIS,
  metadata: {
    custom_domain: 'konsul.littlebitefeeding.com',
    qris_payload: ZIAD_MEDIKA_STATIC_QRIS,
    products: [
      {
        id: 'eat-and-grow-konsultasi-chat-gtm-anak',
        name: 'Konsultasi Chat GTM Anak (dr. Harys)',
        slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
        price: 150000,
      },
    ],
  },
};

const mockSupabaseAdmin = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'orders') {
      const builder: any = {
        _filters: [] as ((order: any) => boolean)[],
        select: jest.fn(() => builder),
        eq(col: string, val: any) {
          builder._filters.push((o: any) => o[col] === val || (col === 'id' && (o.id === val || o.order_id === val)));
          return builder;
        },
        async maybeSingle() {
          const list = Object.values(mockOrdersDb);
          const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
          return { data: matched || null, error: null };
        },
        async single() {
          const list = Object.values(mockOrdersDb);
          const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
          return { data: matched || null, error: null };
        },
      };

      return {
        select: jest.fn(() => builder),
        insert: jest.fn(async (payload: any) => {
          const item = Array.isArray(payload) ? payload[0] : payload;
          mockOrdersDb[item.id] = { ...item };
          return { data: item, error: null };
        }),
        update: jest.fn((updateData: any) => ({
          eq: jest.fn((col: string, val: any) => {
            if (mockOrdersDb[val]) {
              mockOrdersDb[val] = { ...mockOrdersDb[val], ...updateData };
            }
            return {
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: mockOrdersDb[val],
                  error: null,
                })),
              })),
              data: mockOrdersDb[val],
              error: null,
            };
          }),
        })),
      };
    }

    if (tableName === 'order_items') {
      return {
        insert: jest.fn(async () => ({ data: [], error: null })),
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }

    if (tableName === 'tenants') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn((col: string, val: any) => ({
            maybeSingle: jest.fn(async () => {
              if (val === 'tumbuh-kembang-anak' || val === mockTenantClinic.id) {
                return { data: mockTenantClinic, error: null };
              }
              return { data: null, error: null };
            }),
          })),
          or: jest.fn((_cond: string) => ({
            maybeSingle: jest.fn(async () => {
              return { data: mockTenantClinic, error: null };
            }),
          })),
        })),
      };
    }

    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
        or: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: jest.fn(async () => ({ data: [], error: null })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseAdmin),
  getSupabase: jest.fn(() => mockSupabaseAdmin),
  isValidUuid: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('@/lib/capi.service', () => ({
  dispatchMetaCAPIInitiateCheckoutForOrder: jest.fn(async () => ({ success: true })),
  dispatchMetaCAPIPurchaseForOrder: jest.fn(async () => ({ success: true })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Ziad Medika Tenant QRIS Payload & Dynamic Injection', () => {
  const CONSULTATION_AMOUNT = 150_000;

  describe('1. Dynamic QRIS Generation using Ziad Medika Base String', () => {
    test('successfully generates dynamic QRIS and 100% contains "Ziad medika, Service"', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      expect(dynamicQris).toBeTruthy();
      // Tag 59 must be untouched and present
      expect(dynamicQris).toContain('Ziad medika, Service');
      expect(dynamicQris).toContain('5920Ziad medika, Service');
    });

    test('switches Tag 01 indicator from 010211 (static) to 010212 (dynamic)', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      expect(dynamicQris.startsWith('000201010212')).toBe(true);
      expect(dynamicQris).not.toContain('010211');
    });

    test('injects Tag 54 with correct length and nominal before Tag 58 (5802ID)', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      // Amount: 150000 -> Tag 54, length 06: '5406150000'
      expect(dynamicQris).toContain('5406150000');
      expect(dynamicQris).toContain('54061500005802ID');
    });

    test('preserves Tag 51 merchant NMID completely without corrupting digits', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      // The NMID inside Tag 51 subtag 02 must remain intact
      expect(dynamicQris).toContain('0215ID10266110544730303UMI');
      expect(dynamicQris).toContain('ID.CO.QRIS.WWW');
    });

    test('preserves Merchant City (Tag 60) and Postal Code (Tag 61)', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      expect(dynamicQris).toContain('6012Kota Cirebon');
      expect(dynamicQris).toContain('610545141');
    });

    test('recalculates valid CRC16-CCITT and does not retain old CRC (58FF)', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      expect(dynamicQris).not.toContain('630458FF');

      // Verify recalculated CRC
      const payloadWithoutCrc = dynamicQris.substring(0, dynamicQris.length - 4);
      const embeddedCrc = dynamicQris.substring(dynamicQris.length - 4);
      const computedCrc = crc16ccitt(payloadWithoutCrc);

      expect(embeddedCrc).toBe(computedCrc);
      expect(embeddedCrc).toMatch(/^[0-9A-F]{4}$/);
    });

    test('does NOT fall back to BoonTrack platform DANA string', () => {
      const dynamicQris = generateDynamicQRIS(ZIAD_MEDIKA_STATIC_QRIS, CONSULTATION_AMOUNT);

      expect(dynamicQris).not.toContain('BoonTrack');
      expect(dynamicQris).not.toContain('5909BoonTrack');
      expect(dynamicQris).not.toContain('Kab. Bandung');
    });
  });

  describe('2. Payments API Route (/api/v1/payments/qris/create)', () => {
    let createQrisHandler: any;

    beforeAll(async () => {
      const module = await import('@/app/api/v1/payments/qris/create/route');
      createQrisHandler = module.POST;
    });

    test('reads tenant qris_payload from Supabase and returns dynamic QR containing "Ziad medika, Service"', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/payments/qris/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: 'ORD-ZIAD-TEST-001',
          tenant_slug: 'tumbuh-kembang-anak',
          amount: 150000,
          unique_code: 0,
          customer_name: 'Bunda Sarah',
          customer_phone: '081234567890',
          product_name: 'Konsultasi Chat GTM Anak (dr. Harys)',
        }),
      });

      const res = await createQrisHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.qr_string).toBeTruthy();

      // Absolute requirement: 100% contains 'Ziad medika, Service'
      expect(data.qr_string).toContain('Ziad medika, Service');
      expect(data.qr_string).not.toContain('BoonTrack');

      // Must be dynamic with Tag 54
      expect(data.qr_string.startsWith('000201010212')).toBe(true);
      expect(data.qr_string).toContain('5406150000');
    });
  });

  describe('3. Checkout Service (createOrderAndInvoice)', () => {
    let createOrderAndInvoice: any;

    beforeAll(async () => {
      const module = await import('@/lib/checkout-service');
      createOrderAndInvoice = module.createOrderAndInvoice;
    });

    test('creates order and generates QRIS from tenant Ziad Medika payload without falling back to BoonTrack', async () => {
      const result = await createOrderAndInvoice({
        tenantSlug: 'tumbuh-kembang-anak',
        productId: 'eat-and-grow-konsultasi-chat-gtm-anak',
        productTitle: 'Konsultasi Chat GTM Anak (dr. Harys)',
        amount: 150000,
        basePrice: 150000,
        uniqueCode: 0,
        paymentMethod: 'qris',
        customerName: 'Bunda Sarah',
        customerPhone: '081234567890',
      });

      expect(result).toBeDefined();
      expect(result.orderId).toBeTruthy();

      // Check the created order in mock DB
      const savedOrder = mockOrdersDb[result.orderId];
      expect(savedOrder).toBeDefined();
      expect(savedOrder.qr_code_url).toBeTruthy();

      // URL contains encoded QR string
      const decodedQr = decodeURIComponent(savedOrder.qr_code_url);
      expect(decodedQr).toContain('Ziad medika, Service');
      expect(decodedQr).not.toContain('BoonTrack');
      expect(decodedQr).toContain('5406150000');
    });
  });
});
