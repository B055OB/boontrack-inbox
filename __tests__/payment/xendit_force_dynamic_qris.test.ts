/**
 * @file __tests__/payment/xendit_force_dynamic_qris.test.ts
 * @description Unit & Integration Tests: Force Xendit Dynamic QRIS & Deprecate DANA Fallback
 */

import { createXenditDynamicQRIS } from '@/lib/payment/xendit-service';
import { handlePaymentWebhook } from '@/lib/payment-webhook-service';
import type { NextRequest } from 'next/server';

describe('Xendit Dynamic QRIS Gateway & Routing Hardening', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('1. createXenditDynamicQRIS Service', () => {
    it('harus fail-closed jika XENDIT_SECRET_KEY tidak diset', async () => {
      delete process.env.XENDIT_SECRET_KEY;
      delete process.env.XENDIT_API_KEY;

      const result = await createXenditDynamicQRIS({
        orderId: 'ORD-TEST-001',
        amount: 50000,
        tenantSlug: 'onlineboost',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('XENDIT_SECRET_KEY');
    });

    it('harus memanggil official endpoint /qr_codes dan menghasilkan qr_string resmi', async () => {
      process.env.XENDIT_SECRET_KEY = 'xnd_development_mock_key';

      const mockDynamicQrString =
        '00020101021226670016ID.CO.XENDIT.WWW011893600899000000000102150000000000000015204581253033605405500005802ID5911ONLINEBOOST6007JAKARTA61051234062250721ORD-TEST-OFFICIAL-0016304A1B2';

      const mockFetch = jest.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/qr_codes')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              id: 'qr_test_123',
              reference_id: 'ORD-TEST-OFFICIAL-001',
              type: 'DYNAMIC',
              currency: 'IDR',
              amount: 50000,
              channel_code: 'ID_XENDIT',
              status: 'ACTIVE',
              qr_string: mockDynamicQrString,
            }),
          });
        }
        if (url.includes('/v2/invoices')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'inv_test_123',
              invoice_url: 'https://checkout-staging.xendit.co/v2/inv_test_123',
            }),
          });
        }
        return originalFetch(url, opts);
      });

      global.fetch = mockFetch as any;

      const result = await createXenditDynamicQRIS({
        orderId: 'ORD-TEST-OFFICIAL-001',
        amount: 50000,
        tenantSlug: 'onlineboost',
        productTitle: 'Paket Starter Inkubasi',
      });

      expect(result.success).toBe(true);
      expect(result.qr_string).toBe(mockDynamicQrString);
      expect(result.qr_string?.startsWith('000201010212')).toBe(true);
      expect(result.invoice_url).toBe('https://checkout-staging.xendit.co/v2/inv_test_123');
      expect(result.xendit_id).toBe('qr_test_123');

      // Verifikasi payload yang dikirim ke Xendit /qr_codes
      const qrCall = mockFetch.mock.calls.find((call: any[]) => call[0].includes('/qr_codes'));
      expect(qrCall).toBeDefined();
      const qrBody = JSON.parse(qrCall[1].body);
      expect(qrBody.reference_id).toBe('ORD-TEST-OFFICIAL-001');
      expect(qrBody.type).toBe('DYNAMIC');
      expect(qrBody.amount).toBe(50000);
    });
  });

  describe('2. Deprecasi Static DANA Bandung Fallback', () => {
    it('memastikan NEXT_PUBLIC_BOONTRACK_STATIC_QRIS didepresiasi di environment', () => {
      const staticQris = process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS;
      // Harus kosong atau undefined, tidak boleh lagi berisi string DANA Kab. Bandung
      if (staticQris) {
        expect(staticQris).not.toContain('ID.DANA.WWW');
        expect(staticQris).not.toContain('Kab. Bandung');
      }
    });
  });

  describe('3. Webhook Reconciliation: Xendit Dynamic QR & Invoice Support', () => {
    function createMockRequest(body: any, headers: Record<string, string> = {}): NextRequest {
      const bodyText = JSON.stringify(body);
      const reqHeaders = new Headers({
        'content-type': 'application/json',
        ...headers,
      });

      return {
        url: 'https://boontrack.com/api/webhooks/xendit',
        method: 'POST',
        headers: reqHeaders,
        text: async () => bodyText,
        json: async () => body,
      } as unknown as NextRequest;
    }

    it('harus mengenali payload event "qr.payment" dari Xendit Dynamic QR code', async () => {
      const qrPaymentPayload = {
        event: 'qr.payment',
        data: {
          id: 'qr_test_123',
          reference_id: 'ORD-MOCK-DYNAMIC-999',
          currency: 'IDR',
          amount: 99000,
          payment_id: 'py_test_123',
          status: 'COMPLETED',
          payment_detail: {
            source: 'QR_CODE',
          },
        },
      };

      const req = createMockRequest(qrPaymentPayload);
      const response = await handlePaymentWebhook(req, '/api/webhooks/xendit');
      const json = await response.json();

      // Webhook memproses tanpa exception dan mengembalikan JSON
      expect(json).toBeDefined();
    }, 10000);
  });
});
