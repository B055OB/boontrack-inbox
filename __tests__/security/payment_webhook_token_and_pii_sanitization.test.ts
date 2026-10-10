/**
 * Test Suite: Payment Webhook Security & PII Sanitization
 *
 * Verifies:
 * 1. app/api/webhooks/payment/route.ts:
 *    - Rejects POST with 403 Forbidden when x-callback-token is missing or empty (Fail-Closed).
 *    - Rejects POST with 403 Forbidden when x-callback-token is invalid.
 *    - Accepts POST when x-callback-token matches process.env.XENDIT_CALLBACK_TOKEN.
 *    - GET /api/webhooks/payment without logs returns 200 without logs field.
 *    - GET /api/webhooks/payment?logs=true returns 401 Unauthorized for public visitors.
 *    - GET /api/webhooks/payment?logs=true returns 200 for authorized admin.
 *
 * 2. lib/payment-webhook-service.ts:
 *    - addWebhookLog redacts rawBody to '[REDACTED_PII]'.
 *    - addWebhookLog redacts sensitive headers (authorization, x-callback-token, cookie, etc.) to '[REDACTED]'.
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/webhooks/payment/route';
import {
  addWebhookLog,
  getRecentWebhookLogs,
  type WebhookLogEntry,
} from '@/lib/payment-webhook-service';

// Mock handlePaymentWebhook to isolate route logic
jest.mock('@/lib/payment-webhook-service', () => {
  const actual = jest.requireActual('@/lib/payment-webhook-service');
  return {
    ...actual,
    handlePaymentWebhook: jest.fn().mockImplementation(async () => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ success: true, message: 'Settlement processed' });
    }),
  };
});

describe('CTO Audit Closure: Payment Webhook Security & PII Sanitization', () => {
  const originalToken = process.env.XENDIT_CALLBACK_TOKEN;
  const originalAdminSecret = process.env.INTERNAL_API_SECRET;
  const TEST_VALID_TOKEN = 'test_valid_xendit_callback_token_xyz123';

  beforeAll(() => {
    process.env.XENDIT_CALLBACK_TOKEN = TEST_VALID_TOKEN;
    process.env.INTERNAL_API_SECRET = 'test_internal_admin_secret_999';
  });

  afterAll(() => {
    process.env.XENDIT_CALLBACK_TOKEN = originalToken;
    process.env.INTERNAL_API_SECRET = originalAdminSecret;
  });

  describe('1. x-callback-token Validation on POST /api/webhooks/payment (Fail-Closed)', () => {
    it('rejects POST with 403 when x-callback-token header is absent', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('x-callback-token');
    });

    it('rejects POST with 403 when x-callback-token header is wrong/forged', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': 'attacker_fake_token',
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('x-callback-token');
    });

    it('accepts POST when x-callback-token matches valid configured token', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': TEST_VALID_TOKEN,
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('2. Public Diagnostic Logs Protection (GET /api/webhooks/payment)', () => {
    it('GET without ?logs returns 200 without exposing logs', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ONLINE');
      expect(json.logs).toBeUndefined();
    });

    it('GET ?logs=true returns 401 Unauthorized for unauthenticated public caller', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment?logs=true');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('GET ?logs=true returns 200 when authorized with internal admin secret', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment?logs=true', {
        headers: {
          'x-internal-secret': 'test_internal_admin_secret_999',
        },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ONLINE');
      expect(Array.isArray(json.logs)).toBe(true);
    });
  });

  describe('3. PII and Sensitive Headers Sanitization in addWebhookLog', () => {
    it('redacts rawBody to [REDACTED_PII] and redacts authorization/token headers', () => {
      const testEntry: WebhookLogEntry = {
        id: 'LOG-TEST-SANITIZATION-001',
        timestamp: new Date().toISOString(),
        endpoint: '/api/webhooks/payment',
        method: 'POST',
        headers: {
          authorization: 'Bearer super_secret_token_123',
          'x-callback-token': 'xendit_token_sensitive',
          cookie: 'session_secret=abc',
          'content-type': 'application/json',
          'user-agent': 'Xendit/1.0',
        },
        rawBody: {
          customer_phone: '081234567890',
          customer_email: 'buyer@example.com',
          credit_card_number: '4111111111111111',
          nominal: 149000,
        },
        resultStatus: 200,
        resultBody: { success: true },
      };

      addWebhookLog(testEntry);

      const logs = getRecentWebhookLogs();
      const recorded = logs.find((l) => l.id === 'LOG-TEST-SANITIZATION-001');

      expect(recorded).toBeDefined();
      expect(recorded!.rawBody).toBe('[REDACTED_PII]');
      expect(recorded!.headers['authorization']).toBe('[REDACTED]');
      expect(recorded!.headers['x-callback-token']).toBe('[REDACTED]');
      expect(recorded!.headers['cookie']).toBe('[REDACTED]');
      expect(recorded!.headers['content-type']).toBe('application/json');
      expect(recorded!.headers['user-agent']).toBe('Xendit/1.0');
    });
  });
});
