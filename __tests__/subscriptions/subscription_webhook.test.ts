import { handlePaymentWebhook } from '@/lib/payment-webhook-service';
import * as subService from '@/lib/subscriptions/service';
import type { NextRequest } from 'next/server';

jest.mock('@/lib/subscriptions/service', () => {
  const actual = jest.requireActual('@/lib/subscriptions/service');
  return {
    ...actual,
    activateShopSubscription: jest.fn(),
  };
});

describe('Subscription Payment Webhook Integration Suite', () => {
  const mockTenantId = '11111111-2222-3333-4444-555555555555';
  const mockTenantSlug = 'tokoberkah';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockRequest(body: any, endpoint = '/api/webhook/payment'): NextRequest {
    const jsonStr = JSON.stringify(body);
    return {
      url: `https://dashboard.boontrack.com${endpoint}`,
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
      }),
      text: jest.fn().mockResolvedValue(jsonStr),
      json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
  }

  it('triggers activateShopSubscription when order_id starts with SUB- and status is PAID', async () => {
    (subService.activateShopSubscription as jest.Mock).mockResolvedValue({
      success: true,
      subscription: {
        id: 'sub-new-123',
        tenant_id: mockTenantId,
        tier: 'PRO_SCALE',
        duration_months: 1,
        status: 'ACTIVE',
        invoice_id: 'inv-sub-1001',
        amount_paid: 299000,
        current_period_ends_at: '2026-11-02T10:00:00.000+07:00',
        expires_at: '2026-11-03T10:00:00.000+07:00',
      },
      tenantId: mockTenantId,
      tenantSlug: mockTenantSlug,
      isExisting: false,
    });

    const payload = {
      order_id: 'SUB-tokoberkah-PRO_SCALE-1-1788194898',
      invoice_id: 'inv-sub-1001',
      tenant_slug: mockTenantSlug,
      tenant_id: mockTenantId,
      tier: 'PRO_SCALE',
      duration_months: 1,
      amount: 299000,
      status: 'PAID',
    };

    const req = createMockRequest(payload);
    const res = await handlePaymentWebhook(req, '/api/webhook/payment');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.subscription?.id).toBe('sub-new-123');
    expect(subService.activateShopSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: mockTenantId,
        tenantSlug: mockTenantSlug,
        tier: 'PRO_SCALE',
        durationMonths: 1,
        invoiceId: 'inv-sub-1001',
        amountPaid: 299000,
      }),
      expect.anything()
    );
  });

  it('handles idempotency gracefully when webhook is delivered multiple times', async () => {
    (subService.activateShopSubscription as jest.Mock).mockResolvedValue({
      success: true,
      subscription: {
        id: 'sub-existing-123',
        tenant_id: mockTenantId,
        tier: 'ENTERPRISE',
        duration_months: 6,
        status: 'ACTIVE',
        invoice_id: 'inv-sub-dup-2002',
        amount_paid: 2694600,
      },
      tenantId: mockTenantId,
      tenantSlug: mockTenantSlug,
      isExisting: true,
    });

    const payload = {
      order_id: 'SUB-tokoberkah-ENTERPRISE-6-1788194999',
      invoice_id: 'inv-sub-dup-2002',
      tenant_slug: mockTenantSlug,
      tier: 'ENTERPRISE',
      duration_months: 6,
      amount: 2694600,
      transaction_status: 'settlement', // Midtrans standard
    };

    const req = createMockRequest(payload);
    const res = await handlePaymentWebhook(req, '/api/webhooks/payment');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.already_paid).toBe(true);
    expect(subService.activateShopSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'ENTERPRISE',
        durationMonths: 6,
        invoiceId: 'inv-sub-dup-2002',
        amountPaid: 2694600,
      }),
      expect.anything()
    );
  });

  it('does not trigger subscription activation for regular product orders (e.g. ORD-xxx)', async () => {
    const payload = {
      order_id: 'ORD-987654321',
      gross_amount: 50000,
      status: 'PAID',
    };

    const req = createMockRequest(payload);
    await handlePaymentWebhook(req, '/api/webhook/payment');

    expect(subService.activateShopSubscription).not.toHaveBeenCalled();
  });

  it('does not activate subscription if status is pending/unpaid', async () => {
    const payload = {
      order_id: 'SUB-tokoberkah-PRO_SCALE-1-1788194898',
      amount: 299000,
      status: 'PENDING',
    };

    const req = createMockRequest(payload);
    await handlePaymentWebhook(req, '/api/webhook/payment');

    expect(subService.activateShopSubscription).not.toHaveBeenCalled();
  });
});
