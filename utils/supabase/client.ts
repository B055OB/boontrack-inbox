import { createClient } from '@supabase/supabase-js';

// ─── Fail-closed validation (module load time) ───────────────────────────────
// This module is consumed by browser-side components; it must NEVER reference
// the service role key. Use getSupabaseAdmin() from lib/supabaseClient.ts for
// all server-side admin operations requiring elevated privileges.
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

// NOTE: SUPABASE_SERVICE_ROLE_KEY is intentionally NOT exported from this module.
// Any attempt to export it here constitutes a security violation.

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function createBrowserClient() {
  return supabase;
}

export function createClientComponentClient() {
  return supabase;
}

export default supabase;
