/**
 * Test Suite: Payment Webhook Security & PII Sanitization
 *
 * Verifies:
 * 1. app/api/webhook/payment/route.ts (Singular alias):
 *    - Rejects POST with 403 Forbidden when x-callback-token is missing or empty (Fail-Closed).
 *    - Rejects POST with 403 Forbidden when x-callback-token is invalid.
 *    - Accepts POST when x-callback-token matches process.env.XENDIT_CALLBACK_TOKEN.
 *    - GET /api/webhook/payment?logs=true rejects with 401 when accessed using x-callback-token (revoked).
 *    - GET /api/webhook/payment?logs=true rejects with 401 when accessed using EVOLUTION_API_KEY (revoked).
 *    - GET /api/webhook/payment?logs=true returns 200 for internal admin secret or service role key.
 *
 * 2. app/api/webhooks/payment/route.ts (Plural alias):
 *    - Rejects POST with 403 Forbidden when x-callback-token is missing or invalid.
 *    - Accepts POST when x-callback-token matches process.env.XENDIT_CALLBACK_TOKEN.
 *    - GET /api/webhooks/payment?logs=true rejects with 401 when accessed using webhook tokens.
 *
 * 3. lib/payment-webhook-service.ts:
 *    - addWebhookLog redacts rawBody to '[REDACTED_PII]'.
 *    - addWebhookLog redacts sensitive headers (authorization, x-callback-token, cookie, etc.) to '[REDACTED]'.
 *    - addWebhookLog recursively sanitizes resultBody and nested payloads to '[REDACTED_PII]' for phones, emails, tokens, and PII keys.
 */

import { NextRequest } from 'next/server';
import { POST as singularPOST, GET as singularGET } from '@/app/api/webhook/payment/route';
import { POST as pluralPOST, GET as pluralGET } from '@/app/api/webhooks/payment/route';
import {
  addWebhookLog,
  getRecentWebhookLogs,
  sanitizePII,
  isAuthorizedWebhookLogViewer,
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
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalEvoKey = process.env.EVOLUTION_API_KEY;

  const TEST_VALID_TOKEN = 'test_valid_xendit_callback_token_xyz123';
  const TEST_INTERNAL_SECRET = 'test_internal_admin_secret_999';
  const TEST_SERVICE_ROLE = 'test_supabase_service_role_key_888';
  const TEST_EVO_KEY = 'test_evo_api_key_777';

  beforeAll(() => {
    process.env.XENDIT_CALLBACK_TOKEN = TEST_VALID_TOKEN;
    process.env.INTERNAL_API_SECRET = TEST_INTERNAL_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_ROLE;
    process.env.EVOLUTION_API_KEY = TEST_EVO_KEY;
  });

  afterAll(() => {
    process.env.XENDIT_CALLBACK_TOKEN = originalToken;
    process.env.INTERNAL_API_SECRET = originalAdminSecret;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    process.env.EVOLUTION_API_KEY = originalEvoKey;
  });

  describe('1. Singular Alias POST /api/webhook/payment Token Validation (Fail-Closed)', () => {
    it('rejects POST with 403 when x-callback-token header is absent', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhook/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await singularPOST(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('x-callback-token');
    });

    it('rejects POST with 403 when x-callback-token header is invalid or forged', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhook/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': 'attacker_fake_token',
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await singularPOST(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('x-callback-token');
    });

    it('accepts POST when x-callback-token matches configured token', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhook/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': TEST_VALID_TOKEN,
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await singularPOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('2. Plural Alias POST /api/webhooks/payment Token Validation (Fail-Closed)', () => {
    it('rejects POST with 403 when x-callback-token is absent', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await pluralPOST(req);
      expect(res.status).toBe(403);
    });

    it('accepts POST when x-callback-token is valid', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': TEST_VALID_TOKEN,
        },
        body: JSON.stringify({ status: 'PAID', amount: 149000 }),
      });

      const res = await pluralPOST(req);
      expect(res.status).toBe(200);
    });
  });

  describe('3. Diagnostic Logs Protection: Revocation of Webhook and Evolution Tokens', () => {
    it('GET ?logs=true rejects with 401 when accessed with XENDIT_CALLBACK_TOKEN (Revoked)', async () => {
      // Attempting to read diagnostic logs using x-callback-token MUST be denied
      const req = new NextRequest('https://boontrack.com/api/webhook/payment?logs=true', {
        headers: {
          'x-callback-token': TEST_VALID_TOKEN,
        },
      });
      const res = await singularGET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('GET ?logs=true rejects with 401 on plural route with XENDIT_CALLBACK_TOKEN (Revoked)', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment?logs=true', {
        headers: {
          'x-callback-token': TEST_VALID_TOKEN,
        },
      });
      const res = await pluralGET(req);

      expect(res.status).toBe(401);
    });

    it('GET ?logs=true rejects with 401 when accessed with EVOLUTION_API_KEY / x-admin-key (Revoked)', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhook/payment?logs=true', {
        headers: {
          'x-admin-key': TEST_EVO_KEY,
        },
      });
      const res = await singularGET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('GET ?logs=true accepts with 200 when authorized with INTERNAL_API_SECRET / ADMIN_INTERNAL_SECRET', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhook/payment?logs=true', {
        headers: {
          'x-internal-secret': TEST_INTERNAL_SECRET,
        },
      });
      const res = await singularGET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ONLINE');
      expect(Array.isArray(json.logs)).toBe(true);
    });

    it('GET ?logs=true accepts with 200 when authorized with Supabase Service Role Key', async () => {
      const req = new NextRequest('https://boontrack.com/api/webhooks/payment?logs=true', {
        headers: {
          authorization: `Bearer ${TEST_SERVICE_ROLE}`,
        },
      });
      const res = await pluralGET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ONLINE');
      expect(Array.isArray(json.logs)).toBe(true);
    });
  });

  describe('4. Comprehensive PII & resultBody Sanitization in addWebhookLog', () => {
    it('redacts rawBody to [REDACTED_PII] and redacts authorization/token headers', () => {
      const testEntry: WebhookLogEntry = {
        id: 'LOG-TEST-SANITIZATION-001',
        timestamp: new Date().toISOString(),
        endpoint: '/api/webhook/payment',
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
    });

    it('sanitizes resultBody containing phone numbers, emails, and nested PII objects', () => {
      const testEntry: WebhookLogEntry = {
        id: 'LOG-TEST-RESULTBODY-PII-002',
        timestamp: new Date().toISOString(),
        endpoint: '/api/webhook/payment',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        rawBody: { order_id: 'ORDER-123' },
        resultStatus: 200,
        resultBody: {
          success: true,
          order_id: 'ORDER-123',
          gross_amount: 149000,
          customer_name: 'Budi Santoso',
          customer_phone: '081298765432',
          customer_email: 'budi@gmail.com',
          token: 'secret_jwt_token',
          message: 'Notifikasi berhasil dikirim ke 081298765432 via email budi@gmail.com',
          nested: {
            buyer_phone: '6287712345678',
            buyer_email: 'nested.buyer@example.com',
            shipping_address: 'Jl. Merdeka No. 45, Bandung',
            internal_status: 'COMPLETED',
          },
          recipient_list: [
            { phone: '081300001111', role: 'admin' },
            { email: 'admin@toko.com', role: 'owner' },
          ],
        },
      };

      addWebhookLog(testEntry);

      const logs = getRecentWebhookLogs();
      const recorded = logs.find((l) => l.id === 'LOG-TEST-RESULTBODY-PII-002');

      expect(recorded).toBeDefined();
      const rb = recorded!.resultBody;

      // Preserved non-PII operational fields
      expect(rb.success).toBe(true);
      expect(rb.order_id).toBe('ORDER-123');
      expect(rb.gross_amount).toBe(149000);
      expect(rb.nested.internal_status).toBe('COMPLETED');

      // Redacted top-level PII keys
      expect(rb.customer_name).toBe('[REDACTED_PII]');
      expect(rb.customer_phone).toBe('[REDACTED_PII]');
      expect(rb.customer_email).toBe('[REDACTED_PII]');
      expect(rb.token).toBe('[REDACTED_PII]');

      // Redacted inside message strings (embedded phone and email)
      expect(rb.message).not.toContain('081298765432');
      expect(rb.message).not.toContain('budi@gmail.com');
      expect(rb.message).toContain('[REDACTED_PII]');

      // Redacted nested object PII
      expect(rb.nested.buyer_phone).toBe('[REDACTED_PII]');
      expect(rb.nested.buyer_email).toBe('[REDACTED_PII]');
      expect(rb.nested.shipping_address).toBe('[REDACTED_PII]');

      // Redacted array of objects PII
      expect(rb.recipient_list[0].phone).toBe('[REDACTED_PII]');
      expect(rb.recipient_list[1].email).toBe('[REDACTED_PII]');
      expect(rb.recipient_list[0].role).toBe('admin');
    });
  });
});
