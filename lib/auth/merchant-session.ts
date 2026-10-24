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
 * Validates whether an incoming request carries an authorized machine-to-machine internal secret.
 */
export function isInternalMachineAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  const internalSecret = req.headers.get('x-internal-secret')?.trim() || '';
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  if (envAdminSecret && envAdminSecret.length >= 16) {
    const bufEnv = Buffer.from(envAdminSecret);
    if (internalSecret) {
      const bufProvided = Buffer.from(internalSecret);
      if (bufProvided.length === bufEnv.length && crypto.timingSafeEqual(bufProvided, bufEnv)) {
        return true;
      }
    }
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const candidate = authHeader.slice(7).trim();
      const bufBearer = Buffer.from(candidate);
      if (bufBearer.length === bufEnv.length && crypto.timingSafeEqual(bufBearer, bufEnv)) {
        return true;
      }
    }
  }
  return false;
}

export type AuthorizeMerchantResult =
  | { authorized: true; payload: MerchantSessionPayload }
  | { authorized: false; status: 401 | 403 | 500; response: NextResponse };

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
