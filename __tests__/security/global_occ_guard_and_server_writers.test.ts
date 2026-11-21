import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PUT as handleSettingsPut } from '@/app/api/v1/tenants/[slug]/settings/route';
import { PUT as handleThemePut } from '@/app/api/v1/tenants/[slug]/theme/route';
import { PATCH as handleAdminConfigPatch } from '@/app/api/v1/admin/tenants/[slug]/config/route';
import { POST as handleResendVerification } from '@/app/api/v1/auth/resend-verification/route';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import * as subscriptionGuardModule from '@/lib/subscription-guard';
import * as supabaseClientModule from '@/lib/supabaseClient';
import * as emailModule from '@/lib/boonpilot-email';
import { POST as handlePublishProposal } from '@/app/api/v1/boonpilot/publish-proposal/route';

describe('GLOBAL OCC GUARD & SERVER-ROUTED TENANT WRITERS', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
    jest.spyOn(supabaseClientModule, 'getSupabase').mockReturnValue(mockSupabase);
    jest.spyOn(subscriptionGuardModule, 'checkTenantMutationPermission').mockResolvedValue({ allowed: true });
    jest.spyOn(merchantSessionModule, 'isInternalMachineAuthorized').mockReturnValue(true);
    jest.spyOn(merchantSessionModule, 'authorizeMerchantRequest').mockReturnValue({
      authorized: true,
      payload: { userId: 'test-user-id', role: 'OWNER' },
      response: null as any,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Layer 1: Server-Side Timestamp Uniformity', () => {
    it('1. Theme route updates metadata and advances updated_at', async () => {
      let capturedPayload: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                tier: 'PRO_SCALE',
                metadata: { visual_theme: 'clean_minimal' },
                updated_at: '2026-11-20T10:00:00.000Z',
              },
              error: null,
            }),
            update: jest.fn().mockImplementation((payload: any) => {
              capturedPayload = payload;
              const updateBuilder: any = {};
              updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
              updateBuilder.select = jest.fn().mockResolvedValue({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: payload.metadata, updated_at: payload.updated_at }],
                error: null,
              });
              updateBuilder.then = (resolve: any) => resolve({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: payload.metadata, updated_at: payload.updated_at }],
                error: null,
              });
              return updateBuilder;
            }),
          };
        }
        return mockSupabase;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/shabu-ajhi/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visual_theme: 'warm_culinary',
        }),
      });

      const res = await handleThemePut(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
      expect(res.status).toBe(200);
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.updated_at).toBeDefined();
      expect(typeof capturedPayload.updated_at).toBe('string');
      expect(new Date(capturedPayload.updated_at).getTime()).toBeGreaterThan(0);
    });

    it('2. Settings route PUT accepts dynamic metadata and advances updated_at', async () => {
      let capturedFields: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                name: 'Shabu Ajhi',
                tier: 'PRO_SCALE',
                metadata: { onboarding_completed: false },
                updated_at: '2026-11-20T10:00:00.000Z',
              },
              error: null,
            }),
            update: jest.fn().mockImplementation((fields: any) => {
              capturedFields = fields;
              const updateBuilder: any = {};
              updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
              updateBuilder.select = jest.fn().mockResolvedValue({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: fields.metadata, updated_at: fields.updated_at }],
                error: null,
              });
              updateBuilder.then = (resolve: any) => resolve({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: fields.metadata, updated_at: fields.updated_at }],
                error: null,
              });
              return updateBuilder;
            }),
          };
        }
        return mockSupabase;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/shabu-ajhi/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storefront_mode: 'microsite',
          onboarding_completed: true,
          metadata: {
            custom_note: 'OCC test note',
            featured_product_ids: ['prod-1', 'prod-2'],
          },
        }),
      });

      const res = await handleSettingsPut(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
      expect(res.status).toBe(200);
      expect(capturedFields).not.toBeNull();
      expect(capturedFields.updated_at).toBeDefined();
      expect(capturedFields.metadata.storefront_mode).toBe('microsite');
      expect(capturedFields.metadata.onboarding_completed).toBe(true);
      expect(capturedFields.metadata.custom_note).toBe('OCC test note');
      expect(capturedFields.metadata.featured_product_ids).toEqual(['prod-1', 'prod-2']);
    });
  });

  describe('Layer 2: Monotonic PostgreSQL Trigger Migration Invariant', () => {
    it('3. Trigger migration file exists and enforces GREATEST(clock_timestamp(), OLD.updated_at + 1 microsecond)', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase',
        'migrations',
        '20261120_monotonic_tenants_updated_at_trigger.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.set_tenants_updated_at()');
      expect(sqlContent).toContain('GREATEST(');
      expect(sqlContent).toContain('clock_timestamp()');
      expect(sqlContent).toContain("interval '1 microsecond'");
      expect(sqlContent).toContain('CREATE TRIGGER trg_tenants_set_updated_at');
      expect(sqlContent).toContain('BEFORE UPDATE ON public.tenants');
    });
  });

  describe('Layer 3: Client-to-Server Tenant Mutation Zero-Direct-Update Invariant', () => {
    it('4. Zero client components directly invoke .from("tenants").update() or .upsert()', () => {
      const dirs = ['app', 'components'];
      const clientFilesDirectlyUpdatingTenants: string[] = [];

      function scanDir(dir: string) {
        const fullDir = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullDir)) return;
        const entries = fs.readdirSync(fullDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(fullDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.next') {
              scanDir(path.join(dir, entry.name));
            }
          } else if (/\.(tsx|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const isClient = content.slice(0, 500).includes("'use client'") || content.slice(0, 500).includes('"use client"');
            if (isClient) {
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(".from('tenants')") || lines[i].includes('.from("tenants")')) {
                  const windowStr = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
                  if (windowStr.includes('.update(') || windowStr.includes('.upsert(')) {
                    clientFilesDirectlyUpdatingTenants.push(path.relative(process.cwd(), fullPath));
                    break;
                  }
                }
              }
            }
          }
        }
      }

      for (const d of dirs) scanDir(d);

      expect(clientFilesDirectlyUpdatingTenants).toEqual([]);
    });
  });

  describe('Layer 4: Blocker WS02-C & WS02-D Regression Guards', () => {
    it('5. admin/tenants/[slug]/config with body.pricing.custom_packages writes to pricing_custom_packages and NEVER mutates metadata.products', async () => {
      let capturedPayload: any = null;
      const initialProducts = [{ id: 'canon-p1', name: 'Canonical Product 1' }];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                tier: 'STARTER',
                metadata: {
                  products: initialProducts,
                },
                updated_at: '2026-11-20T10:00:00.000Z',
              },
              error: null,
            }),
            update: jest.fn().mockImplementation((payload: any) => {
              capturedPayload = payload;
              const updateBuilder: any = {};
              updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
              updateBuilder.select = jest.fn().mockResolvedValue({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: payload.metadata, updated_at: payload.updated_at }],
                error: null,
              });
              updateBuilder.then = (resolve: any) => resolve({
                data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi', metadata: payload.metadata, updated_at: payload.updated_at }],
                error: null,
              });
              return updateBuilder;
            }),
          };
        }
        if (table === 'tenant_config_audit_logs') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return mockSupabase;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/admin/tenants/shabu-ajhi/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing: {
            custom_packages: [{ id: 'pkg-1', name: 'Custom Catering Package' }],
          },
        }),
      });

      const res = await handleAdminConfigPatch(req, { params: Promise.resolve({ slug: 'shabu-ajhi' }) });
      expect(res.status).toBe(200);
      expect(capturedPayload).not.toBeNull();
      // Must be saved under pricing_custom_packages
      expect(capturedPayload.metadata.pricing_custom_packages).toEqual([{ id: 'pkg-1', name: 'Custom Catering Package' }]);
      // MUST NOT touch or overwrite metadata.products!
      expect(capturedPayload.metadata.products).toEqual(initialProducts);
    });

    it('6. resend-verification aborts and does NOT send email when updateTenantWithOccCas returns failure', async () => {
      let emailSent = false;
      jest.spyOn(emailModule, 'sendBoonPilotVerificationEmail').mockImplementation(async () => {
        emailSent = true;
        return { success: true } as any;
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                name: 'Shabu Ajhi',
                updated_at: '2026-11-20T10:00:00.000Z',
                metadata: {
                  email: 'test@merchant.com',
                },
              },
              error: null,
            }),
            update: jest.fn().mockImplementation(() => {
              // Return error / 0 matched rows to simulate OCC conflict
              const updateBuilder: any = {};
              updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
              updateBuilder.select = jest.fn().mockResolvedValue({
                data: [], // 0 rows affected = conflict
                error: null,
              });
              updateBuilder.then = (resolve: any) => resolve({
                data: [],
                error: null,
              });
              return updateBuilder;
            }),
          };
        }
        return mockSupabase;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@merchant.com',
        }),
      });

      const res = await handleResendVerification(req);
      expect(res.status).toBe(409);
      expect(emailSent).toBe(false);
    });

    it('7. publish-proposal returns 409 and aborts without publishing when updateTenantWithOccCas hits OCC conflict', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-proposal-1',
                slug: 'shabu-ajhi',
                name: 'Shabu Ajhi',
                updated_at: '2026-11-20T10:00:00.000Z',
                metadata: {
                  plan_tier: 'SOLO_TRIAL',
                },
              },
              error: null,
            }),
            update: jest.fn().mockImplementation(() => {
              // Simulate OCC conflict: 0 rows affected
              const updateBuilder: any = {};
              updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
              updateBuilder.select = jest.fn().mockResolvedValue({
                data: [], // 0 rows affected = conflict
                error: null,
              });
              updateBuilder.then = (resolve: any) => resolve({
                data: [],
                error: null,
              });
              return updateBuilder;
            }),
          };
        }
        return mockSupabase;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/boonpilot/publish-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'shabu-ajhi',
          proposal: {
            id: 'prop-1',
            tenant_slug: 'shabu-ajhi',
            business_profile: {
              store_name: 'Shabu Ajhi',
            },
            status: 'DRAFT',
          },
        }),
      });

      const res = await handlePublishProposal(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('OCC_CONFLICT');
    });

    it('8. audit-tenant-writers.js AST scanner exits 0 on self-test clean run', () => {
      const output = execSync('node scripts/audit-tenant-writers.js --self-test', {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(output).toContain('[SELF-TEST PASSED]');
    });
  });
});
