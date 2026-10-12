import { createClient } from '@supabase/supabase-js';

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
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    : '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
