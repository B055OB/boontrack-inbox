/**
 * Test Suite: API Route Security & Tenant Isolation Guard
 * Verifies that GET /api/orders, GET /api/v1/tenants/[slug]/orders, and GET /api/v1/tenant/me
 * return 401 Unauthorized when accessed without valid merchant session cookies.
 */
import { NextRequest } from 'next/server';
import { GET as getOrders } from '@/app/api/orders/route';
import { GET as getTenantOrders } from '@/app/api/v1/tenants/[slug]/orders/route';
import { GET as getTenantMe } from '@/app/api/v1/tenant/me/route';

describe('Orders and Tenant API Security Guards', () => {
  describe('GET /api/orders', () => {
    it('1. Returns 401 Unauthorized when accessed without session cookies', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders?tenant=solusi-ads');
      const res = await getOrders(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('2. Returns 401 Unauthorized when accessed with mismatching tenant cookie (Tenant Isolation)', async () => {
      const req = new NextRequest('https://boontrack.com/api/orders?tenant=solusi-ads', {
        headers: {
          cookie: 'merchant_store=tenant-alpha; merchant_session=tenant-alpha',
        },
      });
      const res = await getOrders(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });
  });

  describe('GET /api/v1/tenants/[slug]/orders', () => {
    it('3. Returns 401 Unauthorized when accessed without cookies', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/solusi-ads/orders');
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: 'solusi-ads' }) });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('4. Returns 401 Unauthorized when accessed with mismatching cookie', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/solusi-ads/orders', {
        headers: {
          cookie: 'merchant_store=attacker; merchant_session=attacker',
        },
      });
      const res = await getTenantOrders(req, { params: Promise.resolve({ slug: 'solusi-ads' }) });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });
  });

  describe('GET /api/v1/tenant/me', () => {
    it('5. Returns 401 Unauthorized when query slug does not match merchant session cookie', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenant/me?slug=solusi-ads', {
        headers: {
          cookie: 'merchant_store=another-store; merchant_session=another-store',
        },
      });
      const res = await getTenantMe(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('6. Returns 401 Unauthorized when accessed without any cookies', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenant/me?slug=solusi-ads');
      const res = await getTenantMe(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });
  });
});
