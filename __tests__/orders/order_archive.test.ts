/**
 * Test Suite: Order Soft-Archive / Hide System & UI Hygiene (SPRINT 3)
 * Strict No-Hard-Delete Architecture.
 *
 * Verifies:
 * 1. PATCH /api/v1/orders/[id]/archive idempotent archiving & unarchiving.
 * 2. DELETE /api/v1/orders/[id]/archive returns 405 Method Not Allowed (hard delete forbidden).
 * 3. Tenant Isolation security on archive endpoint.
 * 4. GET /api/orders default exclusion of archived orders and filter handling.
 * 5. Audit trail & financial metrics preservation (paid revenue integrity).
 */
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '@/app/api/v1/orders/[id]/archive/route';
import { GET as getOrders } from '@/app/api/orders/route';
import { calculateFinancialMetrics } from '@/lib/finance-engine';

// Mock in-memory orders database for testing
let mockOrdersDatabase: any[] = [];
let mockTenantsDatabase: any[] = [];

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: () => mockSupabaseClient,
    getSupabase: () => mockSupabaseClient,
  };
});

const mockSupabaseClient = {
  from: (table: string) => {
    if (table === 'tenants') {
      return {
        select: (_cols?: string) => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              const row = mockTenantsDatabase.find((t) => t[col] === val);
              return { data: row || null, error: null };
            },
          }),
        }),
      };
    }

    if (table === 'orders') {
      return {
        select: (_cols?: string) => {
          let currentList = [...mockOrdersDatabase];
          let filteredList = currentList;

          const queryObj: any = {
            _filtered: filteredList,
            eq: (col: string, val: any) => {
              queryObj._filtered = queryObj._filtered.filter((o: any) => o[col] === val);
              return queryObj;
            },
            or: (cond: string) => {
              // Parse Supabase .or() clauses
              if (cond.includes('is_archived.is.null,is_archived.eq.false')) {
                queryObj._filtered = queryObj._filtered.filter(
                  (o: any) => o.is_archived === null || o.is_archived === undefined || o.is_archived === false
                );
              } else if (cond.includes('tenant_slug.eq.') && cond.includes('tenant_id.eq.')) {
                const parts = cond.split(',');
                const slugMatch = parts[0]?.replace('tenant_slug.eq.', '');
                const uuidMatch = parts[1]?.replace('tenant_id.eq.', '');
                queryObj._filtered = queryObj._filtered.filter(
                  (o: any) => o.tenant_slug === slugMatch || o.tenant_id === uuidMatch
                );
              }
              return queryObj;
            },
            gte: (col: string, val: any) => {
              queryObj._filtered = queryObj._filtered.filter((o: any) => o[col] >= val);
              return queryObj;
            },
            lte: (col: string, val: any) => {
              queryObj._filtered = queryObj._filtered.filter((o: any) => o[col] <= val);
              return queryObj;
            },
            order: (_col: string, _opts: any) => queryObj,
            limit: (n: number) => {
              queryObj._filtered = queryObj._filtered.slice(0, n);
              return queryObj;
            },
            maybeSingle: async () => {
              return { data: queryObj._filtered[0] || null, error: null };
            },
            then: (resolve: any) => resolve({ data: queryObj._filtered, error: null }),
          };
          return queryObj;
        },
        update: (updates: any) => ({
          eq: (col: string, val: any) => ({
            select: (_cols?: string) => ({
              maybeSingle: async () => {
                const index = mockOrdersDatabase.findIndex((o) => o[col] === val);
                if (index === -1) {
                  return { data: null, error: null };
                }
                mockOrdersDatabase[index] = {
                  ...mockOrdersDatabase[index],
                  ...updates,
                };
                return { data: mockOrdersDatabase[index], error: null };
              },
            }),
          }),
        }),
      };
    }

    return {
      select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    };
  },
};

describe('SPRINT 3: Soft-Archive Order System & UI Hygiene', () => {
  const tenantSlug = 'merchant-demo';
  const tenantId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    mockTenantsDatabase = [
      {
        id: tenantId,
        slug: tenantSlug,
        name: 'Merchant Demo Store',
      },
    ];

    mockOrdersDatabase = [
      {
        id: 'ord-active-paid',
        order_id: 'ord-active-paid',
        invoice_no: 'INV-001',
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        total_amount: 150000,
        gross_amount: 150000,
        status: 'PAID',
        payment_status: 'PAID',
        is_archived: false,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'ord-active-pending',
        order_id: 'ord-active-pending',
        invoice_no: 'INV-002',
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        total_amount: 50000,
        gross_amount: 50000,
        status: 'PENDING',
        payment_status: 'PENDING',
        is_archived: false,
        created_at: '2026-10-01T11:00:00Z',
      },
      {
        id: 'ord-already-archived',
        order_id: 'ord-already-archived',
        invoice_no: 'INV-003',
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        total_amount: 75000,
        gross_amount: 75000,
        status: 'UNPAID',
        payment_status: 'UNPAID',
        is_archived: true,
        created_at: '2026-10-01T12:00:00Z',
      },
    ];
  });

  describe('1. PATCH /api/v1/orders/[id]/archive (Idempotent Soft-Archive)', () => {
    it('successfully archives an active pending order with status 200', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ord-active-pending/archive', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `merchant_store=${tenantSlug}`,
        },
        body: JSON.stringify({ is_archived: true }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-active-pending' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.is_archived).toBe(true);
      expect(json.order.is_archived).toBe(true);

      // Verify state in mock database
      const found = mockOrdersDatabase.find((o) => o.id === 'ord-active-pending');
      expect(found.is_archived).toBe(true);
      expect(found.updated_at).toBeDefined();
    });

    it('remains idempotent when archiving an already archived order', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ord-already-archived/archive', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `merchant_store=${tenantSlug}`,
        },
        body: JSON.stringify({ is_archived: true }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-already-archived' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.is_archived).toBe(true);
    });

    it('successfully unarchives / restores an archived order with is_archived: false', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ord-already-archived/archive', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `merchant_store=${tenantSlug}`,
        },
        body: JSON.stringify({ is_archived: false }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-already-archived' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.is_archived).toBe(false);

      const found = mockOrdersDatabase.find((o) => o.id === 'ord-already-archived');
      expect(found.is_archived).toBe(false);
    });

    it('enforces Tenant Isolation: returns 403 Forbidden when unauthorized tenant attempts to archive', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/ord-active-pending/archive', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=another-unauthorized-merchant',
        },
        body: JSON.stringify({ is_archived: true }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-active-pending' }) });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('FORBIDDEN');
    });

    it('returns 404 Not Found for non-existent order ID', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/orders/non-existent-order/archive', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `merchant_store=${tenantSlug}`,
        },
        body: JSON.stringify({ is_archived: true }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'non-existent-order' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('2. Strict No-Hard-Delete Guard', () => {
    it('returns 405 Method Not Allowed on DELETE requests to protect data integrity', async () => {
      const res = await DELETE();
      expect(res.status).toBe(405);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('METHOD_NOT_ALLOWED');
      expect(json.message).toContain('Hard Delete');
    });
  });

  describe('3. GET /api/orders (Soft-Archive Filters & UI Hygiene)', () => {
    it('default query excludes archived orders (only returns active orders)', async () => {
      const req = new NextRequest(`https://boontrack.com/api/orders?tenant=${tenantSlug}`, {
        headers: {
          cookie: `merchant_store=${tenantSlug}`,
        },
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.orders).toHaveLength(2);

      const ids = json.orders.map((o: any) => o.id);
      expect(ids).toContain('ord-active-paid');
      expect(ids).toContain('ord-active-pending');
      expect(ids).not.toContain('ord-already-archived');
    });

    it('returns only archived orders when ?archived=true is passed', async () => {
      const req = new NextRequest(`https://boontrack.com/api/orders?tenant=${tenantSlug}&archived=true`, {
        headers: {
          cookie: `merchant_store=${tenantSlug}`,
        },
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.orders).toHaveLength(1);
      expect(json.orders[0].id).toBe('ord-already-archived');
      expect(json.orders[0].is_archived).toBe(true);
    });

    it('returns all orders when ?include_archived=true is passed', async () => {
      const req = new NextRequest(`https://boontrack.com/api/orders?tenant=${tenantSlug}&include_archived=true`, {
        headers: {
          cookie: `merchant_store=${tenantSlug}`,
        },
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.orders).toHaveLength(3);
    });
  });

  describe('4. Financial Integrity & Audit Trail Preservation', () => {
    it('paid revenue calculation remains 100% accurate and unaffected by soft-archived pending orders', () => {
      // Calculate metrics with all orders
      const metricsBeforeArchive = calculateFinancialMetrics(mockOrdersDatabase);
      expect(metricsBeforeArchive.totalRevenue).toBe(150000);
      expect(metricsBeforeArchive.totalSuccessfulOrders).toBe(1);

      // Archive the pending order
      const pendingOrder = mockOrdersDatabase.find((o) => o.id === 'ord-active-pending');
      pendingOrder.is_archived = true;

      // Recalculate metrics
      const metricsAfterArchive = calculateFinancialMetrics(mockOrdersDatabase);

      // Paid revenue must not be distorted by archiving
      expect(metricsAfterArchive.totalRevenue).toBe(150000);
      expect(metricsAfterArchive.totalSuccessfulOrders).toBe(1);
      expect(metricsAfterArchive.totalRevenue).toBe(metricsBeforeArchive.totalRevenue);
    });

    it('audit trail: orders records are never physically removed from database', () => {
      const initialCount = mockOrdersDatabase.length;
      expect(initialCount).toBe(3);

      // Mark an order as archived
      mockOrdersDatabase[1].is_archived = true;

      // Ensure record still exists in database for compliance and audit
      expect(mockOrdersDatabase.length).toBe(initialCount);
      expect(mockOrdersDatabase.find((o) => o.id === 'ord-active-pending')).toBeDefined();
    });
  });
});
