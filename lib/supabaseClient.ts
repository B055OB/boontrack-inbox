import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isValidUuid, safeUuidOrNull } from './uuid-guard';

export { isValidUuid, safeUuidOrNull };

// ─── Fail-closed validation (module load time) ───────────────────────────────

const WORKFORCE_STAGING_REF = 'tjkbgxrckaocgosvmzmj';
const EXPECTED_REST_HOST = `${WORKFORCE_STAGING_REF}.supabase.co`;

/**
 * Validates that a Supabase REST API URL targets exclusively the designated Workforce staging project.
 * Uses strict WHATWG URL parsing to enforce:
 * - protocol: strictly 'https:'
 * - exact hostname: 'tjkbgxrckaocgosvmzmj.supabase.co'
 * - no username or password
 * - no non-standard port (must be empty or 443)
 * - no path beyond root '/'
 * - no query/search string
 * - no hash/fragment
 * Throws fatal error on missing URL, production ref (mpluz), Studio staging ref (xkhq), or lookalikes.
 * Returns the normalized canonical origin URL string.
 */
export function assertStagingRestUrlTarget(restUrl: string): string {
  if (!restUrl || typeof restUrl !== 'string' || !restUrl.trim()) {
    throw new Error(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is missing or empty. ' +
      'Fallback to production or shared client is strictly forbidden in test/CI.'
    );
  }

  // Immediate fail-closed reject on forbidden project references
  if (restUrl.includes('mpluzajlzpregmjwpjqr')) {
    throw new Error(
      '[STAGING GUARD FATAL] REST URL targets production database (mpluzajlzpregmjwpjqr). Abort.'
    );
  }
  if (restUrl.includes('xkhqirhurnjqglmajghn')) {
    throw new Error(
      '[STAGING GUARD FATAL] REST URL targets Studio staging (xkhqirhurnjqglmajghn). ' +
      'Workforce test/CI must target tjkbgxrckaocgosvmzmj. Abort.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(restUrl.trim());
  } catch {
    throw new Error('[STAGING GUARD FATAL] Malformed Supabase REST URL. Abort.');
  }

  // 1. Protocol: must be https:
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[STAGING GUARD FATAL] Insecure protocol (${parsed.protocol}). Expected https:. Abort.`
    );
  }

  // 2. Credentials: no username or password
  if (parsed.username || parsed.password) {
    throw new Error(
      '[STAGING GUARD FATAL] Embedded credentials in Supabase REST URL are strictly forbidden. Abort.'
    );
  }

  // 3. Port: no unexpected or non-standard port
  if (parsed.port && parsed.port !== '443') {
    throw new Error(
      `[STAGING GUARD FATAL] Unexpected port (${parsed.port}) in Supabase REST URL. Expected standard HTTPS (443). Abort.`
    );
  }

  // 4. Exact hostname
  if (parsed.hostname !== EXPECTED_REST_HOST) {
    if (restUrl.includes(WORKFORCE_STAGING_REF)) {
      throw new Error(
        `[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected (${parsed.hostname}). Expected exact hostname ${EXPECTED_REST_HOST}. Abort.`
      );
    }
    throw new Error(
      `[STAGING GUARD FATAL] Invalid Supabase REST hostname (${parsed.hostname}). Expected exact hostname ${EXPECTED_REST_HOST}. Abort.`
    );
  }

  // 5. No path beyond root '/'
  const cleanPath = parsed.pathname.replace(/^\/$/, '');
  if (cleanPath !== '') {
    throw new Error(
      `[STAGING GUARD FATAL] Unexpected pathname (${parsed.pathname}) in Supabase REST URL base. Abort.`
    );
  }

  // 6. No search/query
  if (parsed.search) {
    throw new Error(
      '[STAGING GUARD FATAL] Query parameters in Supabase REST URL base are forbidden. Abort.'
    );
  }

  // 7. No hash/fragment
  if (parsed.hash) {
    throw new Error(
      '[STAGING GUARD FATAL] Fragment identifier in Supabase REST URL base is forbidden. Abort.'
    );
  }

  return `https://${EXPECTED_REST_HOST}`;
}

/**
 * Validates that a Supabase REST API URL targets an authorized Shared platform project.
 * Uses strict WHATWG URL parsing to enforce:
 * - protocol: strictly 'https:'
 * - no username or password
 * - no non-standard port (must be empty or 443)
 * - no path beyond root '/'
 * - no query/search string
 * - no hash/fragment
 * - strictly forbids Workforce staging (tjkbgxrckaocgosvmzmj) and Studio staging (xkhqirhurnjqglmajghn)
 * Returns the normalized canonical origin URL string.
 */
export function assertSharedRestUrlTarget(restUrl: string): string {
  if (!restUrl || typeof restUrl !== 'string' || !restUrl.trim()) {
    throw new Error(
      '[SHARED GUARD FATAL] NEXT_PUBLIC_SUPABASE_URL is missing or empty. ' +
      'Shared factory requires an explicit platform environment URL.'
    );
  }

  const trimmed = restUrl.trim();

  // Immediate fail-closed reject on Workforce staging and Studio staging project references
  if (trimmed.includes(WORKFORCE_STAGING_REF)) {
    throw new Error(
      `[SHARED GUARD FATAL] REST URL targets Workforce staging (${WORKFORCE_STAGING_REF}). Shared factory must never target Workforce staging. Abort.`
    );
  }
  if (trimmed.includes('xkhqirhurnjqglmajghn')) {
    throw new Error(
      '[SHARED GUARD FATAL] REST URL targets Studio staging (xkhqirhurnjqglmajghn). Shared factory must never target Studio staging. Abort.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('[SHARED GUARD FATAL] Malformed Supabase REST URL. Abort.');
  }

  // 1. Protocol: must be https:
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[SHARED GUARD FATAL] Insecure protocol (${parsed.protocol}). Expected https:. Abort.`
    );
  }

  // 2. Credentials: no username or password
  if (parsed.username || parsed.password) {
    throw new Error(
      '[SHARED GUARD FATAL] Embedded credentials in Supabase REST URL are strictly forbidden. Abort.'
    );
  }

  // 3. Port: no unexpected or non-standard port
  if (parsed.port && parsed.port !== '443') {
    throw new Error(
      `[SHARED GUARD FATAL] Unexpected port (${parsed.port}) in Supabase REST URL. Expected standard HTTPS (443). Abort.`
    );
  }

  // 4. Hostname validation: must not target Workforce or Studio lookalikes
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === EXPECTED_REST_HOST || hostname.includes(WORKFORCE_STAGING_REF)) {
    throw new Error(
      `[SHARED GUARD FATAL] Hostname lookalike or project ref smuggling detected (${hostname}). Shared factory cannot target Workforce staging. Abort.`
    );
  }
  if (hostname.includes('xkhqirhurnjqglmajghn')) {
    throw new Error(
      `[SHARED GUARD FATAL] Hostname lookalike or project ref smuggling detected (${hostname}). Shared factory cannot target Studio staging. Abort.`
    );
  }

  // Strict format validation for Supabase project endpoint
  // Standard format is 20 lowercase alphanumeric characters: <project-ref>.supabase.co
  // In test harness, mock-project.supabase.co is the approved stub
  const isStandardSupabaseHost = /^[a-z0-9]{20}\.supabase\.co$/.test(hostname);
  const isApprovedMockHost = isTestOrCI && hostname === 'mock-project.supabase.co';

  if (!isStandardSupabaseHost && !isApprovedMockHost) {
    throw new Error(
      `[SHARED GUARD FATAL] Hostname "${hostname}" is not an authorized Supabase project endpoint format (<project-ref>.supabase.co). Arbitrary or non-platform hostnames are strictly rejected.`
    );
  }

  // 5. No path beyond root '/'
  const cleanPath = parsed.pathname.replace(/^\/$/, '');
  if (cleanPath !== '') {
    throw new Error(
      `[SHARED GUARD FATAL] Unexpected pathname (${parsed.pathname}) in Supabase REST URL base. Abort.`
    );
  }

  // 6. No search/query
  if (parsed.search) {
    throw new Error(
      '[SHARED GUARD FATAL] Query parameters in Supabase REST URL base are forbidden. Abort.'
    );
  }

  // 7. No hash/fragment
  if (parsed.hash) {
    throw new Error(
      '[SHARED GUARD FATAL] Fragment identifier in Supabase REST URL base is forbidden. Abort.'
    );
  }

  return `https://${hostname}`;
}

// Prioritize WORKFORCE_SUPABASE_* to ensure isolated staging targeting
let _url = process.env.WORKFORCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let _anonKey = process.env.WORKFORCE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isTestOrCI = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

if (isTestOrCI) {
  // In test/CI: WORKFORCE_SUPABASE_URL is mandatory. NEVER fall back to NEXT_PUBLIC_SUPABASE_URL or production.
  const rawWorkforceUrl = process.env.WORKFORCE_SUPABASE_URL;
  if (!rawWorkforceUrl) {
    throw new Error(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is required in test/CI environment. ' +
      'Fallback to NEXT_PUBLIC_SUPABASE_URL or production database is strictly forbidden.'
    );
  }
  _url = assertStagingRestUrlTarget(rawWorkforceUrl);

  const rawWorkforceKey = process.env.WORKFORCE_SUPABASE_ANON_KEY;
  if (!rawWorkforceKey) {
    throw new Error('[STAGING GUARD FATAL] WORKFORCE_SUPABASE_ANON_KEY is required in test/CI environment.');
  }
  _anonKey = rawWorkforceKey;
} else if (!_url || !_anonKey) {
  if (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'development'
  ) {
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
 * Use getSupabaseAdmin() for all admin-privileged DB operations.
 */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  typeof window === 'undefined'
    ? (process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '')
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

interface VerifiedClientIdentity {
  domain: 'workforce' | 'shared';
  normalizedHost: string;
}

// Module-private WeakMap: immutable client provenance registry
const verifiedClientRegistry = new WeakMap<object, VerifiedClientIdentity>();

function isAuthorizedSharedHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const normalized = hostname.trim().toLowerCase();

  // Workforce staging host and Studio host must NEVER be accepted as Shared
  if (normalized === EXPECTED_REST_HOST || normalized.includes(WORKFORCE_STAGING_REF)) {
    return false;
  }
  if (normalized.includes('xkhqirhurnjqglmajghn')) {
    return false;
  }

  // In test harness, mock-project.supabase.co is the approved stub
  if (isTestOrCI && normalized === 'mock-project.supabase.co') {
    return true;
  }

  // In production/staging non-test runtime, validate against official platform environment configuration
  if (!isTestOrCI && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const validatedUrl = assertSharedRestUrlTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);
      const expectedHost = new URL(validatedUrl).hostname.toLowerCase();
      return normalized === expectedHost;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Verifies that an injected client is an authentic, factory-issued instance.
 * Rejects any arbitrary object, even if it has matching properties or supabaseUrl.
 */
export function verifyFactoryClient(client: unknown, expectedContext: 'workforce' | 'shared'): void {
  if (!client || typeof client !== 'object') {
    throw new Error(
      `[CATALOG CONTEXT FATAL] Injected client must be a valid object. Received: ${typeof client}`
    );
  }

  const identity = verifiedClientRegistry.get(client);
  if (!identity) {
    throw new Error(
      '[CATALOG CONTEXT FATAL] Injected client is not a verified factory-issued client. Arbitrary or unregistered client instances are strictly rejected.'
    );
  }

  if (identity.domain !== expectedContext) {
    throw new Error(
      `[CATALOG CONTEXT FATAL] Injected client provenance mismatch. Client is registered for domain "${identity.domain}", but requested context is "${expectedContext}".`
    );
  }

  if (expectedContext === 'workforce') {
    if (identity.normalizedHost !== EXPECTED_REST_HOST) {
      throw new Error(
        `[CATALOG CONTEXT FATAL] Registered client host "${identity.normalizedHost}" is not authorized for Workforce.`
      );
    }
  } else {
    if (!isAuthorizedSharedHost(identity.normalizedHost)) {
      throw new Error(
        `[CATALOG CONTEXT FATAL] Registered client host "${identity.normalizedHost}" is not in approved Shared allowlist.`
      );
    }
  }
}

let supabaseInstance: SupabaseClient | null = null;
let lastConfiguredSharedKey: string | null = null;
let lastConfiguredSharedUrl: string | null = null;

export const getSupabase = () => {
  const rawSharedUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const validatedSharedUrl = assertSharedRestUrlTarget(rawSharedUrl);
  const sharedKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (isTestOrCI ? 'dummy-anon-key-test' : supabaseAnonKey)).trim();

  if (
    !supabaseInstance ||
    sharedKey !== lastConfiguredSharedKey ||
    validatedSharedUrl !== lastConfiguredSharedUrl
  ) {
    lastConfiguredSharedKey = sharedKey;
    lastConfiguredSharedUrl = validatedSharedUrl;
    supabaseInstance = createClient(validatedSharedUrl, sharedKey, {
      global: {
        fetch: createGuardedFetch(),
      },
    });
    (supabaseInstance as any)._clientProvenance = 'shared';
    (supabaseInstance as any).supabaseUrl = validatedSharedUrl;
  }
  const host = new URL(validatedSharedUrl).hostname.toLowerCase();
  verifiedClientRegistry.set(supabaseInstance, {
    domain: 'shared',
    normalizedHost: host,
  });
  return supabaseInstance;
};

let supabaseAdminInstance: SupabaseClient | null = null;
let lastConfiguredAdminKey: string | null = null;
let lastConfiguredAdminUrl: string | null = null;

let workforceAdminInstance: SupabaseClient | null = null;
let lastConfiguredWorkforceAdminKey: string | null = null;
let lastConfiguredWorkforceAdminUrl: string | null = null;

/**
 * Dedicated Workforce Admin Client Factory.
 *
 * Strict isolation rules:
 * 1. WORKFORCE_SUPABASE_URL and WORKFORCE_SUPABASE_SERVICE_ROLE_KEY are strictly mandatory.
 * 2. ZERO fallback to NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.
 * 3. Strict WHATWG URL parsing and validation via assertStagingRestUrlTarget().
 * 4. Fails closed against production (mpluzajlzpregmjwpjqr), Studio staging (xkhqirhurnjqglmajghn),
 *    lookalikes, non-HTTPS, or unknown hosts.
 * 5. Rejects execution in browser context.
 * 6. Completely separate cached singleton: NEVER shares or adopts instances with getSupabaseAdmin().
 */
export const getWorkforceSupabaseAdmin = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    throw new Error('[Security Guard] getWorkforceSupabaseAdmin() cannot be called in client-side browser context.');
  }

  const rawUrl = process.env.WORKFORCE_SUPABASE_URL;
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      '[WORKFORCE ADMIN FATAL] WORKFORCE_SUPABASE_URL is missing or empty. ' +
      'Workforce admin operations must strictly target workforce_staging and cannot fall back to shared URL.'
    );
  }

  const serviceKey = (process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) {
    throw new Error(
      '[WORKFORCE ADMIN FATAL] WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing or empty. ' +
      'Workforce admin operations must strictly use WORKFORCE_SUPABASE_SERVICE_ROLE_KEY and cannot fall back to shared service key.'
    );
  }

  const validatedUrl = assertStagingRestUrlTarget(rawUrl);

  if (
    !workforceAdminInstance ||
    serviceKey !== lastConfiguredWorkforceAdminKey ||
    validatedUrl !== lastConfiguredWorkforceAdminUrl
  ) {
    lastConfiguredWorkforceAdminKey = serviceKey;
    lastConfiguredWorkforceAdminUrl = validatedUrl;
    workforceAdminInstance = createClient(validatedUrl, serviceKey, {
      auth: { persistSession: false },
      global: {
        fetch: createGuardedFetch(),
      },
    });
    (workforceAdminInstance as any)._clientProvenance = 'workforce';
    (workforceAdminInstance as any).supabaseUrl = validatedUrl;
  }
  verifiedClientRegistry.set(workforceAdminInstance, {
    domain: 'workforce',
    normalizedHost: EXPECTED_REST_HOST,
  });
  return workforceAdminInstance;
};

/**
 * Generic Admin Client Factory for non-Workforce domains (Shop, Studio, Creator, Core).
 *
 * Rules:
 * 1. Reads from process.env — server-only.
 * 2. Uses supabaseUrl (or assertStagingRestUrlTarget if WORKFORCE_SUPABASE_URL is set in testing).
 * 3. Completely separate cached singleton: NEVER shares or adopts instances with getWorkforceSupabaseAdmin().
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    throw new Error('[Security Guard] getSupabaseAdmin() cannot be called in client-side browser context.');
  }

  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!serviceKey) {
    throw new Error('[SHARED ADMIN FATAL] Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  const rawTargetUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const validatedTargetUrl = assertSharedRestUrlTarget(rawTargetUrl);

  if (
    !supabaseAdminInstance ||
    serviceKey !== lastConfiguredAdminKey ||
    validatedTargetUrl !== lastConfiguredAdminUrl
  ) {
    lastConfiguredAdminKey = serviceKey;
    lastConfiguredAdminUrl = validatedTargetUrl;
    supabaseAdminInstance = createClient(validatedTargetUrl, serviceKey, {
      auth: { persistSession: false },
      global: {
        fetch: createGuardedFetch(),
      },
    });
    (supabaseAdminInstance as any)._clientProvenance = 'shared';
    (supabaseAdminInstance as any).supabaseUrl = validatedTargetUrl;
  }
  const host = new URL(validatedTargetUrl).hostname.toLowerCase();
  verifiedClientRegistry.set(supabaseAdminInstance, {
    domain: 'shared',
    normalizedHost: host,
  });
  return supabaseAdminInstance;
};

/**
 * Validates that a database connection string targets the designated Workforce staging project.
 * Uses strict WHATWG URL parsing to validate protocol, hostname, port, database, and pooler username.
 * Call this in integration test `beforeAll` before opening any pg connection.
 * Throws a fatal error if the connection string points to production, Studio staging, lookalikes, or an unknown project.
 */
export function assertStagingDatabaseTarget(connectionString: string): void {
  if (!connectionString || typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('[STAGING GUARD FATAL] Database connection string is empty. Abort.');
  }

  // Fail-closed immediate guard against production and Studio staging project references
  if (connectionString.includes('mpluzajlzpregmjwpjqr')) {
    throw new Error(
      '[STAGING GUARD FATAL] Connection string targets production database (mpluzajlzpregmjwpjqr). ' +
      'Integration tests must use workforce_staging. Abort.'
    );
  }
  if (connectionString.includes('xkhqirhurnjqglmajghn')) {
    throw new Error(
      '[STAGING GUARD FATAL] Connection string targets Studio staging (xkhqirhurnjqglmajghn). ' +
      'Workforce integration tests must strictly use workforce_staging (tjkbgxrckaocgosvmzmj). Abort.'
    );
  }

  // Parse connection string with WHATWG URL parser (never echoes raw connection string with passwords)
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('[STAGING GUARD FATAL] Malformed database connection URL. Abort.');
  }

  // 1. Protocol validation
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `[STAGING GUARD FATAL] Invalid protocol (${parsed.protocol}). Expected postgres: or postgresql:. Abort.`
    );
  }

  // 2. Database validation (Supabase standard default database is 'postgres')
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName !== 'postgres') {
    throw new Error(
      `[STAGING GUARD FATAL] Invalid database name (${dbName}). Expected postgres. Abort.`
    );
  }

  const WORKFORCE_STAGING_REF = 'tjkbgxrckaocgosvmzmj';
  const EXPECTED_DIRECT_HOST = `db.${WORKFORCE_STAGING_REF}.supabase.co`;
  const EXPECTED_POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';
  const EXPECTED_POOLER_USER = `postgres.${WORKFORCE_STAGING_REF}`;

  // 3. Strict host and credential validation
  if (parsed.hostname === EXPECTED_DIRECT_HOST) {
    if (parsed.port !== '5432') {
      throw new Error(
        `[STAGING GUARD FATAL] Invalid port (${parsed.port || 'default'}) for direct staging connection. Expected 5432. Abort.`
      );
    }
  } else if (parsed.hostname === EXPECTED_POOLER_HOST) {
    if (parsed.port !== '6543') {
      throw new Error(
        `[STAGING GUARD FATAL] Invalid port (${parsed.port || 'default'}) for pooler connection. Expected 6543. Abort.`
      );
    }
    const username = decodeURIComponent(parsed.username);
    if (username !== EXPECTED_POOLER_USER) {
      throw new Error(
        `[STAGING GUARD FATAL] Invalid pooler username (${username}). Expected ${EXPECTED_POOLER_USER}. Abort.`
      );
    }
  } else {
    // Check if project reference was smuggled in lookalike hostname, query, or path
    if (connectionString.includes(WORKFORCE_STAGING_REF)) {
      throw new Error(
        `[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected (${parsed.hostname}). Connection string does not match expected direct host (${EXPECTED_DIRECT_HOST}) or pooler host (${EXPECTED_POOLER_HOST}). Abort.`
      );
    }
    throw new Error(
      `[STAGING GUARD FATAL] Connection string hostname (${parsed.hostname}) is neither authorized direct host (${EXPECTED_DIRECT_HOST}) nor authorized pooler host (${EXPECTED_POOLER_HOST}). Abort.`
    );
  }

  // 4. Schema environment validation (if set in process.env, must be workforce_staging)
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA;
  if (targetSchema && targetSchema !== 'workforce_staging') {
    throw new Error(
      `[STAGING GUARD FATAL] WORKFORCE_TARGET_SCHEMA must be workforce_staging. Received: ${targetSchema}. Abort.`
    );
  }
}
