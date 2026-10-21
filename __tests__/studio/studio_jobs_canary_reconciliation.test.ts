/**
 * @file __tests__/studio/studio_jobs_canary_reconciliation.test.ts
 * @description Executive Canary Testing Suite for Studio Jobs API & Credit Reconciliation
 *
 * Verifies End-to-End Pipeline & CTO Safeguards:
 * 1. Happy Path: Job creation with credit reservation, PATCH with valid x-worker-secret -> COMPLETED, credits consumed.
 * 2. Failure & Auto-Refund: Job creation with credit reservation, PATCH with status FAILED -> Auto-refund triggered,
 *    credits restored, and idempotent retry does NOT double-refund.
 * 3. Cross-Tenant Security: GET /api/studio/jobs using session from another tenant -> 403 Forbidden with zero data leak.
 */

import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/studio/jobs/route';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('CANARY TEST: Studio Jobs API & Credit Reconciliation Gateway', () => {
  const originalEnv = process.env;
  const CANARY_WORKER_SECRET = 'canary-worker-secret-prod-2026';

  // Test Tenant & User UUIDs
  const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
  const TEST_TENANT_SLUG = 'canary-pilot-tenant';
  const TEST_OWNER_ID = '11111111-1111-4000-8000-111111111111';

  // Cross-Tenant Attacker UUIDs
  const ATTACKER_TENANT_ID = '00000000-0000-4000-8000-000000000002';
  const ATTACKER_USER_ID = '22222222-2222-4000-8000-222222222222';

  // In-Memory Simulated Database State
  let inMemoryTenants: Record<string, any> = {};
  let inMemoryEntitlements: Record<string, any> = {};
  let inMemoryLedger: Array<any> = [];
  let inMemoryJobs: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      STUDIO_WORKER_SECRET: CANARY_WORKER_SECRET,
      INTERNAL_WORKER_SECRET: CANARY_WORKER_SECRET,
    };

    // Initialize clean state for tenant
    inMemoryTenants = {
      [TEST_TENANT_ID]: {
        id: TEST_TENANT_ID,
        slug: TEST_TENANT_SLUG,
        name: 'Canary Pilot Store',
        user_id: TEST_OWNER_ID,
        owner_id: TEST_OWNER_ID,
        email: 'owner@canary.boontrack.com',
      },
      [ATTACKER_TENANT_ID]: {
        id: ATTACKER_TENANT_ID,
        slug: 'attacker-store',
        name: 'Attacker Store',
        user_id: ATTACKER_USER_ID,
        owner_id: ATTACKER_USER_ID,
        email: 'attacker@evil.com',
      },
    };

    inMemoryEntitlements = {
      [TEST_TENANT_ID]: {
        tenant_id: TEST_TENANT_ID,
        credits_remaining: 50, // Initial balance: 50 Credits
        is_unlimited: false,
        tier: 'PRO_SCALE',
      },
    };

    inMemoryLedger = [];
    inMemoryJobs = {};

    // Mock Supabase Admin & Public Client for in-memory fidelity
    const mockSupabase: any = {
      auth: {
        getUser: jest.fn().mockImplementation(async (token?: string) => {
          if (!token || token === 'invalid') {
            return { data: { user: null }, error: { message: 'Invalid or missing JWT' } };
          }
          if (token === 'bearer-owner-token') {
            return {
              data: {
                user: {
                  id: TEST_OWNER_ID,
                  email: 'owner@canary.boontrack.com',
                  app_metadata: { role: 'authenticated' },
                },
              },
              error: null,
            };
          }
          if (token === 'bearer-attacker-token') {
            return {
              data: {
                user: {
                  id: ATTACKER_USER_ID,
                  email: 'attacker@evil.com',
                  app_metadata: { role: 'authenticated' },
                },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: 'Unknown token' } };
        }),
      },
      rpc: jest.fn().mockImplementation(async (procName: string) => {
        if (procName === 'fn_release_studio_credits') {
          // Fall back to direct atomic fallback logic in StudioCreditService
          return { data: null, error: { message: 'RPC not installed, using fallback' } };
        }
        return { data: null, error: null };
      }),
      from: jest.fn().mockImplementation((table: string) => {
        const currentEqFilters: Record<string, any> = {};

        const queryObj: any = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockImplementation(async (payload: any) => {
            if (table === 'tenant_credit_ledger') {
              const rows = Array.isArray(payload) ? payload : [payload];
              inMemoryLedger.push(...rows);
              return { data: rows, error: null };
            }
            if (table === 'studio_jobs') {
              const row = Array.isArray(payload) ? payload[0] : payload;
              inMemoryJobs[row.id] = { ...row, created_at: new Date().toISOString() };
              return { data: [row], error: null };
            }
            return { data: null, error: null };
          }),
          update: jest.fn().mockImplementation((updatePayload: any) => {
            return {
              eq: jest.fn().mockImplementation(async (col: string, val: any) => {
                if (table === 'tenant_entitlements' && col === 'tenant_id') {
                  if (inMemoryEntitlements[val]) {
                    Object.assign(inMemoryEntitlements[val], updatePayload);
                  }
                  return { data: inMemoryEntitlements[val], error: null };
                }
                if (table === 'studio_jobs' && col === 'id') {
                  if (inMemoryJobs[val]) {
                    Object.assign(inMemoryJobs[val], updatePayload);
                  }
                  return { data: inMemoryJobs[val], error: null };
                }
                if (table === 'tenant_credit_ledger') {
                  return { data: null, error: null };
                }
                return { data: null, error: null };
              }),
            };
          }),
          eq: jest.fn().mockImplementation((col: string, val: any) => {
            currentEqFilters[col] = val;
            return queryObj;
          }),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockImplementation(async () => {
            if (table === 'tenants') {
              return { data: inMemoryTenants[TEST_TENANT_ID], error: null };
            }
            if (table === 'tenant_entitlements') {
              return { data: inMemoryEntitlements[TEST_TENANT_ID], error: null };
            }
            if (table === 'studio_jobs') {
              const jobId = currentEqFilters['id'];
              if (jobId && inMemoryJobs[jobId]) {
                return { data: inMemoryJobs[jobId], error: null };
              }
              const allJobs = Object.values(inMemoryJobs);
              return { data: allJobs[allJobs.length - 1] || null, error: null };
            }
            if (table === 'tenant_credit_ledger') {
              const jobId = currentEqFilters['job_id'];
              const type = currentEqFilters['type'];
              const found = inMemoryLedger.find((l) => {
                if (jobId && l.job_id !== jobId) return false;
                if (type && l.type !== type) return false;
                return true;
              });
              return { data: found || null, error: null };
            }
            return { data: null, error: null };
          }),
          then: (resolve: any) => {
            if (table === 'studio_jobs') {
              resolve({ data: Object.values(inMemoryJobs), error: null });
            } else if (table === 'tenant_users') {
              resolve({ data: [], error: null });
            } else {
              resolve({ data: [], error: null });
            }
          },
        };
        return queryObj;
      }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase as any);

    // Spy on resolveTenant and getEntitlements
    jest.spyOn(StudioCreditService, 'resolveTenant').mockResolvedValue(inMemoryTenants[TEST_TENANT_ID]);
    jest.spyOn(StudioCreditService, 'getEntitlements').mockImplementation(async () => {
      return inMemoryEntitlements[TEST_TENANT_ID];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('1. Uji Job Sukses (Happy Path)', () => {
    it('membuat 1 job baru, memotong 3 kredit, dan menyelesaikan via PATCH worker secret -> COMPLETED (200 OK)', async () => {
      const jobId = 'job-canary-success-001';
      const requiredCredits = 3;

      // 1. Simulasikan pembuatan job baru dengan reservasi kredit
      const initialBalance = inMemoryEntitlements[TEST_TENANT_ID].credits_remaining; // 50
      expect(initialBalance).toBe(50);

      const reserveResult = await StudioCreditService.reserveCredits(
        TEST_TENANT_ID,
        requiredCredits,
        'Render video canary MP4 otomatis: UGC Test Campaign',
        jobId
      );

      expect(reserveResult.success).toBe(true);
      expect(reserveResult.credits_remaining).toBe(47);
      expect(inMemoryEntitlements[TEST_TENANT_ID].credits_remaining).toBe(47);

      // Simpan job ke DB dengan status QUEUED
      inMemoryJobs[jobId] = {
        id: jobId,
        tenant_id: TEST_TENANT_ID,
        user_id: TEST_OWNER_ID,
        status: 'QUEUED',
        job_type: 'FFMPEG_LEVEL_1',
        output_url: null,
      };

      // 2. Kirim PATCH /api/studio/jobs dengan x-worker-secret valid dan status COMPLETED
      const patchReq = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': CANARY_WORKER_SECRET,
        },
        body: JSON.stringify({
          job_id: jobId,
          status: 'COMPLETED',
          output_url: 'https://cdn.boon.id/studio-renders/canary-success-001.mp4',
        }),
      });

      const patchRes = await PATCH(patchReq);
      const patchJson = await patchRes.json();

      // 3. Verifikasi response dan state di database
      expect(patchRes.status).toBe(200);
      expect(patchJson.success).toBe(true);
      expect(patchJson.status).toBe('COMPLETED');
      expect(patchJson.output_url).toBe('https://cdn.boon.id/studio-renders/canary-success-001.mp4');
      expect(patchJson.refunded).toBe(false);

      // Pastikan status di DB terupdate menjadi COMPLETED
      expect(inMemoryJobs[jobId].status).toBe('COMPLETED');
      expect(inMemoryJobs[jobId].output_url).toBe('https://cdn.boon.id/studio-renders/canary-success-001.mp4');

      // Pastikan saldo kredit tetap terpotong (47 kredit, tidak ada refund)
      expect(inMemoryEntitlements[TEST_TENANT_ID].credits_remaining).toBe(47);

      console.log(`[CANARY TEST 1 - SUCCESS PATH] Job ${jobId} COMPLETED | Saldo Kredit: 47 (Potong ${requiredCredits} Credits) | Status: 200 OK`);
    });
  });

  describe('2. Uji Job Gagal & Auto-Refund (Idempotent Safeguard)', () => {
    it('membuat job gagal, melakukan auto-refund saldo kredit, dan menjamin idempotensi pada pemanggilan berulang', async () => {
      const jobId = 'job-canary-failed-002';
      const requiredCredits = 3;

      // 1. Simulasikan pembuatan job baru dengan reservasi 3 kredit dari saldo awal (50)
      const reserveResult = await StudioCreditService.reserveCredits(
        TEST_TENANT_ID,
        requiredCredits,
        'Render video canary MP4 otomatis: Fail Probe',
        jobId
      );

      expect(reserveResult.success).toBe(true);
      expect(reserveResult.credits_remaining).toBe(47); // 50 - 3 = 47
      expect(inMemoryEntitlements[TEST_TENANT_ID].credits_remaining).toBe(47);

      inMemoryJobs[jobId] = {
        id: jobId,
        tenant_id: TEST_TENANT_ID,
        user_id: TEST_OWNER_ID,
        status: 'PROCESSING',
        output_url: null,
      };

      // 2. Kirim PATCH /api/studio/jobs dengan status FAILED
      const patchFailReq1 = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': CANARY_WORKER_SECRET,
        },
        body: JSON.stringify({
          job_id: jobId,
          status: 'FAILED',
          error_message: 'Worker FFmpeg SIGKILL: GPU memory allocation timeout',
        }),
      });

      const patchFailRes1 = await PATCH(patchFailReq1);
      const patchFailJson1 = await patchFailRes1.json();

      // 3. Verifikasi auto-refund pertama
      expect(patchFailRes1.status).toBe(200);
      expect(patchFailJson1.success).toBe(true);
      expect(patchFailJson1.status).toBe('FAILED');
      expect(patchFailJson1.refunded).toBe(true);
      expect(inMemoryJobs[jobId].status).toBe('FAILED');

      // Saldo kredit harus kembali pulih +3 (dari 47 menjadi 50)
      expect(inMemoryEntitlements[TEST_TENANT_ID].credits_remaining).toBe(50);

      console.log(`[CANARY TEST 2 - AUTO-REFUND 1] Job ${jobId} FAILED -> Auto-Refund executed | Saldo Pulih: 50 Credits`);

      // 4. Uji Idempotensi: Panggil ulang PATCH FAILED dengan job_id yang sama
      const patchFailReq2 = new NextRequest('http://localhost:3000/api/studio/jobs', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': CANARY_WORKER_SECRET,
        },
        body: JSON.stringify({
          job_id: jobId,
          status: 'FAILED',
          error_message: 'Worker FFmpeg SIGKILL retry ping',
        }),
      });

      const patchFailRes2 = await PATCH(patchFailReq2);
      const patchFailJson2 = await patchFailRes2.json();

      expect(patchFailRes2.status).toBe(200);
      expect(patchFailJson2.success).toBe(true);
      expect(patchFailJson2.status).toBe('FAILED');

      // Pastikan saldo TIDAK bertambah lagi (tetap 50, bukan 53)
      expect(inMemoryEntitlements[TEST_TENANT_ID].credits_remaining).toBe(50);

      console.log(`[CANARY TEST 2 - IDEMPOTENCY CHECK] Re-run PATCH FAILED for ${jobId} -> Saldo Tetap 50 (Zero Double-Refund Guard Passed)`);
    });
  });

  describe('3. Uji Cross-Tenant Security', () => {
    it('menolak akses GET /api/studio/jobs dari akun tenant lain dengan HTTP 403 Forbidden dan tidak membocorkan metadata', async () => {
      // Mock lookup: saat request query data TEST_TENANT_ID
      const req = new NextRequest(`http://localhost:3000/api/studio/jobs?tenant_id=${TEST_TENANT_ID}`, {
        method: 'GET',
        headers: {
          authorization: 'Bearer bearer-attacker-token', // Sesi milik ATTACKER_USER_ID
        },
      });

      const res = await GET(req);
      const json = await res.json();

      // Verifikasi HTTP 403 Forbidden
      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Forbidden');

      // Pastikan response tidak mengandung metadata job tenant uji
      expect(json.jobs).toBeUndefined();
      expect(json.telemetry).toBeUndefined();
      expect(json.count).toBeUndefined();

      console.log(`[CANARY TEST 3 - CROSS-TENANT ISOLATION] Attacker access to ${TEST_TENANT_ID} rejected with 403 Forbidden | Data Leak: ZERO`);
    });
  });
});
