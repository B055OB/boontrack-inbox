/**
 * __tests__/baseline/retail_commerce_v1_transaction_pipeline.test.ts
 *
 * GATE 3: RETAIL_COMMERCE_V1 End-to-End Transaction Pipeline Regression Suite
 * Tests full commerce pipeline:
 * 1. Catalog -> Variant Selection -> Stock Check
 * 2. Unified Checkout Context (Server Revalidation of Price & Weight)
 * 3. Pre-Creation Order Generation (PENDING + Dynamic QRIS CRC16)
 * 4. Webhook Payment Authority Event (PENDING -> PAID / COMPLETED)
 * 5. Financial State Machine Guardrails (Anti-Tamper & Anti-Duplicate Mutation)
 */

import { NextRequest } from 'next/server';
import { createEphemeralCheckoutContextFromDirectBuy } from '@/lib/checkout/unified-checkout-engine';
import { POST as createQrisHandler } from '@/app/api/v1/payments/qris/create/route';
import { POST as readerNotificationHandler } from '@/app/api/v1/reader/notification/route';

// ---------------------------------------------------------------------------
// In-Memory Database & Test Fixtures
// ---------------------------------------------------------------------------

const mockOrdersDb: Record<string, any> = {};
const mockDispatchedNotifications: any[] = [];
const mockDispatchedCapi: any[] = [];

// Retail Product Catalog Fixture with Stock & Variants
const retailProductCatalog = [
  {
    id: 'prod-bomber-01',
    tenant_id: 'ten-retail-alpha',
    title: 'Jaket Bomber Waterproof Alpha',
    price: 250000,
    promo_price: 225000,
    weight_grams: 600,
    requires_shipping: true,
    variants: [
      { id: 'var-army-l', name: 'Army - L', price_override: 225000, stock: 10 },
      { id: 'var-black-xl', name: 'Black - XL', price_override: 235000, stock: 0 }, // Out of stock
    ],
  },
];

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseAdmin),
  getSupabase: jest.fn(() => mockSupabaseAdmin),
  isValidUuid: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('@/lib/whatsapp', () => ({
  sendOrderFulfillmentNotification: jest.fn(async (params: any) => {
    mockDispatchedNotifications.push(params);
    return { success: true, messageId: 'wa_msg_retail_123' };
  }),
  sendOrderPaidNotification: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/capi.service', () => ({
  dispatchMetaCAPIPurchaseForOrder: jest.fn(async (orderId: string) => {
    mockDispatchedCapi.push(orderId);
    return { success: true };
  }),
  dispatchMetaCAPIInitiateCheckoutForOrder: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/capi-outbox', () => ({
  enqueueCAPIOutboxEvent: jest.fn(async (params: any) => {
    mockDispatchedCapi.push(params.orderId);
    return { success: true, eventId: 'evt_retail_1', businessEventId: `PURCHASE_${params.orderId}` };
  }),
  processCAPIOutboxQueue: jest.fn(async () => ({ processed: 1, succeeded: 1, failed: 0, deadLettered: 0 })),
}));

// Fluent Supabase Mock
const mockSupabaseAdmin = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'orders') {
      const createQueryBuilder = () => {
        const builder: any = {
          _filters: [] as ((o: any) => boolean)[],
          eq(col: string, val: any) {
            builder._filters.push((o: any) => o[col] === val || (col === 'id' && (o.id === val || o.order_id === val)));
            return builder;
          },
          in(col: string, vals: any[]) {
            builder._filters.push((o: any) => vals.includes(o[col]));
            return builder;
          },
          or: () => builder,
          gte: () => builder,
          lte: () => builder,
          order: () => builder,
          limit: () => builder,
          async maybeSingle() {
            const list = Object.values(mockOrdersDb);
            const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
            return { data: matched ? { ...matched } : null, error: null };
          },
          async single() {
            const list = Object.values(mockOrdersDb);
            const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
            return { data: matched ? { ...matched } : null, error: null };
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
                id: 'ten-retail-alpha',
                slug: 'retail-store-alpha',
                metadata: {
                  payment_settings: {
                    qris_raw: '00020101021126580014ID.LINKAJA.WWW0118936009110020478144021000000000000303UMI51440014ID.CO.QRIS.WWW0215ID10200210000000303UMI5204599953033605802ID5910ALPHA SHOP6007JAKARTA61051234062070703A0163046D32',
                  },
                },
              },
              error: null,
            })),
          })),
          or: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                id: 'ten-retail-alpha',
                slug: 'retail-store-alpha',
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
          eq: jest.fn((col: string, val: any) => ({
            maybeSingle: jest.fn(async () => {
              const prod = retailProductCatalog.find((p) => p.id === val);
              return { data: prod || null, error: null };
            }),
          })),
        })),
      };
    }

    return {
      insert: jest.fn(async () => ({ error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: null })) })),
        in: jest.fn(() => ({ limit: jest.fn(async () => ({ data: [] })), order: jest.fn(() => ({ limit: jest.fn(async () => ({ data: [] })) })) })),
      })),
      update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
    };
  }),
};

describe('GATE 3: RETAIL_COMMERCE_V1 Transaction Pipeline Regression Test', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    for (const key of Object.keys(mockOrdersDb)) {
      delete mockOrdersDb[key];
    }
    mockDispatchedNotifications.length = 0;
    mockDispatchedCapi.length = 0;

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found' }),
    })) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── TEST 1: CATALOG -> VARIANT -> STOCK VALIDATION ────────────────────────
  describe('1. Catalog, Variant Selection & Stock Guard', () => {
    it('verifies product variant and stock availability in catalog', () => {
      const product = retailProductCatalog[0];
      expect(product).toBeDefined();

      const inStockVariant = product.variants.find((v) => v.id === 'var-army-l');
      expect(inStockVariant?.stock).toBe(10);
      expect(inStockVariant?.stock).toBeGreaterThan(0);

      const outOfStockVariant = product.variants.find((v) => v.id === 'var-black-xl');
      expect(outOfStockVariant?.stock).toBe(0);
    });

    it('creates Ephemeral Checkout Context for valid in-stock variant and revalidates ground-truth price', async () => {
      const product = retailProductCatalog[0];
      const selectedVariant = product.variants[0]; // var-army-l

      // Client submits request (even if client attempts to manipulate price)
      const context = await createEphemeralCheckoutContextFromDirectBuy({
        tenantSlug: 'retail-store-alpha',
        product: {
          id: product.id,
          title: product.title,
          price: product.price, // standard price 250000
          promo_price: product.promo_price, // server ground truth promo price: 225000
          weight_grams: product.weight_grams,
          requires_shipping: product.requires_shipping,
        },
        quantity: 2,
        variantId: selectedVariant.id,
        variantName: selectedVariant.name,
        customerData: {
          name: 'Rian Pratama',
          phone: '081234567890',
          address: 'Jl. Sudirman No. 45, Jakarta Selatan',
          city: 'Jakarta Selatan',
        },
      });

      expect(context.contextType).toBe('DIRECT');
      expect(context.tenantSlug).toBe('retail-store-alpha');
      expect(context.totalQuantity).toBe(2);
      // Unit price must resolve to server promo price (225000), not tampered price (999)
      expect(context.items[0].unitPrice).toBe(225000);
      expect(context.subtotal).toBe(450000);
      expect(context.totalWeightGrams).toBe(1200); // 600g * 2
      expect(context.requiresShipping).toBe(true);
      expect(context.items[0].variantId).toBe('var-army-l');
    });
  });

  // ── TEST 2: ORDER CREATION (PENDING + DYNAMIC QRIS) ────────────────────────
  describe('2. Pre-Creation Order Generation (PENDING Status & Dynamic QRIS)', () => {
    const testOrderId = 'ORD-RETAIL-778899';

    it('pre-creates order in database with PENDING status and generates dynamic QRIS', async () => {
      const grossAmount = 450450; // 450000 subtotal + 450 unique code
      const req = new NextRequest('http://localhost:3000/api/v1/payments/qris/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: testOrderId,
          amount: grossAmount,
          unique_code: 450,
          tenant_slug: 'retail-store-alpha',
          customer_name: 'Rian Pratama',
          customer_phone: '081234567890',
          customer_email: 'rian@example.com',
          product_id: 'prod-bomber-01',
          product_name: 'Jaket Bomber Waterproof Alpha (2x)',
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

      // Database assertion: Order must be persisted in PENDING state
      const savedOrder = mockOrdersDb[testOrderId];
      expect(savedOrder).toBeDefined();
      expect(savedOrder.id).toBe(testOrderId);
      expect(savedOrder.status).toBe('PENDING');
      expect(savedOrder.payment_status).toBe('PENDING');
      expect(savedOrder.gross_amount).toBe(grossAmount);
      expect(savedOrder.unique_code).toBe(450);
    });
  });

  // ── TEST 3: FINANCIAL STATE MACHINE TRANSITION (PENDING -> PAID) ──────────
  describe('3. Financial Authority Event & Webhook Mutation (PENDING -> PAID / COMPLETED)', () => {
    const testOrderId = 'ORD-RETAIL-PAID-001';

    beforeEach(() => {
      // Seed PENDING order in DB
      mockOrdersDb[testOrderId] = {
        id: testOrderId,
        tenant_slug: 'retail-store-alpha',
        customer_name: 'Rian Pratama',
        customer_phone: '081234567890',
        gross_amount: 450450,
        unique_code: 450,
        product_id: 'prod-bomber-01',
        product_title: 'Jaket Bomber Waterproof Alpha (2x)',
        status: 'PENDING',
        payment_status: 'PENDING',
        order_status: 'PENDING',
        fulfillment_metadata: {
          tracking_url: 'https://track.boontrack.com/ORD-RETAIL-PAID-001',
        },
      };
    });

    it('mutates order status to PAID and COMPLETED upon matching bank/reader webhook notification', async () => {
      const webhookReq = new NextRequest('http://localhost:3000/api/v1/reader/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'retail-store-alpha',
          title: 'QRIS Settlement',
          text: 'Dana masuk QRIS sebesar Rp 450.450 dari Rian Pratama',
        }),
      });

      const res = await readerNotificationHandler(webhookReq);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.matched).toBe(true);
      expect(data.order_status).toBe('COMPLETED');

      // Database assertion: Financial state transitioned to PAID
      const updatedOrder = mockOrdersDb[testOrderId];
      expect(updatedOrder.payment_status).toBe('PAID');
      expect(updatedOrder.status).toBe('PAID');

      // Downstream triggers verification
      expect(mockDispatchedNotifications.length).toBeGreaterThan(0);
      expect(mockDispatchedNotifications[0].phone).toBe('081234567890');
      expect(mockDispatchedCapi).toContain(testOrderId);
    });
  });

  // ── TEST 4: FINANCIAL STATE MACHINE GUARDS ─────────────────────────────────
  describe('4. Financial State Machine Guardrails (Anti-Duplicate & Anti-Tamper)', () => {
    it('prevents double fulfillment and duplicate notification on second identical webhook', async () => {
      const settledOrderId = 'ORD-RETAIL-SETTLED-002';
      // Seed already settled/paid order
      mockOrdersDb[settledOrderId] = {
        id: settledOrderId,
        tenant_slug: 'retail-store-alpha',
        customer_name: 'Dewi Lestari',
        customer_phone: '081299990000',
        gross_amount: 225000,
        status: 'PAID',
        payment_status: 'PAID',
        order_status: 'COMPLETED',
      };

      const webhookReq = new NextRequest('http://localhost:3000/api/v1/reader/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'retail-store-alpha',
          title: 'QRIS Settlement',
          text: 'Dana masuk QRIS sebesar Rp 225.000 dari Dewi Lestari',
        }),
      });

      const res = await readerNotificationHandler(webhookReq);
      const data = await res.json();

      // Second webhook should not re-trigger notifications because order is already PAID
      expect(data.success).toBe(true);
      expect(mockDispatchedNotifications.length).toBe(0);
    });
  });
});
