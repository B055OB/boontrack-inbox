import { generateUniqueCodeForTenant } from '@/lib/unique-code-generator';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { NextRequest } from 'next/server';

describe('P1 Precision Test: Eliminasi Kode Unik pada Payment Gateway / QRIS', () => {
  describe('1. lib/unique-code-generator.ts Enforcement', () => {
    it('harus mengembalikan unique_code = 0 jika paymentMethod adalah qris (untuk sembarang tenant)', async () => {
      const code = await generateUniqueCodeForTenant({
        tenantSlug: 'toko-kue-lestari',
        baseAmount: 150000,
        paymentMethod: 'qris',
      });
      expect(code).toBe(0);
    });

    it('harus mengembalikan unique_code = 0 jika paymentMethod adalah gateway atau xendit', async () => {
      const code1 = await generateUniqueCodeForTenant({
        tenantSlug: 'gym-center',
        baseAmount: 300000,
        paymentMethod: 'gateway',
      });
      const code2 = await generateUniqueCodeForTenant({
        tenantSlug: 'fashion-store',
        baseAmount: 250000,
        paymentMethod: 'xendit_qris',
      });
      expect(code1).toBe(0);
      expect(code2).toBe(0);
    });

    it('hanya boleh mengalokasikan kode unik 3 digit jika paymentMethod adalah manual_transfer', async () => {
      const code = await generateUniqueCodeForTenant({
        tenantSlug: 'apotek-sehat',
        baseAmount: 100000,
        paymentMethod: 'manual_transfer',
      });
      expect(code).toBeGreaterThanOrEqual(100);
      expect(code).toBeLessThanOrEqual(999);
    });
  });

  describe('2. lib/checkout-service.ts Precision Billing', () => {
    it('harus menghasilkan unique_code = 0 dan gross_amount bulat pas (nett) saat checkout QRIS', async () => {
      const result = await createOrderAndInvoice({
        tenantSlug: 'sample-brand',
        productId: 'prod-digital-pack',
        productTitle: 'Digital Marketing Pack',
        amount: 250000,
        basePrice: 250000,
        customerName: 'Budi Santoso',
        customerPhone: '081234567890',
        customerEmail: 'budi@example.com',
        paymentMethod: 'qris',
        uniqueCode: 751, // Simulasi client mencoba mengirimkan kode unik
      });

      expect(result.orderId).toBeDefined();
      expect(result.uniqueCode).toBe(0);
      expect(result.grossAmount).toBe(250000);
    });

    it('harus menyertakan kode unik saat checkout transfer bank manual', async () => {
      const result = await createOrderAndInvoice({
        tenantSlug: 'sample-brand',
        productId: 'prod-digital-pack',
        productTitle: 'Digital Marketing Pack',
        amount: 250000,
        basePrice: 250000,
        customerName: 'Budi Santoso',
        customerPhone: '081234567890',
        customerEmail: 'budi@example.com',
        paymentMethod: 'manual_transfer',
        uniqueCode: 421,
      });

      expect(result.orderId).toBeDefined();
      expect(result.uniqueCode).toBe(421);
      expect(result.grossAmount).toBe(250421);
    });
  });

  describe('3. POST /api/checkout/create-order route policy', () => {
    it('harus memaksakan uniqueCode = 0 pada request order QRIS tanpa melihat nama tenant', async () => {
      const { POST } = await import('@/app/api/checkout/create-order/route');

      const req = new NextRequest('http://localhost:3000/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'random-brand-xyz',
          productId: 'prod-xyz-1',
          productTitle: 'SaaS Tool Starter',
          amount: 199000,
          basePrice: 199000,
          customerName: 'Joko Anwar',
          customerPhone: '081987654321',
          customerEmail: 'joko@example.com',
          paymentMethod: 'qris',
          uniqueCode: 350, // Sengaja disuntikkan client
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderId).toBeDefined();
      expect(data.uniqueCode).toBe(0);
      expect(data.grossAmount).toBe(199000);
    });
  });

  describe('4. GET /api/v1/tenants/[slug]/unique-code route policy', () => {
    it('harus mengembalikan unique_code = 0 dan final_amount bulat nett saat method=qris', async () => {
      const { GET } = await import('@/app/api/v1/tenants/[slug]/unique-code/route');

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/custom-shop/unique-code?amount=150000&method=qris');
      const res = await GET(req, {
        params: Promise.resolve({ slug: 'custom-shop' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.unique_code).toBe(0);
      expect(data.base_amount).toBe(150000);
      expect(data.final_amount).toBe(150000);
    });

    it('harus mengembalikan unique_code > 0 dan final_amount = base + unique_code saat method=manual_transfer', async () => {
      const { GET } = await import('@/app/api/v1/tenants/[slug]/unique-code/route');

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/custom-shop/unique-code?amount=150000&method=manual_transfer');
      const res = await GET(req, {
        params: Promise.resolve({ slug: 'custom-shop' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.unique_code).toBeGreaterThanOrEqual(100);
      expect(data.unique_code).toBeLessThanOrEqual(999);
      expect(data.final_amount).toBe(150000 + data.unique_code);
    });
  });
});
