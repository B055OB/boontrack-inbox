/**
 * lib/auth/merchant-session.ts
 *
 * Dedicated Server-Signed Merchant & CS Session Token Management.
 *
 * Security Invariants:
 * 1. ZERO TRUST ON PLAINTEXT COOKIES: Plain cookies (merchant_store, etc.) are never trusted as proof of session.
 * 2. CRYPTOGRAPHIC SIGNATURE: Tokens are signed with HMAC-SHA256 using a dedicated session secret.
 * 3. STRICT TENANT BINDING: The token is bound to a specific tenant_slug and cannot be used for cross-tenant operations.
 * 4. CONSTANT-TIME VERIFICATION: Signature comparisons use crypto.timingSafeEqual to prevent timing attacks.
 * 5. EXPIRATION & REPLAY DEFENSE: Tokens carry an expiration timestamp (exp) and cryptographic nonce.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  type MerchantSessionPayload,
  type CanonicalTenantRecord,
  type VerifySessionResult,
  validateTenantIdentityConsistency,
  extractMerchantSessionToken,
  verifyMerchantSessionToken as verifyMerchantSessionTokenAsync,
  getMerchantSessionSecretsAsync,
} from './merchant-session-edge';

export type {
  MerchantSessionPayload,
  CanonicalTenantRecord,
  VerifySessionResult,
};

export {
  validateTenantIdentityConsistency,
  extractMerchantSessionToken,
  verifyMerchantSessionTokenAsync,
  getMerchantSessionSecretsAsync,
};

/**
 * Resolves all candidate signing secrets for verification, supporting zero-downtime secret rotation.
 * Priority:
 * 1. Active: BOONTRACK_SESSION_SECRET / MERCHANT_SESSION_SECRET
 * 2. Rotation Transition: BOONTRACK_SESSION_SECRET_PREVIOUS / MERCHANT_SESSION_SECRET_PREVIOUS
 *
 * Production & Preview Security Rule:
 * Production and Vercel Preview environments must NEVER fall back to a hardcoded development secret
 * and must NEVER derive session secrets from admin internal secrets (strict domain separation).
 * If required secrets are absent, resolution returns empty array (fail-closed).
 */
export function getMerchantSessionSecrets(): string[] {
  const secrets: string[] = [];

  const primary = (process.env.BOONTRACK_SESSION_SECRET || process.env.MERCHANT_SESSION_SECRET)?.trim();
  if (primary && primary.length >= 16) {
    secrets.push(primary);
  }

  const previous = (process.env.BOONTRACK_SESSION_SECRET_PREVIOUS || process.env.MERCHANT_SESSION_SECRET_PREVIOUS)?.trim();
  if (previous && previous.length >= 16 && !secrets.includes(previous)) {
    secrets.push(previous);
  }

  // Explicit Fail-Closed Enforced in Production, Preview, and Staging
  const isEnforcedFailClosed =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.APP_ENV === 'staging';

  if (secrets.length === 0) {
    if (isEnforcedFailClosed) {
      // Safe operational log — NEVER log secrets
      console.error('[AUTH_SECURITY] Critical: No merchant session signing secret configured in production/preview. Authentication failing closed.');
      return [];
    }
    // Only in non-production environments (test/dev)
    secrets.push('bt_dev_merchant_session_secret_default_key_2026_minimum_32_bytes!');
  }

  return secrets;
}

/**
 * Resolves the active signing secret for newly minted tokens.
 */
export function getMerchantSessionSecret(): string {
  const secrets = getMerchantSessionSecrets();
  if (secrets.length === 0) {
    throw new Error('Merchant session signing secret is unconfigured in production.');
  }
  return secrets[0];
}

/**
 * Signs a merchant session payload into a compact, URL-safe token.
 */
export function signMerchantSessionToken(
  params: {
    tenantSlug: string;
    tenantId?: string;
    role?: 'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR';
    userId?: string;
    name?: string;
    phone?: string;
    ttlMs?: number; // default: 30 days
  },
  customSecret?: string
): string {
  const secret = customSecret || getMerchantSessionSecret();
  const now = Date.now();
  const ttl = params.ttlMs || 30 * 24 * 60 * 60 * 1000; // 30 days default

  const payload: MerchantSessionPayload = {
    tenantSlug: params.tenantSlug.toLowerCase().trim(),
    tenantId: params.tenantId?.trim(),
    role: params.role || 'MERCHANT',
    userId: params.userId?.trim(),
    name: params.name?.trim(),
    phone: params.phone?.trim(),
    iat: now,
    exp: now + ttl,
    nonce: crypto.randomBytes(12).toString('hex'),
  };

  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(serialized).digest('hex');

  return `${serialized}.${hmac}`;
}

/**
 * Validates tenant identity consistency between a verified session payload and
 * a canonical database record.
 *
 * Invariants:
 * 1. Resolves against one canonical database record.
 * 2. If the signed token contains both tenant slug and tenant UUID, both must agree with that canonical record.
 * 3. A matching slug cannot mask a contradictory UUID, and vice versa.
 * 4. Deliberate legacy-token rotation compatibility (single identifier: only slug or only UUID)
 *    is supported safely only when that single identifier matches the canonical record.
 * 5. Fails closed (status 403) on unresolved canonical identity, missing token identity, or contradictory identity.
 */

/**
 * Verifies a server-signed merchant session token.
 */
export function verifyMerchantSessionToken(
  token?: string | null,
  expectedTenantSlug?: string | null,
  customSecret?: string,
  canonicalTenant?: CanonicalTenantRecord | null
): VerifySessionResult {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Merchant session token missing.',
    };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Format token merchant tidak valid.',
    };
  }

  const [encodedPayload, providedSignature] = parts;
  const candidateSecrets = customSecret ? [customSecret] : getMerchantSessionSecrets();
  if (candidateSecrets.length === 0) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Konfigurasi keamanan sesi belum lengkap pada server (Fail-Closed).',
    };
  }
  let signatureMatched = false;
  let matchedSecretIndex = -1;

  for (let i = 0; i < candidateSecrets.length; i++) {
    const candidateSecret = candidateSecrets[i];
    const expectedSignature = crypto.createHmac('sha256', candidateSecret).update(encodedPayload).digest('hex');
    const bufProvided = Buffer.from(providedSignature);
    const bufExpected = Buffer.from(expectedSignature);

    if (bufProvided.length === bufExpected.length && crypto.timingSafeEqual(bufProvided, bufExpected)) {
      signatureMatched = true;
      matchedSecretIndex = i;
      break;
    }
  }

  if (!signatureMatched) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Tanda tangan sesi merchant tidak sah (Forged Token).',
    };
  }

  let payload: MerchantSessionPayload;
  try {
    const rawJson = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    payload = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Payload token merchant corrupt.',
    };
  }

  // Check expiration
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Sesi login merchant telah kedaluwarsa. Silakan login kembali.',
    };
  }

  // Enforce rotation transition grace period (max 7 days from token issuance)
  // Ensures previous secrets cannot be accepted indefinitely even if left in config.
  const MAX_ROTATION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
  const isPreviousSecret = matchedSecretIndex > 0;
  if (isPreviousSecret && typeof payload.iat === 'number' && Date.now() - payload.iat > MAX_ROTATION_GRACE_PERIOD_MS) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Sesi dari secret rotasi sebelumnya telah melewati batas masa transisi aman (Maksimal 7 hari). Silakan login ulang.',
    };
  }

  // Check tenant identity against canonical database record if provided
  if (canonicalTenant) {
    const consistency = validateTenantIdentityConsistency(payload, canonicalTenant);
    if (!consistency.valid) {
      return {
        valid: false,
        status: consistency.status,
        error: consistency.error,
      };
    }
  } else if (expectedTenantSlug) {
    const normExpected = expectedTenantSlug.toLowerCase().trim();
    const normTokenTenant = (payload.tenantSlug || '').toLowerCase().trim();
    const normTokenTenantId = (payload.tenantId || '').toLowerCase().trim();

    if (normTokenTenant !== normExpected && normTokenTenantId !== normExpected) {
      return {
        valid: false,
        status: 403,
        error: `Forbidden: Sesi merchant ('${normTokenTenant}') tidak cocok dengan target toko ('${normExpected}').`,
      };
    }
  }

  return {
    valid: true,
    status: 200,
    payload,
  };
}


/**
 * Validates whether an incoming request carries an authorized machine-to-machine internal secret
 * bound strictly to an authoritative target tenant and allowed business operation scope.
 *
 * M2M Ingress Contract (Workforce Round 3Q):
 * - Must present valid internal secret via 'x-internal-secret' or 'Authorization: Bearer <secret>'
 * - Must present canonical 'x-target-tenant' header matching expected targetTenantSlug
 * - Must present canonical 'x-machine-operation' header matching allowedOperations allowlist
 * - Legacy aliases (x-tenant-slug, x-tenant-id, x-internal-operation) are STRICTLY REJECTED.
 * - Missing tenant slug, empty allowed operations, or secret-only calls fail closed immediately.
 */
export function isInternalMachineAuthorized(
  req: NextRequest,
  targetTenantSlug: string,
  allowedOperations: string[]
): boolean {
  // Fail-closed invariant: Target tenant slug and allowed operations are strictly mandatory
  if (!targetTenantSlug || typeof targetTenantSlug !== 'string' || !targetTenantSlug.trim()) {
    return false;
  }
  if (!allowedOperations || !Array.isArray(allowedOperations) || allowedOperations.length === 0) {
    return false;
  }

  const authHeader = req.headers.get('authorization')?.trim() || '';
  const internalSecret = req.headers.get('x-internal-secret')?.trim() || '';
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  if (envAdminSecret && envAdminSecret.length >= 16) {
    const bufEnv = Buffer.from(envAdminSecret);
    let secretValid = false;
    if (internalSecret) {
      const bufProvided = Buffer.from(internalSecret);
      if (bufProvided.length === bufEnv.length && crypto.timingSafeEqual(bufProvided, bufEnv)) {
        secretValid = true;
      }
    }
    if (!secretValid && authHeader.toLowerCase().startsWith('bearer ')) {
      const candidate = authHeader.slice(7).trim();
      const bufBearer = Buffer.from(candidate);
      if (bufBearer.length === bufEnv.length && crypto.timingSafeEqual(bufBearer, bufEnv)) {
        secretValid = true;
      }
    }

    if (!secretValid) {
      return false;
    }

    // 1. Enforce canonical target tenant boundary (STRICT: no legacy alias fallbacks)
    const reqTargetTenant = req.headers.get('x-target-tenant')?.trim().toLowerCase();
    if (!reqTargetTenant) {
      return false;
    }
    const normExpected = targetTenantSlug.trim().toLowerCase();
    if (reqTargetTenant !== normExpected) {
      return false;
    }

    // 2. Enforce canonical allowed operations boundary (STRICT: no legacy alias fallbacks)
    const reqOperation = req.headers.get('x-machine-operation')?.trim().toUpperCase();
    if (!reqOperation) {
      return false;
    }
    const normAllowed = allowedOperations.map((op) => op.trim().toUpperCase());
    if (!normAllowed.includes(reqOperation)) {
      return false;
    }

    return true;
  }
  return false;
}

export type AuthorizeMerchantResult =
  | { authorized: true; payload: MerchantSessionPayload }
  | { authorized: false; status: 401 | 403 | 500 | 503; response: NextResponse; error?: string };

/**
 * Validates request session and enforces role & tenant authorization server-side.
 * Defense-in-depth:
 * 1. Requires valid HMAC-signed bt_merchant_token (extracts from cookie or header).
 * 2. Checks cryptographic signature, expiration, and rotation grace period.
 * 3. Enforces strict tenant binding against expected targetSlug.
 * 4. Checks caller role against allowedRoles.
 * 5. Fails closed with appropriate 401/403 NextResponse if unauthorized.
 */
export function authorizeMerchantRequest(
  req: NextRequest,
  targetSlug?: string | null,
  allowedRoles?: Array<'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR'>,
  canonicalTenant?: CanonicalTenantRecord | null
): AuthorizeMerchantResult {
  const token = extractMerchantSessionToken(req);
  if (!token) {
    return {
      authorized: false,
      status: 401,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan. Kredensial tidak ditemukan.' },
        { status: 401 }
      ),
    };
  }

  const result = verifyMerchantSessionToken(token, targetSlug || undefined, undefined, canonicalTenant);
  if (!result.valid || !result.payload) {
    const errorStatus = (result.status === 200 ? 401 : result.status) as 401 | 403 | 500;
    return {
      authorized: false,
      status: errorStatus,
      response: NextResponse.json(
        { success: false, error: result.error || 'Unauthorized: Token sesi tidak sah atau kedaluwarsa.' },
        { status: errorStatus }
      ),
    };
  }

  // Check role authorization if specified
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = result.payload.role || 'MERCHANT';
    if (!allowedRoles.includes(userRole)) {
      return {
        authorized: false,
        status: 403,
        response: NextResponse.json(
          { success: false, error: `Forbidden: Peran '${userRole}' tidak memiliki wewenang untuk operasi ini.` },
          { status: 403 }
        ),
      };
    }
  }

  return {
    authorized: true,
    payload: result.payload,
  };
}

export interface AuthorizeMerchantSessionOptions {
  canonicalTenant?: CanonicalTenantRecord | null;
  skipDatabaseLookup?: boolean;
}

/**
 * Validates request session and enforces role & tenant authorization server-side
 * with Database Membership SSOT (Round 3I).
 *
 * Invariants:
 * 1. Cryptographic HMAC token extraction & verification.
 * 2. Canonical database tenant consistency (anti-spoofing).
 * 3. Database membership authority (workforce_staging.tenant_memberships):
 *    - Inactive / revoked membership fails closed (403).
 *    - Missing membership fails closed (403).
 *    - Authoritative database role overrides token role.
 * 4. Strict Role Capability Matrix enforcement.
 */
export async function authorizeMerchantSession(
  req: NextRequest,
  targetSlug?: string | null,
  allowedRoles?: Array<'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR'>,
  options?: AuthorizeMerchantSessionOptions
): Promise<AuthorizeMerchantResult> {
  const token = extractMerchantSessionToken(req);
  if (!token) {
    return {
      authorized: false,
      status: 401,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan. Kredensial tidak ditemukan.' },
        { status: 401 }
      ),
    };
  }

  // 1. Cryptographic HMAC Token Verification
  const result = verifyMerchantSessionToken(token, targetSlug || undefined, undefined, options?.canonicalTenant);
  if (!result.valid || !result.payload) {
    const errorStatus = (result.status === 200 ? 401 : result.status) as 401 | 403 | 500;
    return {
      authorized: false,
      status: errorStatus,
      response: NextResponse.json(
        { success: false, error: result.error || 'Unauthorized: Token sesi tidak sah atau kedaluwarsa.' },
        { status: errorStatus }
      ),
    };
  }

  const payload: MerchantSessionPayload = { ...result.payload };
  const effectiveSlug = targetSlug ? targetSlug.toLowerCase().trim() : (payload.tenantSlug || '').toLowerCase().trim();

  // If skipping database lookup (e.g. test environment flag)
  if (options?.skipDatabaseLookup) {
    if (allowedRoles && allowedRoles.length > 0) {
      const userRole = payload.role || 'MERCHANT';
      if (!allowedRoles.includes(userRole)) {
        return {
          authorized: false,
          status: 403,
          response: NextResponse.json(
            { success: false, error: `Forbidden: Peran '${userRole}' tidak memiliki wewenang untuk operasi ini.` },
            { status: 403 }
          ),
        };
      }
    }
    return { authorized: true, payload };
  }

  // 2. Database Authority Verification (SSOT)
  try {
    const { getWorkforceSupabaseAdmin } = await import('@/lib/supabaseClient');
    const supabase = getWorkforceSupabaseAdmin();

    if (effectiveSlug) {
      if (!supabase) {
        return {
          authorized: false,
          status: 503,
          error: 'DATABASE_LOOKUP_FAILED',
          response: NextResponse.json(
            { success: false, error: 'Database lookup failed (Fail-Closed).' },
            { status: 503 }
          ),
        };
      }

      // A. Query Canonical Tenant Record
      const { data: tenantRow, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, slug, is_active, status')
        .eq('slug', effectiveSlug)
        .maybeSingle();

      if (tenantErr) {
        return {
          authorized: false,
          status: 503,
          error: 'DATABASE_LOOKUP_FAILED',
          response: NextResponse.json(
            { success: false, error: 'Database lookup failed (Fail-Closed).' },
            { status: 503 }
          ),
        };
      }

      if (!tenantRow) {
        return {
          authorized: false,
          status: 403,
          response: NextResponse.json(
            { success: false, error: 'Forbidden: Rekor toko tidak ditemukan pada otoritas database (Fail-Closed).' },
            { status: 403 }
          ),
        };
      }

      // B. Validate Canonical Tenant Consistency (Blocker A)
      const consistency = validateTenantIdentityConsistency(payload, tenantRow);
      if (!consistency.valid) {
        const errorStatus = (consistency.status === 200 ? 403 : consistency.status) as 401 | 403 | 500;
        return {
          authorized: false,
          status: errorStatus,
          response: NextResponse.json(
            { success: false, error: consistency.error || 'Forbidden: Identitas tenant tidak konsisten.' },
            { status: errorStatus }
          ),
        };
      }

      // C. Database Membership Authority Check (Round 3I/3J SSOT)
      if (payload.userId) {
        let membershipRow: any = null;
        const { data: mData, error: mErr } = await supabase
          .from('tenant_memberships')
          .select('role, is_active')
          .eq('user_id', payload.userId)
          .or(`tenant_id.eq.${tenantRow.id},tenant_slug.eq.${tenantRow.slug}`)
          .maybeSingle();

        if (mErr) {
          return {
            authorized: false,
            status: 503,
            error: 'DATABASE_LOOKUP_FAILED',
            response: NextResponse.json(
              { success: false, error: 'Database lookup failed (Fail-Closed).' },
              { status: 503 }
            ),
          };
        }
        membershipRow = mData;

        if (!membershipRow) {
          try {
            const { data: mDataStaging, error: mErrStaging } = await (supabase as any)
              .schema('workforce_staging')
              .from('tenant_memberships')
              .select('role, is_active')
              .eq('user_id', payload.userId)
              .or(`tenant_id.eq.${tenantRow.id},tenant_slug.eq.${tenantRow.slug}`)
              .maybeSingle();

            if (mErrStaging) {
              return {
                authorized: false,
                status: 503,
                error: 'DATABASE_LOOKUP_FAILED',
                response: NextResponse.json(
                  { success: false, error: 'Database lookup failed (Fail-Closed).' },
                  { status: 503 }
                ),
              };
            }
            membershipRow = mDataStaging;
          } catch {
            return {
              authorized: false,
              status: 503,
              error: 'DATABASE_LOOKUP_FAILED',
              response: NextResponse.json(
                { success: false, error: 'Database lookup failed (Fail-Closed).' },
                { status: 503 }
              ),
            };
          }
        }

        // If user has no membership record for this tenant -> Fail-Closed (403)
        if (!membershipRow) {
          return {
            authorized: false,
            status: 403,
            response: NextResponse.json(
              { success: false, error: 'Forbidden: Pengguna tidak terdaftar dalam keanggotaan toko ini.' },
              { status: 403 }
            ),
          };
        }

        // If membership is inactive / revoked -> Fail-Closed (403)
        if (membershipRow.is_active !== true) {
          return {
            authorized: false,
            status: 403,
            response: NextResponse.json(
              { success: false, error: 'Forbidden: Keanggotaan toko telah dicabut atau dinonaktifkan (Revoked).' },
              { status: 403 }
            ),
          };
        }

        // Authoritative Database Role Override (Token role NEVER overrides DB role)
        payload.role = membershipRow.role as any;
      } else {
        // Token has no userId: check if memberships exist for this tenant
        const { count, error: countErr } = await supabase
          .from('tenant_memberships')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${tenantRow.id},tenant_slug.eq.${tenantRow.slug}`);

        if (countErr) {
          return {
            authorized: false,
            status: 403,
            response: NextResponse.json(
              { success: false, error: 'Forbidden: Gagal memverifikasi keanggotaan untuk token tanpa identitas pengguna.' },
              { status: 403 }
            ),
          };
        }

        const membershipCount = count || 0;
        if (membershipCount > 0) {
          return {
            authorized: false,
            status: 403,
            response: NextResponse.json(
              { success: false, error: 'Forbidden: Token sesi tanpa identitas pengguna (userId) ditolak karena keanggotaan toko terdaftar.' },
              { status: 403 }
            ),
          };
        }
      }
    }
  } catch (dbErr) {
    console.warn('[AUTH_SSOT] Database membership lookup failure:', dbErr);
    return {
      authorized: false,
      status: 503,
      error: 'DATABASE_LOOKUP_FAILED',
      response: NextResponse.json(
        { success: false, error: 'Database lookup failed (Fail-Closed).' },
        { status: 503 }
      ),
    };
  }

  // 3. Check role authorization against authoritative role
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = payload.role || 'MERCHANT';
    if (!allowedRoles.includes(userRole)) {
      return {
        authorized: false,
        status: 403,
        response: NextResponse.json(
          { success: false, error: `Forbidden: Peran '${userRole}' tidak memiliki wewenang untuk operasi ini.` },
          { status: 403 }
        ),
      };
    }
  }

  return {
    authorized: true,
    payload,
  };
}

export const authorizeMerchantRequestAsync = authorizeMerchantSession;

export interface AuthorizeServerComponentResult {
  authorized: boolean;
  reason?: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR';
  role?: string;
  payload?: MerchantSessionPayload;
  tenantRow?: any;
}

/**
 * Validates request session and enforces role & tenant authorization server-side
 * inside React Server Components (RSC) where cookies() and headers() are used.
 *
 * Full Server Authorization Chain (Round 3T.1 Directive):
 * 1. Session authentication (HMAC-signed token from cookies/headers).
 * 2. Tenant identity binding (token tenant matches route tenant).
 * 3. Canonical tenant record verification in database.
 * 4. Database membership verification (SSOT: user is active member; revoked memberships fail closed).
 * 5. Role authorization hierarchy check.
 */
export async function authorizeServerComponentTenant(
  targetSlug: string,
  allowedRoles?: Array<'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR'>,
  providedToken?: string | null
): Promise<AuthorizeServerComponentResult> {
  const normSlug = (targetSlug || '').toLowerCase().trim();
  if (!normSlug) {
    return { authorized: false, reason: 'NOT_FOUND' };
  }

  // 1. Resolve token from parameters or Next.js cookies/headers
  let token = providedToken;
  if (!token) {
    try {
      const { cookies, headers } = await import('next/headers');
      const cookieStore = await cookies();
      token =
        cookieStore.get('bt_merchant_token')?.value ||
        cookieStore.get('bt_session_token')?.value;

      if (!token) {
        const headersList = await headers();
        const headerToken = headersList.get('x-merchant-token')?.trim();
        if (headerToken && headerToken.includes('.')) {
          token = headerToken;
        } else {
          const authHeader = headersList.get('authorization')?.trim() || '';
          if (authHeader.toLowerCase().startsWith('bearer ')) {
            const candidate = authHeader.slice(7).trim();
            if (candidate.split('.').length === 2) {
              token = candidate;
            }
          }
        }
      }
    } catch {
      // In isolated test runner without next/headers context
    }
  }

  if (!token) {
    return { authorized: false, reason: 'UNAUTHENTICATED' };
  }

  // 2. Cryptographic HMAC Token Verification
  const result = await verifyMerchantSessionTokenAsync(token, normSlug);
  if (!result.valid || !result.payload) {
    return { authorized: false, reason: result.status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED' };
  }

  const payload: MerchantSessionPayload = { ...result.payload };

  // 3. Connect to Database & Query Canonical Tenant Record
  const { getWorkforceSupabaseAdmin } = await import('@/lib/supabaseClient');
  const supabase = getWorkforceSupabaseAdmin();
  if (!supabase) {
    return { authorized: false, reason: 'ERROR' };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normSlug);
  let tQuery = supabase.from('tenants').select('*');
  if (isUuid) {
    tQuery = tQuery.eq('id', normSlug);
  } else {
    tQuery = tQuery.eq('slug', normSlug);
  }

  const { data: tenantRow, error: tErr } = await tQuery.maybeSingle();
  if (tErr || !tenantRow) {
    return { authorized: false, reason: 'NOT_FOUND' };
  }

  // 4. Validate Tenant Identity Consistency (anti-spoofing)
  const consistency = validateTenantIdentityConsistency(payload, tenantRow);
  if (!consistency.valid) {
    return { authorized: false, reason: 'FORBIDDEN' };
  }

  // 5. Database Membership Authority Check (SSOT) — REQUIRED for all human sessions.
  // userId is MANDATORY. Any token missing userId is rejected fail-closed.
  if (!payload.userId) {
    return { authorized: false, reason: 'FORBIDDEN' };
  }

  let membershipRow: any = null;
  let authoritativeRole = payload.role || 'MERCHANT';

  {
    const { data: mData } = await supabase
      .from('tenant_memberships')
      .select('role, is_active')
      .eq('user_id', payload.userId)
      .or(`tenant_id.eq.${tenantRow.id},tenant_slug.eq.${tenantRow.slug}`)
      .maybeSingle();
    membershipRow = mData;

    if (!membershipRow) {
      try {
        const { data: mDataStaging } = await (supabase as any)
          .schema('workforce_staging')
          .from('tenant_memberships')
          .select('role, is_active')
          .eq('user_id', payload.userId)
          .or(`tenant_id.eq.${tenantRow.id},tenant_slug.eq.${tenantRow.slug}`)
          .maybeSingle();
        membershipRow = mDataStaging;
      } catch { }
    }

    // Missing membership fails closed
    if (!membershipRow) {
      return { authorized: false, reason: 'FORBIDDEN' };
    }

    // Revoked / inactive membership fails closed
    if (membershipRow.is_active !== true) {
      return { authorized: false, reason: 'FORBIDDEN' };
    }

    // Authoritative DB role override
    authoritativeRole = membershipRow.role;
  }

  // 6. Role Authorization Check
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(authoritativeRole as any)) {
      return { authorized: false, reason: 'FORBIDDEN', role: authoritativeRole };
    }
  }

  return {
    authorized: true,
    role: authoritativeRole,
    payload,
    tenantRow,
  };
}
