/**
 * __tests__/routing/legacy_merchant_desk_retirement.test.ts
 * P0 Security Test Suite: Legacy Merchant Desk Retirement & Canonical Dashboard Redirect
 */

import LegacyMerchantDeskPage from '@/app/[tenant]/desk/page';
import * as tenantContextModule from '@/lib/auth/tenant-context';
import { redirect } from 'next/navigation';

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue(new Headers({
    host: 'dashboard.boontrack.com',
    cookie: 'bt_merchant_token=mock-valid-token',
  })),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('Legacy Merchant Desk Retirement (CTO Mandate P0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated requests by redirecting to /login with safe return URL', async () => {
    jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValueOnce({
      success: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized: Sesi tidak valid.',
    });

    const params = Promise.resolve({ tenant: 'alpha-store' });
    const searchParams = Promise.resolve({});

    await LegacyMerchantDeskPage({ params, searchParams });

    expect(redirect).toHaveBeenCalledWith(
      '/login?redirectTo=' + encodeURIComponent('/alpha-store/dashboard')
    );
  });

  it('rejects foreign-tenant / cross-tenant session with 403 Forbidden', async () => {
    jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValueOnce({
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Forbidden: Token sesi tidak berhak mengakses alpha-store.',
    });

    const params = Promise.resolve({ tenant: 'alpha-store' });
    const searchParams = Promise.resolve({});

    const result = await LegacyMerchantDeskPage({ params, searchParams });
    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    // Verify 403 Forbidden element is returned
    expect(JSON.stringify(result)).toContain('403 Forbidden');
  });

  it('redirects authorized merchant session to canonical /:tenant/dashboard (307)', async () => {
    jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValueOnce({
      success: true,
      context: {
        userId: 'user-123',
        tenantId: 'tenant-alpha-id',
        tenantSlug: 'alpha-store',
        role: 'OWNER',
        tier: 'PRO_SCALE',
        membershipValid: true,
        authSource: 'MERCHANT_TOKEN',
      },
    });

    const params = Promise.resolve({ tenant: 'alpha-store' });
    const searchParams = Promise.resolve({});

    await LegacyMerchantDeskPage({ params, searchParams });

    expect(redirect).toHaveBeenCalledWith('/alpha-store/dashboard');
  });

  it('preserves safe operational search parameters during redirect', async () => {
    jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValueOnce({
      success: true,
      context: {
        userId: 'user-123',
        tenantId: 'tenant-alpha-id',
        tenantSlug: 'alpha-store',
        role: 'OWNER',
        tier: 'PRO_SCALE',
        membershipValid: true,
        authSource: 'MERCHANT_TOKEN',
      },
    });

    const params = Promise.resolve({ tenant: 'alpha-store' });
    const searchParams = Promise.resolve({
      tab: 'orders',
      filter: 'pending',
      dangerousScript: '<script>alert(1)</script>', // Should be stripped
    });

    await LegacyMerchantDeskPage({ params, searchParams });

    expect(redirect).toHaveBeenCalledWith('/alpha-store/dashboard?tab=orders&filter=pending');
  });
});

