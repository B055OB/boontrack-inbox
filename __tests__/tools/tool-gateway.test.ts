/**
 * __tests__/tools/tool-gateway.test.ts
 * Unit & Acceptance Test Suite — Business Action Layer & Tool Gateway (Roadmap P2)
 *
 * Covers:
 * 1. Tool Registry Discovery & Parameter Validation (Zod)
 * 2. Read Tool: get_order_status (by order ID, by phone, cross-tenant isolation)
 * 3. Read Tool: track_shipment (tracking number lookup, shipping logs, isolation)
 * 4. Action Tool Guardrail: request_order_cancellation
 *    - UNPAID/PENDING -> APPROVED (Void Order)
 *    - PAID (pre-pickup) -> APPROVED (Mark Manual Refund)
 *    - PICKUP_REQUESTED / IN_TRANSIT / DELIVERED -> REJECTED (Zero-Liability Guardrail)
 *    - Cross-tenant cancellation -> REJECTED
 * 5. Action Audit Logging: verifies audit trail is captured for action executions
 */

// ---------------------------------------------------------------------------
// Supabase Mock Setup (MUST be before imports that use it)
// ---------------------------------------------------------------------------

interface MockOrder {
  id: string;
  order_id?: string;
  tenant_slug: string;
  tenant_id?: string;
  customer_name?: string;
  customer_phone?: string;
  product_title?: string;
  product_name?: string;
  items_summary?: string;
  gross_amount?: number;
  total_amount?: number;
  status: string;
  payment_status?: string;
  shipping_status?: string;
  shipping_courier?: string;
  tracking_number?: string;
  resi?: string;
  waybill?: string;
  no_order?: string;
  shipping_logs?: any[];
  cancellation_reason?: string;
  refund_status?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

class InMemoryDatabase {
  public orders: Map<string, MockOrder> = new Map();
  public auditLogs: any[] = [];

  clear() {
    this.orders.clear();
    this.auditLogs = [];
  }

  insertOrder(order: MockOrder) {
    this.orders.set(order.id, { ...order });
  }

  getOrder(id: string): MockOrder | undefined {
    return this.orders.get(id);
  }
}

const db = new InMemoryDatabase();

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
}));

const mockSupabase = {
  from: (table: string) => {
    if (table === 'tool_audit_logs') {
      return {
        insert: jest.fn((entry: any) => {
          db.auditLogs.push(entry);
          return Promise.resolve({ data: entry, error: null });
        }),
      };
    }

    if (table === 'orders') {
      return {
        select: (cols: string) => {
          let tenantFilter: string | null = null;
          let matchFilters: Array<{ field: string; val: string }> = [];

          const queryObj = {
            or: (expression: string) => {
              // Parse tenant filter e.g. tenant_slug.eq.store-a,tenant_id.eq.store-a
              if (expression.includes('tenant_slug.eq.') || expression.includes('tenant_id.eq.')) {
                const match = expression.match(/tenant_slug\.eq\.([^,]+)/);
                if (match) tenantFilter = match[1];
              }

              // Parse ID or phone or tracking filters
              const parts = expression.split(',');
              for (const part of parts) {
                const [field, op, val] = part.split('.');
                if (val && !field.includes('tenant')) {
                  matchFilters.push({ field, val: val.replace(/%/g, '') });
                }
              }
              return queryObj;
            },
            order: () => queryObj,
            limit: () => queryObj,
            then: (resolve: (val: any) => void) => {
              // Execute in-memory query
              let matches = Array.from(db.orders.values());

              if (tenantFilter) {
                matches = matches.filter(
                  (o) => o.tenant_slug === tenantFilter || o.tenant_id === tenantFilter
                );
              }

              if (matchFilters.length > 0) {
                matches = matches.filter((o) => {
                  return matchFilters.some(({ field, val }) => {
                    const cleanVal = val.toLowerCase();
                    const orderVal = String((o as any)[field] || '').toLowerCase();
                    return orderVal.includes(cleanVal) || orderVal === cleanVal;
                  });
                });
              }

              resolve({ data: matches, error: null });
            },
          };

          return queryObj;
        },

        update: (updates: Partial<MockOrder>) => {
          return {
            eq: (field: string, val: string) => {
              if (field === 'id') {
                const existing = db.orders.get(val);
                if (existing) {
                  const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
                  db.orders.set(val, updated);
                }
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    }

    return {
      select: () => ({ then: (r: any) => r({ data: [], error: null }) }),
    };
  },
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  toolRegistry,
  getOrderStatusTool,
  trackShipmentTool,
  requestOrderCancellationTool,
  getRecentToolAuditLogs,
  clearToolAuditLogs,
} from '@/lib/tools';

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  db.clear();
  clearToolAuditLogs();
});

// ---------------------------------------------------------------------------
// Test Suite 1: Tool Registry & Parameter Validation
// ---------------------------------------------------------------------------

describe('Suite 1: Tool Registry & Parameter Validation', () => {
  it('registers all standard tools and retrieves them by name and permission', () => {
    expect(toolRegistry.get('get_order_status')).toBeDefined();
    expect(toolRegistry.get('track_shipment')).toBeDefined();
    expect(toolRegistry.get('request_order_cancellation')).toBeDefined();

    const readTools = toolRegistry.getAll('READ');
    expect(readTools.map((t) => t.name)).toContain('get_order_status');
    expect(readTools.map((t) => t.name)).toContain('track_shipment');

    const actionTools = toolRegistry.getAll('ACTION');
    expect(actionTools.map((t) => t.name)).toContain('request_order_cancellation');
  });

  it('rejects execution if tenant_id is missing in ToolContext', async () => {
    const res = await toolRegistry.execute('get_order_status', { tenant_id: '' }, {
      order_id_or_phone: 'ORD-123',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Missing or invalid tenant_id');
  });

  it('validates tool parameters against Zod schema and returns informative error', async () => {
    // Missing required 'order_id'
    const res = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'store-a' },
      { reason: 'Too short' }
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('Parameter validation failed');
    expect(res.error).toContain('order_id');
  });

  it('returns error for unknown tool name', async () => {
    const res = await toolRegistry.execute('unknown_tool', { tenant_id: 'store-a' }, {});
    expect(res.success).toBe(false);
    expect(res.error).toContain("Unknown tool: 'unknown_tool'");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Read Tool — get_order_status
// ---------------------------------------------------------------------------

describe('Suite 2: Read Tool — get_order_status', () => {
  beforeEach(() => {
    db.insertOrder({
      id: 'ORD-101',
      tenant_slug: 'tenant-shoes',
      customer_name: 'Budi Santoso',
      customer_phone: '628123456789',
      product_title: 'Sepatu Lari Ultralight',
      gross_amount: 450000,
      status: 'PAID',
      shipping_status: 'PENDING',
      shipping_courier: 'J&T Express',
      tracking_number: 'JNT998877',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Cross-tenant order
    db.insertOrder({
      id: 'ORD-FOREIGN-999',
      tenant_slug: 'other-merchant',
      customer_name: 'Foreign Buyer',
      customer_phone: '628999999999',
      product_title: 'Alien Item',
      gross_amount: 1000000,
      status: 'PAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it('retrieves order summary by Order ID', async () => {
    const result = await toolRegistry.execute(
      'get_order_status',
      { tenant_id: 'tenant-shoes' },
      { order_id_or_phone: 'ORD-101' }
    );

    expect(result.success).toBe(true);
    expect(result.data.order_id).toBe('ORD-101');
    expect(result.data.customer_name).toBe('Budi Santoso');
    expect(result.data.payment_status).toBe('PAID');
    expect(result.data.total_amount).toBe(450000);
    expect(result.data.tracking_number).toBe('JNT998877');
  });

  it('retrieves order summary by Customer Phone number', async () => {
    const result = await toolRegistry.execute(
      'get_order_status',
      { tenant_id: 'tenant-shoes' },
      { order_id_or_phone: '08123456789' } // local prefix normalized to 628...
    );

    expect(result.success).toBe(true);
    expect(result.data.order_id).toBe('ORD-101');
  });

  it('strictly isolates tenant data and returns not found for foreign tenant orders', async () => {
    const result = await toolRegistry.execute(
      'get_order_status',
      { tenant_id: 'tenant-shoes' },
      { order_id_or_phone: 'ORD-FOREIGN-999' }
    );

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.message).toContain('Tidak ditemukan pesanan');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: Read Tool — track_shipment
// ---------------------------------------------------------------------------

describe('Suite 3: Read Tool — track_shipment', () => {
  beforeEach(() => {
    db.insertOrder({
      id: 'ORD-202',
      tenant_slug: 'tenant-gadget',
      customer_name: 'Dewi Lestari',
      shipping_courier: 'SiCepat REG',
      shipping_status: 'ON_DELIVERY',
      tracking_number: '003411223344',
      shipping_logs: [
        { event: 'pickup', update: 'Paket di-pickup kurir', received_at: '2026-09-22T10:00:00Z' },
        { event: 'transit', update: 'Tiba di hub Jakarta Selatan', received_at: '2026-09-23T04:00:00Z' },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'PAID',
    });
  });

  it('retrieves shipment tracking details and movement logs', async () => {
    const result = await toolRegistry.execute(
      'track_shipment',
      { tenant_id: 'tenant-gadget' },
      { tracking_number: '003411223344' }
    );

    expect(result.success).toBe(true);
    expect(result.data.courier).toBe('SiCepat REG');
    expect(result.data.shipping_status).toBe('Dalam Perjalanan Menuju Alamat Penerima');
    expect(result.data.shipping_logs).toHaveLength(2);
    expect(result.data.shipping_logs[0].event).toBe('pickup');
  });

  it('returns not found when tracking number does not exist for the tenant', async () => {
    const result = await toolRegistry.execute(
      'track_shipment',
      { tenant_id: 'tenant-gadget' },
      { tracking_number: 'UNKNOWN-RESI-999' }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('tidak ditemukan');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: Action Tool Guardrail — request_order_cancellation
// ---------------------------------------------------------------------------

describe('Suite 4: Action Tool Guardrail — request_order_cancellation', () => {
  it('CASE 1: UNPAID order -> APPROVED (Void Order)', async () => {
    db.insertOrder({
      id: 'ORD-UNPAID-1',
      tenant_slug: 'tenant-store',
      status: 'UNPAID',
      shipping_status: 'NONE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'tenant-store', caller_user: '628111222333' },
      { order_id: 'ORD-UNPAID-1', reason: 'Ingin ganti metode pembayaran' }
    );

    expect(result.success).toBe(true);
    expect(result.guardrailStatus).toBe('APPROVED');
    expect(result.actionTaken).toBe(true);
    expect(result.data.cancellation_action).toBe('VOID_ORDER');

    // Verify DB update
    const updated = db.getOrder('ORD-UNPAID-1')!;
    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancellation_reason).toBe('Ingin ganti metode pembayaran');
  });

  it('CASE 2: PAID order (pre-pickup) -> APPROVED (Marked for manual refund)', async () => {
    db.insertOrder({
      id: 'ORD-PAID-PRE-PICKUP',
      tenant_slug: 'tenant-store',
      status: 'PAID',
      shipping_status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'tenant-store', caller_user: 'buyer@example.com' },
      { order_id: 'ORD-PAID-PRE-PICKUP', reason: 'Salah pilih varian warna' }
    );

    expect(result.success).toBe(true);
    expect(result.guardrailStatus).toBe('APPROVED');
    expect(result.actionTaken).toBe(true);
    expect(result.data.cancellation_action).toBe('MANUAL_REFUND_REQUIRED');
    expect(result.data.refund_status).toBe('PENDING_MANUAL_REFUND');

    // Verify DB update
    const updated = db.getOrder('ORD-PAID-PRE-PICKUP')!;
    expect(updated.status).toBe('CANCELLED');
    expect(updated.refund_status).toBe('PENDING_MANUAL_REFUND');
  });

  it('CASE 3: Dispatched order (IN_TRANSIT) -> REJECTED automatically by Core Guardrail', async () => {
    db.insertOrder({
      id: 'ORD-SHIPPED-ALREADY',
      tenant_slug: 'tenant-store',
      status: 'PAID',
      shipping_status: 'IN_TRANSIT',
      tracking_number: 'JNT-DISPATCHED-001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'tenant-store' },
      { order_id: 'ORD-SHIPPED-ALREADY', reason: 'Berubah pikiran' }
    );

    expect(result.success).toBe(false);
    expect(result.guardrailStatus).toBe('REJECTED');
    expect(result.actionTaken).toBe(false);
    expect(result.message).toBe('Pesanan sudah diproses kurir dan tidak dapat dibatalkan secara otomatis.');

    // Verify DB is UNCHANGED
    const unchanged = db.getOrder('ORD-SHIPPED-ALREADY')!;
    expect(unchanged.status).toBe('PAID');
    expect(unchanged.shipping_status).toBe('IN_TRANSIT');
  });

  it('CASE 4: Dispatched order (PICKUP_REQUESTED) -> REJECTED automatically', async () => {
    db.insertOrder({
      id: 'ORD-PICKUP-REQUESTED',
      tenant_slug: 'tenant-store',
      status: 'PAID',
      shipping_status: 'PICKUP_REQUESTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'tenant-store' },
      { order_id: 'ORD-PICKUP-REQUESTED', reason: 'Cancel pickup' }
    );

    expect(result.success).toBe(false);
    expect(result.guardrailStatus).toBe('REJECTED');
    expect(result.message).toBe('Pesanan sudah diproses kurir dan tidak dapat dibatalkan secara otomatis.');
  });

  it('CASE 5: Cross-tenant cancellation attempt is blocked', async () => {
    db.insertOrder({
      id: 'ORD-OTHER-STORE',
      tenant_slug: 'victim-store',
      status: 'UNPAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Attacker calls tool with tenant_id = 'attacker-store'
    const result = await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'attacker-store' },
      { order_id: 'ORD-OTHER-STORE', reason: 'Malicious cancellation' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('tidak ditemukan atau berada di luar akses');

    // Victim order is untouched
    const untouched = db.getOrder('ORD-OTHER-STORE')!;
    expect(untouched.status).toBe('UNPAID');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: Action Audit Logging
// ---------------------------------------------------------------------------

describe('Suite 5: Action Audit Logging', () => {
  it('records full audit log when an action tool is called', async () => {
    db.insertOrder({
      id: 'ORD-AUDIT-TEST',
      tenant_slug: 'audit-tenant',
      status: 'UNPAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await toolRegistry.execute(
      'request_order_cancellation',
      { tenant_id: 'audit-tenant', caller_user: 'user-audit-123' },
      { order_id: 'ORD-AUDIT-TEST', reason: 'Audit test reason' }
    );

    const logs = getRecentToolAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const targetLog = logs.find((l) => l.target_id === 'ORD-AUDIT-TEST');
    expect(targetLog).toBeDefined();
    expect(targetLog?.tool_name).toBe('request_order_cancellation');
    expect(targetLog?.tenant_id).toBe('audit-tenant');
    expect(targetLog?.caller_user).toBe('user-audit-123');
    expect(targetLog?.guardrail_status).toBe('APPROVED');
    expect(targetLog?.permission).toBe('ACTION');
  });
});
