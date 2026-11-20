/**
 * @file __tests__/api/whatsapp/wp1_whatsapp_entitlement_gates.test.ts
 * @description Comprehensive automated acceptance tests for WP1:
 * WhatsApp / Evolution / WABA Server-Side Entitlement Gates & Tenant Isolation.
 *
 * Scope:
 * A. Provider-capability separation (whatsapp_engine vs whatsapp_official)
 * B. Explicit DENY precedence (Precedence: Explicit DENY > Add-on Grant > Plan Baseline > Default DENY)
 * C. Authentication and tenant isolation (Cryptographic validation, Role RBAC, Cross-tenant defense)
 * D. No-side-effect denial (Zero outbound network requests, zero DB writes, zero QR creation on denial)
 * E. Authorized connection regression under mocks (Evolution and WABA functional paths)
 * F. Direct API bypass protection (HTTP endpoints cannot be bypassed via direct requests)
 */

import { NextRequest } from 'next/server';
import { GET as whatsappConnectGetRoute, POST as whatsappConnectPostRoute } from '@/app/api/whatsapp/connect/route';
import { POST as whatsappConnectManualRoute } from '@/app/api/whatsapp/connect-manual/route';
import * as tenantContextModule from '@/lib/auth/tenant-context';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import { hasTierAccess, canAccessFeature, CANONICAL_TIERS } from '@/lib/subscription-tiers';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('WP1: WHATSAPP / EVOLUTION / WABA SERVER-SIDE ENTITLEMENT GATES', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockImplementation(() => ({
        ...mockSupabase,
        data: [{ id: 'mock-id', slug: 'mock-slug' }],
        error: null,
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: any) => resolve({ data: [{ id: 'mock-id', slug: 'mock-slug' }], error: null }),
      })),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [{ id: 'mock-id', slug: 'mock-slug' }], error: null }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
    jest.spyOn(merchantSessionModule, 'isInternalMachineAuthorized').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // A. PROVIDER-CAPABILITY SEPARATION
  // =========================================================================
  describe('A. Provider-Capability Separation', () => {
    test('A1: Entitled Evolution request on ADS_PERFORMANCE passes whatsapp_engine authorization', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-ads',
          tenantSlug: 'ads-store',
          role: 'OWNER',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          instance: { state: 'open', owner: '628123456789' },
          connectionStatus: 'open',
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=ads-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe('CONNECTED');
      fetchSpy.mockRestore();
    });

    test('A2: Unentitled Evolution request on SOLO / STARTER is denied with HTTP 403', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-solo',
          tenantSlug: 'solo-store',
          role: 'OWNER',
          tier: 'SOLO',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=solo-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('WhatsApp Engine');
      // Zero provider side effects
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('A3: Unentitled Evolution request on CHECKOUT_LITE is denied with HTTP 403', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-lite',
          tenantSlug: 'lite-store',
          role: 'OWNER',
          tier: 'CHECKOUT_LITE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=lite-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('A4: Entitled Official WABA request on TEAM_SCALE passes whatsapp_official authorization', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-team',
          tenantSlug: 'team-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          verified_name: 'Toko Berkah Resmi',
          display_phone_number: '+62 812-3456-7890',
          quality_rating: 'GREEN',
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'team-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      fetchSpy.mockRestore();
    });

    test('A5: Unentitled WABA request on ADS_PERFORMANCE (without explicit add-on) is denied with HTTP 403', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-ads',
          tenantSlug: 'ads-store',
          role: 'OWNER',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'ads-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('Official WhatsApp');
      // Proof that whatsapp_engine possession does NOT authorize whatsapp_official
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('A6: Entitled WABA request on ADS_PERFORMANCE with explicit capability add-on grant is authorized', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-ads-waba',
          tenantSlug: 'ads-waba-store',
          role: 'OWNER',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {
            capabilities: {
              whatsapp_official: true, // Valid explicit add-on grant
            },
          },
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          verified_name: 'Ads Store Official',
          display_phone_number: '+62 811-1111-2222',
          quality_rating: 'GREEN',
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'ads-waba-store',
          phone_number_id: '11112222',
          waba_id: '33334444',
          access_token: 'EAAB_valid_addon_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      fetchSpy.mockRestore();
    });

    test('A7: whatsapp_official capability does NOT authorize whatsapp_engine', () => {
      // Store on SOLO with explicit waba grant
      const tenant = {
        tier: 'SOLO',
        metadata: {
          capabilities: {
            whatsapp_official: true,
          },
        },
      };

      expect(hasTierAccess(tenant, 'whatsapp_official')).toBe(true);
      expect(hasTierAccess(tenant, 'whatsapp_engine')).toBe(false);
    });

    test('A8: personal_profile mode / capability NEVER authorizes whatsapp_engine or whatsapp_official', () => {
      const tenant = {
        tier: 'SOLO',
        metadata: {
          storefront_mode: 'profile',
          capabilities: {
            personal_profile: true,
          },
        },
      };

      expect(hasTierAccess(tenant, 'whatsapp_engine')).toBe(false);
      expect(hasTierAccess(tenant, 'whatsapp_official')).toBe(false);
    });
  });

  // =========================================================================
  // B. EXPLICIT DENY PRECEDENCE
  // =========================================================================
  describe('B. Explicit DENY Precedence', () => {
    test('B1: Package grant (TEAM_SCALE) + tenant explicit negative override (features.whatsapp_engine: false) -> DENY (HTTP 403)', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-team-denied',
          tenantSlug: 'team-denied-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {
            features: {
              whatsapp_engine: false, // Explicit negative override
            },
          },
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=team-denied-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('B2: Package grant (TEAM_SCALE) + tenant explicit negative override (features.whatsapp_official: false) -> DENY (HTTP 403)', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-team-denied-waba',
          tenantSlug: 'team-denied-waba-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {
            features: {
              whatsapp_official: false, // Explicit negative override
            },
          },
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'team-denied-waba-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('B3: Add-on grant (capabilities.whatsapp_official: true) + explicit negative override (features.whatsapp_official: false) -> DENY', () => {
      const tenant = {
        tier: 'ADS_PERFORMANCE',
        metadata: {
          capabilities: {
            whatsapp_official: true,
          },
          features: {
            whatsapp_official: false, // Explicit negative takes precedence!
          },
        },
      };

      expect(hasTierAccess(tenant, 'whatsapp_official')).toBe(false);
    });

    test('B4: OnlineBoost explicit lockout (features.whatsapp_official: false, whatsapp_engine: false) is strictly enforced', () => {
      const obTenant = {
        slug: 'onlineboost',
        tier: 'TEAM_SCALE',
        metadata: {
          features: {
            whatsapp_official: false,
            whatsapp_engine: false,
            crm: false,
          },
        },
      };

      expect(hasTierAccess(obTenant, 'whatsapp_official')).toBe(false);
      expect(hasTierAccess(obTenant, 'whatsapp_engine')).toBe(false);
    });

    test('B5: Unknown package tier fails closed (default DENY)', () => {
      const unknownTenant = {
        tier: 'CUSTOM_UNKNOWN_PLAN_99',
        metadata: {},
      };

      expect(hasTierAccess(unknownTenant, 'whatsapp_official')).toBe(false);
      expect(hasTierAccess(unknownTenant, 'whatsapp_engine')).toBe(false);
    });

    test('B6: Unknown capability query fails closed', () => {
      const teamTenant = {
        tier: 'TEAM_SCALE',
        metadata: {},
      };

      expect(hasTierAccess(teamTenant, 'unknown_fictional_feature')).toBe(false);
    });
  });

  // =========================================================================
  // C. AUTHENTICATION AND TENANT ISOLATION
  // =========================================================================
  describe('C. Authentication and Tenant Isolation', () => {
    test('C1: Unauthenticated request to /api/whatsapp/connect returns HTTP 401', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Sesi merchant tidak ditemukan atau tidak valid.',
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=victim-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    test('C2: Unauthenticated request to /api/whatsapp/connect-manual returns HTTP 401', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Sesi merchant tidak valid.',
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'victim-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    test('C3: Cross-tenant spoofing attempt returns HTTP 403 (token for Tenant A, targeting Tenant B)', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: "Forbidden: Token sesi ('attacker-store') tidak memiliki wewenang untuk tenant 'victim-store'.",
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=victim-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('victim-store');
    });

    test('C4: Unauthorized role (CS) attempting WABA connection returns HTTP 403', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-cs-1',
          tenantId: 't-team',
          tenantSlug: 'team-store',
          role: 'CS', // CS role is NOT permitted to configure WABA credentials!
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'team-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('CS');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // =========================================================================
  // D. NO-SIDE-EFFECT DENIAL ASSERTIONS
  // =========================================================================
  describe('D. No-Side-Effect Denial Assertions', () => {
    test('D1: Denied Evolution request generates ZERO provider network calls and ZERO DB writes', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-solo',
          tenantSlug: 'solo-store',
          role: 'OWNER',
          tier: 'SOLO',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=solo-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      expect(res.status).toBe(403);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
      expect(mockSupabase.update).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('D2: Denied WABA request generates ZERO Meta Graph calls and ZERO DB writes', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-ads',
          tenantSlug: 'ads-store',
          role: 'OWNER',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'ads-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      expect(res.status).toBe(403);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
      expect(mockSupabase.update).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // =========================================================================
  // E. AUTHORIZED CONNECTION REGRESSION UNDER MOCKS
  // =========================================================================
  describe('E. Authorized Connection Regression Under Mocks', () => {
    test('E1: Authorized Evolution connection formats QR response properly', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-ads',
          tenantSlug: 'ads-store',
          role: 'OWNER',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          instance: { state: 'connecting' },
          base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=',
          code: 'PAIRING-CODE-123',
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?slug=ads-store', {
        method: 'GET',
      });

      const res = await whatsappConnectGetRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe('CONNECTING');
      expect(json.base64).toContain('data:image/png;base64');
      fetchSpy.mockRestore();
    });

    test('E2: POST /api/whatsapp/connect functions identically to GET for authorized callers', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-owner',
          tenantId: 't-team',
          tenantSlug: 'team-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          instance: { state: 'open', owner: '628999888777' },
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tenant_slug: 'team-store' }),
      });

      const res = await whatsappConnectPostRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe('CONNECTED');
      fetchSpy.mockRestore();
    });
  });

  // =========================================================================
  // F. DIRECT API BYPASS PROTECTION
  // =========================================================================
  describe('F. Direct API Bypass Protection', () => {
    test('F1: Direct HTTP request bypassing UI to /api/whatsapp/connect cannot connect without auth token', async () => {
      // Simulate raw client request with no token cookie and no authorization header
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Sesi merchant tidak valid.',
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?tenant=target-store', {
        method: 'POST',
      });

      const res = await whatsappConnectPostRoute(req);
      expect(res.status).toBe(401);
    });

    test('F2: Direct HTTP request bypassing UI to /api/whatsapp/connect-manual cannot connect without auth token', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Sesi merchant tidak valid.',
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'target-store',
          phone_number_id: '123',
          waba_id: '456',
          access_token: 'EAAB_bypass',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // G. AUTHORIZED WABA REGRESSION & ZERO-SIDE-EFFECT DENIAL (MOCKED E2E)
  // =========================================================================
  describe('G. Authorized WABA Regression & Zero-Side-Effect Denial', () => {
    test('G1: Authorized WABA connect path on TEAM_SCALE completes Meta Graph handshake and persists credentials under verified tenant_id', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-waba-owner',
          tenantId: 't-team-waba-e2e',
          tenantSlug: 'team-waba-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        // 1. Core endpoint attempt returns 404 (falls back to direct Meta handshake)
        if (urlStr.includes('/api/v1/whatsapp/connect-manual')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Not Found' }),
          } as Response);
        }
        // 2. Meta Graph phone number verification
        if (urlStr.includes('graph.facebook.com') && urlStr.includes('fields=verified_name')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              verified_name: 'Official Team Store WABA',
              display_phone_number: '+628123456789',
              quality_rating: 'GREEN',
            }),
          } as Response);
        }
        // 3. Meta Graph subscribed apps
        if (urlStr.includes('subscribed_apps')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected unmocked fetch url: ${urlStr}`));
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'team-waba-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_mock_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.verified_name).toBe('Official Team Store WABA');
      expect(json.display_phone_number).toBe('+628123456789');
      expect(json.quality_rating).toBe('GREEN');

      // Verify connection record persistence strictly scoped to verified tenant_id
      expect(mockSupabase.from).toHaveBeenCalledWith('whatsapp_connections');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't-team-waba-e2e',
          tenant_slug: 'team-waba-store',
          phone_number_id: '1234567890',
          provider: 'meta',
          channel_type: 'waba',
          ownership_domain: 'TENANT',
          status: 'active',
          is_connected: true,
        })
      );

      // Verify tenants table updated under verified tenant_id
      expect(mockSupabase.from).toHaveBeenCalledWith('tenants');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          waba_phone_number_id: '1234567890',
          metadata: expect.objectContaining({
            waba_phone_number_id: '1234567890',
            waba_configured: true,
            waba_active: true,
          }),
        })
      );

      fetchSpy.mockRestore();
    });

    test('G2: Authorized WABA connect path on ADS_PERFORMANCE with modular add-on grant completes Meta handshake', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-waba-addon',
          tenantId: 't-ads-waba-addon',
          tenantSlug: 'ads-waba-addon-store',
          role: 'MERCHANT',
          tier: 'ADS_PERFORMANCE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {
            capabilities: {
              whatsapp_official: true, // Modular add-on grant
            },
          },
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        if (urlStr.includes('/api/v1/whatsapp/connect-manual')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Not Found' }),
          } as Response);
        }
        if (urlStr.includes('graph.facebook.com') && urlStr.includes('fields=verified_name')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              verified_name: 'Addon Granted Store',
              display_phone_number: '+628987654321',
              quality_rating: 'GREEN',
            }),
          } as Response);
        }
        if (urlStr.includes('subscribed_apps')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected unmocked fetch: ${urlStr}`));
      });

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'ads-waba-addon-store',
          phone_number_id: '555666777',
          waba_id: '999888777',
          access_token: 'EAAB_addon_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.verified_name).toBe('Addon Granted Store');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't-ads-waba-addon',
          tenant_slug: 'ads-waba-addon-store',
          phone_number_id: '555666777',
          provider: 'meta',
          channel_type: 'waba',
          ownership_domain: 'TENANT',
        })
      );

      fetchSpy.mockRestore();
    });

    test('G3: Negative Test: Unentitled WABA connect path (SOLO) results in ZERO external Meta Graph calls and ZERO database writes', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-solo-waba',
          tenantId: 't-solo-blocked',
          tenantSlug: 'solo-blocked-store',
          role: 'OWNER',
          tier: 'SOLO',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {},
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'solo-blocked-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_mock_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');

      // ZERO external network calls made
      expect(fetchSpy).not.toHaveBeenCalled();

      // ZERO database writes made
      expect(mockSupabase.insert).not.toHaveBeenCalled();
      expect(mockSupabase.update).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    test('G4: Negative Test: Explicit negative override (TEAM_SCALE + features.whatsapp_official: false) results in ZERO external calls and ZERO DB writes', async () => {
      jest.spyOn(tenantContextModule, 'resolveVerifiedTenantContext').mockResolvedValue({
        success: true,
        context: {
          userId: 'user-team-neg',
          tenantId: 't-team-neg',
          tenantSlug: 'team-neg-store',
          role: 'OWNER',
          tier: 'TEAM_SCALE',
          membershipValid: true,
          authSource: 'MERCHANT_TOKEN',
          metadata: {
            features: {
              whatsapp_official: false, // Explicit negative override
            },
          },
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tenant_slug: 'team-neg-store',
          phone_number_id: '1234567890',
          waba_id: '987654321',
          access_token: 'EAAB_test_mock_token',
        }),
      });

      const res = await whatsappConnectManualRoute(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');

      // ZERO external network calls made
      expect(fetchSpy).not.toHaveBeenCalled();

      // ZERO database writes made
      expect(mockSupabase.insert).not.toHaveBeenCalled();
      expect(mockSupabase.update).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });
});
