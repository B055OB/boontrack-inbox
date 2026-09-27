/**
 * @file __tests__/email/email_service.test.ts
 * @description Unit & integration tests for Dual Email Confirmation & Invoice Dispatch
 */

import {
  buildBuyerReceiptHtml,
  buildMerchantAlertHtml,
  sendOrderFulfillmentEmails,
} from '@/lib/email-service';

// Mock Supabase
const mockOrdersTable: Record<string, any> = {
  'ORD-1790483266787-7715': {
    id: 'ORD-1790483266787-7715',
    tenant_slug: 'buzzerukm',
    tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
    customer_name: 'Maulidiyatul Izzah',
    customer_phone: '08123456789',
    customer_email: 'maulidiyatul.izzah@gmail.com',
    gross_amount: 99497,
    status: 'PAID',
    product_title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
  },
};

const mockTenantsTable: Record<string, any> = {
  buzzerukm: {
    name: 'Buzzer UKM',
    slug: 'buzzerukm',
    id: 'edd76758-2792-4602-8c99-be37735e9de1',
    metadata: {
      email: 'buzzerukm@gmail.com',
      store_name: 'Buzzer UKM',
      products: [
        {
          id: 'c7ba0001-7de7-4888-9999-000000000001',
          title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
          link_digital: 'https://t.me/+zhWxgGbzZxhmMjU1',
        },
      ],
    },
  },
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((col: string, val: string) => ({
          maybeSingle: jest.fn(async () => {
            if (table === 'tenants') {
              return { data: mockTenantsTable[val] || null, error: null };
            }
            if (table === 'orders') {
              return { data: mockOrdersTable[val] || null, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
      update: jest.fn((updateData: any) => ({
        eq: jest.fn(async (col: string, val: string) => {
          if (mockOrdersTable[val]) {
            Object.assign(mockOrdersTable[val], updateData);
          }
          return { data: mockOrdersTable[val], error: null };
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

// Mock Global Fetch for Resend API
const dispatchedEmails: any[] = [];
global.fetch = jest.fn(async (url: any, init?: any) => {
  if (typeof url === 'string' && url.includes('api.resend.com/emails')) {
    const body = JSON.parse(init?.body || '{}');
    dispatchedEmails.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `email_${Math.random().toString(36).substring(7)}` }),
    } as Response;
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
  } as Response;
});

describe('Dual Email Confirmation & Invoice Dispatch on Fulfillment', () => {
  beforeEach(() => {
    dispatchedEmails.length = 0;
    jest.clearAllMocks();
  });

  it('1. Generates professional HTML receipt with digital access CTA for buyer', () => {
    const html = buildBuyerReceiptHtml({
      storeName: 'Buzzer UKM',
      orderId: 'ORD-1790483266787-7715',
      customerName: 'Maulidiyatul Izzah',
      customerEmail: 'maulidiyatul.izzah@gmail.com',
      productTitle: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
      grossAmount: 99497,
      paymentMethod: 'QRIS Dinamis',
      paidAt: '2026-09-27T04:27:47.446Z',
      accessUrl: 'https://t.me/+zhWxgGbzZxhmMjU1',
      instructions: 'Silakan klik tombol di bawah untuk bergabung ke grup private Telegram:',
    });

    expect(html).toContain('BUZZER UKM');
    expect(html).toContain('ORD-1790483266787-7715');
    expect(html).toContain('Maulidiyatul Izzah');
    expect(html).toContain('7-Day Sprint CTWA Mastery');
    expect(html).toContain('99.497');
    expect(html).toContain('Akses Materi / Gabung Grup Telegram');
    expect(html).toContain('https://t.me/+zhWxgGbzZxhmMjU1');
    expect(html).toContain('PEMBAYARAN LUNAS (PAID)');
  });

  it('2. Generates merchant order alert HTML template', () => {
    const html = buildMerchantAlertHtml({
      storeName: 'Buzzer UKM',
      orderId: 'ORD-1790483266787-7715',
      customerName: 'Maulidiyatul Izzah',
      customerEmail: 'maulidiyatul.izzah@gmail.com',
      productTitle: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
      grossAmount: 99497,
      paidAt: '2026-09-27T04:27:47.446Z',
      dashboardUrl: 'https://dashboard.boontrack.com/buzzerukm',
    });

    expect(html).toContain('Buzzer UKM');
    expect(html).toContain('ORD-1790483266787-7715');
    expect(html).toContain('Maulidiyatul Izzah');
    expect(html).toContain('Lihat di Dashboard Merchant');
  });

  it('3. Dispatches dual emails to both buyer and merchant on order fulfillment', async () => {
    const result = await sendOrderFulfillmentEmails({
      orderId: 'ORD-1790483266787-7715',
      tenantSlug: 'buzzerukm',
      tenantId: 'edd76758-2792-4602-8c99-be37735e9de1',
      customerName: 'Maulidiyatul Izzah',
      customerEmail: 'maulidiyatul.izzah@gmail.com',
      customerPhone: '08123456789',
      productTitle: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
      grossAmount: 99497,
      paymentMethod: 'QRIS Dinamis',
      paidAt: '2026-09-27T04:27:47.446Z',
      accessUrl: 'https://t.me/+zhWxgGbzZxhmMjU1',
    });

    expect(result.success).toBe(true);
    expect(result.buyerEmailSent).toBe(true);
    expect(result.merchantEmailSent).toBe(true);
    expect(dispatchedEmails.length).toBe(2);

    // Verify buyer email recipient and subject
    const buyerEmail = dispatchedEmails.find((e) => e.to.includes('maulidiyatul.izzah@gmail.com'));
    expect(buyerEmail).toBeDefined();
    expect(buyerEmail.subject).toContain('ORD-1790483266787-7715');
    expect(buyerEmail.html).toContain('https://t.me/+zhWxgGbzZxhmMjU1');

    // Verify merchant email recipient and subject
    const merchantEmail = dispatchedEmails.find((e) => e.to.includes('buzzerukm@gmail.com'));
    expect(merchantEmail).toBeDefined();
    expect(merchantEmail.subject).toContain('ORD-1790483266787-7715');

    // Verify email_sent column updated in database
    expect(mockOrdersTable['ORD-1790483266787-7715'].email_sent).toBe(true);
    expect(mockOrdersTable['ORD-1790483266787-7715'].email_sent_at).toBeDefined();
  });

  it('4. Handles missing buyer email gracefully by only sending merchant alert', async () => {
    const result = await sendOrderFulfillmentEmails({
      orderId: 'ORD-1790483266787-7715',
      tenantSlug: 'buzzerukm',
      customerName: 'Maulidiyatul Izzah',
      customerEmail: null, // No buyer email provided
      productTitle: '7-Day Sprint CTWA Mastery',
      grossAmount: 99497,
    });

    expect(result.success).toBe(true);
    expect(result.buyerEmailSent).toBe(false);
    expect(result.merchantEmailSent).toBe(true);
    expect(dispatchedEmails.length).toBe(1);
    expect(dispatchedEmails[0].to).toEqual(['buzzerukm@gmail.com']);
  });
});
