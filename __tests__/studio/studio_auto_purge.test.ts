/**
 * @file __tests__/studio/studio_auto_purge.test.ts
 * @description Unit tests for Studio Auto-Purge Storage Worker & Download Tracking.
 */

import { StudioPurgeService } from '@/lib/services/studio-purge.service';
import { POST as trackDownloadHandler } from '@/app/api/studio/renders/[id]/track-download/route';
import { GET as autoPurgeCronHandler } from '@/app/api/studio/cron/auto-purge/route';
import type { NextRequest } from 'next/server';

interface MockJob {
  id: string;
  tenant_id: string;
  status: string;
  output_url: string | null;
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
}

let mockJobs: MockJob[] = [];

// Mock Supabase
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabase: jest.fn(() => createMockSupabase()),
    getSupabaseAdmin: jest.fn(() => createMockSupabase()),
  };
});

function createMockSupabase() {
  return {
    from: (table: string) => {
      let filters: { field: string; op: string; val: any }[] = [];
      let notNullFilterField: string | null = null;

      const builder: any = {
        select: () => builder,
        eq: (field: string, val: any) => {
          filters.push({ field, op: 'eq', val });
          return builder;
        },
        not: (field: string, op: string, val: any) => {
          if (op === 'is' && val === null) {
            notNullFilterField = field;
          }
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const idFilter = filters.find(f => f.field === 'id');
          if (idFilter) {
            const found = mockJobs.find(j => j.id === idFilter.val);
            return { data: found || null, error: null };
          }
          return { data: mockJobs[0] || null, error: null };
        },
        update: (updates: any) => {
          return {
            eq: async (field: string, val: any) => {
              if (field === 'id') {
                const idx = mockJobs.findIndex(j => j.id === val);
                if (idx !== -1) {
                  mockJobs[idx] = {
                    ...mockJobs[idx],
                    ...updates,
                    payload: updates.payload !== undefined ? updates.payload : mockJobs[idx].payload,
                  };
                  return { data: mockJobs[idx], error: null };
                }
              }
              return { data: null, error: null };
            },
          };
        },
        then: (resolve: any) => {
          let result = [...mockJobs];
          if (filters.some(f => f.field === 'status' && f.val === 'COMPLETED')) {
            result = result.filter(j => j.status === 'COMPLETED');
          }
          if (notNullFilterField === 'output_url') {
            result = result.filter(j => j.output_url !== null);
          }
          resolve({ data: result, error: null });
        },
      };

      return builder;
    },
    storage: {
      from: () => ({
        remove: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
  };
}

describe('Studio Auto-Purge Storage & Download Tracking Suite', () => {
  beforeEach(() => {
    mockJobs = [];
    jest.clearAllMocks();
  });

  it('1. tracks download timestamp via StudioPurgeService.trackDownload', async () => {
    const testJobId = '11111111-2222-3333-4444-555555555555';
    mockJobs = [
      {
        id: testJobId,
        tenant_id: 'tenant-123',
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/video_001.mp4',
        payload: {
          product_name: 'Serum Wajah',
          hook: 'Rahasia glowing alami',
          scenes: [{ scene: 1 }],
        },
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ];

    const result = await StudioPurgeService.trackDownload(testJobId);

    expect(result.success).toBe(true);
    expect(result.job_id).toBe(testJobId);
    expect(result.downloaded_at).toBeDefined();

    // Verify metadata updated in database
    const updated = mockJobs.find(j => j.id === testJobId);
    expect(updated?.payload.downloaded_at).toBeDefined();
    expect(updated?.payload.download_count).toBe(1);
    // Record naskah teks & hook tetap utuh
    expect(updated?.payload.hook).toBe('Rahasia glowing alami');
  });

  it('2. tracks download via API endpoint /api/studio/renders/[id]/track-download', async () => {
    const testJobId = '22222222-3333-4444-5555-666666666666';
    mockJobs = [
      {
        id: testJobId,
        tenant_id: 'tenant-123',
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/video_002.mp4',
        payload: { product_name: 'Kuras Toren' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const req = {
      url: `https://studio.boontrack.com/api/studio/renders/${testJobId}/track-download`,
      method: 'POST',
    } as unknown as NextRequest;

    const res = await trackDownloadHandler(req, {
      params: Promise.resolve({ id: testJobId }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.job_id).toBe(testJobId);
  });

  it('3. Auto-Purge Rule A: purges MP4 if downloaded_at is older than 24 hours while preserving script records', async () => {
    const downloadedOver24hAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const jobAId = 'aaaaaaaa-1111-2222-3333-444444444444';

    mockJobs = [
      {
        id: jobAId,
        tenant_id: 'tenant-123',
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/video_downloaded.mp4',
        payload: {
          product_name: 'Serum Glow',
          hook: 'Naskah Penting Yang Harus Tetap Ada',
          scenes: [1, 2, 3],
          ads_copy: { headlines: ['Beli Sekarang'] },
          downloaded_at: downloadedOver24hAgo,
        },
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        updated_at: downloadedOver24hAgo,
      },
    ];

    const report = await StudioPurgeService.purgeExpiredRenders();

    expect(report.success).toBe(true);
    expect(report.purged_count).toBe(1);

    const updatedJob = mockJobs.find(j => j.id === jobAId);
    // File fisik di storage dibersihkan: output_url menjadi null
    expect(updatedJob?.output_url).toBeNull();
    expect(updatedJob?.payload.is_purged).toBe(true);
    expect(updatedJob?.payload.purge_reason).toBe('DOWNLOADED_OVER_24H');
    expect(updatedJob?.payload.archived_output_url).toBe('https://assets.boontrack.com/renders/video_downloaded.mp4');

    // Naskah, hook, scene, dan ads_copy TETAP UTUH di database
    expect(updatedJob?.payload.hook).toBe('Naskah Penting Yang Harus Tetap Ada');
    expect(updatedJob?.payload.scenes).toEqual([1, 2, 3]);
    expect(updatedJob?.payload.ads_copy).toBeDefined();
  });

  it('4. Auto-Purge Rule B: purges undownloaded MP4 if older than 7 days while preserving script records', async () => {
    const createdOver7DaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const jobBId = 'bbbbbbbb-2222-3333-4444-555555555555';

    mockJobs = [
      {
        id: jobBId,
        tenant_id: 'tenant-123',
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/video_expired_7d.mp4',
        payload: {
          product_name: 'Jasa Servis AC',
          hook: 'Hook AC Bocor',
          scenes: [{ scene: 1 }],
          // Belum diunduh (tidak ada downloaded_at)
        },
        created_at: createdOver7DaysAgo,
        updated_at: createdOver7DaysAgo,
      },
    ];

    const report = await StudioPurgeService.purgeExpiredRenders();

    expect(report.success).toBe(true);
    expect(report.purged_count).toBe(1);

    const updatedJob = mockJobs.find(j => j.id === jobBId);
    expect(updatedJob?.output_url).toBeNull();
    expect(updatedJob?.payload.is_purged).toBe(true);
    expect(updatedJob?.payload.purge_reason).toBe('EXPIRED_OVER_7D');

    // Naskah dan hook tetap utuh
    expect(updatedJob?.payload.hook).toBe('Hook AC Bocor');
  });

  it('5. Retains fresh renders (under 24h since download, under 7 days without download)', async () => {
    const freshJobId = 'cccccccc-3333-4444-5555-666666666666';
    const downloaded2HoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    mockJobs = [
      {
        id: freshJobId,
        tenant_id: 'tenant-123',
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/fresh_video.mp4',
        payload: {
          product_name: 'Fresh Render',
          downloaded_at: downloaded2HoursAgo, // Baru 2 jam, belum lewat 24 jam!
        },
        created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        updated_at: downloaded2HoursAgo,
      },
    ];

    const report = await StudioPurgeService.purgeExpiredRenders();

    expect(report.success).toBe(true);
    expect(report.purged_count).toBe(0);
    expect(report.retained_count).toBe(1);

    const job = mockJobs.find(j => j.id === freshJobId);
    expect(job?.output_url).toBe('https://assets.boontrack.com/renders/fresh_video.mp4');
    expect(job?.payload.is_purged).toBeUndefined();
  });

  it('6. executes cron endpoint /api/studio/cron/auto-purge successfully', async () => {
    const req = {
      headers: new Headers(),
      nextUrl: new URL('https://studio.boontrack.com/api/studio/cron/auto-purge'),
    } as unknown as NextRequest;

    const res = await autoPurgeCronHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.timestamp).toBeDefined();
  });
});
