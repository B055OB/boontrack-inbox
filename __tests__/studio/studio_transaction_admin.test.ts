/**
 * @file __tests__/studio/studio_transaction_admin.test.ts
 * @description Unit tests for Studio Administration, SSOT Pricing, Xendit Invoice, and Webhook Integrations.
 */

import { STUDIO_TOKEN_PACKAGES, getStudioTokenPackage } from '@/lib/config/studio-pricing';
import { POST as createInvoiceHandler } from '@/app/api/studio/billing/create-invoice/route';
import { handlePaymentWebhook } from '@/lib/payment-webhook-service';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { activateStudioRegistrationByToken } from '@/lib/studio/auth';
import * as affiliateService from '@/lib/affiliate-notification-service';
import type { NextRequest } from 'next/server';

// Mock Supabase
const mockSupabaseQuery: any = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
  upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
  update: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
  single: jest.fn(),
};

const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseQuery),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: jest.fn(() => mockSupabaseClient),
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
}));

// Mock Studio Credit Service
jest.mock('@/lib/services/studio-credit.service', () => ({
  StudioCreditService: {
    topUpCredits: jest.fn(),
    getEntitlements: jest.fn(),
    reserveCredits: jest.fn(),
    releaseCredits: jest.fn(),
  },
}));

// Mock Affiliate Service
jest.mock('@/lib/affiliate-notification-service', () => {
  const actual = jest.requireActual('@/lib/affiliate-notification-service');
  return {
    ...actual,
    sendNewStoreReferralNotification: jest.fn().mockResolvedValue({ success: true, dispatchedTo: ['affiliate@example.com'] }),
    recordStudioTokenCommission: jest.fn().mockResolvedValue({ success: true, commissionAmount: 24750 }),
  };
});

describe('1. Studio Token Pricing SSOT Configuration Suite', () => {
  it('defines 3 standard packages with exact IDR nominal and render credits', () => {
    // Starter: 25 credits, Rp 49.000
    expect(STUDIO_TOKEN_PACKAGES.starter).toBeDefined();
    expect(STUDIO_TOKEN_PACKAGES.starter.credits).toBe(25);
    expect(STUDIO_TOKEN_PACKAGES.starter.price).toBe(49000);
    expect(STUDIO_TOKEN_PACKAGES.starter.billingType).toBe('ONE_TIME');

    // Creator: 50 credits, Rp 99.000 (recommended)
    expect(STUDIO_TOKEN_PACKAGES.creator).toBeDefined();
    expect(STUDIO_TOKEN_PACKAGES.creator.credits).toBe(50);
    expect(STUDIO_TOKEN_PACKAGES.creator.price).toBe(99000);
    expect(STUDIO_TOKEN_PACKAGES.creator.isPopular).toBe(true);
    expect(STUDIO_TOKEN_PACKAGES.creator.billingType).toBe('ONE_TIME');

    // Pro Monthly: 100 credits, Rp 149.000
    expect(STUDIO_TOKEN_PACKAGES.pro_monthly).toBeDefined();
    expect(STUDIO_TOKEN_PACKAGES.pro_monthly.credits).toBe(100);
    expect(STUDIO_TOKEN_PACKAGES.pro_monthly.price).toBe(149000);
    expect(STUDIO_TOKEN_PACKAGES.pro_monthly.billingType).toBe('SUBSCRIPTION');
  });

  it('resolves packages via getStudioTokenPackage with aliases', () => {
    expect(getStudioTokenPackage('starter')?.id).toBe('starter');
    expect(getStudioTokenPackage('creator')?.id).toBe('creator');
    expect(getStudioTokenPackage('pro')?.id).toBe('pro_monthly');
    expect(getStudioTokenPackage('pro_monthly')?.id).toBe('pro_monthly');
    expect(getStudioTokenPackage('non_existent')).toBeNull();
  });
});

describe('2. Studio Xendit Create Invoice API Suite', () => {
  const originalFetch = global.fetch;
  const originalEnvSecret = process.env.XENDIT_SECRET_KEY;
  const originalEnvApi = process.env.XENDIT_API_KEY;

  beforeEach(() => {
    process.env.XENDIT_SECRET_KEY = 'xnd_test_mock_secret_key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.XENDIT_SECRET_KEY = originalEnvSecret;
    process.env.XENDIT_API_KEY = originalEnvApi;
    jest.clearAllMocks();
  });

  function createPostRequest(body: any, cookies: Record<string, string> = {}): NextRequest {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');

    return {
      url: 'https://studio.boontrack.com/api/studio/billing/create-invoice',
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      }),
      json: jest.fn().mockResolvedValue(body),
      cookies: {
        get: (key: string) => cookies[key] ? { value: cookies[key] } : undefined,
      },
    } as unknown as NextRequest;
  }

  it('rejects invalid packageId with 400 Bad Request', async () => {
    const req = createPostRequest({ packageId: 'invalid_pkg', tenantSlug: 'test-creator' });
    const res = await createInvoiceHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('tidak valid');
  });

  it('rejects missing tenantSlug with 400 Bad Request', async () => {
    const req = createPostRequest({ packageId: 'creator' });
    const res = await createInvoiceHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('tenantSlug wajib disertakan');
  });

  it('returns 404 when tenant is not found in database', async () => {
    mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = createPostRequest({ packageId: 'creator', tenantSlug: 'nonexistent-tenant' });
    const res = await createInvoiceHandler(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain('tidak ditemukan');
  });

  it('creates Xendit invoice successfully when tenant exists', async () => {
    mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'warungkreatif',
        name: 'Warung Kreatif Studio',
        metadata: {
          whatsapp: '081234567890',
          email: 'creator@example.com',
          affiliate_code: 'kangsakti',
        },
      },
      error: null,
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'inv_xendit_studio_123',
        invoice_url: 'https://checkout.xendit.co/web/inv_xendit_studio_123',
        status: 'PENDING',
      }),
    });

    const req = createPostRequest({
      packageId: 'creator',
      tenantSlug: 'warungkreatif',
    });

    const res = await createInvoiceHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.invoice_id).toBe('inv_xendit_studio_123');
    expect(json.invoice_url).toBe('https://checkout.xendit.co/web/inv_xendit_studio_123');
    expect(json.credits).toBe(50);
    expect(json.amount).toBe(99000);
    expect(json.external_id).toMatch(/^TOPUP-STUDIO-warungkreatif-50-\d+$/);

    // Verify payload sent to Xendit
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v2/invoices'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"category":"STUDIO_TOKEN"'),
      })
    );
  });

  it('returns 500 when Xendit keys are missing on server (fail-secure check)', async () => {
    delete process.env.XENDIT_SECRET_KEY;
    delete process.env.XENDIT_API_KEY;

    mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'warungkreatif',
        name: 'Warung Kreatif Studio',
        metadata: {},
      },
      error: null,
    });

    const req = createPostRequest({
      packageId: 'creator',
      tenantSlug: 'warungkreatif',
    });

    const res = await createInvoiceHandler(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Payment gateway configuration is missing on server');
  });
});

describe('3. Studio Token Webhook Integration Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createWebhookRequest(body: any): NextRequest {
    const jsonStr = JSON.stringify(body);
    return {
      url: 'https://dashboard.boontrack.com/api/webhooks/payment',
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
      }),
      text: jest.fn().mockResolvedValue(jsonStr),
      json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
  }

  it('triggers StudioCreditService.topUpCredits when order starts with TOPUP-STUDIO- and status is PAID', async () => {
    (StudioCreditService.topUpCredits as jest.Mock).mockResolvedValue({
      success: true,
      newBalance: 51,
      commissionRecorded: true,
      commissionAmount: 24750,
    });

    const payload = {
      external_id: 'TOPUP-STUDIO-warungkreatif-50-1788194898',
      tenant_slug: 'warungkreatif',
      credits: 50,
      amount: 99000,
      status: 'PAID',
      metadata: {
        affiliate_code: 'kangsakti',
      },
    };

    const req = createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req, '/api/webhooks/payment');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.credits_added).toBe(50);
    expect(json.new_balance).toBe(51);
    expect(StudioCreditService.topUpCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantIdOrSlug: 'warungkreatif',
        credits: 50,
        amountPaid: 99000,
        paymentStatus: 'PAID',
        affiliateCode: 'kangsakti',
      })
    );
  });

  it('skips top-up and returns 200 idempotent when status is PENDING or unpaid', async () => {
    const payload = {
      external_id: 'TOPUP-STUDIO-warungkreatif-50-1788194898',
      tenant_slug: 'warungkreatif',
      credits: 50,
      amount: 99000,
      status: 'PENDING',
    };

    const req = createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req, '/api/webhooks/payment');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('Top-up skipped');
    expect(StudioCreditService.topUpCredits).not.toHaveBeenCalled();
  });

  it('handles duplicate webhook callbacks idempotently without double crediting', async () => {
    (StudioCreditService.topUpCredits as jest.Mock).mockResolvedValue({
      success: true,
      newBalance: 51,
      commissionRecorded: false,
      isExisting: true,
    });

    const payload = {
      external_id: 'TOPUP-STUDIO-warungkreatif-50-1788194898',
      tenant_slug: 'warungkreatif',
      credits: 50,
      amount: 99000,
      status: 'PAID',
    };

    const req = createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req, '/api/webhooks/payment');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.already_processed).toBe(true);
    expect(json.credits_added).toBe(0);
    expect(json.message).toContain('already processed previously');
  });
});

describe('4. Studio Registration Activation & Ledger Pipeline Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('activates registration, upserts entitlements, writes TRIAL_GRANT log, and triggers referral alert', async () => {
    const mockTenantRecord = {
      id: 'tenant-studio-uuid-001',
      slug: 'studio-budi-kreatif-a1b2',
      name: 'Budi Studio',
      metadata: {
        whatsapp: '628123456789',
        email: 'budi@example.com',
        affiliate_code: 'kang-sakti',
        affiliate_id: 'aff-sakti-uuid',
        studio_activation_token: 'TOKEN123',
      },
    };

    const mockUpdatedTenant = {
      ...mockTenantRecord,
      is_active: true,
      status: 'active',
    };

    // 1. Initial tenant lookup by token
    mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
      data: mockTenantRecord,
      error: null,
    });

    // 2. Tenant update return
    mockSupabaseQuery.single.mockResolvedValueOnce({
      data: mockUpdatedTenant,
      error: null,
    });

    const result = await activateStudioRegistrationByToken('TOKEN123', '628123456789');

    expect(result).toBeDefined();
    expect(result?.is_active).toBe(true);

    // Verify tenant_entitlements upsert
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('tenant_entitlements');
    expect(mockSupabaseQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-studio-uuid-001',
        credits_remaining: 1,
        is_unlimited: false,
        tier: 'free_trial',
      }),
      expect.anything()
    );

    // Verify tenant_credit_ledger insert with TRIAL_GRANT action
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('tenant_credit_ledger');
    expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-studio-uuid-001',
        amount: 1,
        balance_after: 1,
        action: 'TRIAL_GRANT',
        description: 'Aktivasi akun Studio - 1 Kredit Render Gratis',
      })
    );

    // Verify sendNewStoreReferralNotification was called
    expect(affiliateService.sendNewStoreReferralNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        storeName: 'Budi Studio',
        slug: 'studio-budi-kreatif-a1b2',
        referralCode: 'kang-sakti',
        affiliateId: 'aff-sakti-uuid',
        tenantId: 'tenant-studio-uuid-001',
        isTrial: true,
      })
    );
  });
});
