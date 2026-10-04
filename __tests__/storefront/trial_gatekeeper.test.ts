import fs from 'fs';
import path from 'path';
import { SUBSCRIPTION_PRICING, getTierAiSessionQuota } from '@/lib/subscriptions/entitlement';
import { getTenantSubscriptionStatus } from '@/lib/subscriptions/status';

describe('Trial Gatekeeper & Onboarding Invariant', () => {
  const onboardRoutePath = path.join(process.cwd(), 'app/api/v1/tenants/onboard/route.ts');
  const registerPagePath = path.join(process.cwd(), 'app/register/page.tsx');
  let onboardRouteCode: string;
  let registerPageCode: string;

  beforeAll(() => {
    onboardRouteCode = fs.readFileSync(onboardRoutePath, 'utf-8');
    registerPageCode = fs.readFileSync(registerPagePath, 'utf-8');
  });

  describe('1. Trial Gatekeeper Invariant in app/api/v1/tenants/onboard/route.ts', () => {
    it('only PRO_SCALE tier is eligible for trial (7 days)', () => {
      expect(onboardRouteCode).toContain("canonicalPlanTier !== 'PRO_SCALE'");
      expect(onboardRouteCode).toContain('isTrial = false;');
    });

    it('requires CHECKOUT_LITE, STARTER, and ENTERPRISE to have PENDING_PAYMENT status and is_active = false', () => {
      expect(onboardRouteCode).toContain("tenantStatus = 'PENDING_PAYMENT'");
      expect(onboardRouteCode).toContain("status: 'PENDING_PAYMENT'");
      expect(onboardRouteCode).toContain('is_active: false');
    });

    it('creates and records Xendit invoice for non-PRO_SCALE tiers', () => {
      expect(onboardRouteCode).toContain('SUB-${generatedSlug}-${canonicalPlanTier}');
      expect(onboardRouteCode).toContain('invoice_url: invoiceUrl');
      expect(onboardRouteCode).toContain("status: 'PENDING_PAYMENT'");
    });

    it('redirects merchant non-PRO_SCALE to Xendit invoice URL', () => {
      expect(onboardRouteCode).toContain('NextResponse.redirect(invoiceUrl');
      expect(onboardRouteCode).toContain('redirect_url: invoiceUrl');
    });

    it('registers redirect on client in register page for non-PRO_SCALE invoices', () => {
      expect(registerPageCode).toContain('window.location.href = targetInvoiceUrl');
    });
  });

  describe('2. Multi-Tier Subscription Entitlement & Pricing Configuration', () => {
    it('supports all 4 canonical tiers in SUBSCRIPTION_PRICING', () => {
      expect(SUBSCRIPTION_PRICING.CHECKOUT_LITE).toBeDefined();
      expect(SUBSCRIPTION_PRICING.CHECKOUT_LITE.durations[1].priceTotal).toBe(59000);

      expect(SUBSCRIPTION_PRICING.STARTER).toBeDefined();
      expect(SUBSCRIPTION_PRICING.STARTER.durations[1].priceTotal).toBe(199000);

      expect(SUBSCRIPTION_PRICING.PRO_SCALE).toBeDefined();
      expect(SUBSCRIPTION_PRICING.PRO_SCALE.durations[1].priceTotal).toBe(299000);

      expect(SUBSCRIPTION_PRICING.ENTERPRISE).toBeDefined();
      expect(SUBSCRIPTION_PRICING.ENTERPRISE.durations[1].priceTotal).toBe(499000);
    });

    it('allocates 0 AI session quota to CHECKOUT_LITE', () => {
      const quota = getTierAiSessionQuota('CHECKOUT_LITE');
      expect(quota.baseQuota).toBe(0);
    });
  });

  describe('3. Subscription Status Domain Resolution for PENDING_PAYMENT', () => {
    it('resolves PENDING_PAYMENT status as invalid/unentitled and ineligible for commission', () => {
      const tenant = {
        slug: 'probe-store',
        status: 'PENDING_PAYMENT',
        subscription_status: 'pending_payment',
        tier: 'STARTER',
        is_active: false,
      };

      const result = getTenantSubscriptionStatus(tenant);
      expect(result.status).toBe('pending_payment');
      expect(result.isValid).toBe(false);
      expect(result.isCommissionEligible).toBe(false);
      expect(result.label).toBe('MENUNGGU PEMBAYARAN');
    });
  });
});
