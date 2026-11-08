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
  getWorkforceSupabaseAdmin,
  assertSharedRestUrlTarget,
  assertStagingRestUrlTarget,
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
  const EXPECTED_URL = process.env.WORKFORCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co';
  const EXPECTED_KEY = process.env.WORKFORCE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-test';
  const HARDCODED_SERVICE_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQxNzIzMiwiZXhwIjoyMTAxOTkzMjMyfQ.TJMAEJQXeAv33EcwCt6OVyaC0ZFTROWzuljvm07i0Qg';

  // ─── 1. lib/supabaseClient.ts ────────────────────────────────────────────────
  describe('1. lib/supabaseClient.ts', () => {
    it('SUPABASE_URL resolves from env (no hardcoded fallback)', () => {
      expect(SUPABASE_URL).toBe(EXPECTED_URL);
      // Value must originate from env, not a hardcoded string literal in source
      expect(SUPABASE_URL).toBe(process.env.WORKFORCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    });

    it('SUPABASE_ANON_KEY resolves from env (no hardcoded fallback)', () => {
      expect(SUPABASE_ANON_KEY).toBe(EXPECTED_KEY);
      expect(SUPABASE_ANON_KEY).toBe(process.env.WORKFORCE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    });

    it('SUPABASE_SERVICE_ROLE_KEY resolves from env with NO hardcoded JWT string in source code', () => {
      const expectedService = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      expect(SUPABASE_SERVICE_ROLE_KEY).toBe(expectedService);
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
      const originalWorkforceKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
      try {
        expect(() => getSupabaseAdmin()).toThrow(
          '[SHARED ADMIN FATAL] Missing SUPABASE_SERVICE_ROLE_KEY environment variable'
        );
      } finally {
        // Restore so subsequent tests are not affected
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = originalWorkforceKey;
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

    // ─── getWorkforceSupabaseAdmin() Isolated Workforce Factory ───────────────────────────
    describe('getWorkforceSupabaseAdmin() Isolated Workforce Factory', () => {
      const originalWfUrl = process.env.WORKFORCE_SUPABASE_URL;
      const originalWfKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
      const originalSharedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalSharedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      afterEach(() => {
        process.env.WORKFORCE_SUPABASE_URL = originalWfUrl;
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = originalWfKey;
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalSharedUrl;
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalSharedKey;
        delete (global as any).window;
      });

      it('succeeds and returns active client when WORKFORCE_SUPABASE_* are valid', () => {
        process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = originalWfKey || 'test-service-key';
        const client = getWorkforceSupabaseAdmin();
        expect(client).toBeDefined();
        expect(typeof client.from).toBe('function');
      });

      it('strictly throws on missing WORKFORCE_SUPABASE_URL with ZERO fallback to NEXT_PUBLIC_SUPABASE_URL', () => {
        delete process.env.WORKFORCE_SUPABASE_URL;
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_URL is missing/);
      });

      it('strictly throws on missing WORKFORCE_SUPABASE_SERVICE_ROLE_KEY with ZERO fallback to SUPABASE_SERVICE_ROLE_KEY', () => {
        process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
        delete process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-service-key-that-must-be-ignored';
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing/);
      });

      it('strictly throws when WORKFORCE_SUPABASE_URL targets production database (mpluz)', () => {
        process.env.WORKFORCE_SUPABASE_URL = 'https://mpluzajlzpregmjwpjqr.supabase.co';
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/targets production database/);
      });

      it('strictly throws when WORKFORCE_SUPABASE_URL targets Studio staging (xkhq)', () => {
        process.env.WORKFORCE_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/targets Studio staging/);
      });

      it('strictly throws when WORKFORCE_SUPABASE_URL is a lookalike hostname', () => {
        process.env.WORKFORCE_SUPABASE_URL = 'https://evil-tjkbgxrckaocgosvmzmj.supabase.co';
        process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/lookalike or project ref smuggling detected/);
      });

      it('strictly throws if called in browser window context', () => {
        (global as any).window = {};
        expect(() => getWorkforceSupabaseAdmin()).toThrow(/Security Guard/);
      });

      // ─── Singleton Independence & Cross-Domain Isolation ────────────────────
      describe('Singleton Independence & Cross-Domain Isolation', () => {
        const WF_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
        const WF_KEY = 'workforce-secret-role-key-1';
        const SHARED_KEY = 'shared-secret-role-key-1';

        beforeEach(() => {
          process.env.WORKFORCE_SUPABASE_URL = WF_URL;
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = WF_KEY;
          process.env.SUPABASE_SERVICE_ROLE_KEY = SHARED_KEY;
        });

        it('ISO-1: Shared first -> Workforce second produces two distinct, non-identical instances', () => {
          const sharedAdmin = getSupabaseAdmin();
          const workforceAdmin = getWorkforceSupabaseAdmin();

          expect(sharedAdmin).toBeDefined();
          expect(workforceAdmin).toBeDefined();
          // STRICT: instances must NEVER be identical
          expect(workforceAdmin).not.toBe(sharedAdmin);
        });

        it('ISO-2: Workforce first -> Shared second produces two distinct, non-identical instances', () => {
          // Force new key to bypass previous cache
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'wf-key-order-test-2';
          process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-key-order-test-2';

          const workforceAdmin = getWorkforceSupabaseAdmin();
          const sharedAdmin = getSupabaseAdmin();

          expect(workforceAdmin).toBeDefined();
          expect(sharedAdmin).toBeDefined();
          expect(workforceAdmin).not.toBe(sharedAdmin);
        });

        it('ISO-3: Identical service key across both factories still produces distinct client instances targeting respective URLs', () => {
          const IDENTICAL_KEY = 'identical-secret-key-across-domains';
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = IDENTICAL_KEY;
          process.env.SUPABASE_SERVICE_ROLE_KEY = IDENTICAL_KEY;

          // Spy on createClient to verify exact target URLs passed
          const supabaseJs = require('@supabase/supabase-js');
          const createClientSpy = jest.spyOn(supabaseJs, 'createClient');

          try {
            const wfAdmin = getWorkforceSupabaseAdmin();
            const sharedAdmin = getSupabaseAdmin();

            expect(wfAdmin).not.toBe(sharedAdmin);

            // Verify createClient was called with respective URLs
            const calls = createClientSpy.mock.calls;
            const wfCall = calls.find((c: any[]) => c[0] === WF_URL);
            expect(wfCall).toBeDefined();
            expect(wfCall[1]).toBe(IDENTICAL_KEY);
          } finally {
            createClientSpy.mockRestore();
          }
        });

        it('ISO-4: Key rotation in Workforce factory rotates ONLY workforceAdminInstance without affecting sharedAdmin', () => {
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'wf-key-initial';
          process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-key-stable';

          const initialWf = getWorkforceSupabaseAdmin();
          const initialShared = getSupabaseAdmin();

          // Rotate Workforce key
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'wf-key-rotated';
          const rotatedWf = getWorkforceSupabaseAdmin();
          const currentShared = getSupabaseAdmin();

          // Workforce instance must be newly created
          expect(rotatedWf).not.toBe(initialWf);
          // Shared instance must remain unchanged
          expect(currentShared).toBe(initialShared);
        });

        it('ISO-5: Key rotation in Shared factory rotates ONLY supabaseAdminInstance without affecting workforceAdmin', () => {
          process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'wf-key-stable';
          process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-key-initial';

          const initialWf = getWorkforceSupabaseAdmin();
          const initialShared = getSupabaseAdmin();

          // Rotate Shared key
          process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-key-rotated';
          const currentWf = getWorkforceSupabaseAdmin();
          const rotatedShared = getSupabaseAdmin();

          // Shared instance must be newly created
          expect(rotatedShared).not.toBe(initialShared);
          // Workforce instance must remain unchanged
          expect(currentWf).toBe(initialWf);
        });
      });

      // ─── assertSharedRestUrlTarget & Shared Factory Validation ──────────────
      describe('assertSharedRestUrlTarget & Shared Factory Validation', () => {
        it('throws on missing or empty REST URL', () => {
          expect(() => assertSharedRestUrlTarget('')).toThrow(/SHARED GUARD FATAL.*NEXT_PUBLIC_SUPABASE_URL is missing/);
        });

        it('strictly throws when URL targets Workforce staging (tjkbgxrckaocgosvmzmj)', () => {
          expect(() => assertSharedRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co')).toThrow(
            /SHARED GUARD FATAL.*targets Workforce staging/
          );
        });

        it('strictly throws when URL targets Studio staging (xkhqirhurnjqglmajghn)', () => {
          expect(() => assertSharedRestUrlTarget('https://xkhqirhurnjqglmajghn.supabase.co')).toThrow(
            /SHARED GUARD FATAL.*targets Studio staging/
          );
        });

        it('strictly throws on Workforce lookalike hostname', () => {
          expect(() => assertSharedRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co.evil.com')).toThrow(
            /SHARED GUARD FATAL.*targets Workforce staging/
          );
        });

        it('strictly throws on Studio lookalike hostname', () => {
          expect(() => assertSharedRestUrlTarget('https://xkhqirhurnjqglmajghn.supabase.co.evil.com')).toThrow(
            /SHARED GUARD FATAL.*targets Studio staging/
          );
        });

        it('strictly throws on insecure HTTP protocol', () => {
          expect(() => assertSharedRestUrlTarget('http://mock-project.supabase.co')).toThrow(
            /SHARED GUARD FATAL.*Insecure protocol/
          );
        });

        it('strictly throws on embedded credentials', () => {
          expect(() => assertSharedRestUrlTarget('https://admin:password@mock-project.supabase.co')).toThrow(
            /SHARED GUARD FATAL.*Embedded credentials/
          );
        });

        it('strictly throws on non-standard port', () => {
          expect(() => assertSharedRestUrlTarget('https://mock-project.supabase.co:8443')).toThrow(
            /SHARED GUARD FATAL.*Unexpected port/
          );
        });

        it('strictly throws on unexpected pathname', () => {
          expect(() => assertSharedRestUrlTarget('https://mock-project.supabase.co/rest/v1')).toThrow(
            /SHARED GUARD FATAL.*Unexpected pathname/
          );
        });

        it('strictly throws on query string', () => {
          expect(() => assertSharedRestUrlTarget('https://mock-project.supabase.co?token=secret')).toThrow(
            /SHARED GUARD FATAL.*Query parameters/
          );
        });

        it('strictly throws on fragment identifier', () => {
          expect(() => assertSharedRestUrlTarget('https://mock-project.supabase.co#fragment')).toThrow(
            /SHARED GUARD FATAL.*Fragment identifier/
          );
        });

        it('accepts and normalizes approved mock endpoint in test harness', () => {
          const canonical = assertSharedRestUrlTarget('https://mock-project.supabase.co/');
          expect(canonical).toBe('https://mock-project.supabase.co');
        });

        it('accepts and normalizes valid platform HTTPS endpoint (20-char ref)', () => {
          const canonical = assertSharedRestUrlTarget('https://abcdefghijklmnopqrst.supabase.co');
          expect(canonical).toBe('https://abcdefghijklmnopqrst.supabase.co');
        });

        it('Shared factory getSupabase() creates client with validated URL', () => {
          const expectedUrl = assertSharedRestUrlTarget(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co');
          const client = getSupabase();
          expect(client).toBeDefined();
          expect((client as any).supabaseUrl).toBe(expectedUrl);
        });

        // ─── getSupabaseAdmin() Direct Factory Tests ─────────────────────────
        it('getSupabaseAdmin() succeeds when endpoint and key are valid', () => {
          const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          try {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-test-service-key-abc';
            const adminClient = getSupabaseAdmin();
            expect(adminClient).toBeDefined();
            expect(typeof adminClient.from).toBe('function');
            expect((adminClient as any).supabaseUrl).toBe('https://abcdefghijklmnopqrst.supabase.co');
          } finally {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
          }
        });

        it('getSupabaseAdmin() strictly rejects Workforce staging endpoint', () => {
          const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          try {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-test-service-key-abc';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*targets Workforce staging/);
          } finally {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
          }
        });

        it('getSupabaseAdmin() strictly rejects Studio staging endpoint', () => {
          const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          try {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-test-service-key-abc';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*targets Studio staging/);
          } finally {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
          }
        });

        it('getSupabaseAdmin() strictly rejects foreign / attacker-controlled endpoint', () => {
          const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          try {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://attacker-controlled.com';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-test-service-key-abc';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*not an authorized Supabase project endpoint format/);
          } finally {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
          }
        });

        it('createClient() is NEVER called when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
          const supabaseJs = require('@supabase/supabase-js');
          const createClientSpy = jest.spyOn(supabaseJs, 'createClient');
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
          try {
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED ADMIN FATAL\]/);
            expect(createClientSpy).not.toHaveBeenCalled();
          } finally {
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
            createClientSpy.mockRestore();
          }
        });

        it('createClient() is NEVER called when NEXT_PUBLIC_SUPABASE_URL is invalid or unauthorized in getSupabaseAdmin()', () => {
          const supabaseJs = require('@supabase/supabase-js');
          const createClientSpy = jest.spyOn(supabaseJs, 'createClient');
          const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-test-service-key-12345';
          try {
            // 1. Workforce endpoint
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*targets Workforce staging/);
            expect(createClientSpy).not.toHaveBeenCalled();

            // 2. Studio endpoint
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*targets Studio staging/);
            expect(createClientSpy).not.toHaveBeenCalled();

            // 3. Foreign endpoint
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://attacker-controlled.com';
            expect(() => getSupabaseAdmin()).toThrow(/\[SHARED GUARD FATAL\].*not an authorized Supabase project endpoint format/);
            expect(createClientSpy).not.toHaveBeenCalled();
          } finally {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
            createClientSpy.mockRestore();
          }
        });
      });
    });
  });

  // ─── 2. lib/supabase.ts ─────────────────────────────────────────────────────
  describe('2. lib/supabase.ts', () => {
    it('exports URL and ANON_KEY sourced from env (no hardcoded fallbacks)', () => {
      expect(libUrl).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
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

