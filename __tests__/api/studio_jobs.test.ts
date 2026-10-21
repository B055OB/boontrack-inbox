/**
 * @file __tests__/api/studio_jobs.test.ts
 * @description Security and Multi-Tenant Isolation Test Suite for Studio Jobs API Gateway
 *
 * Verifies CTO Gate Security Rules:
 * - Test 1: GET tanpa session -> 401 Unauthorized.
 * - Test 2: GET dengan tenant yang tidak sesuai -> 403 Forbidden.
 * - Test 3: PATCH tanpa secret worker -> 401 Unauthorized.
 * - Test 4: PATCH dengan secret worker yang valid -> 200 OK.
 * - Test 5 (Bonus): GET dengan tenant yang sah -> 200 OK dengan tenant isolation filter .eq('tenant_id', ...).
 */

import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/studio/jobs/route';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('Studio Jobs API Route - Security & Multi-Tenant Isolation Guard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('GET /api/studio/jobs (Tenant Data Isolation)', () => {
    it('Test 1: GET tanpa session -> 401 Unauthorized', async () => {
      // Mock Supabase available
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'No session' } }),
        },
      };
      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase as any);

      // Request with no Authorization header or auth cookies
      const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=tenant-123');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });

    it('Test 2: GET dengan tenant yang tidak sesuai -> 403 Forbidden', async () => {
      // Attacker user authenticated with a valid session
      const attackerUserId = 'user-attacker-uuid';
      const mockSupabase: any = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: {
              user: {
                id: attackerUserId,
                email: 'attacker@evil.com',
                app_metadata: { role: 'authenticated' },
              },
            },
            error: null,
          }),
        },
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'tenant-victim-uuid',
                  slug: 'victim-store',
                  user_id: 'user-victim-uuid', // Owned by someone else
                  owner_id: 'user-victim-uuid',
                  email: 'victim@store.com',
                },
                error: null,
              }),
            };
          }
          if (table === 'tenant_users') {
            return {
              select: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: [], error: null }), // Attacker is NOT in tenant_users
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
          };
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase as any);

      // Attacker sends valid token but attempts to query tenant-victim-uuid
      const req = new NextRequest('http://localhost:3000/api/studio/jobs?tenant_id=tenant-victim-uuid', {
        headers: {
          authorization: 'Bearer attacker-valid-jwt-token',
        },
      });

      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');
    });

    it('Test 2b (Bonus): GET dengan tenant yang sah -> 200 OK dan terisolasi dengan filter tenant_id', async () => {
      const authorizedUserId = 'user-owner-uuid';
      const verifiedTenantId = 'tenant-owned-uuid';

      const eqFilters: Record<string, any> = {};
      const mockQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation((col: string, val: any) => {
          eqFilters[col] = val;
          return mockQueryBuilder;
        }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) =>
          resolve({
            data: [
              {
                id: 'job-1',
                tenant_id: verifiedTenantId,
                status: 'COMPLETED',
                job_type: 'VIDEO_RENDER',
                created_at: '2026-10-21T00:00:00Z',
              },
            ],
            error: null,
          }),
      };

      const mockSupabase: any = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: {
              user: {
                id: authorizedUserId,
                email: 'owner@legit.com',
                app_metadata: { role: 'authenticated' },
              },
            },
            error: null,
          }),
        },
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: verifiedTenantId,
                  slug: 'legit-store',
                  user_id: authorizedUserId, // User IS the owner
                  owner_id: authorizedUserId,
                  email: 'owner@legit.com',
                },
                error: null,
              }),
            };
          }
          if (table === 'studio_jobs') {
            return mockQueryBuilder;
          }
          return mockQueryBuilder;
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);
      jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase as any);

      const req = new NextRequest(`http://localhost:3000/api/studio/jobs?tenant_id=${verifiedTenantId}`, {
        headers: {
          authorization: 'Bearer owner-valid-token',
        },
      });

      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      // Verify mandatory query filter .eq('tenant_id', verifiedTenantId) was called
      expect(eqFilters['tenant_id']).toBe(verifiedTenantId);
    });
  });

  describe('PATCH /api/studio/jobs (Worker Service Authentication)', () => {
    it('Test 3: PATCH tanpa secret worker -> 401 Unauthorized', async () => {
      process.env.STUDIO_WORKER_SECRET = 'ultra-secure-render-worker-secret-2026';

      // Request with missing secret header
      const req = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          job_id: 'job-123',
          status: 'COMPLETED',
          output_url: 'https://cdn.boon.id/output.mp4',
        }),
      });

      const res = await PATCH(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });

    it('Test 3b: PATCH dengan secret worker yang salah -> 401 Unauthorized', async () => {
      process.env.STUDIO_WORKER_SECRET = 'ultra-secure-render-worker-secret-2026';

      const req = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': 'wrong-secret',
        },
        body: JSON.stringify({
          job_id: 'job-123',
          status: 'COMPLETED',
        }),
      });

      const res = await PATCH(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Unauthorized');
    });

    it('Test 4: PATCH dengan secret worker yang valid -> 200 OK', async () => {
      const validSecret = 'ultra-secure-render-worker-secret-2026';
      process.env.STUDIO_WORKER_SECRET = validSecret;

      const updatePayloadRecorded: any = {};
      const mockSupabaseAdmin: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'studio_jobs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'job-abc-123',
                  tenant_id: 'tenant-xyz-789',
                  status: 'PROCESSING',
                },
                error: null,
              }),
              update: jest.fn().mockImplementation((payload: any) => {
                Object.assign(updatePayloadRecorded, payload);
                return {
                  eq: jest.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
          };
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabaseAdmin as any);

      const req = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': validSecret,
        },
        body: JSON.stringify({
          job_id: 'job-abc-123',
          status: 'COMPLETED',
          output_url: 'https://cdn.boon.id/renders/job-abc-123.mp4',
        }),
      });

      const res = await PATCH(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.job_id).toBe('job-abc-123');
      expect(json.status).toBe('COMPLETED');
      expect(json.output_url).toBe('https://cdn.boon.id/renders/job-abc-123.mp4');
      expect(updatePayloadRecorded.status).toBe('COMPLETED');
      expect(updatePayloadRecorded.output_url).toBe('https://cdn.boon.id/renders/job-abc-123.mp4');
    });

    it('Test 4b: PATCH dengan Authorization Bearer secret yang valid -> 200 OK', async () => {
      const validSecret = 'ultra-secure-render-worker-secret-2026';
      process.env.INTERNAL_WORKER_SECRET = validSecret;

      const mockSupabaseAdmin: any = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'studio_jobs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'job-def-456',
                  tenant_id: 'tenant-xyz-789',
                  status: 'QUEUED',
                },
                error: null,
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          return {};
        }),
      };

      jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabaseAdmin as any);

      const req = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSecret}`,
        },
        body: JSON.stringify({
          job_id: 'job-def-456',
          status: 'PROCESSING',
        }),
      });

      const res = await PATCH(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.job_id).toBe('job-def-456');
      expect(json.status).toBe('PROCESSING');
    });
  });
});
