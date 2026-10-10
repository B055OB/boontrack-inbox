/**
 * Test Suite: Evolution API Key Fail-Closed & Bot-Control Route Authorization
 *
 * Verifies:
 * 1. lib/whatsapp/evolution-webhook-handler.ts:
 *    - Throws [SECURITY FATAL] error when EVOLUTION_API_KEY is missing or empty.
 *    - Resolves EVOLUTION_API_KEY from process.env when configured.
 *    - Resolves customApiKey when provided.
 *
 * 2. app/api/v1/tenants/[slug]/bot-control/route.ts:
 *    - Rejects unauthorized access with 401 when no session is present.
 *    - Rejects with 401 when invalid or expired session token is provided.
 *    - Rejects with 403 when session token belongs to a user who is not an owner/admin of the tenant.
 *    - Rejects with 401 when unauthenticated caller supplies owner's phone in body (phone spoofing rejected).
 *    - Rejects with 401 when unauthenticated caller supplies x-phone header.
 *    - Rejects with 403 when accessed with mismatching merchant session cookie (cross-tenant rejected).
 *    - Allows access with matching merchant session cookie.
 *    - Allows access with valid Supabase Auth session token of tenant owner.
 *    - Allows access with valid Supabase Auth session token of tenant admin.
 *    - Allows access with internal service secret or service role key.
 */

import { NextRequest } from 'next/server';
import {
  getRequiredEvolutionApiKey,
  getEvolutionApiKey,
  processEvolutionWebhookEvent,
} from '@/lib/whatsapp/evolution-webhook-handler';
import { GET, POST, PUT } from '@/app/api/v1/tenants/[slug]/bot-control/route';

// Mock Supabase Client for bot-control route and service
const mockTenantData = {
  id: 'tenant-uuid-1234',
  slug: 'toko-sukses',
  user_id: 'owner-uuid-1234',
  owner_id: 'owner-uuid-1234',
  email: 'owner@toko-sukses.com',
  owner_email: 'owner@toko-sukses.com',
  phone: '6281234567890',
  whatsapp_number: '6281234567890',
  bot_paused: false,
  is_bot_active: true,
  metadata: {
    owner_id: 'owner-uuid-1234',
    owner_phone: '6281234567890',
    admin_phones: ['628111111111', '08222222222'],
    bot_control_allowlist: ['628333333333'],
  },
};

const mockSupabase = {
  auth: {
    getUser: jest.fn(async (token: string) => {
      if (token === 'valid-owner-jwt-token') {
        return {
          data: {
            user: {
              id: 'owner-uuid-1234',
              email: 'owner@toko-sukses.com',
              phone: '6281234567890',
            },
          },
          error: null,
        };
      }
      if (token === 'valid-admin-jwt-token') {
        return {
          data: {
            user: {
              id: 'admin-uuid-5555',
              email: 'admin@toko-sukses.com',
              phone: '628555555555',
            },
          },
          error: null,
        };
      }
      if (token === 'valid-stranger-jwt-token') {
        return {
          data: {
            user: {
              id: 'stranger-uuid-9999',
              email: 'stranger@otherdomain.com',
              phone: '628999999999',
            },
          },
          error: null,
        };
      }
      return {
        data: { user: null },
        error: { message: 'Invalid or expired session token' },
      };
    }),
  },
  from: jest.fn((table: string) => {
    if (table === 'tenants') {
      return {
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: mockTenantData,
              error: null,
            })),
          })),
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: mockTenantData,
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          or: jest.fn(async () => ({ error: null })),
          eq: jest.fn(async () => ({ error: null })),
        })),
      };
    }

    if (table === 'tenant_users') {
      const mockUsers = [
        { user_id: 'admin-uuid-5555', email: 'admin@toko-sukses.com', role: 'admin', is_active: true },
        { user_id: 'stranger-uuid-7777', email: 'customer@other.com', role: 'customer', is_active: true },
      ];
      const queryBuilder: any = {
        then: (resolve: any) => resolve({ data: mockUsers, error: null }),
        select: jest.fn(() => queryBuilder),
        or: jest.fn(() => queryBuilder),
        eq: jest.fn(() => queryBuilder),
        maybeSingle: jest.fn(async () => ({
          data: mockUsers[0],
          error: null,
        })),
      };
      return queryBuilder;
    }

    // Default table mock
    return {
      select: jest.fn(() => ({
        or: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: [], error: null })),
        })),
        eq: jest.fn(async () => ({ data: [], error: null })),
      })),
      update: jest.fn(() => ({
        or: jest.fn(async () => ({ error: null })),
        eq: jest.fn(async () => ({ error: null })),
      })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: () => mockSupabase,
  getSupabase: () => mockSupabase,
}));

describe('Security Remediation: EVOLUTION_API_KEY Fail-Closed Enforcement', () => {
  const originalEnvKey = process.env.EVOLUTION_API_KEY;

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.EVOLUTION_API_KEY = originalEnvKey;
    } else {
      delete process.env.EVOLUTION_API_KEY;
    }
  });

  it('1. getRequiredEvolutionApiKey throws Error immediately when process.env.EVOLUTION_API_KEY is missing or empty (Fail-Closed)', () => {
    delete process.env.EVOLUTION_API_KEY;
    expect(() => getRequiredEvolutionApiKey()).toThrow(/\[SECURITY FATAL\] EVOLUTION_API_KEY is not configured/);

    process.env.EVOLUTION_API_KEY = '   ';
    expect(() => getRequiredEvolutionApiKey()).toThrow(/\[SECURITY FATAL\] EVOLUTION_API_KEY is not configured/);
  });

  it('2. getRequiredEvolutionApiKey reads correctly from process.env.EVOLUTION_API_KEY when configured', () => {
    process.env.EVOLUTION_API_KEY = 'test-secret-evo-key-999';
    expect(getRequiredEvolutionApiKey()).toBe('test-secret-evo-key-999');
    expect(getEvolutionApiKey()).toBe('test-secret-evo-key-999');
  });

  it('3. getRequiredEvolutionApiKey prioritizes customApiKey when provided', () => {
    process.env.EVOLUTION_API_KEY = 'fallback-key';
    expect(getRequiredEvolutionApiKey('custom-instance-key')).toBe('custom-instance-key');
  });

  it('4. processEvolutionWebhookEvent aborts and throws Error when EVOLUTION_API_KEY is missing (Fail-Closed)', async () => {
    delete process.env.EVOLUTION_API_KEY;
    const dummyPayload = {
      event: 'messages.upsert',
      instance: 'unknown-instance',
      data: { key: { remoteJid: '6281234@s.whatsapp.net', fromMe: false } },
    };

    let threw = false;
    try {
      await processEvolutionWebhookEvent(dummyPayload);
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain('[SECURITY FATAL] EVOLUTION_API_KEY');
    }
    expect(threw).toBe(true);
  });
});

describe('Security Remediation: Official Session Verification on bot-control/route.ts', () => {
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;

  beforeAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret';
    process.env.INTERNAL_API_SECRET = 'test-internal-secret-token';
  });

  afterAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    process.env.INTERNAL_API_SECRET = originalInternalSecret;
  });

  describe('Unauthenticated and Unauthorized Requests', () => {
    it('1. Returns 401 Unauthorized when accessed without session cookies or authorization headers', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('2. Returns 401 Unauthorized when invalid or expired Bearer token is provided', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer expired-or-invalid-jwt-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('3. Returns 403 Forbidden when session token belongs to a stranger/non-owner of this tenant', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer valid-stranger-jwt-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('4. Rejects with 401 Unauthorized when caller supplies owner phone in body without valid session (Anti-Spoofing)', async () => {
      // Attacker attempts to spoof owner by sending owner's phone in body
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PAUSE', phone: '6281234567890' }), // owner phone spoof attempt
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unauthorized');
    });

    it('5. Rejects with 401 Unauthorized when caller supplies x-phone header without valid session (Header Spoofing Blocked)', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-phone': '6281234567890',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);
    });

    it('6. Returns 403 Forbidden when accessed with mismatching merchant session cookie', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_session=attacker-store; merchant_store=attacker-store',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('7. GET request returns 401 Unauthorized without session or credentials', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control');
      const res = await GET(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);
    });
  });

  describe('Authorized Requests via Official Sessions', () => {
    it('8. Allows mutation when caller has valid matching merchant session cookie', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_session=toko-sukses',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bot_paused).toBe(true);
    });

    it('9. Allows mutation when caller provides valid Supabase session token of tenant owner', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer valid-owner-jwt-token',
        },
        body: JSON.stringify({ action: 'RESUME' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bot_paused).toBe(false);
    });

    it('10. Allows mutation when caller provides valid Supabase session token of tenant admin', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer valid-admin-jwt-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bot_paused).toBe(true);
    });

    it('11. Allows access with x-internal-secret header', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-internal-secret-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('12. Allows access with Supabase Service Role Key in Authorization header', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer test-service-role-secret',
        },
        body: JSON.stringify({ action: 'RESUME' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('13. GET endpoint returns 200 with bot status when caller has valid session', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        headers: {
          cookie: 'merchant_session=toko-sukses',
        },
      });

      const res = await GET(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.slug).toBe('toko-sukses');
    });

    it('14. PUT endpoint delegates to POST and enforces the exact same authorization', async () => {
      const unauthReq = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const unauthRes = await PUT(unauthReq, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(unauthRes.status).toBe(401);

      const authReq = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_session=toko-sukses',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const authRes = await PUT(authReq, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(authRes.status).toBe(200);
    });
  });
});
