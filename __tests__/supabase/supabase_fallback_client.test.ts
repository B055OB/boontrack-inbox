/**
 * Security contract tests for Supabase client modules.
 *
 * These tests verify that:
 * 1. NO hardcoded credential strings exist as fallbacks.
 * 2. All values are sourced exclusively from process.env.
 * 3. getSupabaseAdmin() throws the exact required error when env var is absent.
 * 4. utils/supabase/client.ts does NOT export SUPABASE_SERVICE_ROLE_KEY.
 *
 * The test environment loads .env / .env.local via setupEnv.ts (setupFiles),
 * so process.env vars are available when these modules are first imported.
 */

// Unmock modules for this test file so it validates actual implementation contracts
jest.unmock('@/lib/supabaseClient');
jest.unmock('@/lib/supabase');
jest.unmock('@/utils/supabase/client');
jest.unmock('@supabase/supabase-js');

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
  SUPABASE_SERVICE_ROLE_KEY as libService,
} from '@/lib/supabase';
import * as utilsClientModule from '@/utils/supabase/client';
import {
  supabase as supabaseFromUtils,
  createBrowserClient,
  createClientComponentClient,
} from '@/utils/supabase/client';

describe('Supabase Client Security Contract Suite', () => {
  const EXPECTED_URL = 'https://mpluzajlzpregmjwpjqr.supabase.co';
  const EXPECTED_KEY_PREFIX = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const HARDCODED_SERVICE_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQxNzIzMiwiZXhwIjoyMTAxOTkzMjMyfQ.TJMAEJQXeAv33EcwCt6OVyaC0ZFTROWzuljvm07i0Qg';

  // ─── 1. lib/supabaseClient.ts ────────────────────────────────────────────────
  describe('1. lib/supabaseClient.ts', () => {
    it('SUPABASE_URL resolves from env (no hardcoded fallback)', () => {
      expect(SUPABASE_URL).toBe(EXPECTED_URL);
      // Value must originate from env, not a hardcoded string literal in source
      expect(SUPABASE_URL).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
    });

    it('SUPABASE_ANON_KEY resolves from env (no hardcoded fallback)', () => {
      expect(SUPABASE_ANON_KEY.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
      expect(SUPABASE_ANON_KEY).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    });

    it('SUPABASE_SERVICE_ROLE_KEY resolves from env with NO hardcoded JWT string in source code', () => {
      expect(SUPABASE_SERVICE_ROLE_KEY).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
      // Verify the source file does not contain the hardcoded JWT literal
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(path.resolve(__dirname, '../../lib/supabaseClient.ts'), 'utf-8');
      expect(source).not.toContain(HARDCODED_SERVICE_JWT);
    });

    it('supabase browser client is defined and functional', () => {
      expect(supabase).toBeDefined();
      expect(typeof supabase.from).toBe('function');
    });

    it('getSupabase() returns active instance with guarded fetch', () => {
      const client = getSupabase();
      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
    });

    it('getSupabaseAdmin() succeeds when SUPABASE_SERVICE_ROLE_KEY env var is set', () => {
      expect(() => {
        const adminClient = getSupabaseAdmin();
        expect(adminClient).toBeDefined();
        expect(typeof adminClient.from).toBe('function');
      }).not.toThrow();
    });

    it('getSupabaseAdmin() throws EXACT required error when SUPABASE_SERVICE_ROLE_KEY is absent', () => {
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        expect(() => getSupabaseAdmin()).toThrow(
          'Missing SUPABASE_SERVICE_ROLE_KEY environment variable'
        );
      } finally {
        // Restore so subsequent tests are not affected
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
    });

    it('getSupabaseAdmin() throws security error if called in browser window context', () => {
      (global as any).window = {};
      try {
        expect(() => getSupabaseAdmin()).toThrow(/Security Guard/);
      } finally {
        delete (global as any).window;
      }
    });
  });

  // ─── 2. lib/supabase.ts ─────────────────────────────────────────────────────
  describe('2. lib/supabase.ts', () => {
    it('exports URL and ANON_KEY sourced from env (no hardcoded fallbacks)', () => {
      expect(libUrl).toBe(EXPECTED_URL);
      expect(libUrl).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
      expect(libKey.startsWith(EXPECTED_KEY_PREFIX)).toBe(true);
      expect(libKey).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    });

    it('SUPABASE_SERVICE_ROLE_KEY from lib/supabase.ts is NOT hardcoded in source code', () => {
      expect(libService).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(path.resolve(__dirname, '../../lib/supabase.ts'), 'utf-8');
      expect(source).not.toContain(HARDCODED_SERVICE_JWT);
    });

    it('supabase client instance is defined', () => {
      expect(supabaseFromLib).toBeDefined();
      expect(typeof supabaseFromLib.from).toBe('function');
    });
  });

  // ─── 3. utils/supabase/client.ts ─────────────────────────────────────────────
  describe('3. utils/supabase/client.ts', () => {
    it('does NOT export SUPABASE_SERVICE_ROLE_KEY (security prohibition)', () => {
      expect('SUPABASE_SERVICE_ROLE_KEY' in utilsClientModule).toBe(false);
    });

    it('exports functional supabase, createBrowserClient, and createClientComponentClient', () => {
      expect(supabaseFromUtils).toBeDefined();
      expect(typeof supabaseFromUtils.from).toBe('function');
      expect(createBrowserClient()).toBe(supabaseFromUtils);
      expect(createClientComponentClient()).toBe(supabaseFromUtils);
    });

    it('URL and ANON_KEY resolve from env (no hardcoded fallbacks)', () => {
      expect(utilsClientModule.SUPABASE_URL).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
      expect(utilsClientModule.SUPABASE_ANON_KEY).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    });
  });
});

