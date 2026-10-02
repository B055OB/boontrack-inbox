/**
 * @file __tests__/fulfillment/hard_gate.test.ts
 * @description Unit tests for ACT-02: Hard-Gate Asset & Fulfillment Link Sanitization.
 *
 * Verifies:
 * 1. Backend API (/api/v1/orders/[id]) strips fulfillment_url, download_url, google_meet_url,
 *    and credentials to null when order is UNPAID / PENDING.
 * 2. Backend API (/api/v1/fulfillment) returns 403 Forbidden and null fulfillment_url when UNPAID.
 * 3. Backend APIs return fulfillment assets ONLY when payment status is confirmed 'PAID'.
 * 4. Tenant isolation: No cross-tenant asset or template fallback leakage.
 */

// ---------------------------------------------------------------------------
// Database Mocks
// ---------------------------------------------------------------------------

const mockOrders: Record<string, any> = {
  'ORD-UNPAID-123': {
    id: 'ORD-UNPAID-123',
    tenant_slug: 'store-alpha',
    product_id: 'PROD-DIGITAL-1',
    product_title: 'Template Notion Pro',
    gross_amount: 150000,
    status: 'PENDING',
    payment_status: 'UNPAID',
    order_status: 'PENDING',
    link_digital: 'https://secret.cdn.com/alpha-notion-template.zip',
    download_url: 'https://secret.cdn.com/alpha-notion-template.zip',
    fulfillment_metadata: {
      access_url: 'https://secret.cdn.com/alpha-notion-template.zip',
      google_meet_url: 'https://meet.google.com/abc-defg-hij',
      credentials: { token: 'SECRET_TOKEN_123' },
      license_key: 'ALPHA-KEY-999',
    },
  },
  'ORD-PAID-456': {
    id: 'ORD-PAID-456',
    tenant_slug: 'store-alpha',
    product_id: 'PROD-DIGITAL-1',
    product_title: 'Template Notion Pro',
    gross_amount: 150000,
    status: 'PAID',
    payment_status: 'PAID',
    order_status: 'COMPLETED',
    link_digital: 'https://secret.cdn.com/alpha-notion-template.zip',
    download_url: 'https://secret.cdn.com/alpha-notion-template.zip',
    paid_at: '2026-10-02T10:00:00Z',
    fulfillment_metadata: {
      access_url: 'https://secret.cdn.com/alpha-notion-template.zip',
      google_meet_url: 'https://meet.google.com/abc-defg-hij',
      credentials: { token: 'SECRET_TOKEN_123' },
      license_key: 'ALPHA-KEY-999',
    },
  },
  'ORD-TENANT-BETA': {
    id: 'ORD-TENANT-BETA',
    tenant_slug: 'store-beta',
    product_id: 'PROD-BETA-X',
    product_title: 'Kursus Privat Beta',
    gross_amount: 300000,
    status: 'PAID',
    payment_status: 'PAID',
    order_status: 'COMPLETED',
    link_digital: 'https://beta.boontrack.com/kursus-private.mp4',
    download_url: 'https://beta.boontrack.com/kursus-private.mp4',
  },
};

const mockTenants: Record<string, any> = {
  'store-alpha': {
    slug: 'store-alpha',
    name: 'Alpha Store',
    metadata: {
      products: [
        {
          id: 'PROD-DIGITAL-1',
          name: 'Template Notion Pro',
          link_digital: 'https://secret.cdn.com/alpha-notion-template.zip',
          fulfillment_metadata: {
            access_url: 'https://secret.cdn.com/alpha-notion-template.zip',
            meeting_url: 'https://meet.google.com/abc-defg-hij',
          },
        },
      ],
    },
  },
  'store-beta': {
    slug: 'store-beta',
    name: 'Beta Store',
    metadata: {
      products: [
        {
          id: 'PROD-BETA-X',
          name: 'Kursus Privat Beta',
          link_digital: 'https://beta.boontrack.com/kursus-private.mp4',
        },
      ],
    },
  },
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
}));

const mockSupabase = {
  from: jest.fn((table: string) => {
    return {
      select: jest.fn(() => ({
        eq: jest.fn((col: string, val: string) => ({
          maybeSingle: jest.fn(async () => {
            if (table === 'orders') {
              const row = mockOrders[val] || null;
              return { data: row ? { ...row } : null, error: null };
            }
            if (table === 'tenants') {
              const row = mockTenants[val] || null;
              return { data: row ? { ...row } : null, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    };
  }),
};

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';
import { GET as getOrderById } from '@/app/api/v1/orders/[id]/route';
import { GET as getFulfillment, POST as postFulfillment } from '@/app/api/v1/fulfillment/route';
import { GET as getOrderStatus } from '@/app/api/orders/[orderId]/status/route';

describe('ACT-02: Hard-Gate Asset & Fulfillment Link Sanitization', () => {
  describe('GET /api/v1/orders/[id] Payload Sanitization', () => {
    test('HARD-GATE DENY: strips fulfillment_url, download_url, google_meet_url, credentials to null when UNPAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ORD-UNPAID-123');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-UNPAID-123' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('PENDING');
      expect(data.payment_status).toBe('UNPAID');

      // CRITICAL SECURITY ASSERTIONS: All fulfillment assets MUST be null
      expect(data.fulfillment_url).toBeNull();
      expect(data.download_url).toBeNull();
      expect(data.link_digital).toBeNull();
      expect(data.access_url).toBeNull();
      expect(data.google_meet_url).toBeNull();
      expect(data.meeting_link).toBeNull();
      expect(data.credentials).toBeNull();
      expect(data.license_key).toBeNull();
      expect(data.fulfillment_metadata).toBeNull();
      expect(data.briefing_url).toBeNull();
    });

    test('HARD-GATE ALLOW: populates fulfillment assets when payment_status is PAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ORD-PAID-456');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-PAID-456' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('PAID');
      expect(data.payment_status).toBe('PAID');

      // Fulfillment assets MUST be available once PAID
      expect(data.fulfillment_url).toBe('https://secret.cdn.com/alpha-notion-template.zip');
      expect(data.download_url).toBe('https://secret.cdn.com/alpha-notion-template.zip');
      expect(data.link_digital).toBe('https://secret.cdn.com/alpha-notion-template.zip');
      expect(data.google_meet_url).toBe('https://meet.google.com/abc-defg-hij');
      expect(data.credentials).toEqual({ token: 'SECRET_TOKEN_123' });
      expect(data.license_key).toBe('ALPHA-KEY-999');
      expect(data.fulfillment_metadata).not.toBeNull();
    });

    test('returns 404 for non-existent order', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ORD-NONEXISTENT');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-NONEXISTENT' }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('GET & POST /api/v1/fulfillment Endpoint Security', () => {
    test('returns 403 Forbidden with FULFILLMENT_LOCKED when order is UNPAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/fulfillment?order_id=ORD-UNPAID-123');
      const res = await getFulfillment(req);

      expect(res.status).toBe(403);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.status).toBe('UNPAID');
      expect(data.error).toBe('FULFILLMENT_LOCKED');
      expect(data.fulfillment_url).toBeNull();
      expect(data.download_url).toBeNull();
      expect(data.credentials).toBeNull();
    });

    test('returns 200 OK with fulfillment details when order is PAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/fulfillment?order_id=ORD-PAID-456');
      const res = await getFulfillment(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('PAID');
      expect(data.fulfillment_url).toBe('https://secret.cdn.com/alpha-notion-template.zip');
      expect(data.google_meet_url).toBe('https://meet.google.com/abc-defg-hij');
      expect(data.credentials).toEqual({ token: 'SECRET_TOKEN_123' });
    });

    test('POST endpoint also enforces 403 when order is UNPAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/fulfillment', {
        method: 'POST',
        body: JSON.stringify({ order_id: 'ORD-UNPAID-123' }),
      });
      const res = await postFulfillment(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.status).toBe('UNPAID');
      expect(data.fulfillment_url).toBeNull();
    });
  });

  describe('GET /api/orders/[orderId]/status Integration Assertion', () => {
    test('ensures fulfillment_url and access_url are explicitly null when UNPAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders/ORD-UNPAID-123/status');
      const res = await getOrderStatus(req, {
        params: Promise.resolve({ orderId: 'ORD-UNPAID-123' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('PENDING');
      expect(data.fulfillment_url).toBeNull();
      expect(data.access_url).toBeNull();
      expect(data.google_meet_url).toBeNull();
      expect(data.credentials).toBeNull();
      expect(data.license_key).toBeNull();
      expect(data.download_url).toBeNull();
      expect(data.link_digital).toBeNull();
      expect(data.fulfillment_metadata).toBeNull();
    });

    test('ensures fulfillment_url is populated when PAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders/ORD-PAID-456/status');
      const res = await getOrderStatus(req, {
        params: Promise.resolve({ orderId: 'ORD-PAID-456' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('PAID');
      expect(data.fulfillment_url).toBe('https://secret.cdn.com/alpha-notion-template.zip');
      expect(data.access_url).toBe('https://secret.cdn.com/alpha-notion-template.zip');
    });
  });

  describe('Tenant Template Fallback Isolation', () => {
    test('store-beta order never inherits store-alpha fulfillment assets', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ORD-TENANT-BETA');
      const res = await getOrderById(req, {
        params: Promise.resolve({ id: 'ORD-TENANT-BETA' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.tenant_slug).toBe('store-beta');
      expect(data.fulfillment_url).toBe('https://beta.boontrack.com/kursus-private.mp4');
      // Alpha assets must NEVER appear
      expect(data.fulfillment_url).not.toContain('alpha-notion-template');
      expect(data.google_meet_url).toBeNull(); // Beta order does not have meeting url
    });
  });
});
