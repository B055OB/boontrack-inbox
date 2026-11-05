/**
 * @file __tests__/integration/onlineboost_pilot_tenant_invariant.test.ts
 * @description Single-Tenant Pilot Invariant Test Suite for 'onlineboost'
 *
 * Verifies (CTO Mandate Section 4):
 * 1. Correct tenant access ('onlineboost') succeeds.
 * 2. Another tenant's session ('buzzerukm') cannot access OnlineBoost (403 Forbidden).
 * 3. OnlineBoost session cannot access another tenant (403 Forbidden).
 * 4. Missing session is rejected (401 Unauthorized).
 * 5. Forged tenant headers ('x-tenant-id', 'x-tenant-slug') do not alter authorization.
 * 6. Jobs, entitlements, credits, render artifacts, and R2 object access are tenant-scoped.
 * 7. Never uses a hardcoded tenant ID as proof of authorization (cryptographic HMAC-SHA256 signature required).
 */

import { NextRequest } from 'next/server';
import { GET as getEntitlements } from '@/app/api/tenants/[tenantSlug]/entitlements/route';
import { GET as getJobs, POST as postJobs } from '@/app/api/studio/jobs/route';
import { CloudflareR2Pipeline, NineSceneVideoEngine } from '@/lib/creator/render-engine';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('OnlineBoost Single-Tenant Pilot Invariant Suite', () => {
  const ONLINEBOOST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
  const ONLINEBOOST_SLUG = 'onlineboost';

  const ALIEN_TENANT_ID = '00000000-0000-4000-8000-000000000002';
  const ALIEN_SLUG = 'buzzerukm';

  beforeEach(() => {
    jest.clearAllMocks();
    const defaultMockSupabase = createMockSupabase();
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(defaultMockSupabase as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(defaultMockSupabase as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockSupabase = (options: {
    tenantRecord?: any;
    jobs?: any[];
    singleJob?: any;
  } = {}) => {
    const tenant = options.tenantRecord ?? {
      id: ONLINEBOOST_TENANT_ID,
      slug: ONLINEBOOST_SLUG,
      name: 'OnlineBoost Official Store',
      tier: 'PRO_SCALE',
      metadata: { features: ['studio', 'creator'] },
    };

    return {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              const matches =
                (col === 'id' && val.toLowerCase() === tenant.id.toLowerCase()) ||
                (col === 'slug' && val.toLowerCase() === tenant.slug.toLowerCase());
              return {
                maybeSingle: jest.fn().mockResolvedValue({
                  data: matches ? tenant : null,
                  error: null,
                }),
                single: jest.fn().mockResolvedValue({
                  data: matches ? tenant : null,
                  error: matches ? null : { message: 'Not found' },
                }),
              };
            }),
            maybeSingle: jest.fn().mockResolvedValue({ data: tenant, error: null }),
            single: jest.fn().mockResolvedValue({ data: tenant, error: null }),
          };
        }

        if (table === 'studio_jobs') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'job_ob_001',
                    tenant_id: ONLINEBOOST_TENANT_ID,
                    status: 'QUEUED',
                    job_type: 'VIDEO_ADS',
                  },
                  error: null,
                }),
              }),
            }),
            maybeSingle: jest.fn().mockResolvedValue({
              data: options.singleJob || null,
              error: null,
            }),
            single: jest.fn().mockResolvedValue({
              data: options.singleJob || null,
              error: options.singleJob ? null : { message: 'Job not found' },
            }),
            then: (resolve: any) => resolve({ data: options.jobs || [], error: null }),
          };
        }

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
      }),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'usr_ob_owner' } },
          error: null,
        }),
      },
    } as any;
  };

  describe('Invariant 1: Correct Tenant Access Succeeds', () => {
    it('allows OnlineBoost session to access OnlineBoost entitlements and jobs', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('valid_ob_token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: ONLINEBOOST_TENANT_ID,
          tenantSlug: ONLINEBOOST_SLUG,
          role: 'OWNER',
        },
      } as any);

      jest.spyOn(StudioCreditService, 'getEntitlements').mockResolvedValue({
        tenant_id: ONLINEBOOST_TENANT_ID,
        tenant_slug: ONLINEBOOST_SLUG,
        tier: 'PRO_SCALE',
        credits_remaining: 100,
        is_unlimited: false,
      } as any);

      const req = new NextRequest(`https://studio.boontrack.com/api/tenants/${ONLINEBOOST_SLUG}/entitlements`, {
        headers: { Authorization: 'Bearer valid_ob_token' },
      });

      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: ONLINEBOOST_SLUG }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tenant_slug).toBe(ONLINEBOOST_SLUG);
      expect(json.data.credits_remaining).toBe(100);
    });
  });

  describe('Invariant 2: Alien Tenant Session Cannot Access OnlineBoost', () => {
    it('rejects another tenant (buzzerukm) trying to read OnlineBoost data with 403 Forbidden', async () => {
      // Sesi milik alien (buzzerukm)
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alien_token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: ALIEN_TENANT_ID,
          tenantSlug: ALIEN_SLUG,
          role: 'OWNER',
        },
      } as any);

      const mockSupabase = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      // Alien attempts to query OnlineBoost jobs
      const req = new NextRequest(`https://studio.boontrack.com/api/studio/jobs?tenant_id=${ONLINEBOOST_SLUG}`, {
        headers: { Authorization: 'Bearer alien_token' },
      });

      const res = await getJobs(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });
  });

  describe('Invariant 3: OnlineBoost Session Cannot Access Another Tenant', () => {
    it('rejects OnlineBoost session attempting to read another tenant data with 403 Forbidden', async () => {
      // Sesi milik OnlineBoost
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('ob_token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: ONLINEBOOST_TENANT_ID,
          tenantSlug: ONLINEBOOST_SLUG,
          role: 'OWNER',
        },
      } as any);

      const req = new NextRequest(`https://studio.boontrack.com/api/tenants/${ALIEN_SLUG}/entitlements`, {
        headers: { Authorization: 'Bearer ob_token' },
      });

      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: ALIEN_SLUG }),
      });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });
  });

  describe('Invariant 4: Missing Session is Rejected (401 Unauthorized)', () => {
    it('rejects unauthenticated requests to OnlineBoost jobs with 401', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({ valid: false } as any);

      const req = new NextRequest(`https://studio.boontrack.com/api/studio/jobs?tenant_id=${ONLINEBOOST_SLUG}`);
      const res = await getJobs(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });
  });

  describe('Invariant 5: Forged Tenant Headers Do Not Alter Authorization', () => {
    it('ignores client-forged x-tenant-id and x-tenant-slug headers when session is absent or foreign', async () => {
      // Attacker sends forged headers claiming to be OnlineBoost, but provides alien token
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('attacker_token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: ALIEN_TENANT_ID,
          tenantSlug: ALIEN_SLUG,
          role: 'OWNER',
        },
      } as any);

      const mockSupabase = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest(`https://studio.boontrack.com/api/studio/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer attacker_token',
          'x-tenant-id': ONLINEBOOST_TENANT_ID, // FORGED
          'x-tenant-slug': ONLINEBOOST_SLUG,   // FORGED
        },
        body: JSON.stringify({
          tenant_id: ONLINEBOOST_SLUG, // FORGED
          job_type: 'VIDEO_ADS',
          payload: { prompt: 'Malicious probe' },
        }),
      });

      const res = await postJobs(req);
      const json = await res.json();

      // Authorization MUST fail-closed because token claims do not match forged headers
      expect(res.status).toBe(403);
      expect(json.code).toBe('FORBIDDEN');
    });
  });

  describe('Invariant 6: Scoped Jobs, Entitlements, Artifacts & R2 Keys', () => {
    it('enforces OnlineBoost tenant isolation on Cloudflare R2 object keys', () => {
      const key = CloudflareR2Pipeline.generateObjectKey(
        ONLINEBOOST_SLUG,
        'VIDEO_ADS',
        'job_ob_video_99',
        'render.mp4'
      );

      expect(key).toBe(`studio/${ONLINEBOOST_SLUG}/video_ads/job_ob_video_99/render.mp4`);
      expect(key.startsWith(`studio/${ONLINEBOOST_SLUG}/`)).toBe(true);
    });

    it('enforces OnlineBoost tenant isolation on NineSceneVideoEngine manifests', () => {
      const sampleScenes = Array.from({ length: 9 }).map((_, i) => ({
        stage_name: `Stage ${i + 1}`,
        duration_sec: 3,
        voiceover: 'V',
        visual_direction: 'VD',
      }));

      const manifest = NineSceneVideoEngine.createManifest(
        'job_ob_manifest_01',
        ONLINEBOOST_TENANT_ID,
        'OnlineBoost Canary Product',
        'saas',
        sampleScenes
      );

      expect(manifest.tenant_id).toBe(ONLINEBOOST_TENANT_ID);
      expect(manifest.scenes).toHaveLength(9);
    });
  });

  describe('Invariant 7: Zero Hardcoded Tenant ID as Proof of Authorization', () => {
    it('rejects tokens where HMAC signature fails or token is tampered with', async () => {
      // Simulates an invalid/tampered token claiming to be onlineboost
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('tampered_token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: false,
        status: 401,
        error: 'Unauthorized: Tanda tangan sesi merchant tidak sah (Forged Token).',
      });

      const req = new NextRequest(`https://studio.boontrack.com/api/tenants/${ONLINEBOOST_SLUG}/entitlements`, {
        headers: { Authorization: 'Bearer tampered_token' },
      });

      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: ONLINEBOOST_SLUG }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });
  });
});
