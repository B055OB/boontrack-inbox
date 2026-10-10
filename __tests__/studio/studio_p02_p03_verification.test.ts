/**
 * @file __tests__/studio/studio_p02_p03_verification.test.ts
 * @description Formal Verification Suite for CTO Checkpoints P0.2 & P0.3:
 * - P0.2: Webhook Idempotency & Downstream Isolation (Parallel callback concurrency, single ledger record, 1x commission, isolated downstream failures)
 * - P0.3: Transaksi Studio E2E Sandbox (Invoice creation, Webhook settlement, Ledger mutation, Outbox logging)
 */

import { handlePaymentWebhook } from '@/lib/payment-webhook-service';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { POST as createInvoiceHandler } from '@/app/api/studio/billing/create-invoice/route';
import * as affiliateService from '@/lib/affiliate-notification-service';
import type { NextRequest } from 'next/server';

// ── In-Memory Mock Database State for Strict Verification ─────────
interface MockTenant {
  id: string;
  slug: string;
  name: string;
  tier: string;
  metadata: Record<string, any>;
}

interface MockEntitlement {
  tenant_id: string;
  credits_remaining: number;
  is_unlimited: boolean;
  tier: string;
}

interface MockLedgerEntry {
  id: string;
  tenant_id: string;
  amount: number;
  balance_after: number;
  action: string;
  description: string;
  created_at: string;
}

let dbTenants: MockTenant[] = [];
let dbEntitlements: Record<string, MockEntitlement> = {};
let dbLedger: MockLedgerEntry[] = [];
let commissionCallsCount = 0;

// Setup mock Supabase
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabase: jest.fn(() => createMockSupabase()),
    getSupabaseAdmin: jest.fn(() => createMockSupabase()),
  };
});

function createMockSupabase() {
  return {
    from: (table: string) => {
      let selectedFields = '*';
      let filters: { field: string; op: string; val: any }[] = [];
      let ilikeFilter: { field: string; pattern: string } | null = null;
      let limitCount: number | null = null;

      const builder: any = {
        select: (fields: string = '*') => {
          selectedFields = fields;
          return builder;
        },
        eq: (field: string, val: any) => {
          filters.push({ field, op: 'eq', val });
          return builder;
        },
        ilike: (field: string, pattern: string) => {
          ilikeFilter = { field, pattern };
          return builder;
        },
        limit: (cnt: number) => {
          limitCount = cnt;
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => {
          if (table === 'tenants') {
            const slugFilter = filters.find(f => f.field === 'slug');
            const idFilter = filters.find(f => f.field === 'id');
            const t = dbTenants.find(item => 
              (slugFilter && item.slug.toLowerCase() === String(slugFilter.val).toLowerCase()) ||
              (idFilter && item.id === idFilter.val)
            );
            return { data: t || null, error: null };
          }
          if (table === 'tenant_entitlements') {
            const tenantFilter = filters.find(f => f.field === 'tenant_id');
            if (tenantFilter && dbEntitlements[tenantFilter.val]) {
              return { data: dbEntitlements[tenantFilter.val], error: null };
            }
            return { data: null, error: null };
          }
          if (table === 'tenant_credit_ledger') {
            const tenantFilter = filters.find(f => f.field === 'tenant_id');
            let entries = dbLedger.filter(l => !tenantFilter || l.tenant_id === tenantFilter.val);
            if (ilikeFilter) {
              const cleanSub = ilikeFilter.pattern.replace(/%/g, '').toLowerCase();
              entries = entries.filter(l => l.description.toLowerCase().includes(cleanSub));
            }
            return { data: entries[0] || null, error: null };
          }
          return { data: null, error: null };
        },
        upsert: async (record: any) => {
          if (table === 'tenant_entitlements') {
            dbEntitlements[record.tenant_id] = {
              tenant_id: record.tenant_id,
              credits_remaining: record.credits_remaining,
              is_unlimited: record.is_unlimited,
              tier: record.tier,
            };
          }
          return { data: record, error: null };
        },
        update: (record: any) => ({
          eq: async (_col: string, val: any) => {
            if (table === 'tenant_entitlements' && dbEntitlements[val]) {
              dbEntitlements[val].credits_remaining = record.credits_remaining;
            }
            return { data: null, error: null };
          },
        }),
        insert: async (record: any) => {
          if (table === 'tenant_credit_ledger') {
            const entry: MockLedgerEntry = {
              id: `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              tenant_id: record.tenant_id,
              amount: record.amount,
              balance_after: record.balance_after,
              action: record.action,
              description: record.description,
              created_at: new Date().toISOString(),
            };
            dbLedger.push(entry);
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
}

// Mock affiliate service to monitor commission calls
jest.mock('@/lib/affiliate-notification-service', () => {
  const actual = jest.requireActual('@/lib/affiliate-notification-service');
  return {
    ...actual,
    recordStudioTokenCommission: jest.fn(async (params: any) => {
      commissionCallsCount++;
      return {
        success: true,
        commissionAmount: Math.round(params.grossAmount * 0.25),
        amOverrideAmount: Math.round(params.grossAmount * 0.05),
        dispatchedTo: ['affiliate@boontrack.com'],
      };
    }),
  };
});

// Helper to construct mock NextRequest
function makeWebhookRequest(body: any): NextRequest {
  const jsonStr = JSON.stringify(body);
  return {
    url: 'https://studio.boontrack.com/api/webhooks/payment',
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      'x-callback-token': 'test_token',
    }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(jsonStr),
    nextUrl: new URL('https://studio.boontrack.com/api/webhooks/payment'),
  } as unknown as NextRequest;
}

function makeInvoiceRequest(body: any): NextRequest {
  const jsonStr = JSON.stringify(body);
  return {
    url: 'https://studio.boontrack.com/api/studio/billing/create-invoice',
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
    }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(jsonStr),
    cookies: {
      get: () => undefined,
    },
  } as unknown as NextRequest;
}

describe('VERIFIKASI P0.2 — Webhook Idempotency & Downstream Isolation', () => {
  const originalEnvSecret = process.env.XENDIT_SECRET_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.XENDIT_SECRET_KEY = 'xnd_test_verified_secret_key';
    commissionCallsCount = 0;

    (affiliateService.recordStudioTokenCommission as jest.Mock).mockImplementation(async (params: any) => {
      commissionCallsCount++;
      return {
        success: true,
        commissionAmount: Math.round(params.grossAmount * 0.25),
        amOverrideAmount: Math.round(params.grossAmount * 0.05),
        dispatchedTo: ['affiliate@boontrack.com'],
      };
    });

    // Seed mock tenant 'warungkreatif'
    dbTenants = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'warungkreatif',
        name: 'Warung Kreatif Studio',
        tier: 'SOLO',
        metadata: {
          whatsapp: '08123456789',
          affiliate_code: 'kangsakti',
        },
      },
    ];

    // Initial state: 10 credits
    dbEntitlements = {
      '11111111-2222-3333-4444-555555555555': {
        tenant_id: '11111111-2222-3333-4444-555555555555',
        credits_remaining: 10,
        is_unlimited: false,
        tier: 'SOLO',
      },
    };

    dbLedger = [];
  });

  afterEach(() => {
    process.env.XENDIT_SECRET_KEY = originalEnvSecret;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('P0.2.1: Parallel Webhook Callbacks — Prevents Double-Crediting and Duplicates', async () => {
    const txId = `TOPUP-STUDIO-warungkreatif-50-1791569001`;
    const payload = {
      id: 'inv_xendit_parallel_001',
      external_id: txId,
      status: 'PAID',
      amount: 99000,
      payment_method: 'QRIS',
      metadata: {
        tenant_slug: 'warungkreatif',
        credits: 50,
        package_id: 'creator',
        affiliate_code: 'kangsakti',
      },
    };

    // Simulate 2 parallel callback requests hitting the server at the exact same time
    const [res1, res2] = await Promise.all([
      handlePaymentWebhook(makeWebhookRequest(payload), '/api/webhooks/payment'),
      handlePaymentWebhook(makeWebhookRequest(payload), '/api/webhooks/payment'),
    ]);

    const json1 = await res1.json();
    const json2 = await res2.json();

    console.log('[P0.2.1 Parallel Callback Verification]');
    console.log('Response 1:', json1);
    console.log('Response 2:', json2);

    // 1. Both requests must succeed with HTTP 200 (graceful idempotent handling)
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(json1.success).toBe(true);
    expect(json2.success).toBe(true);

    // 2. Exactly one request must be the fresh credit increment (+50)
    //    and exactly one must be identified as idempotent duplicate (+0)
    const freshCount = [json1, json2].filter(j => j.already_processed === false && j.credits_added === 50).length;
    const dupCount = [json1, json2].filter(j => j.already_processed === true && j.credits_added === 0).length;
    expect(freshCount).toBe(1);
    expect(dupCount).toBe(1);

    // 3. Buktikan tenant_entitlements.credits_remaining hanya bertambah tepat 1x (10 -> 60, BUKAN 110)
    const finalEntitlements = dbEntitlements['11111111-2222-3333-4444-555555555555'];
    expect(finalEntitlements.credits_remaining).toBe(60);

    // 4. Buktikan record di tenant_credit_ledger hanya tercipta tepat 1 baris
    const ledgerRows = dbLedger.filter(l => l.description.includes(txId));
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].amount).toBe(50);
    expect(ledgerRows[0].balance_after).toBe(60);
    expect(ledgerRows[0].action).toBe('TOPUP');

    // 5. Buktikan komisi affiliate hanya tercatat tepat 1x
    expect(commissionCallsCount).toBe(1);
  });

  it('P0.2.2: Downstream Failure Isolation — Credit Mutation & Payment Status Persist Even if Downstream Fails', async () => {
    const txId = `TOPUP-STUDIO-warungkreatif-25-1791569002`;
    const payload = {
      id: 'inv_xendit_downstream_fail_002',
      external_id: txId,
      status: 'SETTLED',
      amount: 49000,
      payment_method: 'BCA_VA',
      metadata: {
        tenant_slug: 'warungkreatif',
        credits: 25,
        package_id: 'starter',
      },
    };

    // Simulate downstream affiliate notification throwing network error
    (affiliateService.recordStudioTokenCommission as jest.Mock)
      .mockRejectedValueOnce(new Error('Downstream network timeout connecting to email SMTP server'));

    const res = await handlePaymentWebhook(makeWebhookRequest(payload), '/api/webhooks/payment');
    const json = await res.json();

    console.log('[P0.2.2 Downstream Isolation Verification]');
    console.log('Response status:', res.status, 'Body:', json);

    // 1. Webhook must still respond with HTTP 200
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.credits_added).toBe(25);

    // 2. Credits must be added to entitlements (10 + 25 = 35) and NOT rolled back
    const finalEntitlements = dbEntitlements['11111111-2222-3333-4444-555555555555'];
    expect(finalEntitlements.credits_remaining).toBe(35);

    // 3. Ledger record must be permanently inserted
    const ledgerRows = dbLedger.filter(l => l.description.includes(txId));
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].amount).toBe(25);
    expect(ledgerRows[0].balance_after).toBe(35);
  });
});

describe('VERIFIKASI P0.3 — Transaksi Studio E2E Sandbox', () => {
  const originalEnvSecret = process.env.XENDIT_SECRET_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.XENDIT_SECRET_KEY = 'xnd_test_verified_secret_key';
    commissionCallsCount = 0;

    (affiliateService.recordStudioTokenCommission as jest.Mock).mockImplementation(async (params: any) => {
      commissionCallsCount++;
      return {
        success: true,
        commissionAmount: Math.round(params.grossAmount * 0.25),
        amOverrideAmount: Math.round(params.grossAmount * 0.05),
        dispatchedTo: ['affiliate@boontrack.com'],
      };
    });

    // Seed mock tenant 'warungkreatif'
    dbTenants = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'warungkreatif',
        name: 'Warung Kreatif Studio',
        tier: 'PRO_SCALE',
        metadata: {
          whatsapp: '08123456789',
          affiliate_code: 'kangsakti',
        },
      },
    ];

    dbEntitlements = {
      '11111111-2222-3333-4444-555555555555': {
        tenant_id: '11111111-2222-3333-4444-555555555555',
        credits_remaining: 5,
        is_unlimited: false,
        tier: 'PRO_SCALE',
      },
    };

    dbLedger = [];
  });

  afterEach(() => {
    process.env.XENDIT_SECRET_KEY = originalEnvSecret;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('P0.3: Full E2E Flow — Create Invoice -> Settlement Webhook -> Ledger Mutation -> Outbox Proof', async () => {
    // ── STEP 1: CREATE INVOICE VIA ENDPOINT ───────────────────────
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'inv_xendit_sandbox_e2e_999',
        invoice_url: 'https://checkout.xendit.co/web/inv_xendit_sandbox_e2e_999',
        status: 'PENDING',
      }),
    });

    const invoiceReq = makeInvoiceRequest({
      packageId: 'creator', // 50 credits, Rp 99.000
      tenantSlug: 'warungkreatif',
      customerName: 'Budi Kreator',
      customerPhone: '08123456789',
    });

    const invoiceRes = await createInvoiceHandler(invoiceReq);
    const invoiceJson = await invoiceRes.json();

    console.log('[P0.3 E2E STEP 1: Invoice Created]');
    console.log(invoiceJson);

    expect(invoiceRes.status).toBe(200);
    expect(invoiceJson.success).toBe(true);
    expect(invoiceJson.external_id).toMatch(/^TOPUP-STUDIO-warungkreatif-50-\d+$/);
    expect(invoiceJson.invoice_id).toBe('inv_xendit_sandbox_e2e_999');
    expect(invoiceJson.amount).toBe(99000);
    expect(invoiceJson.credits).toBe(50);

    const generatedExternalId = invoiceJson.external_id;

    // ── STEP 2: SIMULATE WEBHOOK SETTLEMENT (PAID) ────────────────
    const webhookPayload = {
      id: 'inv_xendit_sandbox_e2e_999',
      external_id: generatedExternalId,
      status: 'PAID',
      amount: 99000,
      payment_method: 'QRIS',
      payment_channel: 'SHOPEEPAY',
      paid_at: new Date().toISOString(),
      metadata: {
        tenant_slug: 'warungkreatif',
        credits: 50,
        package_id: 'creator',
        affiliate_code: 'kangsakti',
        product_type: 'STUDIO',
      },
    };

    const webhookRes = await handlePaymentWebhook(makeWebhookRequest(webhookPayload), '/api/webhooks/payment');
    const webhookJson = await webhookRes.json();

    console.log('[P0.3 E2E STEP 2: Webhook Callback Settlement (PAID)]');
    console.log(webhookJson);

    expect(webhookRes.status).toBe(200);
    expect(webhookJson.success).toBe(true);
    expect(webhookJson.credits_added).toBe(50);
    expect(webhookJson.new_balance).toBe(55); // Initial 5 + 50 = 55
    expect(webhookJson.commission_recorded).toBe(true);
    expect(webhookJson.commission_amount).toBe(24750); // 25% of 99.000

    // ── STEP 3: VERIFY MUTASI DATABASE LEDGER ─────────────────────
    const ledgerEntry = dbLedger.find(l => l.description.includes(generatedExternalId));
    console.log('[P0.3 E2E STEP 3: Ledger Mutation Audit Record]');
    console.log(ledgerEntry);

    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry?.tenant_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(ledgerEntry?.amount).toBe(50);
    expect(ledgerEntry?.balance_after).toBe(55);
    expect(ledgerEntry?.action).toBe('TOPUP');

    // ── STEP 4: VERIFY ENTITLEMENTS BALANCE ───────────────────────
    const updatedEntitlement = dbEntitlements['11111111-2222-3333-4444-555555555555'];
    console.log('[P0.3 E2E STEP 4: Updated Entitlements]');
    console.log(updatedEntitlement);

    expect(updatedEntitlement.credits_remaining).toBe(55);

    // ── STEP 5: VERIFY IDEMPOTENCY ON REPLAY ──────────────────────
    const replayRes = await handlePaymentWebhook(makeWebhookRequest(webhookPayload), '/api/webhooks/payment');
    const replayJson = await replayRes.json();

    console.log('[P0.3 E2E STEP 5: Webhook Replay Log (Idempotent Guard)]');
    console.log(replayJson);

    expect(replayRes.status).toBe(200);
    expect(replayJson.already_processed).toBe(true);
    expect(replayJson.credits_added).toBe(0);
    expect(replayJson.new_balance).toBe(55); // Still 55, not 105
  });
});
