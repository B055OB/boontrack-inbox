import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Environment Variable Resolution with Fallback ───────────────────────────
// Prioritizes WORKFORCE_SUPABASE_* and falls back to NEXT_PUBLIC_SUPABASE_*
// to prevent 'Missing required environment variable' errors.
let _url =
  process.env.WORKFORCE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

let _anonKey =
  process.env.WORKFORCE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!_url || !_anonKey) {
  const isNonProduction =
    process.env.NODE_ENV !== 'production' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'development' ||
    process.env.CI === 'true';

  if (isNonProduction) {
    // Dedicated Workforce Staging Instance fallback for local dev/preview
    _url = _url || 'https://tjkbgxrckaocgosvmzmj.supabase.co';
    _anonKey = _anonKey || 'mock_workforce_anon_key';
  } else {
    if (!_url) {
      throw new Error(
        '[Supabase Config] Missing required environment variable: WORKFORCE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'
      );
    }
    if (!_anonKey) {
      throw new Error(
        '[Supabase Config] Missing required environment variable: WORKFORCE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
      );
    }
  }
}

export const SUPABASE_URL: string = _url;
export const SUPABASE_ANON_KEY: string = _anonKey;
export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.WORKFORCE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  _anonKey;

/**
 * SERVER-ONLY. Reads from process.env — no hardcoded fallback.
 * Returns empty string in browser context to prevent accidental exposure.
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY ||
       process.env.SUPABASE_SERVICE_ROLE_KEY ||
       '')
    : '';

/**
 * Standard Supabase client instance for Workforce Web (Port 3001)
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Getter for standard client
 */
export function getSupabase(): SupabaseClient {
  return supabase;
}

/**
 * Getter for elevated service role client (Server-side operations only)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('[Supabase Security] getSupabaseAdmin() cannot be called in browser context');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('[Supabase Config] Missing required environment variable: WORKFORCE_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Browser-safe client getter
 */
export function createBrowserClient(): SupabaseClient {
  return supabase;
}

export default supabase;
