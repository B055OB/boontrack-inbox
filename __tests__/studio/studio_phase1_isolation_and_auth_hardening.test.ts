/**
 * @file __tests__/studio/studio_phase1_isolation_and_auth_hardening.test.ts
 * @description Phase 1 Regression Test Suite for BoonTrack Studio
 *
 * Verifies CTO Directive Phase 1 Requirements:
 * 1. P0 Tenant Isolation: Zero random fallbacks (tenants.limit(1) removed).
 * 2. Sandbox Prohibitions: @creator and sandbox sessions blocked with 403 on billing and final render dispatch.
 * 3. Session Harmonization: Activation issues signed bt_merchant_token; plaintext cookies rejected.
 * 4. Jobs Authorization: /api/studio/jobs accepts verified merchant token and rejects forged/cross-tenant queries.
 */

import { NextRequest } from 'next/server';
import * as supabaseClientModule from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

// Import route handlers
import { POST as renderPost } from '@/app/api/studio/render/route';
import { POST as dispatchPost } from '@/app/api/studio/render/dispatch/route';
import { POST as batchPost } from '@/app/api/studio/render/batch/route';
import { POST as createInvoicePost } from '@/app/api/studio/billing/create-invoice/route';
import { POST as scriptsPost, GET as scriptsGet } from '@/app/api/studio/scripts/route';
import { POST as activatePost } from '@/app/api/studio/auth/activate/route';
import { GET as regStatusGet } from '@/app/api/studio/auth/registration-status/route';
import { GET as jobsGet } from '@/app/api/studio/jobs/route';

jest.mock('@/lib/studio/auth', () => ({
  normalizeStudioPhone: jest.fn((p) => p.replace(/[^0-9]/g, '')),
  activateStudioRegistrationByToken: jest.fn(),
  getStudioRegistrationStatus: jest.fn(),
}));

describe('CTO Directive — Studio Phase 1 Hardening & Tenant Isolation Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BOONTRACK_SESSION_SECRET: 'test_session_secret_at_least_32_characters_long_2026!',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  // =========================================================================
  // SECTION 1: P0 TENANT ISOLATION & ZERO RANDOM FALLBACKS
  // =========================================================================
  describe('1. P0 Tenant Isolation & Fail-Closed Guards', () => {
    it('1.1 StudioCreditService.resolveTenant returns null for creator or sandbox identity', async () => {
      const creatorRes = await StudioCreditService.resolveTenant('creator');
      const sandboxRes = await StudioCreditService.resolveTenant('sandbox');
      expect(creatorRes).toBeNull();
      expect(sandboxRes).toBeNull();
    });

    it('1.2 StudioCreditService.reserveCredits rejects creator sandbox with 403 SANDBOX_PROHIBITED', async () => {
      const res = await StudioCreditService.reserveCredits('creator', 3, 'Test sandbox render');
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.status_code).toBe('SANDBOX_PROHIBITED');
    });

    it('1.3 StudioCreditService.reserveCredits returns 404 for unknown tenant (never falls back)', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const res = await StudioCreditService.reserveCredits('nonexistent-tenant', 3);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(404);
    });

    it('1.4 POST /api/studio/render rejects creator session with 403 SANDBOX_PROHIBITED', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'creator',
          product_name: 'Test Product',
          scenes: [{ scene_number: 1, voiceover: 'Hello' }],
        }),
      });

      const res = await renderPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('SANDBOX_PROHIBITED');
    });

    it('1.5 POST /api/studio/render fails closed with 404 when tenant is not found (zero limit(1) fallback)', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost:3000/api/studio/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'ghost-merchant-uuid',
          product_name: 'Ghost Item',
          scenes: [{ scene_number: 1, voiceover: 'Test' }],
        }),
      });

      const res = await renderPost(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('1.6 POST /api/studio/render/dispatch rejects creator session with 403 SANDBOX_PROHIBITED', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/render/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'creator',
          product_name: 'Test UGC',
          scenes: [{ scene_number: 1, voiceover: 'Test' }],
        }),
      });

      const res = await dispatchPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('SANDBOX_PROHIBITED');
    });

    it('1.7 POST /api/studio/render/batch rejects creator session with 403 SANDBOX_PROHIBITED', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'creator',
          product_name: 'FCD Batch',
          variations: [{ hook: 'Hook A', body: 'Body A', cta: 'CTA A' }],
        }),
      });

      const res = await batchPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('SANDBOX_PROHIBITED');
    });

    it('1.8 POST /api/studio/scripts fails closed with 404 when tenant is missing or invalid', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost:3000/api/studio/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'creator',
          product_name: 'My Product',
          scenes: [{ scene_number: 1 }],
        }),
      });

      const res = await scriptsPost(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('1.9 GET /api/studio/scripts requires tenant parameter and rejects empty tenant lookup', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/scripts');
      const res = await scriptsGet(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('TENANT_REQUIRED');
    });
  });

  // =========================================================================
  // SECTION 2: SANDBOX BILLING HARD-BLOCK
  // =========================================================================
  describe('2. Sandbox Billing Hard-Block', () => {
    it('2.1 POST /api/studio/billing/create-invoice rejects creator slug with 403 SANDBOX_PROHIBITED', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'creator',
          packageId: 'starter',
        }),
      });

      const res = await createInvoicePost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('SANDBOX_PROHIBITED');
    });

    it('2.2 POST /api/studio/billing/create-invoice rejects tenant with metadata.is_sandbox === true with 403', async () => {
      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: 'tenant-sandbox-id',
              slug: 'test-sandbox-store',
              tier: 'FREE',
              metadata: { is_sandbox: true },
            },
            error: null,
          }),
        })),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);

      const req = new NextRequest('http://localhost:3000/api/studio/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: 'test-sandbox-store',
          packageId: 'starter',
        }),
      });

      const res = await createInvoicePost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('SANDBOX_PROHIBITED');
    });
  });

  // =========================================================================
  // SECTION 3: SESSION HARMONIZATION & CRYPTOGRAPHIC TOKEN PROOF
  // =========================================================================
  describe('3. Session Harmonization & Signed Token Minting', () => {
    it('3.1 POST /api/studio/auth/activate mints cryptographically signed bt_merchant_token and sets cookie', async () => {
      const { activateStudioRegistrationByToken } = require('@/lib/studio/auth');
      activateStudioRegistrationByToken.mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000099',
        slug: 'warungkreatif',
        name: 'Warung Kreatif',
        metadata: {
          whatsapp: '6281234567890',
          studio_workspace: { render_credits: 5 },
        },
      });

      const req = new NextRequest('http://localhost:3000/api/studio/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'ACT-VALID-123' }),
      });

      const res = await activatePost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.slug).toBe('warungkreatif');
      expect(json.token).toBeDefined();
      expect(typeof json.token).toBe('string');
      expect(json.token.includes('.')).toBe(true);

      // Verify Set-Cookie header contains bt_merchant_token
      const setCookieHeader = res.headers.get('set-cookie') || '';
      expect(setCookieHeader).toContain('bt_merchant_token=');
      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('3.2 GET /api/studio/auth/registration-status mints signed bt_merchant_token when status is SUCCESS', async () => {
      const { getStudioRegistrationStatus } = require('@/lib/studio/auth');
      getStudioRegistrationStatus.mockResolvedValueOnce({
        status: 'SUCCESS',
        session: {
          tenant_id: '00000000-0000-4000-8000-000000000099',
          slug: 'warungkreatif',
          name: 'Warung Kreatif',
          whatsapp: '6281234567890',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/studio/auth/registration-status?token=ACT-999');
      const res = await regStatusGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('SUCCESS');
      expect(json.token).toBeDefined();

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('bt_merchant_token=');
    });
  });

  // =========================================================================
  // SECTION 4: JOBS API AUTHENTICATION & MULTI-TENANT ISOLATION
  // =========================================================================
  describe('4. /api/studio/jobs Auth Alignment & Cross-Tenant Defense', () => {
    it('4.1 Rejects unauthenticated request with plaintext cookies (401 Unauthorized)', async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'No session' } }),
        },
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

      const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=victim-tenant', {
        headers: {
          // Plaintext cookie only, no signed HMAC token
          cookie: 'merchant_store=victim-tenant; studio_session=true',
        },
      });

      const res = await jobsGet(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });

    it('4.2 Accepts valid signed bt_merchant_token and returns jobs for bound tenant', async () => {
      const tenantId = '00000000-0000-4000-8000-000000000099';
      const tenantSlug = 'warungkreatif';

      const validToken = signMerchantSessionToken({
        tenantSlug,
        tenantId,
        role: 'OWNER',
      });

      const mockJobs = [
        { id: 'job-1', tenant_id: tenantId, status: 'COMPLETED', job_type: 'FFMPEG_LEVEL_1', created_at: new Date().toISOString() },
      ];

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: tenantId, slug: tenantSlug },
                error: null,
              }),
            };
          }
          if (table === 'studio_jobs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockResolvedValue({ data: mockJobs, error: null }),
            };
          }
          return { select: jest.fn().mockReturnThis() };
        }),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest(`http://localhost:3000/api/studio/jobs?tenant_id=${tenantSlug}`, {
        headers: {
          cookie: `bt_merchant_token=${validToken}`,
        },
      });

      const res = await jobsGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.jobs).toHaveLength(1);
      expect(json.jobs[0].tenant_id).toBe(tenantId);
    });

    it('4.3 Rejects cross-tenant access when token belongs to Tenant A but request queries Tenant B (403 Forbidden)', async () => {
      const tokenForTenantA = signMerchantSessionToken({
        tenantSlug: 'attacker-store',
        tenantId: '00000000-0000-4000-8000-000000000001',
        role: 'OWNER',
      });

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: '00000000-0000-4000-8000-000000000002', slug: 'victim-store' },
                error: null,
              }),
            };
          }
          return { select: jest.fn().mockReturnThis() };
        }),
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      // Attacker passes Token A but queries victim-store
      const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=victim-store', {
        headers: {
          cookie: `bt_merchant_token=${tokenForTenantA}`,
        },
      });

      const res = await jobsGet(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');
    });
  });
});
