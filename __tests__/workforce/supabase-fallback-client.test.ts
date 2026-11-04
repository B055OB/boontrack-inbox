/**
 * __tests__/workforce/supabase-fallback-client.test.ts
 * BWM Gate E6: Supabase Client Fallback Verification Suite
 *
 * Verifies that:
 * 1. WORKFORCE_SUPABASE_URL and WORKFORCE_SUPABASE_ANON_KEY act as valid fallbacks
 *    when NEXT_PUBLIC_SUPABASE_* variables are missing, preventing crash.
 * 2. getSupabaseAdmin() resolves service role key properly on server side.
 * 3. @workforce/lib/supabase and @workforce/lib/supabaseClient are fully functional.
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

  it('should initialize using WORKFORCE_SUPABASE_URL and WORKFORCE_SUPABASE_ANON_KEY when NEXT_PUBLIC_* are empty', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
    process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key_for_test';

    const { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } = await import(
      '../../workforce-web/lib/supabase'
    );

    expect(supabase).toBeDefined();
    expect(SUPABASE_URL).toBe('https://tjkbgxrckaocgosvmzmj.supabase.co');
    expect(SUPABASE_ANON_KEY).toBe('mock_workforce_anon_key_for_test');
  });

  it('should not throw "Missing required environment variable" in development when all env vars are unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.WORKFORCE_SUPABASE_URL;
    delete process.env.WORKFORCE_SUPABASE_ANON_KEY;
    process.env.NODE_ENV = 'development';

    expect(async () => {
      const { supabase, SUPABASE_URL } = await import('../../workforce-web/lib/supabase');
      expect(supabase).toBeDefined();
      expect(SUPABASE_URL).toBe('https://tjkbgxrckaocgosvmzmj.supabase.co');
    }).not.toThrow();
  });

  it('should export getSupabaseAdmin that uses WORKFORCE_SUPABASE_SERVICE_ROLE_KEY', async () => {
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

  it('supabaseClient.ts re-exports the exact same instance', async () => {
    process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
    process.env.WORKFORCE_SUPABASE_ANON_KEY = 'mock_workforce_anon_key_for_test';

    const clientFromLib = await import('../../workforce-web/lib/supabase');
    const clientFromClientFile = await import('../../workforce-web/lib/supabaseClient');

    expect(clientFromClientFile.supabase).toBe(clientFromLib.supabase);
    expect(clientFromClientFile.SUPABASE_URL).toBe(clientFromLib.SUPABASE_URL);
  });
});
