jest.unmock('@/lib/supabaseClient');

import * as productCatalogModule from '@/lib/product-catalog';
import {
  fetchActiveCatalog,
  fetchActiveCatalogForWorkforce,
  fetchActiveCatalogForShared,
  fetchActiveCatalogGrounding,
  fetchActiveCatalogGroundingForShared,
  fetchActiveCatalogGroundingForWorkforce,
  formatProductCatalogForBotKnowledge,
} from '@/lib/product-catalog';
import * as supabaseClientModule from '@/lib/supabaseClient';

describe('fetchActiveCatalog & Context Grounding (Zero Stale Cache)', () => {
  beforeAll(() => {
    process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
    process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-wf-service-role-key-123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-shared-service-role-key-456';
  });
  const mockTenant = {
    id: 'b8ff9154-d77a-437f-80ee-372717675183',
    slug: 'viora-goods',
    name: 'Viora Goods',
    custom_domain: null,
    metadata: {
      products: [
        {
          id: 'stale-prod-1',
          name: 'Stale Cached Product (Old Price)',
          price: 99000,
          promo_price: 99000,
        },
      ],
    },
  };

  it('fetches directly from SQL products table bypassing stale metadata products', async () => {
    const mockSqlProducts = [
      {
        id: 'real-prod-101',
        tenant_id: 'b8ff9154-d77a-437f-80ee-372717675183',
        slug: 'fertani-essen-ikan',
        title: 'FERTANI Essen Ikan 120X Kapsul',
        price: 65000,
        promo_price: 59000,
        description: 'Formula Ikan Kolam PG',
        category: 'essen',
        is_available: true,
        created_at: new Date().toISOString(),
      },
    ];

    const officialSupabase = supabaseClientModule.getSupabase();
    jest.spyOn(officialSupabase, 'from').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      then: (resolve: any) => resolve({ data: mockSqlProducts, error: null }),
    } as any);

    const products = await fetchActiveCatalogForShared(mockTenant, { supabaseClient: officialSupabase });

    expect(products.length).toBeGreaterThanOrEqual(1);
    expect(products[0].name).toBe('FERTANI Essen Ikan 120X Kapsul');
    expect(products[0].promo_price).toBe(59000);
    expect(products[0].price).toBe(65000);
  });

  it('generates real-time grounding text with updated promo price and checkout URL', async () => {
    const freshProducts = [
      {
        id: 'real-prod-101',
        slug: 'fertani-essen-ikan',
        name: 'FERTANI Essen Ikan 120X Kapsul',
        price: 65000,
        promo_price: 59000,
        description: 'Formula Ikan Kolam PG',
        category: 'essen',
        is_available: true,
        stock: 100,
        image: '',
      },
    ];

    const officialSupabase = supabaseClientModule.getSupabase();
    jest.spyOn(officialSupabase, 'from').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
      then: (resolve: any) => resolve({ data: freshProducts, error: null }),
    } as any);

    const grounding = await fetchActiveCatalogGroundingForShared(mockTenant, { supabaseClient: officialSupabase });

    expect(grounding).toContain('FERTANI Essen Ikan 120X Kapsul');
    expect(grounding).toContain('Rp 59.000 (Promo dari Rp 65.000)');
    expect(grounding).toContain('https://shop.boontrack.com/viora-goods/p/fertani-essen-ikan');
    expect(grounding).not.toContain('Stale Cached Product');
  });

  it('respects tenant custom domain hierarchy in grounding URLs', () => {
    const tenantWithCustomDomain = {
      id: 'custom-tenant-uuid',
      slug: 'toko-kreatif',
      custom_domain: 'katalog.tokokreatif.com',
      metadata: {},
    };

    const liveProducts = [
      {
        id: 'prod-abc',
        slug: 'kursus-ai-mastery',
        name: 'Kursus AI Mastery',
        price: 150000,
        promo_price: 99000,
        description: 'Panduan lengkap AI untuk bisnis.',
        category: 'digital',
        stock: 999,
        image: '',
      },
    ];

    const grounding = formatProductCatalogForBotKnowledge(tenantWithCustomDomain, liveProducts);

    expect(grounding).toContain('https://katalog.tokokreatif.com/p/kursus-ai-mastery');
    expect(grounding).toContain('Rp 99.000 (Promo dari Rp 150.000)');
    expect(grounding).not.toContain('shop.boontrack.com');
  });

  // =========================================================================
  // Catalog Database Context Isolation & Fail-Closed Suite
  // =========================================================================
  describe('Catalog Database Context Isolation & Fail-Closed Suite', () => {
    const originalWfUrl = process.env.WORKFORCE_SUPABASE_URL;
    const originalWfKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
    const originalSharedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSharedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    beforeEach(() => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-wf-service-role-key-123';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-shared-service-role-key-456';
      jest.clearAllMocks();
    });

    afterEach(() => {
      process.env.WORKFORCE_SUPABASE_URL = originalWfUrl;
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = originalWfKey;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSharedUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalSharedKey;
      jest.restoreAllMocks();
    });

    it('CTX-1: Workforce context + valid configuration -> uses Workforce client', async () => {
      const mockWfClient: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }),
      };

      const wfSpy = jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin').mockReturnValue(mockWfClient);
      const sharedSpy = jest.spyOn(supabaseClientModule, 'getSupabaseAdmin');

      await fetchActiveCatalog(mockTenant, { context: 'workforce' });

      expect(wfSpy).toHaveBeenCalledTimes(1);
      expect(sharedSpy).not.toHaveBeenCalled();
    });

    it('CTX-2: Workforce context + URL missing -> fail-closed (throws fatal error)', async () => {
      jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin').mockImplementation(() => {
        throw new Error('[WORKFORCE ADMIN FATAL] WORKFORCE_SUPABASE_URL is missing or empty.');
      });

      await expect(
        fetchActiveCatalog(mockTenant, { context: 'workforce' })
      ).rejects.toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_URL is missing/);
    });

    it('CTX-3: Workforce context + key missing -> fail-closed (throws fatal error)', async () => {
      jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin').mockImplementation(() => {
        throw new Error('[WORKFORCE ADMIN FATAL] WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing or empty.');
      });

      await expect(
        fetchActiveCatalog(mockTenant, { context: 'workforce' })
      ).rejects.toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing/);
    });

    it('CTX-4: Shared context -> uses Shared client', async () => {
      const mockSharedClient: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }),
      };

      const sharedSpy = jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSharedClient);
      const wfSpy = jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin');

      await fetchActiveCatalog(mockTenant, { context: 'shared' });

      expect(sharedSpy).toHaveBeenCalled();
      expect(wfSpy).not.toHaveBeenCalled();
    });

    it('CTX-5: Shared environment with WORKFORCE_SUPABASE_URL does NOT redirect Shared context to Workforce', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-wf-key';

      const mockSharedClient: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }),
      };

      const sharedSpy = jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(mockSharedClient);
      const wfSpy = jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin');

      await fetchActiveCatalog(mockTenant, { context: 'shared' });

      expect(sharedSpy).toHaveBeenCalled();
      expect(wfSpy).not.toHaveBeenCalled();
    });

    it('CTX-6: Missing context -> fail-closed (rejected)', async () => {
      // Calling fetchActiveCatalog without context must fail-closed
      await expect(fetchActiveCatalog(mockTenant)).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Database context is mandatory/
      );
      await expect(fetchActiveCatalog(mockTenant, {} as any)).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Database context is mandatory/
      );
    });

    it('CTX-7: Invalid context -> fail-closed (rejected)', async () => {
      await expect(
        fetchActiveCatalog(mockTenant, { context: 'invalid_scope' as any })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Invalid database context/
      );
    });

    it('CTX-8: Arbitrary object with correct Workforce URL but unregistered -> rejected', async () => {
      const arbitraryWfClient: any = {
        supabaseUrl: 'https://tjkbgxrckaocgosvmzmj.supabase.co',
        from: jest.fn(),
      };

      await expect(
        fetchActiveCatalogForWorkforce(mockTenant, { supabaseClient: arbitraryWfClient })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client is not a verified factory-issued client/
      );
    });

    it('CTX-9: Arbitrary object with correct Shared URL but unregistered -> rejected', async () => {
      const arbitrarySharedClient: any = {
        supabaseUrl: 'https://mock-project.supabase.co',
        from: jest.fn(),
      };

      await expect(
        fetchActiveCatalogForShared(mockTenant, { supabaseClient: arbitrarySharedClient })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client is not a verified factory-issued client/
      );
    });

    it('CTX-10: Caller attempts to access public registration function -> undefined', () => {
      expect((productCatalogModule as any).registerAuthorizedCatalogClient).toBeUndefined();
      expect((supabaseClientModule as any).registerAuthorizedCatalogClient).toBeUndefined();
      expect((supabaseClientModule as any).registerClient).toBeUndefined();
    });

    it('CTX-11: Caller attempts to modify Shared allowlist -> undefined (not exported)', () => {
      expect((productCatalogModule as any).SHARED_ALLOWED_HOSTS).toBeUndefined();
      expect((supabaseClientModule as any).SHARED_ALLOWED_HOSTS).toBeUndefined();
    });

    it('CTX-12: Environment URL mutated to foreign host -> not automatically authorized for Shared', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rogue-foreign-host.supabase.co';
      const rogueClient: any = {
        supabaseUrl: 'https://rogue-foreign-host.supabase.co',
        from: jest.fn(),
      };

      await expect(
        fetchActiveCatalogForShared(mockTenant, { supabaseClient: rogueClient })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client is not a verified factory-issued client/
      );
    });

    it('CTX-13: Official Workforce factory client -> accepted', async () => {
      const officialWf = supabaseClientModule.getWorkforceSupabaseAdmin();
      jest.spyOn(officialWf, 'from').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any);

      const products = await fetchActiveCatalogForWorkforce(mockTenant, { supabaseClient: officialWf });
      expect(products).toBeDefined();
    });

    it('CTX-14: Official Shared factory client -> accepted', async () => {
      const officialShared = supabaseClientModule.getSupabase();
      jest.spyOn(officialShared, 'from').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any);

      const products = await fetchActiveCatalogForShared(mockTenant, { supabaseClient: officialShared });
      expect(products).toBeDefined();
    });

    it('CTX-15: Cross-context injection (Workforce factory client into Shared wrapper) -> rejected', async () => {
      const officialWf = supabaseClientModule.getWorkforceSupabaseAdmin();

      await expect(
        fetchActiveCatalogForShared(mockTenant, { supabaseClient: officialWf })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client provenance mismatch.*Client is registered for domain "workforce", but requested context is "shared"/
      );
    });

    it('CTX-16: Cross-context injection (Shared factory client into Workforce wrapper) -> rejected', async () => {
      const officialShared = supabaseClientModule.getSupabase();

      await expect(
        fetchActiveCatalogForWorkforce(mockTenant, { supabaseClient: officialShared })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client provenance mismatch.*Client is registered for domain "shared", but requested context is "workforce"/
      );
    });

    it('CTX-17: Hostile input (slug with query parameters) CANNOT manipulate database context', async () => {
      const officialShared = supabaseClientModule.getSupabase();
      const sharedSpy = jest.spyOn(supabaseClientModule, 'getSupabaseAdmin').mockReturnValue(officialShared);
      const wfSpy = jest.spyOn(supabaseClientModule, 'getWorkforceSupabaseAdmin');

      // Attacker attempts to smuggle context=workforce in slug or custom domain
      await fetchActiveCatalog('viora-goods?context=workforce', { context: 'shared' });
      await fetchActiveCatalog({ slug: 'viora-goods?context=workforce', metadata: { context: 'workforce' } }, { context: 'shared' });

      // Must remain in 'shared' context unless options.context is explicitly 'workforce'
      expect(sharedSpy).toHaveBeenCalled();
      expect(wfSpy).not.toHaveBeenCalled();
    });

    it('CTX-18: Authorization and provenance failures strictly REJECT the Promise and NEVER resolve to empty array [] or any value', async () => {
      const unauthorizedClient: any = { supabaseUrl: 'https://attacker-controlled.supabase.co', from: jest.fn() };

      // 1. Unregistered client injection: Promise must strictly REJECT, must NOT resolve
      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant, { supabaseClient: unauthorizedClient });
        didResolve = true;
      } catch (err) {
        caughtError = err;
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(
        /\[CATALOG CONTEXT FATAL\] Injected client is not a verified factory-issued client/
      );

      // Verify rejects.toThrow rejects with exact fatal context message
      await expect(
        fetchActiveCatalogForShared(mockTenant, { supabaseClient: unauthorizedClient })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client is not a verified factory-issued client/
      );

      // 2. Cross-context injection (Workforce client into Shared): Promise must strictly REJECT, must NOT resolve
      const officialWf = supabaseClientModule.getWorkforceSupabaseAdmin();
      let crossDidResolve = false;
      let crossCaughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant, { supabaseClient: officialWf });
        crossDidResolve = true;
      } catch (err) {
        crossCaughtError = err;
      }

      expect(crossDidResolve).toBe(false);
      expect(crossCaughtError).toBeInstanceOf(Error);
      expect(crossCaughtError.message).toMatch(
        /\[CATALOG CONTEXT FATAL\] Injected client provenance mismatch.*Client is registered for domain "workforce", but requested context is "shared"/
      );

      await expect(
        fetchActiveCatalogForShared(mockTenant, { supabaseClient: officialWf })
      ).rejects.toThrow(
        /\[CATALOG CONTEXT FATAL\] Injected client provenance mismatch.*Client is registered for domain "workforce", but requested context is "shared"/
      );
    });

    it('CTX-18.a: Shared URL missing or malformed -> [SHARED GUARD FATAL] propagated to caller, Promise rejects', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(/\[SHARED GUARD FATAL\].*NEXT_PUBLIC_SUPABASE_URL is missing/);

      // Malformed URL
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'malformed-not-a-url';
      await expect(fetchActiveCatalogForShared(mockTenant)).rejects.toThrow(
        /\[SHARED GUARD FATAL\].*Malformed Supabase REST URL/
      );
    });

    it('CTX-18.b: Shared URL targeting foreign endpoint -> [SHARED GUARD FATAL] propagated to caller, Promise rejects', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://attacker-controlled.com';
      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(/\[SHARED GUARD FATAL\].*not an authorized Supabase project endpoint format/);

      await expect(fetchActiveCatalogForShared(mockTenant)).rejects.toThrow(
        /\[SHARED GUARD FATAL\].*not an authorized Supabase project endpoint format/
      );
    });

    it('CTX-18.c: Shared URL targeting Workforce staging -> [SHARED GUARD FATAL] propagated to caller, Promise rejects', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(/\[SHARED GUARD FATAL\].*targets Workforce staging/);

      await expect(fetchActiveCatalogForShared(mockTenant)).rejects.toThrow(
        /\[SHARED GUARD FATAL\].*targets Workforce staging/
      );
    });

    it('CTX-18.d: Shared URL targeting Studio staging -> [SHARED GUARD FATAL] propagated to caller, Promise rejects', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(/\[SHARED GUARD FATAL\].*targets Studio staging/);

      await expect(fetchActiveCatalogForShared(mockTenant)).rejects.toThrow(
        /\[SHARED GUARD FATAL\].*targets Studio staging/
      );
    });

    it('CTX-18.e: Shared admin key missing -> [SHARED ADMIN FATAL] propagated to caller, Promise rejects, createClient never called', async () => {
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const supabaseJs = require('@supabase/supabase-js');
      const createClientSpy = jest.spyOn(supabaseJs, 'createClient');

      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      } finally {
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
        createClientSpy.mockRestore();
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(
        /\[SHARED ADMIN FATAL\] Missing SUPABASE_SERVICE_ROLE_KEY environment variable/
      );
      expect(createClientSpy).not.toHaveBeenCalled();

      // Double-verify via rejects.toThrow
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        await expect(fetchActiveCatalogForShared(mockTenant)).rejects.toThrow(
          /\[SHARED ADMIN FATAL\] Missing SUPABASE_SERVICE_ROLE_KEY environment variable/
        );
      } finally {
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
    });

    it('CTX-18.f: Shared invalid endpoint -> [SHARED GUARD FATAL] propagated to caller, createClient never called', async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://attacker-controlled.com';

      const supabaseJs = require('@supabase/supabase-js');
      const createClientSpy = jest.spyOn(supabaseJs, 'createClient');

      let didResolve = false;
      let caughtError: any = null;
      try {
        await fetchActiveCatalogForShared(mockTenant);
        didResolve = true;
      } catch (err) {
        caughtError = err;
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        createClientSpy.mockRestore();
      }

      expect(didResolve).toBe(false);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toMatch(/\[SHARED GUARD FATAL\].*not an authorized Supabase project endpoint format/);
      expect(createClientSpy).not.toHaveBeenCalled();
    });
  });
});
