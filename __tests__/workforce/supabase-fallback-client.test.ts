/**
 * __tests__/workforce/supabase-fallback-client.test.ts
 * BWM Post-Gate 1 Hardening: Workforce Supabase Client Security Suite
 *
 * Verifies that:
 * 1. WORKFORCE_SUPABASE_URL strictly and exclusively targets tjkbgxrckaocgosvmzmj.supabase.co.
 * 2. ZERO fallback to NEXT_PUBLIC_SUPABASE_* or generic shared database.
 * 3. Exact-host allowlist rejection:
 *    - Production (mpluzajlzpregmjwpjqr) fail-closed.
 *    - Studio staging (xkhqirhurnjqglmajghn) fail-closed.
 *    - Arbitrary Supabase projects fail-closed.
 *    - Lookalike hostnames (e.g. tjkbgxrckaocgosvmzmj.supabase.co.attacker.com) fail-closed.
 *    - Insecure HTTP protocol fail-closed.
 *    - Embedded credentials fail-closed.
 *    - Custom ports fail-closed.
 *    - Unexpected pathname / query / fragment fail-closed.
 * 4. Missing required configuration fails explicitly in production.
 * 5. getSupabaseAdmin() strictly requires WORKFORCE_SUPABASE_SERVICE_ROLE_KEY (zero fallback to SUPABASE_SERVICE_ROLE_KEY).
 * 6. Browser context safety: SUPABASE_SERVICE_ROLE_KEY is blank in window context; getSupabaseAdmin throws.
 */

describe('Workforce Web Supabase Fallback Client Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── 1. Exact Host & Successful Initialization ──────────────────────────────
  describe('1. Exact Workforce Host & Normal Resolution', () => {
    it('accepts exact Workforce staging host (tjkbgxrckaocgosvmzmj.supabase.co)', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key_for_test';

      const { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, assertExactWorkforceUrl } = await import(
        '../../workforce-web/lib/supabase'
      );

      expect(supabase).toBeDefined();
      expect(SUPABASE_URL).toBe('https://tjkbgxrckaocgosvmzmj.supabase.co');
      expect(SUPABASE_ANON_KEY).toBe('mock_workforce_anon_key_for_test');
      expect(assertExactWorkforceUrl('https://tjkbgxrckaocgosvmzmj.supabase.co')).toBe(
        'https://tjkbgxrckaocgosvmzmj.supabase.co'
      );
    });

    it('defaults safely to exact Workforce staging host in development/preview when env vars are unset', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.WORKFORCE_SUPABASE_URL;
      delete process.env.WORKFORCE_SUPABASE_ANON_KEY;
      process.env.NODE_ENV = 'development';

      const { supabase, SUPABASE_URL } = await import('../../workforce-web/lib/supabase');
      expect(supabase).toBeDefined();
      expect(SUPABASE_URL).toBe('https://tjkbgxrckaocgosvmzmj.supabase.co');
    });

    it('supabaseClient.ts re-exports the exact same instance', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key_for_test';

      const clientFromLib = await import('../../workforce-web/lib/supabase');
      const clientFromClientFile = await import('../../workforce-web/lib/supabaseClient');

      expect(clientFromClientFile.supabase).toBe(clientFromLib.supabase);
      expect(clientFromClientFile.SUPABASE_URL).toBe(clientFromLib.SUPABASE_URL);
    });
  });

  // ─── 2. Host Target Security & WHATWG Validation ─────────────────────────────
  describe('2. WHATWG Exact-Host Security Rejections', () => {
    it('strictly rejects Production database reference (mpluzajlzpregmjwpjqr)', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://mpluzajlzpregmjwpjqr.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Production database reference detected in Workforce configuration/);
    });

    it('strictly rejects Studio staging database reference (xkhqirhurnjqglmajghn)', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Studio database reference detected in Workforce configuration/);
    });

    it('strictly rejects arbitrary Supabase project hostname', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Unauthorized hostname 'abcdefghijklmnopqrst.supabase.co'/);
    });

    it('strictly rejects lookalike hostname (subdomain spoofing / suffix attack)', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co.attacker.com';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Unauthorized hostname 'tjkbgxrckaocgosvmzmj.supabase.co.attacker.com'/);
    });

    it('strictly rejects insecure HTTP protocol (must be HTTPS)', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'http://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Insecure protocol 'http:'/);
    });

    it('strictly rejects URL with embedded credentials', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://admin:secret@tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/must not contain embedded credentials/);
    });

    it('strictly rejects custom non-standard port', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co:8443';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Custom port '8443' is not permitted/);
    });

    it('strictly rejects unexpected pathname', async () => {
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co/rest/v1';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Unexpected pathname '\/rest\/v1'/);
    });

    it('strictly rejects query parameters in URL', async () => {
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co?token=leak';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Query string parameters are not permitted/);
    });

    it('strictly rejects fragment identifier (#hash) in URL', async () => {
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co#leak-hash';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_key';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/Fragment identifiers are not permitted/);
    });
  });

  // ─── 3. Missing Configuration In Production ─────────────────────────────────
  describe('3. Production Fail-Closed on Missing Configuration', () => {
    it('fails closed in production if WORKFORCE_SUPABASE_URL is missing (even if NEXT_PUBLIC_SUPABASE_URL exists)', async () => {
      jest.resetModules();
      delete process.env.WORKFORCE_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://some-shared-project.supabase.co';
      delete process.env.VERCEL_ENV;
      delete process.env.CI;
      process.env.NODE_ENV = 'production';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/WORKFORCE CONFIG FATAL.*WORKFORCE_SUPABASE_URL/);
    });

    it('fails closed in production if WORKFORCE_SUPABASE_ANON_KEY is missing', async () => {
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      delete process.env.WORKFORCE_SUPABASE_ANON_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'shared_anon_key';
      delete process.env.VERCEL_ENV;
      delete process.env.CI;
      process.env.NODE_ENV = 'production';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/WORKFORCE CONFIG FATAL.*WORKFORCE_SUPABASE_ANON_KEY/);
    });

    it('fails closed in production even when CI=true if WORKFORCE_SUPABASE_URL and anon key are unset (CI is not an exception)', async () => {
      jest.resetModules();
      delete process.env.WORKFORCE_SUPABASE_URL;
      delete process.env.WORKFORCE_SUPABASE_ANON_KEY;
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'production';
      process.env.CI = 'true';

      await expect(async () => {
        await import('../../workforce-web/lib/supabase');
      }).rejects.toThrow(/WORKFORCE CONFIG FATAL.*WORKFORCE_SUPABASE_URL/);
    });
  });

  // ─── 4. Admin Service Role & Client-Side Safety ──────────────────────────────
  describe('4. Service Role Isolation & Browser Bundle Protection', () => {
    it('exports getSupabaseAdmin that uses WORKFORCE_SUPABASE_SERVICE_ROLE_KEY', async () => {
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key_for_test';
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'mock_workforce_service_role_key_for_test';

      const { getSupabaseAdmin, SUPABASE_SERVICE_ROLE_KEY } = await import(
        '../../workforce-web/lib/supabase'
      );

      expect(SUPABASE_SERVICE_ROLE_KEY).toBe('mock_workforce_service_role_key_for_test');
      const admin = getSupabaseAdmin();
      expect(admin).toBeDefined();
    });

    it('getSupabaseAdmin strictly throws when WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing (zero fallback to shared key)', async () => {
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key';
      delete process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared_service_role_key_that_must_not_be_used';

      const { getSupabaseAdmin } = await import('../../workforce-web/lib/supabase');
      expect(() => getSupabaseAdmin()).toThrow(
        /WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_SERVICE_ROLE_KEY/
      );
    });

    it('protects browser client bundle: blanks service-role key and throws on getSupabaseAdmin in window context', async () => {
      (global as any).window = {};
      jest.resetModules();
      process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
      process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key';
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'mock_server_secret_that_must_not_leak_to_client';

      try {
        const { getSupabaseAdmin, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '../../workforce-web/lib/supabase'
        );
        expect(SUPABASE_SERVICE_ROLE_KEY).toBe('');
        expect(() => getSupabaseAdmin()).toThrow(/cannot be called in browser context/);
      } finally {
        delete (global as any).window;
        jest.resetModules();
      }
    });
  });
});
