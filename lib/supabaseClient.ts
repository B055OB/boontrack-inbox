import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isValidUuid, safeUuidOrNull } from './uuid-guard';

export { isValidUuid, safeUuidOrNull };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';

// CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY HARUS tersedia saat build.
// Fallback ke hardcoded JWT anon key agar client browser tidak crash dengan
// 'supabaseKey is required' ketika env var tidak ter-inject pada deployment.
// Jika env var tersedia (format JWT atau publishable key baru), itu yang dipakai.
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// Supabase publishable key baru (sb_publishable_...) tidak kompatibel dengan
// supabase-js SDK versi lama — selalu gunakan JWT anon key.
const supabaseAnonKey = (rawAnonKey && rawAnonKey.startsWith('eyJ')) ? rawAnonKey : FALLBACK_ANON_KEY;
if (!rawAnonKey || !rawAnonKey.startsWith('eyJ')) {
  if (typeof window !== 'undefined') {
    console.warn(
      '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY tidak tersedia atau bukan format JWT. ' +
      'Menggunakan fallback anon key. Pastikan env var dikonfigurasi di Vercel dashboard.'
    );
  }
}

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
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();

  if (!supabaseAdminInstance || (serviceKey && serviceKey !== lastConfiguredAdminKey)) {
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