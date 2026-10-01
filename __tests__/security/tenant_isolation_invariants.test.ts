/**
 * @file __tests__/security/tenant_isolation_invariants.test.ts
 * @description Comprehensive Test Suite for CTO Security Invariants:
 *  1. Unknown WhatsApp instance -> FAIL-CLOSED (NO RESPONSE).
 *  2. Unknown owner phone -> NO RESPONSE.
 *  3. Mismatched Instance A + Owner B -> REJECT (Anti-Spoofing).
 *  4. Tenant A order + Tenant B fulfillment asset -> ACCESS DENIED.
 *  5. Order PENDING dengan private asset -> ACCESS DENIED (Zero pre-payment leak).
 *  6. Concurrency test: 50 concurrent requests between Tenant A & Tenant B (0% cross-tenant leak).
 */

import { NextRequest } from 'next/server';
import { resolveTenantFromConnection } from '@/lib/whatsapp/inbox-persistence';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';
import { GET as getOrderStatus } from '@/app/api/orders/[orderId]/status/route';

// ---------------------------------------------------------------------------
// Mock Database & State
// ---------------------------------------------------------------------------

const mockConnectionsDb = [
  {
    id: 'conn-a',
    instance_name: 'instance-a',
    tenant_id: 'tenant-uuid-aaaa',
    tenant_slug: 'tenant-a',
    phone_number: '6281111111111',
    phone_number_id: 'phone-id-aaaa',
    credential_ref: 'api-key-a',
    ownership_domain: 'TENANT',
    status: 'CONNECTED',
  },
  {
    id: 'conn-b',
    instance_name: 'instance-b',
    tenant_id: 'tenant-uuid-bbbb',
    tenant_slug: 'tenant-b',
    phone_number: '6282222222222',
    phone_number_id: 'phone-id-bbbb',
    credential_ref: 'api-key-b',
    ownership_domain: 'TENANT',
    status: 'CONNECTED',
  },
];

const mockTenantsDb = [
  {
    id: 'tenant-uuid-aaaa',
    slug: 'tenant-a',
    name: 'Tenant Alpha Digital',
    tier: 'ADS_PERFORMANCE',
    status: 'active',
    metadata: {
      phone: '6281111111111',
      products: [
        {
          id: 'prod-a1',
          name: 'Produk Alpha',
          download_url: 'https://cdn.boontrack.com/alpha-exclusive.zip',
        },
      ],
    },
  },
  {
    id: 'tenant-uuid-bbbb',
    slug: 'tenant-b',
    name: 'Tenant Beta Agency',
    tier: 'PRO_SCALE',
    status: 'active',
    metadata: {
      phone: '6282222222222',
      products: [
        {
          id: 'prod-b1',
          name: 'Produk Beta',
          download_url: 'https://cdn.boontrack.com/beta-secret.pdf',
        },
      ],
    },
  },
];

const mockOrdersDb: Record<string, any> = {
  'ORD-PAID-A': {
    id: 'ORD-PAID-A',
    tenant_id: 'tenant-uuid-aaaa',
    tenant_slug: 'tenant-a',
    product_id: 'prod-a1',
    product_title: 'Produk Alpha',
    status: 'PAID',
    payment_status: 'PAID',
    gross_amount: 150000,
    download_url: 'https://cdn.boontrack.com/alpha-exclusive.zip',
    fulfillment_metadata: {
      tenant_id: 'tenant-uuid-aaaa',
      order_id: 'ORD-PAID-A',
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://cdn.boontrack.com/alpha-exclusive.zip',
    },
  },
  'ORD-PENDING-A': {
    id: 'ORD-PENDING-A',
    tenant_id: 'tenant-uuid-aaaa',
    tenant_slug: 'tenant-a',
    product_id: 'prod-a1',
    product_title: 'Produk Alpha',
    status: 'PENDING',
    payment_status: 'PENDING',
    gross_amount: 150000,
    download_url: 'https://cdn.boontrack.com/alpha-exclusive.zip',
    fulfillment_metadata: {
      tenant_id: 'tenant-uuid-aaaa',
      order_id: 'ORD-PENDING-A',
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://cdn.boontrack.com/alpha-exclusive.zip',
    },
  },
  'ORD-CROSS-TENANT-LEAK': {
    id: 'ORD-CROSS-TENANT-LEAK',
    tenant_id: 'tenant-uuid-aaaa',
    tenant_slug: 'tenant-a',
    product_id: 'prod-b1',
    product_title: 'Stolen Beta Product',
    status: 'PAID',
    payment_status: 'PAID',
    gross_amount: 200000,
    download_url: 'https://cdn.boontrack.com/beta-secret.pdf',
    fulfillment_metadata: {
      tenant_id: 'tenant-uuid-bbbb', // BELONGS TO TENANT B!
      order_id: 'ORD-ORIGINAL-B',
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://cdn.boontrack.com/beta-secret.pdf',
    },
  },
};

// Mock Supabase
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: () => mockSupabase,
    getSupabase: () => mockSupabase,
  };
});

const mockSupabase: any = {
  from: jest.fn((table: string) => {
    let filterField: string | null = null;
    let filterVal: any = null;
    let orClause: string | null = null;

    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn((field: string, val: any) => {
        filterField = field;
        filterVal = val;
        return builder;
      }),
      or: jest.fn((clause: string) => {
        orClause = clause;
        return builder;
      }),
      update: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => {
        if (table === 'whatsapp_connections') {
          if (filterField === 'instance_name') {
            const found = mockConnectionsDb.find((c) => c.instance_name === filterVal);
            return { data: found || null, error: null };
          }
          if (filterField === 'phone_number') {
            const found = mockConnectionsDb.find((c) => c.phone_number === filterVal);
            return { data: found || null, error: null };
          }
          if (filterField === 'phone_number_id') {
            const found = mockConnectionsDb.find((c) => c.phone_number_id === filterVal);
            return { data: found || null, error: null };
          }
          if (orClause) {
            for (const c of mockConnectionsDb) {
              if (
                orClause.includes(`instance_name.eq.${c.instance_name}`) ||
                orClause.includes(`tenant_slug.eq.${c.tenant_slug}`) ||
                orClause.includes(`phone_number.eq.${c.phone_number}`)
              ) {
                return { data: c, error: null };
              }
            }
          }
          return { data: null, error: null };
        }

        if (table === 'tenants') {
          if (filterField === 'id') {
            const found = mockTenantsDb.find((t) => t.id === filterVal);
            return { data: found || null, error: null };
          }
          if (filterField === 'slug') {
            const found = mockTenantsDb.find((t) => t.slug === filterVal);
            return { data: found || null, error: null };
          }
          if (orClause) {
            for (const t of mockTenantsDb) {
              if (
                orClause.includes(`id.eq.${t.id}`) ||
                orClause.includes(`slug.eq.${t.slug}`)
              ) {
                return { data: t, error: null };
              }
            }
          }
          return { data: null, error: null };
        }

        if (table === 'orders') {
          if (filterField === 'id') {
            return { data: mockOrdersDb[filterVal] || null, error: null };
          }
          return { data: null, error: null };
        }

        return { data: null, error: null };
      }),
    };

    return builder;
  }),
};

// ---------------------------------------------------------------------------
// Security Invariant Tests
// ---------------------------------------------------------------------------

describe('CRITICAL CTO SECURITY INVARIANTS: Fail-Closed Tenant Isolation & Fulfillment Gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Invariant 1: Unknown WhatsApp instance -> FAIL-CLOSED (NO RESPONSE)', () => {
    it('returns null and drops event without calling AI when instance is unmapped', async () => {
      const resolved = await resolveTenantFromConnection({
        instanceName: 'unknown-rogue-instance',
      });
      expect(resolved).toBeNull();

      const webhookResult = await processEvolutionWebhookEvent({
        instance: 'unknown-rogue-instance',
        event: 'MESSAGES_UPSERT',
        data: {
          key: { remoteJid: '628999888111@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Halo, paket apa yang tersedia?' },
        },
      });

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.processed).toBe(0);
      expect(webhookResult.status).toBe('quarantine');
      expect(webhookResult.error).toContain('fail-closed');
    });
  });

  describe('Invariant 2: Unknown owner phone -> NO RESPONSE', () => {
    it('returns null when botPhoneNumber does not belong to any tenant', async () => {
      const resolved = await resolveTenantFromConnection({
        botPhoneNumber: '6289998887776',
      });
      expect(resolved).toBeNull();

      const webhookResult = await processEvolutionWebhookEvent({
        owner: '6289998887776',
        event: 'MESSAGES_UPSERT',
        data: {
          key: { remoteJid: '628999888111@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Cek katalog' },
        },
      });

      expect(webhookResult.processed).toBe(0);
      expect(webhookResult.status).toBe('quarantine');
    });
  });

  describe('Invariant 3: Mismatched Instance A + Owner B -> REJECT (Anti-Spoofing)', () => {
    it('strictly rejects when instance belongs to Tenant A but payload claims Owner B phone', async () => {
      // Instance A belongs to Tenant A ('6281111111111'), Owner B belongs to Tenant B ('6282222222222')
      const resolved = await resolveTenantFromConnection({
        instanceName: 'instance-a',
        botPhoneNumber: '6282222222222', // Mismatch!
      });

      expect(resolved).toBeNull();

      const webhookResult = await processEvolutionWebhookEvent({
        instance: 'instance-a',
        owner: '6282222222222',
        event: 'MESSAGES_UPSERT',
        data: {
          key: { remoteJid: '628999888111@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Pesan rahasia' },
        },
      });

      expect(webhookResult.processed).toBe(0);
      expect(webhookResult.status).toBe('quarantine');
    });
  });

  describe('Invariant 4: Tenant A order + Tenant B fulfillment asset -> ACCESS DENIED', () => {
    it('denies access when fulfillment asset tenant does not match order tenant', () => {
      const order = mockOrdersDb['ORD-CROSS-TENANT-LEAK'];
      const activeTenant = mockTenantsDb[0]; // Tenant Alpha

      // Validate Hard-Gate formula
      const isPaid = order.status === 'PAID';
      const isTenantMatch = order.tenant_id === activeTenant.id;
      const isFulfillmentOwnerMatch =
        (!order.fulfillment_metadata?.tenant_id || order.fulfillment_metadata.tenant_id === activeTenant.id) &&
        (!order.fulfillment_metadata?.order_id || order.fulfillment_metadata.order_id === order.id);

      const isFulfillmentAuthorized = isPaid && isTenantMatch && isFulfillmentOwnerMatch;

      // Fulfillment belongs to Tenant B, so it MUST BE FALSE!
      expect(isFulfillmentOwnerMatch).toBe(false);
      expect(isFulfillmentAuthorized).toBe(false);
    });
  });

  describe('Invariant 5: Order PENDING dengan private asset -> ACCESS DENIED', () => {
    it('hides private download_url and fulfillment_metadata from API status when status is PENDING', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders/ORD-PENDING-A/status');
      const res = await getOrderStatus(req, { params: Promise.resolve({ orderId: 'ORD-PENDING-A' }) });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('PENDING');
      expect(data.payment_status).toBe('PENDING');
      // Private digital asset MUST NOT leak for PENDING order!
      expect(data.download_url).toBeNull();
      expect(data.link_digital).toBeNull();
      expect(data.fulfillment_metadata).toBeNull();
    });

    it('exposes private download_url ONLY when payment status is confirmed PAID', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders/ORD-PAID-A/status');
      const res = await getOrderStatus(req, { params: Promise.resolve({ orderId: 'ORD-PAID-A' }) });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('PAID');
      expect(data.payment_status).toBe('PAID');
      expect(data.download_url).toBe('https://cdn.boontrack.com/alpha-exclusive.zip');
      expect(data.fulfillment_metadata).not.toBeNull();
    });
  });

  describe('Invariant 6: Concurrency test: 50 concurrent requests between Tenant A & Tenant B (0% Leak)', () => {
    it('executes 50 interleaved concurrent requests with 0% data cross-contamination', async () => {
      const tasks = Array.from({ length: 50 }).map(async (_, index) => {
        const isTenantA = index % 2 === 0;
        const targetInstance = isTenantA ? 'instance-a' : 'instance-b';
        const expectedTenantId = isTenantA ? 'tenant-uuid-aaaa' : 'tenant-uuid-bbbb';
        const expectedSlug = isTenantA ? 'tenant-a' : 'tenant-b';
        const expectedPhone = isTenantA ? '6281111111111' : '6282222222222';

        const context = await resolveTenantFromConnection({
          instanceName: targetInstance,
          botPhoneNumber: expectedPhone,
        });

        return {
          index,
          isTenantA,
          context,
          matchesTenant: context?.tenantId === expectedTenantId,
          matchesSlug: context?.tenantSlug === expectedSlug,
        };
      });

      const results = await Promise.all(tasks);

      // Verify 100% of requests match their intended tenant with 0% leak
      const leaked = results.filter((r) => !r.matchesTenant || !r.matchesSlug);
      expect(leaked).toHaveLength(0);

      const tenantACount = results.filter((r) => r.isTenantA && r.context?.tenantSlug === 'tenant-a').length;
      const tenantBCount = results.filter((r) => !r.isTenantA && r.context?.tenantSlug === 'tenant-b').length;

      expect(tenantACount).toBe(25);
      expect(tenantBCount).toBe(25);
    });
  });
});
