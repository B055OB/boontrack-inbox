/**
 * @file __tests__/studio/jobs.test.ts
 * @description Unit and Regression Test Suite for Studio Render Jobs & Telemetry API
 * Covers:
 * 1. GET /api/studio/jobs: Queries render jobs and calculates live telemetry metrics.
 * 2. Status filtering (COMPLETED, PROCESSING, QUEUED, FAILED).
 * 3. Fallback when Supabase client is offline / unconfigured.
 * 4. Telemetry worker_status state transitions ('ACTIVE_RENDERING' vs 'STANDBY').
 */

import { GET } from '@/app/api/studio/jobs/route';
import * as supabaseClientModule from '@/lib/supabaseClient';

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

  it('calculates correct telemetry counts and active worker status', async () => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: mockJobs, error: null }),
    };

    const mockSupabase: any = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'studio_jobs') return mockQueryBuilder;
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'tenant-123' } }),
          };
        }
        return mockQueryBuilder;
      }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new Request('http://localhost:3000/api/studio/jobs?tenant_id=demo-store');
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

    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: onlyCompletedJobs, error: null }),
    };

    const mockSupabase: any = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new Request('http://localhost:3000/api/studio/jobs');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.telemetry.completed).toBe(1);
    expect(json.telemetry.processing).toBe(0);
    expect(json.telemetry.worker_status).toBe('STANDBY');
  });

  it('gracefully handles missing database client with zeroed telemetry and empty jobs array', async () => {
    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(null as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(null as any);

    const req = new Request('http://localhost:3000/api/studio/jobs');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.jobs).toEqual([]);
    expect(json.telemetry.total).toBe(0);
    expect(json.telemetry.worker_status).toBe('STANDBY');
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
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

    const req = new Request('http://localhost:3000/api/studio/jobs?status=COMPLETED');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(eqMock).toHaveBeenCalledWith('status', 'COMPLETED');
    expect(json.jobs[0].status).toBe('COMPLETED');
    expect(json.jobs[0].output_url).toBe('https://cdn.boontrack.com/videos/job-1.mp4');
  });
});
