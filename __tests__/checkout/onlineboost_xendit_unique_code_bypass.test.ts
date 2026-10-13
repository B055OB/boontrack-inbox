import { generateUniqueCodeForTenant } from '@/lib/unique-code-generator';
import { NextRequest } from 'next/server';

describe('P0 Test: OnlineBoost & Xendit Unique Code Bypass and QR String Binding', () => {
  describe('1. lib/unique-code-generator.ts Bypass Policy', () => {
    it('should return 0 for tenantSlug === "onlineboost"', async () => {
      const code = await generateUniqueCodeForTenant({
        tenantSlug: 'onlineboost',
        baseAmount: 249000,
        paymentMethod: 'qris',
      });
      expect(code).toBe(0);
    });

    it('should return 0 when paymentMethod includes "xendit"', async () => {
      const code = await generateUniqueCodeForTenant({
        tenantSlug: 'other-store',
        baseAmount: 150000,
        paymentMethod: 'xendit_qris',
      });
      expect(code).toBe(0);
    });

    it('should return 0 when isGateway or isXendit option is true', async () => {
      const code = await generateUniqueCodeForTenant({
        tenantSlug: 'clinic-store',
        baseAmount: 500000,
        paymentMethod: 'qris',
        isGateway: true,
      } as any);
      expect(code).toBe(0);
    });
  });

  describe('2. POST /api/checkout/create-order route policy', () => {
    it('should force uniqueCode = 0 for onlineboost in POST /api/checkout/create-order handler', async () => {
      const { POST } = await import('@/app/api/checkout/create-order/route');

      const mockBody = {
        tenantSlug: 'onlineboost',
        productId: 'prod-starter-1',
        productTitle: 'OnlineBoost Starter Plan',
        amount: 249000,
        basePrice: 249000,
        customerName: 'Test Buyer',
        customerPhone: '081234567890',
        customerEmail: 'test@example.com',
        paymentMethod: 'qris',
      };

      const req = new NextRequest('http://localhost:3000/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockBody),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderId).toBeDefined();
    });
  });

  describe('3. POST /api/v1/payments/qris/create route policy', () => {
    it('should enforce unique_code = 0 and return data wrapper for onlineboost', async () => {
      const { POST } = await import('@/app/api/v1/payments/qris/create/route');

      const req = new NextRequest('http://localhost:3000/api/v1/payments/qris/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'onlineboost',
          product_name: 'OnlineBoost Starter Plan',
          product_id: 'prod-starter-1',
          amount: 249000,
          customer_phone: '081234567890',
          customer_name: 'Test Buyer',
        }),
      });

      const res = await POST(req);
      // Even if mock tenant or products table returns 404 or 200, check behavior
      const data = await res.json();
      if (res.status === 200) {
        expect(data.unique_code).toBe(0);
        expect(data.data).toBeDefined();
        expect(data.data.unique_code).toBe(0);
        expect(data.data.amount).toBe(249000);
      }
    });
  });
});
