import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isValidUuid, safeUuidOrNull } from './uuid-guard';

export { isValidUuid, safeUuidOrNull };

// ─── Fail-closed validation (module load time) ───────────────────────────────
const _url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const _anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!_url) {
  throw new Error(
    '[Supabase Config] Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL'
  );
}
if (!_anonKey) {
  throw new Error(
    '[Supabase Config] Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const SUPABASE_URL: string = _url;
export const SUPABASE_ANON_KEY: string = _anonKey;
export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * SERVER-ONLY. Reads from process.env — no hardcoded fallback.
 * Returns empty string in browser context to prevent accidental exposure.
 * Use getSupabaseAdmin() for all admin-privileged DB operations.
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    : '';

// Direct export of browser-safe Supabase client (lazy initialization prevents eager WebSocket connections at module load)
let _supabaseInstance: SupabaseClient | null = null;
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseInstance) {
      _supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return (_supabaseInstance as any)[prop];
  },
});

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

/**
 * Creates a fetch wrapper that protects Supabase from egress quota exhaustion:
 * 1. Blocks requests attempting to query with 'undefined' or 'null' values on parameters
 * 2. Emits structured warnings on 4xx client errors without infinite loops
 */
function createGuardedFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Guard: Intercept queries containing '=eq.undefined' or '=eq.null' before egress
    if (
      urlStr.includes('=eq.undefined') ||
      urlStr.includes('=eq.null') ||
      urlStr.includes('=eq.%5Bobject%20Object%5D')
    ) {
      console.warn(`[Supabase Guard] Blocked invalid query parameter (undefined/null): ${urlStr}`);
      return new Response(
        JSON.stringify({
          error: {
            message: 'Query parameter cannot be undefined or null',
            code: 'INVALID_QUERY_PARAMETER',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const response = await fetch(input, init);

      // Log 4xx warnings once for diagnostic visibility
      if (response.status >= 400 && response.status < 500) {
        console.warn(`[Supabase 4xx Client Warning] ${init?.method || 'GET'} ${urlStr} → HTTP ${response.status}`);
      }

      return response;
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.warn(`[Supabase Network Warning] ${init?.method || 'GET'} ${urlStr} → ${msg}`);
      throw networkErr;
    }
  };
}

let supabaseInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

export const getSupabase = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: createGuardedFetch(),
      },
    });
  }
  return supabaseInstance;
};

let lastConfiguredAdminKey: string | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    throw new Error('[Security Guard] getSupabaseAdmin() cannot be called in client-side browser context.');
  }

  // Read ONLY from process.env — no hardcoded fallback, no alias chain.
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  if (!supabaseAdminInstance || serviceKey !== lastConfiguredAdminKey) {
    lastConfiguredAdminKey = serviceKey;
    supabaseAdminInstance = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      global: {
        fetch: createGuardedFetch(),
      },
    });
  }
  return supabaseAdminInstance!;
};