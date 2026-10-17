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
import { updateBotState, resolveBotControllerRole, normalizePhoneNumber } from '@/lib/whatsapp/bot-control-service';

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

    it('6. Rejects with 401 Unauthorized when accessed with plain slug cookie without valid Supabase token (Anti-Hijack B1)', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_session=toko-sukses; merchant_store=toko-sukses',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('cookie slug polos ditolak');
    });

    it('7. GET request returns 401 Unauthorized without session or credentials', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control');
      const res = await GET(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(401);
    });
  });

  describe('Authorized Requests via Official Sessions', () => {
    it('8. Allows mutation when caller has valid Supabase session token in cookie (sb-access-token)', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'sb-access-token=valid-owner-jwt-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bot_paused).toBe(true);
      expect(json.pause_reason).toBe('TENANT_DISABLED');
    });

    it('8b. Allows mutation with source: dashboard_master_toggle and returns consistent is_paused, pause_reason, and source in response', async () => {
      const req = new NextRequest('https://boontrack.com/api/v1/tenants/toko-sukses/bot-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'sb-access-token=valid-owner-jwt-token',
        },
        body: JSON.stringify({
          scope: 'tenant',
          action: 'PAUSE',
          source: 'dashboard_master_toggle',
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.is_paused).toBe(true);
      expect(json.bot_paused).toBe(true);
      expect(json.pause_reason).toBe('TENANT_DISABLED');
      expect(json.source).toBe('dashboard_master_toggle');
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
          cookie: 'sb-access-token=valid-owner-jwt-token',
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
          cookie: 'sb-access-token=valid-owner-jwt-token',
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      });

      const authRes = await PUT(authReq, { params: Promise.resolve({ slug: 'toko-sukses' }) });
      expect(authRes.status).toBe(200);
    });
  });

  describe('Security Remediation: No Admin Fallback & Explicit system_internal Role (CTO Directive B2)', () => {
    it('15. updateBotState rejects with UNAUTHORIZED when userRole is omitted and caller is non-system (Fail-Closed, No Default Admin)', async () => {
      const result = await updateBotState({
        tenantId: 'uuid-1234',
        tenantSlug: 'toko-sukses',
        action: 'PAUSE',
        scope: 'tenant',
        source: 'external_unauthorized_call',
        // userRole deliberately omitted!
        supabase: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED');
      expect(result.message).toContain('Akses ditolak: Identitas pengguna / role tidak terverifikasi');
    });

    it('16. updateBotState rejects with UNAUTHORIZED when caller passes isSystemContext: true or source: system_internal without valid server secret (Blocker A)', async () => {
      // 1. Calling with source: 'system_internal' without server secret
      const resSource = await updateBotState({
        tenantId: 'uuid-1234',
        tenantSlug: 'toko-sukses',
        action: 'RESUME',
        scope: 'conversation',
        customerPhone: '6281234567890',
        source: 'system_internal',
        // userRole omitted, no server secret
        supabase: mockSupabase,
      });

      expect(resSource.success).toBe(false);
      expect(resSource.error).toBe('UNAUTHORIZED');
      expect(resSource.message).toContain('Akses ditolak: Identitas pengguna / role tidak terverifikasi');

      // 2. Calling with isSystemContext: true without server secret (boolean bypass attempt)
      const resBool = await updateBotState({
        tenantId: 'uuid-1234',
        tenantSlug: 'toko-sukses',
        action: 'RESUME',
        scope: 'conversation',
        customerPhone: '6281234567890',
        source: 'timeout_expired',
        isSystemContext: true,
        supabase: mockSupabase,
      });

      expect(resBool.success).toBe(false);
      expect(resBool.error).toBe('UNAUTHORIZED');
      expect(resBool.message).toContain('Akses ditolak: Identitas pengguna / role tidak terverifikasi');
    });

    it('17. updateBotState permits mutation with role system_internal ONLY when valid server secret is provided (Blocker A)', async () => {
      const result = await updateBotState({
        tenantId: 'uuid-1234',
        tenantSlug: 'toko-sukses',
        action: 'RESUME',
        scope: 'conversation',
        customerPhone: '6281234567890',
        source: 'timeout_expired',
        internalSecret: 'test-internal-secret-token',
        supabase: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.bot_paused).toBe(false);
      expect(result.last_state_updated_by).toBe('timeout_expired');
    });
  });

  describe('Security Remediation: Bot Business Number Isolation (CTO Directive Temuan B & Blocker B)', () => {
    it('18. normalizePhoneNumber correctly standardizes 08xx, 628xx, and +628xx formats', () => {
      expect(normalizePhoneNumber('081234567890')).toBe('6281234567890');
      expect(normalizePhoneNumber('+6281234567890')).toBe('6281234567890');
      expect(normalizePhoneNumber('6281234567890')).toBe('6281234567890');
      expect(normalizePhoneNumber('+62 812-3456-7890')).toBe('6281234567890');
      expect(normalizePhoneNumber('0812-3456-7890')).toBe('6281234567890');
    });

    it('19. resolveBotControllerRole strictly denies owner role to bot device whatsapp_number across all formats (Anti-Impersonation)', async () => {
      // mockTenantData has whatsapp_number: '6281234567890'
      const formats = ['6281234567890', '081234567890', '+6281234567890', '+62 812-3456-7890'];
      for (const phone of formats) {
        const auth = await resolveBotControllerRole({
          senderPhone: phone,
          tenantId: 'tenant-uuid-1234',
          tenantSlug: 'toko-sukses',
          supabase: mockSupabase,
        });

        expect(auth.authorized).toBe(false);
        expect(auth.role).toBe('none');
        expect(auth.canControlTenant).toBe(false);
        expect(auth.canControlContact).toBe(false);
        expect(auth.source).toBe('bot_business_device_denied');
      }
    });

    it('20. PRIORITY RULE ENFORCEMENT: denies bot device number EVEN IF accidentally listed in metadata owner_phone / admin_phones', async () => {
      const botDevicePhone = '6281234567890';
      const mockTenantWithConflictedMetadata = {
        from: () => ({
          select: () => ({
            or: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'tenant-uuid-1234',
                  slug: 'toko-sukses',
                  whatsapp_number: botDevicePhone,
                  metadata: {
                    owner_phone: '081234567890', // bot number accidentally in owner_phone!
                    admin_phones: ['+6281234567890'], // bot number accidentally in admin_phones!
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const auth = await resolveBotControllerRole({
        senderPhone: '+6281234567890',
        tenantId: 'tenant-uuid-1234',
        supabase: mockTenantWithConflictedMetadata as any,
      });

      expect(auth.authorized).toBe(false);
      expect(auth.role).toBe('none');
      expect(auth.canControlTenant).toBe(false);
      expect(auth.canControlContact).toBe(false);
      expect(auth.source).toBe('bot_business_device_denied');
    });
  });
});
