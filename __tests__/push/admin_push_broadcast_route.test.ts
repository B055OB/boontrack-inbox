import { NextRequest, NextResponse } from 'next/server';
import { GET as getSubscribeRoute, POST as postSubscribeRoute } from '@/app/api/v1/push/subscribe/route';
import { GET as getBroadcastRoute, POST as postBroadcastRoute } from '@/app/api/v1/admin/push/broadcast/route';
import { verifyManagerRole } from '@/lib/auth/rbac-guard';
import webpush from 'web-push';

let mockPushSubscriptions: any[] = [];
let mockTenants: any[] = [];

const createMockSupabaseClient = () => ({
  from: (table: string) => {
    if (table === 'push_subscriptions') {
      return {
        select: () => ({
          order: () => ({
            data: [...mockPushSubscriptions],
            error: null,
          }),
          then: (resolve: any) => resolve({ data: [...mockPushSubscriptions], error: null }),
          eq: (col: string, val: any) => {
            const filtered = mockPushSubscriptions.filter((s) => s[col] === val);
            return Promise.resolve({ data: filtered, error: null });
          },
        }),
        upsert: (payload: any) => {
          const existingIdx = mockPushSubscriptions.findIndex(
            (s) => s.endpoint === payload.endpoint
          );
          const saved = {
            id: payload.id || `sub-${Date.now()}`,
            ...payload,
            created_at: new Date().toISOString(),
          };
          if (existingIdx >= 0) {
            mockPushSubscriptions[existingIdx] = saved;
          } else {
            mockPushSubscriptions.push(saved);
          }
          return {
            select: () => ({
              single: () => Promise.resolve({ data: saved, error: null }),
            }),
          };
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            mockPushSubscriptions = mockPushSubscriptions.filter((s) => s[col] !== val);
            return Promise.resolve({ error: null });
          },
          in: (col: string, vals: any[]) => {
            mockPushSubscriptions = mockPushSubscriptions.filter((s) => !vals.includes(s[col]));
            return Promise.resolve({ error: null });
          },
        }),
      };
    }

    if (table === 'tenants') {
      return {
        select: () => Promise.resolve({ data: [...mockTenants], error: null }),
      };
    }

    return {
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ error: null }),
    };
  },
});

jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: () => createMockSupabaseClient(),
  getSupabaseAdmin: () => createMockSupabaseClient(),
}));

jest.mock('@/lib/auth/rbac-guard', () => ({
  verifyManagerRole: jest.fn(),
}));

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

describe('Admin Web Push & Subscription Persistence Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyManagerRole as jest.Mock).mockImplementation(async (req: NextRequest) => {
      const authHeader = req?.headers?.get('authorization');
      if (authHeader === 'Bearer superadmin-jwt') {
        return {
          authorized: true,
          role: 'SUPERADMIN',
          userId: 'sa-uuid-1',
          email: 'founder@boontrack.com',
        };
      }
      if (authHeader === 'Bearer affiliate-jwt') {
        return {
          authorized: true,
          role: 'AFFILIATE_MANAGER',
          userId: 'am-uuid-1',
          email: 'manager@boontrack.com',
        };
      }
      return {
        authorized: false,
        errorStatus: 401,
        errorMessage: 'Unauthorized',
      };
    });
    mockPushSubscriptions = [
      {
        id: 'sub-active-1',
        tenant_slug: 'tokoberkah',
        endpoint: 'https://fcm.googleapis.com/fcm/send/token1',
        p256dh: 'p256key1',
        auth: 'auth1',
        keys: { p256dh: 'p256key1', auth: 'auth1' },
      },
      {
        id: 'sub-stale-410',
        tenant_slug: 'tokousang',
        endpoint: 'https://fcm.googleapis.com/fcm/send/token_stale',
        p256dh: 'p256key2',
        auth: 'auth2',
        keys: { p256dh: 'p256key2', auth: 'auth2' },
      },
    ];

    mockTenants = [
      {
        slug: 'tokoberkah',
        name: 'Toko Berkah',
        tier: 'SOLO',
        is_active: true,
        metadata: { is_saas: true },
      },
      {
        slug: 'tokousang',
        name: 'Toko Usang',
        tier: 'SOLO',
        is_active: true,
        metadata: { is_saas: true },
      },
    ];
  });

  describe('1. Push Subscribe Route (/api/v1/push/subscribe)', () => {
    it('returns canonical public VAPID key on GET', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/push/subscribe');
      const res = await getSubscribeRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(typeof data.public_key).toBe('string');
      expect(data.public_key.length).toBe(87);
    });

    it('rejects POST with 400 when tenant_slug is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/test' },
        }),
      });
      const res = await postSubscribeRoute(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('tenant_slug is required');
    });

    it('successfully persists new browser subscription for admin/tenant', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/push/subscribe', {
        method: 'POST',
        headers: { host: 'dashboard.boontrack.com' },
        body: JSON.stringify({
          tenant_slug: 'admin',
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/new_admin_device',
            keys: { p256dh: 'admin_p256', auth: 'admin_auth' },
          },
        }),
      });
      const res = await postSubscribeRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tenant_slug).toBe('admin');

      // Verify stored in database
      const found = mockPushSubscriptions.find((s) => s.endpoint.includes('new_admin_device'));
      expect(found).toBeDefined();
      expect(found?.tenant_slug).toBe('admin');
    });
  });

  describe('2. Broadcast & Auto-Cleanup (/api/v1/admin/push/broadcast)', () => {
    it('rejects unauthenticated GET and AFFILIATE_MANAGER role cleanly', async () => {
      const unauthRes = await getBroadcastRoute();
      expect(unauthRes.status).toBe(401);

      const affiliateReq = new NextRequest('http://localhost:3000/api/v1/admin/push/broadcast', {
        method: 'GET',
        headers: { authorization: 'Bearer affiliate-jwt' },
      });
      const affiliateRes = await getBroadcastRoute(affiliateReq);
      expect(affiliateRes.status).toBe(403);
    });

    it('returns list of subscribers and total count on GET when SUPERADMIN authenticated', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/push/broadcast', {
        method: 'GET',
        headers: { authorization: 'Bearer superadmin-jwt' },
      });
      const res = await getBroadcastRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.total_subscriptions).toBe(2);
      expect(data.subscriptions.length).toBe(2);
    });

    it('rejects broadcast with empty message', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/admin/push/broadcast', {
        method: 'POST',
        headers: { authorization: 'Bearer superadmin-jwt' },
        body: JSON.stringify({
          title: 'Halo',
          message: '   ',
        }),
      });
      const res = await postBroadcastRoute(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('tidak boleh kosong');
    });

    it('auto-cleans stale subscriptions on 410 Gone / 404 Not Found', async () => {
      // Mock webpush behavior:
      // tokoberkah succeeds
      // tokousang fails with 410 Gone
      (webpush.sendNotification as jest.Mock).mockImplementation((config) => {
        if (config.endpoint.includes('token_stale')) {
          const err: any = new Error('Unsubscribed');
          err.statusCode = 410;
          err.body = 'push subscription has unsubscribed or expired.';
          return Promise.reject(err);
        }
        return Promise.resolve({ statusCode: 201 });
      });

      const req = new NextRequest('http://localhost:3000/api/v1/admin/push/broadcast', {
        method: 'POST',
        headers: { authorization: 'Bearer superadmin-jwt' },
        body: JSON.stringify({
          title: '🚀 Rilis Fitur Baru',
          message: 'Fitur F&B dan Ongkir Instan kini aktif.',
          target_type: 'all',
        }),
      });

      const res = await postBroadcastRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.success_count).toBe(1);
      expect(data.failure_count).toBe(1);
      expect(data.cleaned_up_count).toBe(1);

      // Verify the stale subscription was automatically deleted from database
      const staleFound = mockPushSubscriptions.find((s) => s.id === 'sub-stale-410');
      expect(staleFound).toBeUndefined();

      // Verify active subscription remains
      const activeFound = mockPushSubscriptions.find((s) => s.id === 'sub-active-1');
      expect(activeFound).toBeDefined();

      // Verify failures breakdown in response
      expect(data.failures.length).toBe(1);
      expect(data.failures[0].tenant_slug).toBe('tokousang');
      expect(data.failures[0].category).toBe('EXPIRED_GONE');
      expect(data.failures[0].cleaned_up).toBe(true);
    });

    it('logs VAPID mismatch without deleting token when 403 occurs', async () => {
      (webpush.sendNotification as jest.Mock).mockImplementation(() => {
        const err: any = new Error('Forbidden');
        err.statusCode = 403;
        err.body = 'the VAPID credentials in the authorization header do not correspond';
        return Promise.reject(err);
      });

      const req = new NextRequest('http://localhost:3000/api/v1/admin/push/broadcast', {
        method: 'POST',
        headers: { authorization: 'Bearer superadmin-jwt' },
        body: JSON.stringify({
          title: 'Test Broadcast',
          message: 'Pesan uji coba',
          target_type: 'all',
        }),
      });

      const res = await postBroadcastRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.failure_count).toBe(2);
      expect(data.cleaned_up_count).toBe(0); // Not deleted because it's a VAPID mismatch, not expired token
      expect(data.failures[0].category).toBe('VAPID_MISMATCH');
      expect(data.failures[0].cleaned_up).toBe(false);
    });
  });
});
