/**
 * tests/studio_security_remediation_regression.test.ts
 * Comprehensive Security Regression & Authorization Test Suite
 * Baseline: f811a45dee801b48151761e14818059fdf7ba88b
 *
 * Scope: SEC-P0-01 through SEC-P1-03
 * Verifies code remediation, negative exploit blocking, and positive authorization.
 */

import { NextRequest } from 'next/server';
import dns from 'dns';
import {
  signHostSessionToken,
  revokeHostSession,
  resetRevokedJtiCache,
} from '@/lib/auth/host-session';
import { isPrivateOrBlockedIp, isAllowedStorageHostname, validateDownloadUrl, safeFetchMediaAsset } from '@/lib/security/ssrf-guard';
import { GET as downloadGet } from '@/app/api/studio/download/route';
import { POST as dispatchPost, GET as dispatchGet } from '@/app/api/studio/render/dispatch/route';
import { POST as batchPost } from '@/app/api/studio/render/batch/route';
import { POST as scriptGeneratePost } from '@/app/api/studio/script/generate/route';
import { GET as renderGet, POST as renderPost } from '@/app/api/studio/render/route';
import { GET as scriptsGet, POST as scriptsPost } from '@/app/api/studio/scripts/route';
import { POST as sessionLogoutPost } from '@/app/api/auth/session/route';
import { POST as trackDownloadPost, GET as trackDownloadGet } from '@/app/api/studio/renders/[id]/track-download/route';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { StudioPurgeService } from '@/lib/services/studio-purge.service';
import * as supabaseModule from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient', () => {
  const original = jest.requireActual('@/lib/supabaseClient');
  return {
    ...original,
    getSupabaseAdmin: jest.fn(),
    getSupabase: jest.fn(),
  };
});

describe('CTO REMEDIATION REGRESSION SUITE: SEC-P0-01 through SEC-P1-03', () => {
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_A_SLUG = 'tenant-a-store';
  const USER_A = 'u0000000-0000-0000-0000-000000000001';

  const TENANT_B = 'b0000000-0000-0000-0000-000000000002';
  const TENANT_B_SLUG = 'tenant-b-store';
  const USER_B = 'u0000000-0000-0000-0000-000000000002';

  let tokenA: string;
  let tokenB: string;
  let expiredToken: string;
  let mockSupabase: any;
  let mockJobsDb: Map<string, any>;
  let mockScriptsDb: Map<string, any>;
  let mockCreditsDb: Map<string, number>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRevokedJtiCache();

    mockJobsDb = new Map();
    mockScriptsDb = new Map();
    mockCreditsDb = new Map([
      [TENANT_A, 50],
      [TENANT_B, 20],
    ]);

    // Setup valid tokens
    tokenA = signHostSessionToken({
      product: 'studio',
      userId: USER_A,
      tenantId: TENANT_A,
      tenantSlug: TENANT_A_SLUG,
    });

    tokenB = signHostSessionToken({
      product: 'studio',
      userId: USER_B,
      tenantId: TENANT_B,
      tenantSlug: TENANT_B_SLUG,
    });

    // Expired token (issued in the past, exp = now - 3600)
    expiredToken = signHostSessionToken({
      product: 'studio',
      userId: USER_A,
      tenantId: TENANT_A,
      tenantSlug: TENANT_A_SLUG,
      ttlSeconds: -3600,
    });

    // Mock Supabase Database
    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn((field: string, val: string) => ({
              maybeSingle: jest.fn().mockImplementation(async () => {
                if (val === TENANT_A || val === TENANT_A_SLUG) {
                  return { data: { id: TENANT_A, slug: TENANT_A_SLUG, tier: 'PRO', metadata: {} }, error: null };
                }
                if (val === TENANT_B || val === TENANT_B_SLUG) {
                  return { data: { id: TENANT_B, slug: TENANT_B_SLUG, tier: 'PRO', metadata: {} }, error: null };
                }
                return { data: null, error: null };
              }),
            })),
          };
        }

        if (table === 'studio_jobs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any, field: string, val: string) {
              this._filters = this._filters || {};
              this._filters[field] = val;
              return this;
            }),
            maybeSingle: jest.fn(function (this: any) {
              const filters = this._filters || {};
              for (const [id, job] of mockJobsDb.entries()) {
                let match = true;
                if (filters.id && job.id !== filters.id) match = false;
                if (filters.tenant_id && job.tenant_id !== filters.tenant_id) match = false;
                if (match) return Promise.resolve({ data: job, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }),
            insert: jest.fn(async (rows: any) => {
              const list = Array.isArray(rows) ? rows : [rows];
              for (const r of list) {
                mockJobsDb.set(r.id, { ...r, created_at: new Date().toISOString() });
              }
              return { data: list, error: null };
            }),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            update: jest.fn((updates: any) => ({
              eq: jest.fn(async (field: string, val: string) => {
                if (field === 'id' && mockJobsDb.has(val)) {
                  const existing = mockJobsDb.get(val);
                  mockJobsDb.set(val, {
                    ...existing,
                    ...updates,
                    payload: { ...(existing?.payload || {}), ...(updates?.payload || {}) },
                  });
                }
                return { data: null, error: null };
              }),
            })),
          };
        }

        if (table === 'studio_scripts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(function (this: any, field: string, val: string) {
              this._filters = this._filters || {};
              this._filters[field] = val;
              return this;
            }),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn(function (this: any, num: number) {
              const filters = this._filters || {};
              const result = [];
              for (const [id, script] of mockScriptsDb.entries()) {
                if (!filters.tenant_id || script.tenant_id === filters.tenant_id) {
                  result.push(script);
                }
              }
              return Promise.resolve({ data: result.slice(0, num), error: null });
            }),
            insert: jest.fn((payload: any) => {
              const id = crypto.randomUUID();
              const rec = { id, ...payload };
              mockScriptsDb.set(id, rec);
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: rec, error: null }),
                }),
              };
            }),
          };
        }

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    (supabaseModule.getSupabaseAdmin as jest.Mock).mockReturnValue(mockSupabase);
    (supabaseModule.getSupabase as jest.Mock).mockReturnValue(mockSupabase);

    // Mock StudioCreditService
    jest.spyOn(StudioCreditService, 'reserveCredits').mockImplementation(
      async (tenantIdOrSlug: string, amount: number, desc?: string, jobId?: string) => {
        const tenantId = tenantIdOrSlug === TENANT_A_SLUG ? TENANT_A : (tenantIdOrSlug === TENANT_B_SLUG ? TENANT_B : tenantIdOrSlug);
        const current = mockCreditsDb.get(tenantId) ?? 0;
        if (current < amount) {
          return {
            success: false,
            statusCode: 402,
            status_code: 'INSUFFICIENT_CREDITS',
            message: `Credits not sufficient (needs ${amount})`,
            credits_remaining: current,
          };
        }
        mockCreditsDb.set(tenantId, current - amount);
        return {
          success: true,
          statusCode: 200,
          credits_remaining: current - amount,
        };
      }
    );

    jest.spyOn(StudioCreditService, 'refundJobCredits').mockImplementation(
      async (params: any) => {
        const tenantId = params.tenantIdOrSlug === TENANT_A_SLUG ? TENANT_A : params.tenantIdOrSlug;
        const current = mockCreditsDb.get(tenantId) ?? 0;
        mockCreditsDb.set(tenantId, current + (params.amount || 3));
        return { success: true, refunded: true, credits_remaining: current + (params.amount || 3) };
      }
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SEC-P0-01: SECURE MEDIA DOWNLOAD PROXY (SSRF & AUTH)
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P0-01: Media Download Proxy Hardening', () => {
    it('Negative: rejects unauthenticated requests with HTTP 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/download?url=https://assets.boontrack.com/video.mp4');
      const res = await downloadGet(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Negative: rejects expired host session with HTTP 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/download?url=https://assets.boontrack.com/video.mp4', {
        headers: { cookie: `__Host-bt_studio_session=${expiredToken}` },
      });
      const res = await downloadGet(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Negative: rejects revoked host session with HTTP 401', async () => {
      const jti = 'jti-revoked-download-test';
      const revokedToken = signHostSessionToken({
        product: 'studio',
        userId: USER_A,
        tenantId: TENANT_A,
        tenantSlug: TENANT_A_SLUG,
      });
      // Extract JTI from revokedToken and revoke it
      const payload = JSON.parse(Buffer.from(revokedToken.split('.')[1], 'base64').toString('utf8'));
      await revokeHostSession(payload.jti, Math.floor(Date.now() / 1000) + 3600, 'studio');

      const req = new NextRequest('http://localhost:3000/api/studio/download?url=https://assets.boontrack.com/video.mp4', {
        headers: { cookie: `__Host-bt_studio_session=${revokedToken}` },
      });
      const res = await downloadGet(req);
      expect(res.status).toBe(401);
    });

    it('Negative: rejects unapproved storage origins with HTTP 403 (SSRF)', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/download?url=https://evil-attacker-site.com/malicious.mp4', {
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await downloadGet(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('BLOCKED_STORAGE_DESTINATION');
    });

    it('Negative: blocks cloud metadata endpoint (169.254.169.254) with HTTP 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/studio/download?url=http://169.254.169.254/latest/meta-data/', {
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await downloadGet(req);
      expect(res.status).toBe(403);
    });

    it('Negative: blocks private RFC 1918 and loopback IPs (127.0.0.1, 10.0.0.1, 192.168.1.1)', () => {
      expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('127.0.0.2')).toBe(true);
      expect(isPrivateOrBlockedIp('10.0.0.5')).toBe(true);
      expect(isPrivateOrBlockedIp('192.168.1.100')).toBe(true);
      expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIp('::1')).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false); // Public IP
    });

    it('SSRF Allowlist Invariant: verifies exact match, suffix match, and lookalike domain rejection', () => {
      // 1. Exact match hosts
      expect(isAllowedStorageHostname('assets.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('media.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('storage.boontrack.com')).toBe(true);

      // 2. Suffix matching (*.boontrack.com, *.supabase.co, *.r2.cloudflarestorage.com)
      expect(isAllowedStorageHostname('cdn.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('project123.supabase.co')).toBe(true);
      expect(isAllowedStorageHostname('account456.r2.cloudflarestorage.com')).toBe(true);

      // 3. Lookalike domains: MUST BE REJECTED (Missing dot separator before suffix)
      expect(isAllowedStorageHostname('evilboontrack.com')).toBe(false);
      expect(isAllowedStorageHostname('notboontrack.com')).toBe(false);
      expect(isAllowedStorageHostname('fake-supabase.co')).toBe(false);
      expect(isAllowedStorageHostname('evilir2.cloudflarestorage.com')).toBe(false);

      // 4. Apex domain without subdomain
      expect(isAllowedStorageHostname('boontrack.com')).toBe(false);

      // 5. Dangerous / loopback hostnames blocked immediately
      expect(isAllowedStorageHostname('localhost')).toBe(false);
      expect(isAllowedStorageHostname('app.localhost')).toBe(false);
      expect(isAllowedStorageHostname('server.internal')).toBe(false);
      expect(isAllowedStorageHostname('metadata.google.internal')).toBe(false);
      expect(isAllowedStorageHostname('169.254.169.254')).toBe(false);
    });

    it('SSRF Multi-Hop Redirect Defense: re-validates storage allowlist at every hop', async () => {
      const originalFetch = global.fetch;
      const dnsSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '104.21.50.1', family: 4 }] as any);
      // Hop 1: 302 -> https://mock-approved-storage.test/hop2.mp4 (approved)
      // Hop 2: 302 -> https://evilboontrack.com/malicious.mp4 (lookalike domain - unapproved!)
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          status: 302,
          headers: new Headers({ location: 'https://mock-approved-storage.test/hop2.mp4' }),
        })
        .mockResolvedValueOnce({
          status: 302,
          headers: new Headers({ location: 'https://evilboontrack.com/malicious.mp4' }),
        });

      try {
        const result = await safeFetchMediaAsset('https://mock-approved-storage.test/hop1.mp4');
        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('tidak termasuk dalam daftar domain storage resmi');
      } finally {
        global.fetch = originalFetch;
        dnsSpy.mockRestore();
      }
    });

    it('Negative: blocks redirect to private IP addresses (SSRF redirect defense)', async () => {
      // Mock fetch: first response is 302 redirecting to http://169.254.169.254/latest/meta-data/
      const originalFetch = global.fetch;
      const dnsSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '104.21.50.1', family: 4 }] as any);
      global.fetch = jest.fn().mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
      });

      try {
        const result = await safeFetchMediaAsset('https://mock-approved-storage.test/redirect.mp4');
        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('Positive: permits approved storage host with valid session', async () => {
      const originalFetch = global.fetch;
      const dnsSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '104.21.50.1', family: 4 }] as any);
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '1048576',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0x00, 0x00, 0x00, 0x20]));
            controller.close();
          },
        }),
      });

      // Mock DNS lookup for assets.boontrack.com to return public IP
      jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([{ address: '104.21.50.1', family: 4 }] as any);

      try {
        const req = new NextRequest('http://localhost:3000/api/studio/download?url=https://assets.boontrack.com/video.mp4&filename=clean-video.mp4', {
          headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
        });
        const res = await downloadGet(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toBe('attachment; filename="clean-video.mp4"');
        expect(res.headers.get('content-type')).toBe('video/mp4');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. SEC-P0-02: SECURE RENDER DISPATCH & BATCH
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P0-02: Render Dispatch & Batch Authorization', () => {
    it('Negative: rejects unauthenticated dispatch with HTTP 401', async () => {
      const req = new Request('http://localhost:3000/api/studio/render/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [{ scene_number: 1, voiceover: 'test' }],
        }),
      });
      const res = await dispatchPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Negative: rejects forged tenant_id with HTTP 403 FORBIDDEN_TENANT_MISMATCH', async () => {
      // Caller has session for Tenant A, but attempts to bill Tenant B
      const req = new Request('http://localhost:3000/api/studio/render/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          tenant_id: TENANT_B, // FORGERY ATTEMPT
          product_name: 'Stolen Render',
          scenes: [{ scene_number: 1, voiceover: 'test' }],
        }),
      });
      const res = await dispatchPost(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN_TENANT_MISMATCH');
      // Verify Tenant B's balance was NOT touched
      expect(mockCreditsDb.get(TENANT_B)).toBe(20);
    });

    it('Negative: returns HTTP 402 when tenant has insufficient credits', async () => {
      mockCreditsDb.set(TENANT_A, 0); // Drain credits

      const req = new Request('http://localhost:3000/api/studio/render/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'Unfunded Render',
          scenes: [{ scene_number: 1, voiceover: 'test' }],
        }),
      });
      const res = await dispatchPost(req);
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toBe('INSUFFICIENT_CREDITS');
    });

    it('Positive: derives tenant from session, reserves credits, and queues job (QUEUED)', async () => {
      const initialCredits = mockCreditsDb.get(TENANT_A)!;

      const req = new Request('http://localhost:3000/api/studio/render/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'Legit Render Job',
          scenes: [{ scene_number: 1, voiceover: 'Halo semua' }],
        }),
      });
      const res = await dispatchPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('QUEUED');
      expect(data.consumed_credits).toBe(3);
      expect(mockCreditsDb.get(TENANT_A)).toBe(initialCredits - 3);

      // Verify job in database is scoped to TENANT_A
      const savedJob = mockJobsDb.get(data.job_id);
      expect(savedJob).toBeDefined();
      expect(savedJob.tenant_id).toBe(TENANT_A);
      expect(savedJob.user_id).toBe(USER_A);
    });

    it('Batch Negative: rejects unauthenticated batch request with HTTP 401', async () => {
      const req = new Request('http://localhost:3000/api/studio/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variations: [{ id: 1, title: 'Var 1' }] }),
      });
      const res = await batchPost(req);
      expect(res.status).toBe(401);
    });

    it('Batch Negative: rejects forged tenant_id in batch payload with HTTP 403', async () => {
      const req = new Request('http://localhost:3000/api/studio/render/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          tenant_id: TENANT_B, // FORGERY
          variations: [{ id: 1, title: 'Var 1' }],
        }),
      });
      const res = await batchPost(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN_TENANT_MISMATCH');
    });

    it('Batch Positive: processes batch variations, deducting correct total credits', async () => {
      const initialCredits = mockCreditsDb.get(TENANT_A)!;
      const variations = [
        { id: 1, title: 'Var A', hook: 'H1', body: 'B1', cta: 'C1' },
        { id: 2, title: 'Var B', hook: 'H2', body: 'B2', cta: 'C2' },
      ]; // 2 variations * 3 credits = 6 credits

      const req = new Request('http://localhost:3000/api/studio/render/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'FCD Batch Test',
          variations,
        }),
      });
      const res = await batchPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('QUEUED');
      expect(data.consumed_credits).toBe(6);
      expect(mockCreditsDb.get(TENANT_A)).toBe(initialCredits - 6);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. SEC-P0-03: SECURE SCRIPT GENERATION & AI QUOTA ABUSE DEFENSE
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P0-03: Script AI Generator Hardening', () => {
    it('Negative: rejects unauthenticated script generation with HTTP 401', async () => {
      const req = new Request('http://localhost:3000/api/studio/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: 'Serum Glowing',
          pain_point: 'Kulit kusam',
          hook_angle: 'Sebelum Sesudah',
          cta_goal: 'Beli Sekarang',
        }),
      });
      const res = await scriptGeneratePost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Negative: rejects forged tenant_id in script payload with HTTP 403', async () => {
      const req = new Request('http://localhost:3000/api/studio/script/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          tenant_id: TENANT_B, // FORGERY
          product_name: 'Serum Glowing',
          pain_point: 'Kulit kusam',
          hook_angle: 'Sebelum Sesudah',
          cta_goal: 'Beli Sekarang',
        }),
      });
      const res = await scriptGeneratePost(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN_TENANT_MISMATCH');
    });

    it('Negative: rejects when tenant balance is 0 and avoids external AI invocation', async () => {
      mockCreditsDb.set(TENANT_A, 0); // Drain credits

      const fetchSpy = jest.spyOn(global, 'fetch');

      const req = new Request('http://localhost:3000/api/studio/script/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'Free Script Attempt',
          pain_point: 'No money',
          hook_angle: 'Secret',
          cta_goal: 'Click',
        }),
      });
      const res = await scriptGeneratePost(req);
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toBe('INSUFFICIENT_CREDITS');

      // Verify ZERO calls were made to external Google Gemini API
      const geminiCalls = fetchSpy.mock.calls.filter(call =>
        String(call[0]).includes('generativelanguage.googleapis.com')
      );
      expect(geminiCalls.length).toBe(0);
    });

    it('Positive: reserves 1 credit, resolves tenant server-side, and generates 9 scenes', async () => {
      const initialCredits = mockCreditsDb.get(TENANT_A)!;

      const req = new Request('http://localhost:3000/api/studio/script/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'Kopi Stamina',
          pain_point: 'Cepat lelah siang hari',
          hook_angle: 'Hemat Boncos',
          cta_goal: 'Cek Keranjang Kuning',
        }),
      });
      const res = await scriptGeneratePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.scenes).toHaveLength(9);
      expect(data.consumed_credits).toBe(1);
      expect(mockCreditsDb.get(TENANT_A)).toBe(initialCredits - 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. SEC-P1-01: RENDER JOB OWNERSHIP & STATUS ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P1-01: Multi-Tenant Job Ownership', () => {
    let jobAId: string;

    beforeEach(() => {
      jobAId = 'a1111111-1111-1111-1111-111111111111';
      mockJobsDb.set(jobAId, {
        id: jobAId,
        tenant_id: TENANT_A,
        user_id: USER_A,
        status: 'COMPLETED',
        output_url: 'https://assets.boontrack.com/renders/tenant-a-video.mp4',
        error_message: null,
      });
    });

    it('Negative: rejects unauthenticated job inspection with HTTP 401', async () => {
      const req = new Request(`http://localhost:3000/api/studio/render?job_id=${jobAId}`);
      const res = await renderGet(req);
      expect(res.status).toBe(401);
    });

    it('Negative: returns safe 404 denial when Tenant B tries to inspect Tenant A job', async () => {
      // Caller has valid session for Tenant B, but queries Tenant A's job
      const req = new Request(`http://localhost:3000/api/studio/render?job_id=${jobAId}`, {
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const res = await renderGet(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('JOB_NOT_FOUND');
      // Must not leak output_url or any job metadata
      expect(data.output_url).toBeUndefined();
    });

    it('Negative: dispatch GET handler also returns safe 404 for foreign jobs', async () => {
      const req = new Request(`http://localhost:3000/api/studio/render/dispatch?job_id=${jobAId}`, {
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const res = await dispatchGet(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('JOB_NOT_FOUND');
    });

    it('Positive: permits owner Tenant A to retrieve own job state and output URL', async () => {
      const req = new Request(`http://localhost:3000/api/studio/render?job_id=${jobAId}`, {
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await renderGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('COMPLETED');
      expect(data.output_url).toBe('https://assets.boontrack.com/renders/tenant-a-video.mp4');
    });

    // ── Track Download Authorization & Fail-Closed Invariant Tests (SEC-P1-01 / CTO Directive) ──
    it('Track-Download Fail-Closed: rejects unauthenticated POST with HTTP 401 and skips trackDownload', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');
      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: rejects expired session with HTTP 401 and skips trackDownload', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');
      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${expiredToken}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(401);
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: rejects revoked session with HTTP 401 and skips trackDownload', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');
      const revokedToken = signHostSessionToken({
        product: 'studio',
        userId: USER_A,
        tenantId: TENANT_A,
        tenantSlug: TENANT_A_SLUG,
      });
      const payload = JSON.parse(Buffer.from(revokedToken.split('.')[1], 'base64').toString('utf8'));
      await revokeHostSession(payload.jti, Math.floor(Date.now() / 1000) + 3600, 'studio');

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${revokedToken}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(401);
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: returns HTTP 503 SERVICE_UNAVAILABLE and skips trackDownload when Supabase client is null', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');
      (supabaseModule.getSupabaseAdmin as jest.Mock).mockReturnValueOnce(null);
      (supabaseModule.getSupabase as jest.Mock).mockReturnValueOnce(null);

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe('SERVICE_UNAVAILABLE');
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: returns HTTP 500 DATABASE_ERROR and skips trackDownload on database query failure', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');
      const errorSupabase = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database query timeout' } }),
        })),
      };
      (supabaseModule.getSupabaseAdmin as jest.Mock).mockReturnValueOnce(errorSupabase);

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('DATABASE_ERROR');
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: returns safe 404 denial and does NOT call trackDownload when foreign Tenant B targets Tenant A job', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('JOB_NOT_FOUND');
      expect(data.output_url).toBeUndefined();
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Fail-Closed: returns safe 404 denial and does NOT call trackDownload when job ID does not exist', async () => {
      const missingJobId = '00000000-0000-0000-0000-000000000000';
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${missingJobId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: missingJobId }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('JOB_NOT_FOUND');
      expect(trackDownloadSpy).not.toHaveBeenCalled();
    });

    it('Track-Download Positive: permits owner Tenant A to track download and calls trackDownload exactly once without leaking URLs', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');

      const req = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'POST',
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const res = await trackDownloadPost(req, { params: Promise.resolve({ id: jobAId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.job_id).toBe(jobAId);
      expect(data.downloaded_at).toBeDefined();
      expect(data.output_url).toBeUndefined();
      expect(data.signed_url).toBeUndefined();
      expect(trackDownloadSpy).toHaveBeenCalledTimes(1);
    });

    it('Track-Download Fallback GET: enforces identical strict session and tenant authorization', async () => {
      const trackDownloadSpy = jest.spyOn(StudioPurgeService, 'trackDownload');

      // 1. Unauthenticated GET -> HTTP 401 (Proves NO anonymous fallback path exists)
      const anonReq = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'GET',
      });
      const anonRes = await trackDownloadGet(anonReq, { params: Promise.resolve({ id: jobAId }) });
      expect(anonRes.status).toBe(401);
      expect(trackDownloadSpy).not.toHaveBeenCalled();

      // 2. Foreign Tenant GET -> HTTP 404 safe denial
      const foreignReq = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'GET',
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const foreignRes = await trackDownloadGet(foreignReq, { params: Promise.resolve({ id: jobAId }) });
      expect(foreignRes.status).toBe(404);
      expect(trackDownloadSpy).not.toHaveBeenCalled();

      // 3. Owner Tenant GET -> HTTP 200
      const ownerReq = new NextRequest(`http://localhost:3000/api/studio/renders/${jobAId}/track-download`, {
        method: 'GET',
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const ownerRes = await trackDownloadGet(ownerReq, { params: Promise.resolve({ id: jobAId }) });
      expect(ownerRes.status).toBe(200);
      const ownerData = await ownerRes.json();
      expect(ownerData.success).toBe(true);
      expect(trackDownloadSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. SEC-P1-02: SCRIPT OWNERSHIP & STORAGE ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P1-02: Script Repository Tenant Scoping', () => {
    let scriptAId: string;

    beforeEach(() => {
      scriptAId = 's1111111-1111-1111-1111-111111111111';
      mockScriptsDb.set(scriptAId, {
        id: scriptAId,
        tenant_id: TENANT_A,
        user_id: USER_A,
        product_name: 'Tenant A Secret Formula',
        brief: { pain_point: 'A secrets' },
        scenes: [{ scene_number: 1, voiceover: 'Tenant A copy' }],
      });
    });

    it('Negative: rejects unauthenticated script fetch with HTTP 401', async () => {
      const req = new Request(`http://localhost:3000/api/studio/scripts?slug=${TENANT_A_SLUG}`);
      const res = await scriptsGet(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('Negative: rejects querying with foreign slug with HTTP 403', async () => {
      // User is authenticated as Tenant B, but tries to query ?slug=tenant-a-store
      const req = new Request(`http://localhost:3000/api/studio/scripts?slug=${TENANT_A_SLUG}`, {
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const res = await scriptsGet(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN_TENANT_MISMATCH');
    });

    it('Positive: scopes script queries strictly to authenticated tenant', async () => {
      // Tenant B queries without slug
      const req = new Request('http://localhost:3000/api/studio/scripts', {
        headers: { cookie: `__Host-bt_studio_session=${tokenB}` },
      });
      const res = await scriptsGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      // Tenant B should see 0 scripts (does not see Tenant A script)
      expect(data.count).toBe(0);

      // Tenant A queries scripts
      const reqA = new Request('http://localhost:3000/api/studio/scripts', {
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const resA = await scriptsGet(reqA);
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      expect(dataA.count).toBe(1);
      expect(dataA.data[0].product_name).toBe('Tenant A Secret Formula');
    });

    it('Positive: POST /api/studio/scripts derives tenant from session', async () => {
      const req = new Request('http://localhost:3000/api/studio/scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({
          product_name: 'New Script Entry',
          scenes: [{ scene_number: 1, voiceover: 'Scene 1' }],
        }),
      });
      const res = await scriptsPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tenant_id).toBe(TENANT_A);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. SEC-P1-03: LOGOUT & HOST-ONLY COOKIE REVOCATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('SEC-P1-03: Studio Logout Lifecycle & Cookie Revocation', () => {
    it('Positive: POST /api/auth/session revokes token and clears HttpOnly cookie header', async () => {
      const payload = JSON.parse(Buffer.from(tokenA.split('.')[1], 'base64').toString('utf8'));

      const logoutReq = new NextRequest('http://localhost:3000/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `__Host-bt_studio_session=${tokenA}`,
        },
        body: JSON.stringify({ product: 'studio' }),
      });

      const logoutRes = await sessionLogoutPost(logoutReq);
      expect(logoutRes.status).toBe(200);

      // Verify Set-Cookie header clears host-only cookie with Max-Age=0
      const setCookie = logoutRes.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('Max-Age=0');

      // Verify subsequent protected request with the old token is REJECTED (Revoked JTI)
      const protectedReq = new Request(`http://localhost:3000/api/studio/scripts`, {
        headers: { cookie: `__Host-bt_studio_session=${tokenA}` },
      });
      const protectedRes = await scriptsGet(protectedReq);
      expect(protectedRes.status).toBe(401);
    });
  });
});
