/**
 * @file __tests__/studio/studio_jobs_routing_and_entitlements.test.ts
 * @description Unit and Security Test Suite for Studio Jobs API & Entitlements Routing
 *
 * Covers:
 * 1. POST /api/studio/jobs - Authenticated creation & credit deduction (201)
 * 2. POST /api/studio/jobs - Missing/invalid authentication (401)
 * 3. POST /api/studio/jobs - Cross-tenant isolation enforcement (403)
 * 4. POST /api/studio/jobs - Insufficient credits payment hold (402)
 * 5. GET /api/studio/jobs - Unknown job polling (404)
 * 6. GET /api/studio/jobs - Cross-tenant job polling isolation (403)
 * 7. GET /api/studio/jobs - Valid authorized single job polling (200)
 * 8. GET /api/tenants/[tenantSlug]/entitlements - Unauthenticated access (401)
 * 9. GET /api/tenants/[tenantSlug]/entitlements - Cross-tenant access (403)
 * 10. GET /api/tenants/[tenantSlug]/entitlements - Dynamic 'studio' alias resolution (200)
 */

import { NextRequest } from 'next/server';
import { GET as getJobs, POST as postJobs } from '@/app/api/studio/jobs/route';
import { GET as getEntitlements } from '@/app/api/tenants/[tenantSlug]/entitlements/route';
import * as supabaseClientModule from '@/lib/supabaseClient';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import { StudioCreditService } from '@/lib/services/studio-credit.service';

describe('Studio Jobs & Entitlements Routing Security Suite', () => {
  const mockTenantId = 'tenant-alpha-uuid';
  const mockTenantSlug = 'alpha-store';
  const otherTenantSlug = 'beta-store';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockSupabase = (options: {
    singleJob?: any;
    jobNotFound?: boolean;
    insertError?: any;
    tenantsData?: any;
  } = {}) => {
    const tenantRecord = options.tenantsData ?? { id: mockTenantId, slug: mockTenantSlug, tier: 'PRO' };

    return {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: tenantRecord, error: null }),
            single: jest.fn().mockResolvedValue({ data: tenantRecord, error: null }),
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
                single: jest.fn().mockResolvedValue(
                  options.insertError
                    ? { data: null, error: options.insertError }
                    : {
                        data: {
                          id: 'new-job-123',
                          tenant_id: mockTenantId,
                          job_type: 'VIDEO_ADS',
                          status: 'QUEUED',
                          created_at: new Date().toISOString(),
                        },
                        error: null,
                      }
                ),
              }),
            }),
            maybeSingle: jest.fn().mockImplementation(() => {
              if (options.jobNotFound) {
                return Promise.resolve({ data: null, error: null });
              }
              return Promise.resolve({ data: options.singleJob ?? null, error: null });
            }),
            single: jest.fn().mockImplementation(() => {
              if (options.jobNotFound || !options.singleJob) {
                return Promise.resolve({ data: null, error: { message: 'Row not found' } });
              }
              return Promise.resolve({ data: options.singleJob, error: null });
            }),
            then: (resolve: any) => resolve({ data: options.singleJob ? [options.singleJob] : [], error: null }),
          };
        }

        // Default query builder for other tables (e.g. tenant_users)
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
      }),
      rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
    } as any;
  };

  describe('POST /api/studio/jobs', () => {
    it('returns 401 when no session credentials are provided', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({ valid: false } as any);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: mockTenantSlug,
          job_type: 'VIDEO_ADS',
          payload: { prompt: 'Test video' },
        }),
      });

      const res = await postJobs(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when session tenant does not match requested tenant (cross-tenant attack)', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      const mockSupabase = createMockSupabase({
        tenantsData: { id: 'beta-uuid', slug: otherTenantSlug, tier: 'PRO' },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      // Attempt to dispatch job for beta-store with alpha-token
      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer alpha-token',
        },
        body: JSON.stringify({
          tenant_id: otherTenantSlug,
          job_type: 'VIDEO_ADS',
          payload: { prompt: 'Cross tenant attempt' },
        }),
      });

      const res = await postJobs(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it('returns 402 Payment Required when credit reservation fails due to insufficient balance', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      const mockSupabase = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
        success: false,
        message: 'Kredit Studio tidak mencukupi.',
        remainingCredits: 0,
        requiredCredits: 3,
      } as any);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer alpha-token',
        },
        body: JSON.stringify({
          tenant_id: mockTenantSlug,
          job_type: 'VIDEO_ADS',
          payload: { prompt: 'Out of credits' },
        }),
      });

      const res = await postJobs(req);
      const json = await res.json();

      expect(res.status).toBe(402);
      expect(json.success).toBe(false);
      expect(json.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('successfully reserves credits and creates job (201)', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      jest.spyOn(StudioCreditService, 'reserveCredits').mockResolvedValue({
        success: true,
        remainingCredits: 10,
        requiredCredits: 3,
      } as any);

      const mockSupabase = createMockSupabase();
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer alpha-token',
        },
        body: JSON.stringify({
          tenant_id: mockTenantSlug,
          job_type: 'VIDEO_ADS',
          payload: { prompt: 'Scale your SaaS now' },
        }),
      });

      const res = await postJobs(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.job).toBeDefined();
      expect(json.job_id).toBeDefined();
    });
  });

  describe('GET /api/studio/jobs (Polling & Single Job)', () => {
    it('returns 404 when polled job_id does not exist', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      const mockSupabase = createMockSupabase({ jobNotFound: true });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs?job_id=non-existent-uuid', {
        headers: { Authorization: 'Bearer alpha-token' },
      });

      const res = await getJobs(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it('returns 403 when polled job belongs to another tenant', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      // Job belongs to 'beta-store'
      const mockSupabase = createMockSupabase({
        singleJob: {
          id: 'job-beta-1',
          tenant_id: otherTenantSlug,
          status: 'COMPLETED',
          job_type: 'VIDEO_ADS',
        },
      });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs?job_id=job-beta-1', {
        headers: { Authorization: 'Bearer alpha-token' },
      });

      const res = await getJobs(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it('returns 200 with job payload for authorized polling', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      const mockJob = {
        id: 'job-alpha-1',
        tenant_id: mockTenantId,
        status: 'COMPLETED',
        job_type: 'VIDEO_ADS',
        output_url: 'https://assets.boontrack.com/video.mp4',
      };

      const mockSupabase = createMockSupabase({ singleJob: mockJob });
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      const req = new NextRequest('https://studio.boontrack.com/api/studio/jobs?job_id=job-alpha-1', {
        headers: { Authorization: 'Bearer alpha-token' },
      });

      const res = await getJobs(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.job.id).toBe('job-alpha-1');
      expect(json.job.status).toBe('COMPLETED');
    });
  });

  describe('GET /api/tenants/[tenantSlug]/entitlements', () => {
    it('returns 401 when no session is present', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({ valid: false } as any);

      const req = new NextRequest('https://studio.boontrack.com/api/tenants/alpha-store/entitlements');
      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: 'alpha-store' }),
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when session tenant does not match requested tenant slug', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      const req = new NextRequest('https://studio.boontrack.com/api/tenants/beta-store/entitlements', {
        headers: { Authorization: 'Bearer alpha-token' },
      });

      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: 'beta-store' }),
      });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
    });

    it('resolves studio alias to session tenant and returns 200', async () => {
      jest.spyOn(merchantSessionModule, 'extractMerchantSessionToken').mockReturnValue('alpha-token');
      jest.spyOn(merchantSessionModule, 'verifyMerchantSessionToken').mockReturnValue({
        valid: true,
        payload: {
          tenantId: mockTenantId,
          tenantSlug: mockTenantSlug,
          role: 'OWNER',
        },
      } as any);

      jest.spyOn(StudioCreditService, 'getEntitlements').mockResolvedValue({
        tenant_id: mockTenantId,
        tier: 'PRO',
        credits_remaining: 15,
        is_unlimited: false,
      } as any);

      const req = new NextRequest('https://studio.boontrack.com/api/tenants/studio/entitlements', {
        headers: { Authorization: 'Bearer alpha-token' },
      });

      const res = await getEntitlements(req, {
        params: Promise.resolve({ tenantSlug: 'studio' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credits_remaining).toBe(15);
    });
  });
});
