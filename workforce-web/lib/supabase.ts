import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const WORKFORCE_ALLOWED_HOST = 'tjkbgxrckaocgosvmzmj.supabase.co';

/**
 * Validates that the provided URL strictly and exclusively targets the authoritative
 * Workforce staging project (tjkbgxrckaocgosvmzmj.supabase.co) via WHATWG URL parsing.
 * Fails closed on insecure protocol, non-allowlisted hostnames, lookalikes, embedded credentials,
 * non-standard ports, unexpected pathnames, queries, or fragments.
 */
export function assertExactWorkforceUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(
      '[WORKFORCE SECURITY FATAL] WORKFORCE_SUPABASE_URL is missing or empty. ' +
      'Workforce operations must strictly target workforce_staging and cannot fall back to generic/shared database.'
    );
  }

  const trimmed = rawUrl.trim();

  // Explicit check against Production and Studio project refs (defence-in-depth)
  if (trimmed.includes('mpluzajlzpregmjwpjqr')) {
    throw new Error(
      '[WORKFORCE SECURITY FATAL] Production database reference detected in Workforce configuration (mpluzajlzpregmjwpjqr). Abort.'
    );
  }
  if (trimmed.includes('xkhqirhurnjqglmajghn')) {
    throw new Error(
      '[WORKFORCE SECURITY FATAL] Studio database reference detected in Workforce configuration (xkhqirhurnjqglmajghn). Abort.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new Error(`[WORKFORCE SECURITY FATAL] Invalid WORKFORCE_SUPABASE_URL format: ${err?.message || err}`);
  }

  // 1. Mandatory HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[WORKFORCE SECURITY FATAL] Insecure protocol '${parsed.protocol}'. WORKFORCE_SUPABASE_URL must strictly use HTTPS.`
    );
  }

  // 2. Exact-host allowlist (blocks lookalikes, rogue domains, arbitrary projects)
  if (parsed.hostname !== WORKFORCE_ALLOWED_HOST) {
    throw new Error(
      `[WORKFORCE SECURITY FATAL] Unauthorized hostname '${parsed.hostname}'. ` +
      `WORKFORCE_SUPABASE_URL must strictly target exact host '${WORKFORCE_ALLOWED_HOST}'.`
    );
  }

  // 3. Reject embedded credentials (username/password)
  if (parsed.username || parsed.password) {
    throw new Error('[WORKFORCE SECURITY FATAL] WORKFORCE_SUPABASE_URL must not contain embedded credentials.');
  }

  // 4. Reject custom ports (must be standard default 443 or empty)
  if (parsed.port && parsed.port !== '443') {
    throw new Error(`[WORKFORCE SECURITY FATAL] Custom port '${parsed.port}' is not permitted. Only standard HTTPS (443) is allowed.`);
  }

  // 5. Reject unexpected pathname, query, or fragment
  if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`[WORKFORCE SECURITY FATAL] Unexpected pathname '${parsed.pathname}' in WORKFORCE_SUPABASE_URL.`);
  }
  if (parsed.search && parsed.search !== '') {
    throw new Error(`[WORKFORCE SECURITY FATAL] Query string parameters are not permitted in WORKFORCE_SUPABASE_URL.`);
  }
  if (parsed.hash && parsed.hash !== '') {
    throw new Error(`[WORKFORCE SECURITY FATAL] Fragment identifiers are not permitted in WORKFORCE_SUPABASE_URL.`);
  }

  return `https://${WORKFORCE_ALLOWED_HOST}`;
}

// ─── Environment Variable Resolution with Zero Fallback ───────────────────────
// Strictly reads WORKFORCE_SUPABASE_* variables.
// ZERO fallback to NEXT_PUBLIC_SUPABASE_* or generic shared database.
let _rawUrl = process.env.WORKFORCE_SUPABASE_URL;
let _anonKey = process.env.WORKFORCE_SUPABASE_ANON_KEY;

const isNonProduction =
  process.env.NODE_ENV !== 'production' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'development';

if (!_rawUrl) {
  if (isNonProduction) {
    _rawUrl = `https://${WORKFORCE_ALLOWED_HOST}`;
  } else {
    throw new Error(
      '[WORKFORCE CONFIG FATAL] Missing required environment variable: WORKFORCE_SUPABASE_URL. ' +
      'Workforce operations must strictly target workforce_staging and cannot fall back to generic/shared database.'
    );
  }
}

if (!_anonKey) {
  if (isNonProduction) {
    _anonKey = 'mock_workforce_anon_key';
  } else {
    throw new Error(
      '[WORKFORCE CONFIG FATAL] Missing required environment variable: WORKFORCE_SUPABASE_ANON_KEY. ' +
      'Workforce operations must strictly use WORKFORCE_SUPABASE_ANON_KEY and cannot fall back to generic/shared anon key.'
    );
  }
}

// Every resolved URL (including non-production fallback) MUST be strictly validated:
export const SUPABASE_URL: string = assertExactWorkforceUrl(_rawUrl);
export const SUPABASE_ANON_KEY: string = _anonKey;
export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.WORKFORCE_SUPABASE_ANON_KEY || _anonKey;

/**
 * SERVER-ONLY. Reads from process.env — zero fallback to shared service role key.
 * Returns empty string in browser context to prevent accidental exposure to client bundle.
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY || '')
    : '';

/**
 * Standard Supabase client instance for Workforce Web (Port 3001)
 * Uses public proxy views on workforce staging.
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
 * Strictly requires WORKFORCE_SUPABASE_SERVICE_ROLE_KEY.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('[Supabase Security] getSupabaseAdmin() cannot be called in browser context');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      '[WORKFORCE ADMIN FATAL] Missing required environment variable: WORKFORCE_SUPABASE_SERVICE_ROLE_KEY. ' +
      'Workforce admin operations must strictly use WORKFORCE_SUPABASE_SERVICE_ROLE_KEY and cannot fall back to shared service key.'
    );
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
