import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PUT as handleSettingsPut } from '@/app/api/v1/tenants/[slug]/settings/route';
import { PUT as handleThemePut } from '@/app/api/v1/tenants/[slug]/theme/route';
import * as merchantSessionModule from '@/lib/auth/merchant-session';
import * as subscriptionGuardModule from '@/lib/subscription-guard';
import * as supabaseClientModule from '@/lib/supabaseClient';

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
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
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
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                tier: 'PRO_SCALE',
                metadata: { visual_theme: 'clean_minimal' },
              },
              error: null,
            }),
            update: jest.fn().mockImplementation((payload: any) => {
              capturedPayload = payload;
              return {
                eq: jest.fn().mockResolvedValue({ error: null }),
              };
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
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'tenant-uuid-1',
                slug: 'shabu-ajhi',
                name: 'Shabu Ajhi',
                tier: 'PRO_SCALE',
                metadata: { onboarding_completed: false },
              },
              error: null,
            }),
            update: jest.fn().mockImplementation((fields: any) => {
              capturedFields = fields;
              return {
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockResolvedValue({
                    data: [{ id: 'tenant-uuid-1', slug: 'shabu-ajhi' }],
                    error: null,
                  }),
                }),
              };
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
});
