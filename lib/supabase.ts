import { createClient } from '@supabase/supabase-js';

// ─── Fail-closed validation (module load time) ───────────────────────────────
let _url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let _anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!_url || !_anonKey) {
  const isNonProduction =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'development' ||
    process.env.CI === 'true' ||
    process.env.NODE_ENV === 'test';

  if (isNonProduction) {
    _url = _url || 'https://mpluzajlzpregmjwpjqr.supabase.co';
    _anonKey =
      _anonKey ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24ifQ.mock_anon_key';
  } else {
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
  }
}

export const SUPABASE_URL: string = _url;
export const SUPABASE_ANON_KEY: string = _anonKey;
export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * SERVER-ONLY. Reads from process.env — no hardcoded fallback.
 * Returns empty string in browser context to prevent accidental exposure.
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    : '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
