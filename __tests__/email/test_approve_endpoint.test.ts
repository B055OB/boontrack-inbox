/**
 * @file __tests__/email/test_approve_endpoint.test.ts
 * @description Test for POST /api/orders/[id]/approve endpoint
 */

import { NextRequest } from 'next/server';
import { POST as approveHandler } from '@/app/api/orders/[orderId]/approve/route';

jest.mock('@/lib/whatsapp', () => ({
  sendOrderFulfillmentNotification: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/capi.service', () => ({
  dispatchMetaCAPIPurchaseForOrder: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/affiliate-notification-service', () => ({
  sendOrderCommissionAlert: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/email-service', () => ({
  sendOrderFulfillmentEmails: jest.fn(async () => ({
    success: true,
    buyerEmailSent: true,
    merchantEmailSent: true,
    errors: [],
  })),
}));

const mockOrderDb: Record<string, any> = {
  'ORD-TEST-APPROVE-1': {
    id: 'ORD-TEST-APPROVE-1',
    tenant_slug: 'buzzerukm',
    tenant_id: 'edd76758-2792-4602-8c99-be37735e9de1',
    customer_name: 'Maulidiyatul Izzah',
    customer_phone: '08123456789',
    customer_email: 'maulidiyatul.izzah@gmail.com',
    gross_amount: 99497,
    status: 'PENDING',
    payment_status: 'PENDING',
    order_status: 'PENDING',
    product_title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
  },
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn((col: string, val: string) => ({
          maybeSingle: jest.fn(async () => ({ data: mockOrderDb[val] || null, error: null })),
          single: jest.fn(async () => ({ data: mockOrderDb[val] || null, error: null })),
        })),
        or: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
      })),
      update: jest.fn((updateData: any) => ({
        eq: jest.fn((col: string, val: string) => {
          if (mockOrderDb[val]) {
            Object.assign(mockOrderDb[val], updateData);
          }
          return {
            select: jest.fn(() => ({
              single: jest.fn(async () => ({ data: mockOrderDb[val], error: null })),
            })),
          };
        }),
      })),
    })),
  })),
  getSupabase: jest.fn(() => null),
}));

describe('POST /api/orders/[id]/approve', () => {
  it('approves order to PAID, dispatches WhatsApp and dual fulfillment emails', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders/ORD-TEST-APPROVE-1/approve', {
      method: 'POST',
    });

    const res = await approveHandler(req, {
      params: Promise.resolve({ id: 'ORD-TEST-APPROVE-1' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.order.status).toBe('PAID');
    expect(data.order.payment_status).toBe('PAID');
    expect(data.order.order_status).toBe('COMPLETED');
    expect(data.order.paid_at).toBeDefined();

    const { sendOrderFulfillmentEmails } = require('@/lib/email-service');
    expect(sendOrderFulfillmentEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-TEST-APPROVE-1',
        customerName: 'Maulidiyatul Izzah',
        customerEmail: 'maulidiyatul.izzah@gmail.com',
        grossAmount: 99497,
      })
    );
  });
});
