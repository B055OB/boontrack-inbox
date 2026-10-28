/**
 * @file __tests__/studio/jobs.test.ts
 * @description Unit and Regression Test Suite for Studio Render Jobs & Telemetry API
 * Covers:
 * 1. GET /api/studio/jobs: Queries render jobs and calculates live telemetry metrics.
 * 2. Status filtering (COMPLETED, PROCESSING, QUEUED, FAILED).
 * 3. Handling when Supabase client is offline / unconfigured (500).
 * 4. Telemetry worker_status state transitions ('ACTIVE_RENDERING' vs 'STANDBY').
 */

import { GET } from '@/app/api/studio/jobs/route';
import * as supabaseClientModule from '@/lib/supabaseClient';
import { NextRequest } from 'next/server';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

describe('Studio Render Jobs & Telemetry API Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockJobs = [
    {
      id: 'job-1',
      tenant_id: 'tenant-123',
      user_id: 'user-123',
      status: 'COMPLETED',
      job_type: 'FFMPEG_FCD_BATCH',
      payload: {
        product_name: 'Serum Retinol Pro',
        variation_index: 1,
        filename: 'serum-retinol-pro_VAR1_HookA_CTA1.mp4',
        hook: 'Stop scroll kalau kamu masih mikir...',
      },
      output_url: 'https://cdn.boontrack.com/videos/job-1.mp4',
      created_at: '2026-10-09T01:00:00.000Z',
      updated_at: '2026-10-09T01:01:00.000Z',
    },
    {
      id: 'job-2',
      tenant_id: 'tenant-123',
      user_id: 'user-123',
      status: 'PROCESSING',
      job_type: 'FFMPEG_FCD_BATCH',
      payload: {
        product_name: 'Serum Retinol Pro',
        variation_index: 2,
        filename: 'serum-retinol-pro_VAR2_HookB_CTA1.mp4',
      },
      output_url: null,
      created_at: '2026-10-09T01:02:00.000Z',
      updated_at: '2026-10-09T01:02:30.000Z',
    },
    {
      id: 'job-3',
      tenant_id: 'tenant-123',
      user_id: 'user-123',
      status: 'QUEUED',
      job_type: 'FFMPEG_FCD_BATCH',
      payload: {
        product_name: 'Serum Retinol Pro',
        variation_index: 3,
        filename: 'serum-retinol-pro_VAR3_HookC_CTA2.mp4',
      },
      output_url: null,
      created_at: '2026-10-09T01:03:00.000Z',
      updated_at: '2026-10-09T01:03:00.000Z',
    },
    {
      id: 'job-4',
      tenant_id: 'tenant-123',
      user_id: 'user-123',
      status: 'FAILED',
      job_type: 'FFMPEG_FCD_BATCH',
      payload: {
        product_name: 'Serum Retinol Pro',
      },
      output_url: null,
      error_message: 'FFmpeg codec transcode timeout',
      created_at: '2026-10-09T00:50:00.000Z',
      updated_at: '2026-10-09T00:52:00.000Z',
    },
  ];

  const createMockSupabase = (jobsData: any[]) => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: jobsData, error: null }),
    };

    return {
      rpc: jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'user-123@example.com',
              app_metadata: { role: 'authenticated' },
            },
          },
          error: null,
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'studio_jobs') return mockQueryBuilder;
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-123',
                slug: 'demo-store',
                user_id: 'user-123',
                owner_id: 'user-123',
              },
            }),
          };
        }
        return mockQueryBuilder;
      }),
    };
  };

  it('calculates correct telemetry counts and active worker status', async () => {
    const mockSupabase = createMockSupabase(mockJobs);
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=demo-store', {
      headers: { authorization: 'Bearer valid-test-token' },
    });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.count).toBe(4);
    expect(json.telemetry.total).toBe(4);
    expect(json.telemetry.completed).toBe(1);
    expect(json.telemetry.processing).toBe(1);
    expect(json.telemetry.queued).toBe(1);
    expect(json.telemetry.failed).toBe(1);
    // Because processing > 0, worker_status must be ACTIVE_RENDERING
    expect(json.telemetry.worker_status).toBe('ACTIVE_RENDERING');
  });

  it('sets worker_status to STANDBY when no jobs are currently processing', async () => {
    const onlyCompletedJobs = [mockJobs[0], mockJobs[3]]; // completed + failed only
    const mockSupabase = createMockSupabase(onlyCompletedJobs);
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=demo-store', {
      headers: { authorization: 'Bearer valid-test-token' },
    });
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.telemetry.completed).toBe(1);
    expect(json.telemetry.processing).toBe(0);
    expect(json.telemetry.worker_status).toBe('STANDBY');
  });

  it('gracefully handles missing database client with 500 status', async () => {
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(null as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(null as any);

    const req = new NextRequest('http://localhost:3000/api/studio/jobs', {
      headers: { authorization: 'Bearer valid-test-token' },
    });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('supports status query filtering parameter', async () => {
    const eqMock = jest.fn().mockReturnThis();
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: eqMock,
      then: (resolve: any) => resolve({ data: [mockJobs[0]], error: null }),
    };

    const mockSupabase: any = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'user-123@example.com' },
          },
          error: null,
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'studio_jobs') return mockQueryBuilder;
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'tenant-123', user_id: 'user-123' },
            }),
          };
        }
        return mockQueryBuilder;
      }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=tenant-123&status=COMPLETED', {
      headers: { authorization: 'Bearer valid-test-token' },
    });
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(eqMock).toHaveBeenCalledWith('status', 'COMPLETED');
    expect(json.jobs[0].status).toBe('COMPLETED');
    expect(json.jobs[0].output_url).toBe('https://cdn.boontrack.com/videos/job-1.mp4');
  });

  it('authenticates successfully using signed bt_merchant_token session cookie', async () => {
    const validToken = signMerchantSessionToken({
      tenantSlug: 'demo-store',
      tenantId: 'tenant-123',
      role: 'OWNER',
    });
    const mockSupabase = createMockSupabase(mockJobs);
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=demo-store', {
      headers: {
        cookie: `bt_merchant_token=${validToken}`,
      },
    });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.count).toBe(4);
    expect(json.telemetry.total).toBe(4);
  });
});
