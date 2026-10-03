/**
 * Test Suite: Order Quick-Paid & Manual Approval Persistence
 * Enforces ARCHITECTURE.md §7.3 & Zero Revert on Reload Guard
 *
 * Verifies:
 * 1. POST /api/v1/tenants/[slug]/orders/[id]/quick-paid:
 *    - Updates status = 'PAID', payment_status = 'PAID', order_status = 'COMPLETED', paid_at.
 *    - Atomically records immutable audit trail in order_audit_logs.
 *    - Persists changes so reload reflects PAID status.
 * 2. POST /api/orders/[id]/approve:
 *    - Updates status = 'PAID', payment_status = 'PAID', order_status = 'COMPLETED', paid_at.
 *    - Records audit trail in order_audit_logs.
 * 3. Safe resolution for both UUID and non-UUID order identifiers.
 */
import { NextRequest } from 'next/server';
import { POST as quickPaidRoute } from '@/app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route';
import { POST as approveRoute } from '@/app/api/orders/[id]/approve/route';

let mockOrdersDatabase: any[] = [];
let mockAuditLogsDatabase: any[] = [];

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: () => mockSupabaseAdmin,
    getSupabase: () => mockSupabaseAdmin,
    isValidUuid: (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    safeUuidOrNull: (id: any) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
        ? String(id)
        : null,
  };
});

jest.mock('@/lib/whatsapp', () => ({
  sendOrderPaidNotification: jest.fn().mockResolvedValue({ success: true }),
  sendOrderFulfillmentNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/affiliate-notification-service', () => ({
  sendOrderCommissionAlert: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/capi.service', () => ({
  dispatchMetaCAPIPurchaseForOrder: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/capi-outbox', () => ({
  enqueueCAPIOutboxEvent: jest.fn().mockResolvedValue({ success: true }),
  processCAPIOutboxQueue: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/email-service', () => ({
  sendOrderFulfillmentEmails: jest.fn().mockResolvedValue({ success: true, buyerEmailSent: true, merchantEmailSent: true }),
}));

jest.mock('@/lib/telegram/telegram-dispatcher', () => ({
  dispatchOrderTelegramAlert: jest.fn().mockResolvedValue({ success: true }),
}));

const mockSupabaseAdmin: any = {
  from: (table: string) => {
    if (table === 'orders') {
      return {
        select: (_cols?: string) => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              const row = mockOrdersDatabase.find((o) => o[col] === val);
              return { data: row ? { ...row } : null, error: null };
            },
          }),
          or: (cond: string) => ({
            maybeSingle: async () => {
              // Parse order_id.eq.xxx,invoice_no.eq.xxx
              const match = cond.match(/(?:order_id|invoice_no)\.eq\.([^,]+)/);
              const searchVal = match ? match[1] : '';
              const row = mockOrdersDatabase.find(
                (o) => o.id === searchVal || o.order_id === searchVal || o.invoice_no === searchVal
              );
              return { data: row ? { ...row } : null, error: null };
            },
          }),
        }),
        update: (updateFields: any) => ({
          eq: (col: string, val: any) => ({
            select: () => ({
              single: async () => {
                const idx = mockOrdersDatabase.findIndex((o) => o[col] === val);
                if (idx === -1) {
                  return { data: null, error: { message: 'Order not found for update' } };
                }
                mockOrdersDatabase[idx] = {
                  ...mockOrdersDatabase[idx],
                  ...updateFields,
                };
                return { data: { ...mockOrdersDatabase[idx] }, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === 'order_audit_logs') {
      return {
        insert: async (logEntry: any) => {
          mockAuditLogsDatabase.push({
            id: 'audit-' + Date.now(),
            ...logEntry,
            created_at: new Date().toISOString(),
          });
          return { data: logEntry, error: null };
        },
      };
    }

    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { slug: 'demo-store', metadata: {} },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ data: {}, error: null }),
        }),
      };
    }

    if (table === 'messages') {
      return {
        insert: async () => ({ data: {}, error: null }),
      };
    }

    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ data: {}, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: {}, error: null }) }),
    };
  },
};

describe('Order Quick-Paid & Approval Persistence Suite', () => {
  beforeEach(() => {
    mockOrdersDatabase = [
      {
        id: 'c1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        order_id: 'ORD-UUID-001',
        invoice_no: 'INV-2026-001',
        tenant_slug: 'demo-store',
        tenant_id: 'tenant-uuid-1',
        product_title: 'Produk Digital Eksklusif',
        gross_amount: 150000,
        status: 'PENDING',
        payment_status: 'PENDING',
        order_status: 'PENDING',
        paid_at: null,
        metadata: { source: 'checkout' },
      },
      {
        id: 'ORD-STRING-999',
        order_id: 'ORD-STRING-999',
        invoice_no: 'INV-2026-999',
        tenant_slug: 'demo-store',
        tenant_id: 'tenant-uuid-1',
        product_title: 'Paket Usaha Siap Jual',
        gross_amount: 250000,
        status: 'PENDING',
        payment_status: 'UNPAID',
        order_status: 'PENDING',
        paid_at: null,
        metadata: { source: 'wa' },
      },
    ];
    mockAuditLogsDatabase = [];
  });

  describe('1. POST /api/v1/tenants/[slug]/orders/[id]/quick-paid', () => {
    it('successfully persists PAID status, paid_at, and writes to order_audit_logs for UUID order', async () => {
      const orderUuid = 'c1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/demo-store/orders/${orderUuid}/quick-paid`, {
        method: 'POST',
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'user-agent': 'Mozilla/5.0 Test Dashboard',
        },
      });

      const res = await quickPaidRoute(req, {
        params: Promise.resolve({ slug: 'demo-store', id: orderUuid }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.order.status).toBe('PAID');
      expect(json.order.payment_status).toBe('PAID');
      expect(json.order.order_status).toBe('COMPLETED');
      expect(json.order.paid_at).toBeDefined();

      // Database verification (persistent)
      const storedOrder = mockOrdersDatabase.find((o) => o.id === orderUuid);
      expect(storedOrder.status).toBe('PAID');
      expect(storedOrder.payment_status).toBe('PAID');
      expect(storedOrder.order_status).toBe('COMPLETED');
      expect(storedOrder.paid_at).toBeDefined();

      // Audit log verification
      expect(mockAuditLogsDatabase.length).toBe(1);
      const auditLog = mockAuditLogsDatabase[0];
      expect(auditLog.order_id).toBe(orderUuid);
      expect(auditLog.tenant_slug).toBe('demo-store');
      expect(auditLog.action).toBe('QUICK_PAID_APPROVED');
      expect(auditLog.previous_status).toBe('PENDING');
      expect(auditLog.new_status).toBe('PAID');
      expect(auditLog.ip_address).toBe('203.0.113.195');
    });

    it('safely handles non-UUID string order ID without throwing Postgres syntax error', async () => {
      const stringOrderId = 'ORD-STRING-999';
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/demo-store/orders/${stringOrderId}/quick-paid`, {
        method: 'POST',
        headers: { host: 'dashboard.boontrack.com' },
      });

      const res = await quickPaidRoute(req, {
        params: Promise.resolve({ slug: 'demo-store', id: stringOrderId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.order.status).toBe('PAID');

      const storedOrder = mockOrdersDatabase.find((o) => o.id === stringOrderId);
      expect(storedOrder.status).toBe('PAID');
      expect(storedOrder.payment_status).toBe('PAID');
    });
  });

  describe('2. POST /api/orders/[id]/approve', () => {
    it('successfully approves order, persists PAID, and logs to order_audit_logs', async () => {
      const orderUuid = 'c1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
      const req = new NextRequest(`https://dashboard.boontrack.com/api/orders/${orderUuid}/approve`, {
        method: 'POST',
        headers: {
          'x-forwarded-for': '198.51.100.42',
        },
      });

      const res = await approveRoute(req, {
        params: Promise.resolve({ id: orderUuid }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.order.status).toBe('PAID');
      expect(json.order.payment_status).toBe('PAID');

      // Database verification
      const storedOrder = mockOrdersDatabase.find((o) => o.id === orderUuid);
      expect(storedOrder.status).toBe('PAID');

      // Audit log verification
      expect(mockAuditLogsDatabase.length).toBe(1);
      expect(mockAuditLogsDatabase[0].action).toBe('ORDER_APPROVED_PAID');
      expect(mockAuditLogsDatabase[0].new_status).toBe('PAID');
      expect(mockAuditLogsDatabase[0].ip_address).toBe('198.51.100.42');
    });
  });
});
