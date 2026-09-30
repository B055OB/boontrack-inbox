/**
 * @file __tests__/email/omni_channel_email_suite.test.ts
 * @description Comprehensive test suite for Omni-Channel Email Notification Suite & Order Event Bus.
 * Validates:
 * 1. 100% Dynamic Tenant Branding & Zero-Hardcoding
 * 2. Event 1: ORDER_CREATED (to Buyer) with itemized items, unique suffix, and bank details
 * 3. Event 2: PAYMENT_CONFIRMED (to Buyer & Seller) with digital access / calendar booking
 * 4. Event 3: FLAGGED_MANUAL / SOFT_MATCH (to Seller) with 1-click approval
 * 5. Async Outbox & Non-blocking error handling
 * 6. Provider support: Resend & Postmark
 */

import {
  resolveTenantBranding,
  sendMail,
  sendOrderCreatedEmail,
  sendPaymentConfirmedEmails,
  sendFlaggedManualEmail,
} from '@/lib/email/mailer';
import { orderEventBus } from '@/lib/email/order-event-bus';
import {
  buildOrderCreatedBuyerHtml,
  buildOrderCreatedBuyerText,
} from '@/lib/email/templates/order-created-buyer';
import {
  buildPaymentConfirmedBuyerHtml,
  buildPaymentConfirmedBuyerText,
} from '@/lib/email/templates/payment-confirmed-buyer';
import {
  buildPaymentConfirmedSellerHtml,
  buildPaymentConfirmedSellerText,
} from '@/lib/email/templates/payment-confirmed-seller';
import {
  buildFlaggedManualSellerHtml,
  buildFlaggedManualSellerText,
} from '@/lib/email/templates/flagged-manual-seller';

// Mock Supabase Database
const mockTenantsDatabase: Record<string, any> = {
  'kopi-nusantara': {
    id: 'f1a2b3c4-0001-4000-8000-000000000001',
    slug: 'kopi-nusantara',
    name: 'Kopi Nusantara Roastery',
    metadata: {
      business_profile: {
        store_name: 'Kopi Nusantara Official Store',
        logo_url: 'https://cdn.example.com/kopi-logo.png',
        email: 'owner@kopinusantara.id',
        phone: '081122334455',
        theme_color: '#451a03',
      },
      bank_accounts: [
        {
          bank_name: 'BCA',
          account_number: '5544332211',
          account_holder: 'PT KOPI NUSANTARA INDONESIA',
        },
        {
          bank_name: 'MANDIRI',
          account_number: '998877665544',
          account_holder: 'PT KOPI NUSANTARA INDONESIA',
        },
      ],
      products: [
        {
          id: 'prod-single-origin',
          title: 'Single Origin Gayo 250g',
          link_digital: 'https://drive.google.com/sample-guide',
        },
      ],
    },
  },
  'klinik-gigi-sehat': {
    id: 'f1a2b3c4-0002-4000-8000-000000000002',
    slug: 'klinik-gigi-sehat',
    name: 'Klinik Gigi Sehat',
    metadata: {
      business_profile: {
        store_name: 'Klinik Gigi Sehat & Estetika',
        email: 'admin@gigisehat.com',
        phone: '082233445566',
      },
      payment_config: {
        bank_accounts: [
          {
            bank_name: 'BRI',
            account_number: '123401000555501',
            account_holder: 'KLINIK GIGI SEHAT',
          },
        ],
      },
    },
  },
};

const mockOrdersDatabase: Record<string, any> = {};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((col: string, val: string) => ({
          maybeSingle: jest.fn(async () => {
            if (table === 'tenants') {
              return { data: mockTenantsDatabase[val] || null, error: null };
            }
            if (table === 'orders') {
              return { data: mockOrdersDatabase[val] || null, error: null };
            }
            return { data: null, error: null };
          }),
        })),
        or: jest.fn((orQuery: string) => ({
          maybeSingle: jest.fn(async () => {
            if (table === 'tenants') {
              const matched = Object.values(mockTenantsDatabase).find((t: any) =>
                orQuery.includes(t.id) || orQuery.includes(t.slug)
              );
              return { data: matched || null, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
      update: jest.fn((updateData: any) => ({
        eq: jest.fn(async (_col: string, val: string) => {
          if (!mockOrdersDatabase[val]) {
            mockOrdersDatabase[val] = { id: val };
          }
          Object.assign(mockOrdersDatabase[val], updateData);
          return { data: mockOrdersDatabase[val], error: null };
        }),
      })),
    })),
  })),
  getSupabase: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

// Mock fetch for Resend & Postmark
const dispatchedRequests: { url: string; headers: any; body: any }[] = [];

global.fetch = jest.fn(async (url: any, init?: any) => {
  const urlStr = String(url);
  const body = JSON.parse(init?.body || '{}');
  dispatchedRequests.push({ url: urlStr, headers: init?.headers, body });

  if (urlStr.includes('api.resend.com/emails')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `resend_${Math.random().toString(36).substring(7)}` }),
    } as Response;
  }

  if (urlStr.includes('api.postmarkapp.com/email')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        MessageID: `postmark_${Math.random().toString(36).substring(7)}`,
        ErrorCode: 0,
      }),
    } as Response;
  }

  return { ok: true, status: 200, json: async () => ({}) } as Response;
});

describe('Omni-Channel Email Notification Suite & Order Event Bus', () => {
  beforeEach(() => {
    dispatchedRequests.length = 0;
    delete process.env.POSTMARK_SERVER_TOKEN;
    jest.clearAllMocks();
  });

  describe('1. Dynamic Tenant Branding (Zero Hardcoding)', () => {
    it('resolves custom store branding dynamically from tenants table without hardcoding', async () => {
      const { branding } = await resolveTenantBranding('kopi-nusantara');

      expect(branding.store_name).toBe('Kopi Nusantara Official Store');
      expect(branding.logo_url).toBe('https://cdn.example.com/kopi-logo.png');
      expect(branding.support_email).toBe('owner@kopinusantara.id');
      expect(branding.support_phone).toBe('081122334455');
      expect(branding.theme_color).toBe('#451a03');
    });

    it('falls back gracefully to slug if tenant is not found in database', async () => {
      const { branding } = await resolveTenantBranding('unknown-random-shop');

      expect(branding.store_name).toBe('unknown-random-shop');
      expect(branding.website_url).toContain('unknown-random-shop');
    });
  });

  describe('2. Event 1: ORDER_CREATED (to Buyer)', () => {
    it('generates professional HTML & text with exact transfer amount, unique suffix, and bank details', () => {
      const payload = {
        order_id: 'ORD-KN-1001',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Budi Santoso',
        customer_email: 'budi@gmail.com',
        items: [{ name: 'Single Origin Gayo 250g', quantity: 1, price: 125000, total: 125000 }],
        unique_code: 324,
        total_amount: 125324,
        payment_method: 'Transfer Bank Manual',
        bank_accounts: [
          { bank_name: 'BCA', account_number: '5544332211', account_holder: 'PT KOPI NUSANTARA INDONESIA' },
        ],
        expires_at: '2026-10-01T15:00:00.000Z',
        action_url: 'https://shop.boontrack.com/kopi-nusantara/order/ORD-KN-1001',
      };

      const branding = {
        store_name: 'Kopi Nusantara Official Store',
        logo_url: 'https://cdn.example.com/kopi-logo.png',
        support_email: 'owner@kopinusantara.id',
      };

      const html = buildOrderCreatedBuyerHtml(payload, branding);
      const text = buildOrderCreatedBuyerText(payload, branding);

      expect(html).toContain('KOPI NUSANTARA OFFICIAL STORE');
      expect(html).toContain('ORD-KN-1001');
      expect(html).toContain('125.324');
      expect(html).toContain('324');
      expect(html).toContain('5544332211');
      expect(html).toContain('BCA');
      expect(html).toContain('https://shop.boontrack.com/kopi-nusantara/order/ORD-KN-1001');

      expect(text).toContain('Budi Santoso');
      expect(text).toContain('125.324');
      expect(text).toContain('5544332211');
    });

    it('dispatches ORDER_CREATED email to buyer with dynamically resolved bank accounts', async () => {
      const result = await sendOrderCreatedEmail({
        order_id: 'ORD-KN-1001',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Budi Santoso',
        customer_email: 'budi@gmail.com',
        items: [{ name: 'Single Origin Gayo 250g', quantity: 1, price: 125000, total: 125000 }],
        unique_code: 324,
        total_amount: 125324,
        payment_method: 'Transfer Bank Manual',
      });

      expect(result.success).toBe(true);
      expect(result.recipient).toBe('budi@gmail.com');
      expect(result.subject).toContain('ORD-KN-1001');
      expect(dispatchedRequests.length).toBe(1);

      const request = dispatchedRequests[0];
      expect(request.body.to).toEqual(['budi@gmail.com']);
      expect(request.body.html).toContain('125.324');
      expect(request.body.html).toContain('5544332211'); // dynamically resolved from tenant record
    });
  });

  describe('3. Event 2: PAYMENT_CONFIRMED / PAID (to Buyer & Seller)', () => {
    it('generates official receipt with digital access and calendar booking for buyer', () => {
      const payload = {
        order_id: 'ORD-KN-1002',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Siti Rahma',
        customer_email: 'siti@gmail.com',
        items: [{ name: 'Masterclass Roasting Kopi Online', quantity: 1, price: 350000, total: 350000 }],
        total_amount: 350000,
        payment_method: 'QRIS Dinamis',
        paid_at: '2026-09-30T10:00:00.000Z',
        access_url: 'https://t.me/+private-roasting-group',
        booking_url: 'https://calendar.google.com/calendar/u/0/r/appointment/roasting-session',
      };

      const branding = {
        store_name: 'Kopi Nusantara Official Store',
      };

      const html = buildPaymentConfirmedBuyerHtml(payload, branding);
      const text = buildPaymentConfirmedBuyerText(payload, branding);

      expect(html).toContain('PEMBAYARAN LUNAS (PAID)');
      expect(html).toContain('ORD-KN-1002');
      expect(html).toContain('350.000');
      expect(html).toContain('https://t.me/+private-roasting-group');
      expect(html).toContain('https://calendar.google.com/calendar/u/0/r/appointment/roasting-session');

      expect(text).toContain('PEMBAYARAN ANDA TELAH LUNAS (PAID)');
      expect(text).toContain('https://t.me/+private-roasting-group');
    });

    it('generates merchant revenue alert HTML for seller', () => {
      const payload = {
        order_id: 'ORD-KN-1002',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Siti Rahma',
        customer_email: 'siti@gmail.com',
        customer_phone: '081299887766',
        items: [{ name: 'Masterclass Roasting Kopi Online', quantity: 1, price: 350000, total: 350000 }],
        total_amount: 350000,
        payment_method: 'QRIS Dinamis',
        paid_at: '2026-09-30T10:00:00.000Z',
        dashboard_url: 'https://shop.boontrack.com/kopi-nusantara/dashboard/orders',
      };

      const branding = {
        store_name: 'Kopi Nusantara Official Store',
      };

      const html = buildPaymentConfirmedSellerHtml(payload, branding);
      const text = buildPaymentConfirmedSellerText(payload, branding);

      expect(html).toContain('Pesanan Baru Lunas (PAID)');
      expect(html).toContain('350.000');
      expect(html).toContain('Siti Rahma');
      expect(html).toContain('081299887766');
      expect(html).toContain('Buka Pesanan di Dashboard Merchant');

      expect(text).toContain('DANA MASUK DITERIMA');
      expect(text).toContain('350.000');
    });

    it('dispatches dual confirmation emails to both buyer and seller', async () => {
      const result = await sendPaymentConfirmedEmails({
        order_id: 'ORD-KN-1002',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Siti Rahma',
        customer_email: 'siti@gmail.com',
        items: [{ name: 'Single Origin Gayo 250g', quantity: 1, price: 125000, total: 125000 }],
        total_amount: 125000,
        payment_method: 'QRIS Dinamis',
        paid_at: '2026-09-30T10:00:00.000Z',
      });

      expect(result.buyer_dispatch?.success).toBe(true);
      expect(result.seller_dispatch?.success).toBe(true);
      expect(dispatchedRequests.length).toBe(2);

      const buyerReq = dispatchedRequests.find((r) => r.body.to.includes('siti@gmail.com'));
      const sellerReq = dispatchedRequests.find((r) => r.body.to.includes('owner@kopinusantara.id'));

      expect(buyerReq).toBeDefined();
      expect(sellerReq).toBeDefined();
    });
  });

  describe('4. Event 3: FLAGGED_MANUAL / SOFT_MATCH (to Seller)', () => {
    it('generates flagged manual review alert with 1-click approval link and reason', () => {
      const payload = {
        order_id: 'ORD-KN-HIGH-999',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Pak Bambang',
        items: [{ name: 'Mesin Espresso Komersial', quantity: 1, price: 15000000, total: 15000000 }],
        total_amount: 15000000,
        detected_amount: 15000000,
        status: 'SOFT_MATCH_AWAITING_MUTATION',
        reason: 'Order > Rp 50.000 memerlukan konfirmasi mutasi bank atau approval manual 1-klik',
        reference_no: 'BCA-RRN-99881122',
        approval_url: 'https://shop.boontrack.com/kopi-nusantara/dashboard/orders?tab=pending-verification&orderId=ORD-KN-HIGH-999',
      };

      const branding = {
        store_name: 'Kopi Nusantara Official Store',
      };

      const html = buildFlaggedManualSellerHtml(payload, branding);
      const text = buildFlaggedManualSellerText(payload, branding);

      expect(html).toContain('Perlu Verifikasi Bukti Transfer');
      expect(html).toContain('ORD-KN-HIGH-999');
      expect(html).toContain('15.000.000');
      expect(html).toContain('BCA-RRN-99881122');
      expect(html).toContain('SOFT_MATCH_AWAITING_MUTATION');
      expect(html).toContain('Verifikasi Sekarang di Dashboard (1-Klik)');

      expect(text).toContain('BUKTI TRANSFER PERLU VERIFIKASI MANUAL');
      expect(text).toContain('BCA-RRN-99881122');
    });

    it('dispatches FLAGGED_MANUAL review email to merchant', async () => {
      const result = await sendFlaggedManualEmail({
        order_id: 'ORD-KN-HIGH-999',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Pak Bambang',
        items: [{ name: 'Mesin Espresso Komersial', quantity: 1, price: 15000000, total: 15000000 }],
        total_amount: 15000000,
        status: 'SOFT_MATCH_AWAITING_MUTATION',
        reason: 'Order > Rp 50.000 soft-match pending reader',
        reference_no: 'BCA-RRN-99881122',
      });

      expect(result.success).toBe(true);
      expect(result.recipient).toBe('owner@kopinusantara.id');
      expect(result.subject).toContain('ORD-KN-HIGH-999');
      expect(dispatchedRequests.length).toBe(1);
    });
  });

  describe('5. Error Handling & Multi-Provider Support', () => {
    it('supports Postmark provider when POSTMARK_SERVER_TOKEN is present', async () => {
      process.env.POSTMARK_SERVER_TOKEN = 'test_postmark_token_xyz';

      const result = await sendMail({
        to: 'buyer@test.com',
        subject: 'Test Postmark',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('postmark');
      expect(dispatchedRequests.length).toBe(1);
      expect(dispatchedRequests[0].url).toContain('api.postmarkapp.com/email');
      expect(dispatchedRequests[0].headers['X-Postmark-Server-Token']).toBe('test_postmark_token_xyz');
    });

    it('handles invalid email recipients gracefully without throwing', async () => {
      const result = await sendMail({
        to: 'not-an-email',
        subject: 'Should Fail Cleanly',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipient');
    });
  });

  describe('6. Async Non-Blocking Order Event Bus', () => {
    it('executes publishOrderCreated asynchronously and updates audit records in DB', async () => {
      const busPromise = orderEventBus.publishOrderCreated({
        order_id: 'ORD-ASYNC-001',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Doni',
        customer_email: 'doni@gmail.com',
        items: [{ name: 'Kopi Blend', quantity: 1, price: 75000, total: 75000 }],
        total_amount: 75000,
        payment_method: 'Transfer Bank',
      });

      const res = await busPromise;
      expect(res?.event).toBe('ORDER_CREATED');
      expect(res?.buyer_dispatch?.success).toBe(true);
      expect(mockOrdersDatabase['ORD-ASYNC-001']?.email_sent).toBe(true);
      expect(mockOrdersDatabase['ORD-ASYNC-001']?.email_sent_at).toBeDefined();
    });

    it('executes publishPaymentConfirmed asynchronously and records dual dispatch', async () => {
      const busPromise = orderEventBus.publishPaymentConfirmed({
        order_id: 'ORD-ASYNC-002',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Doni',
        customer_email: 'doni@gmail.com',
        items: [{ name: 'Kopi Blend', quantity: 1, price: 75000, total: 75000 }],
        total_amount: 75000,
        payment_method: 'QRIS',
        paid_at: new Date().toISOString(),
      });

      const res = await busPromise;
      expect(res?.event).toBe('PAYMENT_CONFIRMED');
      expect(res?.buyer_dispatch?.success).toBe(true);
      expect(res?.seller_dispatch?.success).toBe(true);
      expect(mockOrdersDatabase['ORD-ASYNC-002']?.email_sent).toBe(true);
    });

    it('executes publishFlaggedManual asynchronously', async () => {
      const busPromise = orderEventBus.publishFlaggedManual({
        order_id: 'ORD-ASYNC-003',
        tenant_slug: 'kopi-nusantara',
        customer_name: 'Doni',
        items: [{ name: 'Kopi Blend', quantity: 1, price: 150000, total: 150000 }],
        total_amount: 150000,
        status: 'ORDER_PENDING_VERIFICATION',
        reason: 'Bukti transfer manual diunggah via chat WhatsApp',
      });

      const res = await busPromise;
      expect(res?.event).toBe('FLAGGED_MANUAL');
      expect(res?.seller_dispatch?.success).toBe(true);
      expect(mockOrdersDatabase['ORD-ASYNC-003']?.email_sent).toBe(true);
    });
  });
});
