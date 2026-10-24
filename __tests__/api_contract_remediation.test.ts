/**
 * @file __tests__/api_contract_remediation.test.ts
 * @description P0/P1 Regression Test Suite for API Contract Remediation & Tenant Isolation
 * Verifies:
 * 1. Fail-Closed on Database Error (HTTP 503 instead of false 200 OK)
 * 2. Fail-Closed on Missing Tenant (HTTP 404 with NO fallback to DEFAULT_TENANT_CONFIGS)
 * 3. Cross-Tenant Isolation & Zero Query Parameter Authority (HTTP 401 on unauthorized access)
 * 4. Safe DTO Normalization handling undefined, null, and empty string without throwing .toLowerCase() runtime errors
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Dynamic Mock State
// ---------------------------------------------------------------------------
type MockBehavior = 'normal' | 'db_error' | 'tenant_not_found';
let currentBehavior: MockBehavior = 'normal';

const VALID_TENANT_ID = '52967979-4760-4cea-b686-cdbdb389c0e1';
const VALID_TENANT_SLUG = 'onlineboost';

const mockTenantRow = {
  id: VALID_TENANT_ID,
  slug: VALID_TENANT_SLUG,
  name: 'OnlineBoost Official',
  category: null, // Test null normalization
  tier: null,     // Test null normalization
  status: 'active',
  metadata: null, // Test null normalization
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockOrderRow = {
  id: 'order-12345',
  order_number: null, // Test null normalization
  tenant_id: VALID_TENANT_ID,
  tenant_slug: VALID_TENANT_SLUG,
  customer_name: null, // Test null normalization
  customer_phone: '+6281234567890',
  total_amount: null,
  status: null,         // Test null normalization (prevents status.toLowerCase() crash)
  payment_status: null, // Test null normalization (prevents payment_status.toLowerCase() crash)
  is_archived: false,
  created_at: '2026-10-10T10:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
};

const mockContactRow = {
  id: 'contact-12345',
  tenant_id: VALID_TENANT_ID,
  tenant_slug: VALID_TENANT_SLUG,
  name: null,           // Test null normalization
  phone_e164: null,     // Test null normalization
  email: null,
  contact_status: 'ACTIVE',
  lifecycle_stage: null,
  metadata: null,       // Test null metadata
  created_at: null,
  updated_at: null,
};

const mockConversationRow = {
  id: 'conv-12345',
  tenant_id: VALID_TENANT_ID,
  tenant_slug: VALID_TENANT_SLUG,
  customer_name: null,  // Test null normalization
  customer_phone: null, // Test null normalization
  status: null,         // Test null normalization
  bot_status: null,     // Test null normalization
  bot_mode: null,
  bot_paused: null,
  unread_count: null,
  last_message_at: '2026-10-15T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Supabase Mock Builder
// ---------------------------------------------------------------------------
const createMockQueryBuilder = (tableName: string) => {
  let isSingle = false;
  let isMaybeSingle = false;

  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    or: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => {
      isSingle = true;
      return builder;
    },
    maybeSingle: () => {
      isMaybeSingle = true;
      return builder;
    },
    then: (resolve: any) => {
      if (currentBehavior === 'db_error') {
        return resolve({
          data: null,
          error: { message: 'Database connection terminated unexpectedly', code: '57P01' },
        });
      }

      if (currentBehavior === 'tenant_not_found') {
        if (tableName === 'tenants') {
          return resolve({ data: null, error: null });
        }
      }

      if (tableName === 'tenants') {
        return resolve({ data: isSingle || isMaybeSingle ? mockTenantRow : [mockTenantRow], error: null });
      }

      if (tableName === 'orders') {
        return resolve({ data: isSingle || isMaybeSingle ? mockOrderRow : [mockOrderRow], error: null });
      }

      if (tableName === 'contacts') {
        return resolve({ data: isSingle || isMaybeSingle ? mockContactRow : [mockContactRow], error: null });
      }

      if (tableName === 'tags') {
        return resolve({ data: [], error: null });
      }

      if (tableName === 'contact_tags') {
        return resolve({ data: [], error: null });
      }

      if (tableName === 'conversations') {
        return resolve({ data: isSingle || isMaybeSingle ? mockConversationRow : [mockConversationRow], error: null });
      }

      return resolve({ data: isSingle || isMaybeSingle ? null : [], error: null });
    },
  };

  return builder;
};

const mockSupabase = {
  from: jest.fn((table: string) => createMockQueryBuilder(table)),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
  supabase: mockSupabase,
  isValidUuid: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  safeUuidOrNull: (id: any) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
      ? String(id)
      : null,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

import { GET as getTenantBySlug } from '@/app/api/v1/tenants/[slug]/route';
import { GET as getTenantOrders } from '@/app/api/v1/tenants/[slug]/orders/route';
import { GET as getOrdersGlobal } from '@/app/api/orders/route';
import { GET as getCrmContacts } from '@/app/api/v1/crm/contacts/route';
import { GET as getConversations } from '@/app/api/inbox/conversations/route';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

const VALID_TOKEN = signMerchantSessionToken({ tenantSlug: VALID_TENANT_SLUG, role: 'OWNER' });

describe('P0/P1 API Contract Remediation & Isolation Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentBehavior = 'normal';
  });

  // =========================================================================
  // 1. FAIL-CLOSED ON DATABASE ERROR (HTTP 503)
  // =========================================================================
  describe('1. Fail-Closed on Database Error (HTTP 503)', () => {
    beforeEach(() => {
      currentBehavior = 'db_error';
    });

    it('1.1 GET /api/v1/tenants/[slug] returns 503 on database query failure', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${VALID_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: VALID_TENANT_SLUG }) });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_LOOKUP_FAILED');
    });

    it('1.2 GET /api/v1/tenants/[slug]/orders returns 503 on database query failure', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${VALID_TENANT_SLUG}/orders`, {
        headers: { cookie: `bt_merchant_token=${VALID_TOKEN}` },
      });
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: VALID_TENANT_SLUG }) });

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(['TENANT_LOOKUP_FAILED', 'ORDER_LOOKUP_FAILED', 'DATABASE_UNAVAILABLE']).toContain(json.error);
    });

    it('1.3 GET /api/orders returns 503 on database query failure', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders?slug=${VALID_TENANT_SLUG}`, {
        headers: { cookie: `bt_merchant_token=${VALID_TOKEN}` },
      });
      const res = await getOrdersGlobal(req);

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(['TENANT_LOOKUP_FAILED', 'ORDER_LOOKUP_FAILED', 'DATABASE_UNAVAILABLE']).toContain(json.error);
    });

    it('1.4 GET /api/v1/crm/contacts returns 503 on database query failure', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/crm/contacts?tenant_id=${VALID_TENANT_SLUG}`, {
        headers: { cookie: `merchant_store=${VALID_TENANT_SLUG}` },
      });
      const res = await getCrmContacts(req);

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(['TENANT_LOOKUP_FAILED', 'CONTACTS_LOOKUP_FAILED']).toContain(json.error);
    });

    it('1.5 GET /api/inbox/conversations returns 503 on database query failure', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox/conversations?tenant=${VALID_TENANT_SLUG}`);
      const res = await getConversations(req);

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(['TENANT_LOOKUP_FAILED', 'CONVERSATIONS_LOOKUP_FAILED']).toContain(json.error);
    });
  });

  // =========================================================================
  // 2. FAIL-CLOSED ON MISSING TENANT (HTTP 404 - NO SYNTHETIC FALLBACK)
  // =========================================================================
  describe('2. Fail-Closed on Missing Tenant (HTTP 404)', () => {
    beforeEach(() => {
      currentBehavior = 'tenant_not_found';
    });

    it('2.1 GET /api/v1/tenants/[slug] returns 404 when tenant is missing (no fallback)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tenants/nonexistent-brand');
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: 'nonexistent-brand' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
      expect(json.tenant).toBeUndefined();
    });

    it('2.2 GET /api/v1/tenants/[slug]/orders returns 404 when tenant is missing', async () => {
      const nonExistentToken = signMerchantSessionToken({ tenantSlug: 'nonexistent-brand', role: 'OWNER' });
      const req = new NextRequest('http://localhost:3000/api/v1/tenants/nonexistent-brand/orders', {
        headers: { cookie: `bt_merchant_token=${nonExistentToken}` },
      });
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: 'nonexistent-brand' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2.3 GET /api/orders returns 404 when tenant is missing', async () => {
      const nonExistentToken = signMerchantSessionToken({ tenantSlug: 'nonexistent-brand', role: 'OWNER' });
      const req = new NextRequest('http://localhost:3000/api/orders?slug=nonexistent-brand', {
        headers: { cookie: `bt_merchant_token=${nonExistentToken}` },
      });
      const res = await getOrdersGlobal(req);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2.4 GET /api/v1/crm/contacts returns 404 when tenant is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=nonexistent-brand', {
        headers: { cookie: 'merchant_store=nonexistent-brand' },
      });
      const res = await getCrmContacts(req);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2.5 GET /api/inbox/conversations returns 404 when tenant is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/inbox/conversations?tenant=nonexistent-brand');
      const res = await getConversations(req);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });
  });

  // =========================================================================
  // 3. CROSS-TENANT ISOLATION & ZERO QUERY PARAMETER AUTHORITY (HTTP 401)
  // =========================================================================
  describe('3. Cross-Tenant Isolation (HTTP 401)', () => {
    it('3.1 rejects orders access when cookie belongs to Tenant Alpha but URL asks for Tenant Beta', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${VALID_TENANT_SLUG}/orders`, {
        headers: { cookie: 'merchant_store=attacker-store-alpha' },
      });
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: VALID_TENANT_SLUG }) });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('3.2 rejects global orders access when cookie does not match query slug', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders?slug=${VALID_TENANT_SLUG}`, {
        headers: { cookie: 'merchant_store=attacker-store-alpha' },
      });
      const res = await getOrdersGlobal(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('3.3 rejects CRM contacts access when cookie belongs to Tenant Alpha but query asks for Tenant Beta', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/crm/contacts?tenant_id=${VALID_TENANT_SLUG}`, {
        headers: { cookie: 'merchant_store=attacker-store-alpha' },
      });
      const res = await getCrmContacts(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // =========================================================================
  // 4. DEFENSIVE DTO NORMALIZATION (NULL/UNDEFINED/EMPTY STRING SAFETY)
  // =========================================================================
  describe('4. Defensive DTO Normalization', () => {
    it('4.1 GET /api/v1/tenants/[slug] normalizes null fields safely without throwing', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${VALID_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: VALID_TENANT_SLUG }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant).toBeDefined();
      expect(typeof json.tenant.category).toBe('string');
      expect(typeof json.tenant.tier).toBe('string');
      expect(typeof json.tenant.metadata).toBe('object');
      expect(Array.isArray(json.tenant.packages)).toBe(true);
    });

    it('4.2 GET /api/v1/tenants/[slug]/orders normalizes null status and payment_status to avoid toLowerCase crashes', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${VALID_TENANT_SLUG}/orders`, {
        headers: { cookie: `bt_merchant_token=${VALID_TOKEN}` },
      });
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: VALID_TENANT_SLUG }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.orders)).toBe(true);
      expect(json.orders.length).toBe(1);

      const order = json.orders[0];
      expect(typeof order.status).toBe('string');
      expect(typeof order.payment_status).toBe('string');
      expect(typeof order.order_number).toBe('string');
      expect(typeof order.buyer_name).toBe('string');
      // Verify safe to run .toLowerCase() without throwing
      expect(() => order.status.toLowerCase()).not.toThrow();
      expect(() => order.payment_status.toLowerCase()).not.toThrow();
    });

    it('4.3 GET /api/v1/crm/contacts normalizes null contact fields safely', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/crm/contacts?tenant_id=${VALID_TENANT_SLUG}`, {
        headers: { cookie: `merchant_store=${VALID_TENANT_SLUG}` },
      });
      const res = await getCrmContacts(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.contacts)).toBe(true);
      expect(json.contacts.length).toBe(1);

      const contact = json.contacts[0];
      expect(typeof contact.name).toBe('string');
      expect(typeof contact.phone).toBe('string');
      expect(typeof contact.clean_phone).toBe('string');
      expect(Array.isArray(contact.tags)).toBe(true);
      expect(() => contact.name.toLowerCase()).not.toThrow();
    });

    it('4.4 GET /api/inbox/conversations normalizes null conversation status and customer fields', async () => {
      const req = new NextRequest(`http://localhost:3000/api/inbox/conversations?tenant=${VALID_TENANT_SLUG}`);
      const res = await getConversations(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.conversations)).toBe(true);
      expect(json.conversations.length).toBe(1);

      const conv = json.conversations[0];
      expect(typeof conv.status).toBe('string');
      expect(typeof conv.bot_status).toBe('string');
      expect(typeof conv.customer_name).toBe('string');
      expect(typeof conv.customer_phone).toBe('string');
      expect(() => conv.status.toLowerCase()).not.toThrow();
      expect(() => conv.bot_status.toLowerCase()).not.toThrow();
    });
  });
});
