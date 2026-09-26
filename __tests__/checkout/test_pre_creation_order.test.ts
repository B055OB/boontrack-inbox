/**
 * @file __tests__/checkout/test_pre_creation_order.test.ts
 * @description Unit tests for Pre-Creation Order Pattern (PENDING on QRIS generation,
 *              COMPLETED on Reader Webhook matching and Quick-Paid manual marking).
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOrdersDb: Record<string, any> = {};
const mockDispatchedNotifications: any[] = [];
const mockDispatchedCapi: any[] = [];

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: jest.fn(() => mockSupabaseAdmin),
    getSupabase: jest.fn(() => mockSupabaseAdmin),
    isValidUuid: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  };
});

jest.mock('@/lib/whatsapp', () => ({
  sendOrderFulfillmentNotification: jest.fn(async (params: any) => {
    mockDispatchedNotifications.push(params);
    return { success: true, messageId: 'mock_wa_123' };
  }),
  sendOrderPaidNotification: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/capi.service', () => ({
  dispatchMetaCAPIPurchaseForOrder: jest.fn(async (orderId: string) => {
    mockDispatchedCapi.push(orderId);
    return { success: true };
  }),
}));

jest.mock('@/lib/affiliate-notification-service', () => ({
  sendOrderCommissionAlert: jest.fn(async () => ({ success: true })),
}));

// Build fluent Supabase Mock
const mockSupabaseAdmin = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'orders') {
      const createQueryBuilder = () => {
        const builder: any = {
          _filters: [] as ((order: any) => boolean)[],
          eq(col: string, val: any) {
            builder._filters.push((o: any) => o[col] === val || (col === 'id' && (o.id === val || o.order_id === val)));
            return builder;
          },
          in(col: string, vals: any[]) {
            builder._filters.push((o: any) => vals.includes(o[col]));
            return builder;
          },
          or(_cond: string) {
            return builder;
          },
          gte(_col: string, _val: any) {
            return builder;
          },
          lte(_col: string, _val: any) {
            return builder;
          },
          order(_col: string, _opts: any) {
            return builder;
          },
          limit(_n: number) {
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
          then(resolve: (res: any) => void) {
            const list = Object.values(mockOrdersDb);
            const matched = list.filter((o) => builder._filters.every((f: any) => f(o)));
            return Promise.resolve(resolve({ data: matched, error: null }));
          },
        };
        return builder;
      };

      return {
        select: jest.fn(() => createQueryBuilder()),
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

    if (tableName === 'tenants') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                id: 'c1111111-2222-3333-4444-555555555555',
                slug: 'demo-store',
                metadata: {
                  payment_settings: {
                    qris_raw: '00020101021126580014ID.LINKAJA.WWW0118936009110020478144021000000000000303UMI51440014ID.CO.QRIS.WWW0215ID10200210000000303UMI5204599953033605802ID5910DEMO STORE6007JAKARTA61051234062070703A0163046D32',
                  },
                },
              },
              error: null,
            })),
          })),
          or: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                id: 'c1111111-2222-3333-4444-555555555555',
                slug: 'demo-store',
                metadata: {},
              },
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ error: null })),
        })),
      };
    }

    if (tableName === 'products') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                id: 'prod_99',
                title: 'Ecourse Digital Mastery',
                fulfillment_metadata: {
                  access_url: 'https://t.me/joinchat/digital_mastery',
                  instructions: 'Silakan bergabung ke grup VIP Telegram.',
                },
              },
              error: null,
            })),
          })),
        })),
      };
    }

    return {
      insert: jest.fn(async () => ({ error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: null })) })),
      })),
      update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
    };
  }),
};

// ---------------------------------------------------------------------------
// Imports of route handlers
// ---------------------------------------------------------------------------
import { POST as createQrisHandler } from '@/app/api/v1/payments/qris/create/route';
import { POST as readerNotificationHandler } from '@/app/api/v1/reader/notification/route';
import { POST as quickPaidHandler } from '@/app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route';

describe('Pre-Creation Order Pattern (QRIS -> Reader / Quick-Paid)', () => {
  const testOrderId = 'ORD-TEST-998877';

  beforeEach(() => {
    // Reset DB and mock calls
    for (const key of Object.keys(mockOrdersDb)) {
      delete mockOrdersDb[key];
    }
    mockDispatchedNotifications.length = 0;
    mockDispatchedCapi.length = 0;
  });

  it('1. Pre-creates order in database with PENDING status when QRIS is generated', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/payments/qris/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_id: testOrderId,
        amount: 99450,
        unique_code: 450,
        tenant_slug: 'demo-store',
        customer_name: 'Budi Santoso',
        customer_phone: '081234567890',
        customer_email: 'budi@example.com',
        product_id: 'prod_99',
        product_name: 'Ecourse Digital Mastery',
      }),
    });

    const res = await createQrisHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.order_id).toBe(testOrderId);
    expect(data.payment_status).toBe('PENDING');
    expect(data.order_status).toBe('PENDING');
    expect(data.qr_string).toBeTruthy();

    // Verify order is immediately stored in DB with status PENDING
    const savedOrder = mockOrdersDb[testOrderId];
    expect(savedOrder).toBeDefined();
    expect(savedOrder.id).toBe(testOrderId);
    expect(savedOrder.status).toBe('PENDING');
    expect(savedOrder.payment_status).toBe('PENDING');
    expect(savedOrder.order_status).toBe('PENDING');
    expect(savedOrder.customer_name).toBe('Budi Santoso');
    expect(savedOrder.customer_phone).toBe('081234567890');
    expect(savedOrder.gross_amount).toBe(99450);
    expect(savedOrder.unique_code).toBe(450);
  });

  it('2. Synchronizes Reader Webhook mutation matching to update order to PAID & COMPLETED and triggers WhatsApp fulfillment', async () => {
    // Seed pre-created pending order
    mockOrdersDb[testOrderId] = {
      id: testOrderId,
      tenant_slug: 'demo-store',
      customer_name: 'Budi Santoso',
      customer_phone: '081234567890',
      gross_amount: 99450,
      product_id: 'prod_99',
      product_title: 'Ecourse Digital Mastery',
      status: 'PENDING',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      fulfillment_metadata: {
        access_url: 'https://t.me/joinchat/digital_mastery',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/v1/reader/notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_slug: 'demo-store',
        title: 'DANA Bisnis',
        text: 'Pembayaran QRIS diterima sebesar Rp 99.450 dari Budi Santoso',
      }),
    });

    const res = await readerNotificationHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.matched).toBe(true);
    expect(data.order_status).toBe('COMPLETED');
    expect(data.payment_status).toBe('PAID');

    // Verify order was transitioned to PAID and COMPLETED
    const updatedOrder = mockOrdersDb[testOrderId];
    expect(updatedOrder.status).toBe('PAID');
    expect(updatedOrder.payment_status).toBe('PAID');
    expect(updatedOrder.order_status).toBe('COMPLETED');
    expect(updatedOrder.paid_at).toBeDefined();

    // Verify WhatsApp notification was triggered
    expect(mockDispatchedNotifications.length).toBe(1);
    expect(mockDispatchedNotifications[0].orderId).toBe(testOrderId);
    expect(mockDispatchedNotifications[0].phone).toBe('081234567890');
    expect(mockDispatchedNotifications[0].accessUrl).toBe('https://t.me/joinchat/digital_mastery');
  });

  it('3. Manual Quick-Paid button transitions PENDING order to PAID & COMPLETED and sends WhatsApp access notification', async () => {
    // Seed pre-created pending order
    mockOrdersDb[testOrderId] = {
      id: testOrderId,
      tenant_slug: 'demo-store',
      customer_name: 'Budi Santoso',
      customer_phone: '081234567890',
      gross_amount: 99450,
      product_id: 'prod_99',
      product_title: 'Ecourse Digital Mastery',
      status: 'PENDING',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      fulfillment_metadata: {
        access_url: 'https://t.me/joinchat/digital_mastery',
      },
    };

    const req = new NextRequest(`http://localhost:3000/api/v1/tenants/demo-store/orders/${testOrderId}/quick-paid`, {
      method: 'POST',
    });

    const params = Promise.resolve({ slug: 'demo-store', id: testOrderId });
    const res = await quickPaidHandler(req, { params });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.order.payment_status).toBe('PAID');
    expect(data.order.order_status).toBe('COMPLETED');

    const finalOrder = mockOrdersDb[testOrderId];
    expect(finalOrder.status).toBe('PAID');
    expect(finalOrder.payment_status).toBe('PAID');
    expect(finalOrder.order_status).toBe('COMPLETED');

    // Verify WhatsApp fulfillment notification was sent with access URL
    expect(mockDispatchedNotifications.length).toBe(1);
    expect(mockDispatchedNotifications[0].orderId).toBe(testOrderId);
    expect(mockDispatchedNotifications[0].accessUrl).toBe('https://t.me/joinchat/digital_mastery');
  });
});
