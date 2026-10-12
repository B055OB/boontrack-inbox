import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  getSupabase,
  getSupabaseAdmin,
} from '@/lib/supabaseClient';
import {
  supabase as supabaseFromLib,
  SUPABASE_URL as libUrl,
  SUPABASE_ANON_KEY as libKey,
  SUPABASE_PUBLISHABLE_KEY as libPub,
  SUPABASE_SERVICE_ROLE_KEY as libService,
} from '@/lib/supabase';
import {
  supabase as supabaseFromUtils,
  createBrowserClient,
  createClientComponentClient,
} from '@/utils/supabase/client';

describe('Supabase Client Hardcoded Fallback Suite', () => {
  const EXPECTED_URL = 'https://mpluzajlzpregmjwpjqr.supabase.co';
  const EXPECTED_KEY_PREFIX = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const EXPECTED_PUB_KEY = 'sb_publishable_OXETaOPFYI_AKCrKpLEr0Q__RUHScg7';

  describe('1. lib/supabaseClient.ts exports & fallbacks', () => {
    it('SUPABASE_URL, SUPABASE_ANON_KEY, PUBLISHABLE_KEY, and SERVICE_ROLE_KEY have valid non-empty string defaults', () => {
      expect(SUPABASE_URL).toBe(EXPECTED_URL);
      expect(SUPABASE_ANON_KEY.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
      expect(SUPABASE_PUBLISHABLE_KEY).toBe(EXPECTED_PUB_KEY);
      expect(SUPABASE_SERVICE_ROLE_KEY.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
    });

    it('supabase client instance is defined and does not throw supabaseKey is required', () => {
      expect(supabase).toBeDefined();
      expect(typeof supabase.from).toBe('function');
    });

    it('getSupabase() returns active instance with guard fetch', () => {
      const client = getSupabase();
      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
    });

    it('getSupabaseAdmin() falls back to SUPABASE_SERVICE_ROLE_KEY and never throws', () => {
      expect(() => {
        const adminClient = getSupabaseAdmin();
        expect(adminClient).toBeDefined();
        expect(typeof adminClient.from).toBe('function');
      }).not.toThrow();
    });
  });

  describe('2. lib/supabase.ts universal fallback export', () => {
    it('exports supabase and all fallback credentials matching specification', () => {
      expect(libUrl).toBe(EXPECTED_URL);
      expect(libKey.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
      expect(libPub).toBe(EXPECTED_PUB_KEY);
      expect(libService.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
      expect(supabaseFromLib).toBeDefined();
      expect(typeof supabaseFromLib.from).toBe('function');
    });
  });

  describe('3. utils/supabase/client.ts universal fallback export', () => {
    it('exports supabase, createBrowserClient, and createClientComponentClient', () => {
      expect(supabaseFromUtils).toBeDefined();
      expect(typeof supabaseFromUtils.from).toBe('function');
      expect(createBrowserClient()).toBe(supabaseFromUtils);
      expect(createClientComponentClient()).toBe(supabaseFromUtils);
    });
  });
});
