/**
 * lib/auth/merchant-session-edge.ts
 *
 * Edge Runtime & Universal Web Cryptography Session Token Verification.
 *
 * Security Invariants:
 * 1. ZERO NODE.JS BUILTIN DEPENDENCY: Strict compliance with Vercel Edge Runtime (V8 isolates).
 *    Uses standard W3C Web Cryptography API (`globalThis.crypto.subtle`).
 * 2. ZERO TRUST ON PLAINTEXT COOKIES: Plain cookies (merchant_store, etc.) are never trusted as proof of session.
 * 3. CRYPTOGRAPHIC SIGNATURE: Tokens are verified using HMAC-SHA256 with constant-time equality.
 * 4. STRICT TENANT BINDING: The token is bound to a specific tenant_slug / canonical tenant UUID.
 * 5. CANONICAL TENANT INTEGRITY: Dual identifiers (slug and UUID) must both agree with canonical record.
 * 6. EXPIRATION & REPLAY DEFENSE: Enforces expiration timestamp (exp) and rotation transition grace window.
 * 7. FAIL-CLOSED IN PRODUCTION: Missing or unconfigured signing secrets in production fail closed immediately.
 */

import type { NextRequest } from 'next/server';

export interface MerchantSessionPayload {
  tenantSlug: string;
  tenantId?: string;
  role: 'MERCHANT' | 'OWNER' | 'CS' | 'OPERATOR';
  userId?: string;
  name?: string;
  phone?: string;
  iat: number;
  exp: number;
  nonce: string;
}

export interface CanonicalTenantRecord {
  id?: string | null;
  slug?: string | null;
}

export interface VerifySessionResult {
  valid: boolean;
  status: 200 | 401 | 403 | 500;
  payload?: MerchantSessionPayload;
  error?: string;
}

/**
 * Constant-time string equality check to prevent timing attacks.
 * Operates without early exit on mismatch when lengths match.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Universal Base64URL string decoding compatible with both Edge runtime and Node.js.
 */
export function decodeBase64Url(str: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64url').toString('utf-8');
    }
  } catch {
    // Fall back to standard Web atob decoding below
  }

  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Resolves candidate signing secrets asynchronously using Web Cryptography API.
 * Supports zero-downtime secret rotation and fallback derived admin secret.
 *
 * Priority:
 * 1. Active: BOONTRACK_SESSION_SECRET / MERCHANT_SESSION_SECRET
 * 2. Rotation Transition: BOONTRACK_SESSION_SECRET_PREVIOUS / MERCHANT_SESSION_SECRET_PREVIOUS
 *
 * Production & Preview Security Rule:
 * Production and Vercel Preview environments must NEVER fall back to a hardcoded development secret
 * and must NEVER derive session secrets from admin internal secrets (strict domain separation).
 * If required secrets are absent, resolution returns empty array (fail-closed).
 */
export async function getMerchantSessionSecretsAsync(): Promise<string[]> {
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
      console.error('[AUTH_SECURITY] Critical: No merchant session signing secret configured in production/preview. Authentication failing closed.');
      return [];
    }
    // Only in non-production environments (test/dev)
    secrets.push('bt_dev_merchant_session_secret_default_key_2026_minimum_32_bytes!');
  }

  return secrets;
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
export function validateTenantIdentityConsistency(
  payload: MerchantSessionPayload,
  canonicalTenant?: CanonicalTenantRecord | null
): { valid: boolean; status: 200 | 403; error?: string } {
  if (!canonicalTenant) {
    return {
      valid: false,
      status: 403,
      error: 'Forbidden: Rekor kanonikal database tenant tidak tersedia (Fail-Closed).',
    };
  }

  const canonicalSlug = (canonicalTenant.slug || '').toLowerCase().trim();
  const canonicalId = (canonicalTenant.id || '').toLowerCase().trim();

  // Canonical record must have at least one identifier resolved from DB
  if (!canonicalSlug && !canonicalId) {
    return {
      valid: false,
      status: 403,
      error: 'Forbidden: Rekor kanonikal database tenant tidak memiliki slug atau UUID yang valid.',
    };
  }

  const tokenSlug = (payload.tenantSlug || '').toLowerCase().trim();
  const tokenId = (payload.tenantId || '').toLowerCase().trim();

  // Token must have at least one identifier
  if (!tokenSlug && !tokenId) {
    return {
      valid: false,
      status: 403,
      error: 'Forbidden: Token sesi tidak memuat identitas tenant (slug atau UUID).',
    };
  }

  // Dual-identifier token (both slug and UUID present in token)
  if (tokenSlug && tokenId) {
    const slugMatches = canonicalSlug ? tokenSlug === canonicalSlug : false;
    const idMatches = canonicalId ? tokenId === canonicalId : false;

    if (!slugMatches || !idMatches) {
      return {
        valid: false,
        status: 403,
        error: `Forbidden: Kontradiksi identitas tenant pada token sesi (slug: '${tokenSlug}', id: '${tokenId}') vs kanonikal (slug: '${canonicalSlug}', id: '${canonicalId}'). Keduanya wajib cocok.`,
      };
    }

    return { valid: true, status: 200 };
  }

  // Legacy single-identifier token: only slug present in token
  if (tokenSlug && !tokenId) {
    if (!canonicalSlug || tokenSlug !== canonicalSlug) {
      return {
        valid: false,
        status: 403,
        error: `Forbidden: Tenant slug pada token sesi legacy ('${tokenSlug}') tidak cocok dengan slug kanonikal ('${canonicalSlug}').`,
      };
    }
    return { valid: true, status: 200 };
  }

  // Legacy single-identifier token: only UUID present in token
  if (tokenId && !tokenSlug) {
    if (!canonicalId || tokenId !== canonicalId) {
      return {
        valid: false,
        status: 403,
        error: `Forbidden: Tenant UUID pada token sesi legacy ('${tokenId}') tidak cocok dengan UUID kanonikal ('${canonicalId}').`,
      };
    }
    return { valid: true, status: 200 };
  }

  return {
    valid: false,
    status: 403,
    error: 'Forbidden: Identitas tenant tidak dapat diverifikasi (Fail-Closed).',
  };
}

/**
 * Extracts a signed merchant session token from NextRequest (Cookie or Header).
 * Invariant: Plain cookies are non-authoritative and will never be returned as a token.
 */
export function extractMerchantSessionToken(req: NextRequest): string {
  // 1. Direct secure cookie
  const cookieToken = req.cookies.get('bt_merchant_token')?.value?.trim();
  if (cookieToken && cookieToken.includes('.')) {
    return cookieToken;
  }

  // 2. Custom header
  const headerToken = req.headers.get('x-merchant-token')?.trim();
  if (headerToken && headerToken.includes('.')) {
    return headerToken;
  }

  // 3. Authorization Bearer header (if structured as merchant token with single dot)
  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const candidate = authHeader.slice(7).trim();
    // Merchant session token has exactly 1 dot: base64url.hexSignature
    // Supabase JWT has 2 dots: header.payload.signature
    if (candidate.split('.').length === 2) {
      return candidate;
    }
  }

  return '';
}

/**
 * Verifies a server-signed merchant session token using Web Cryptography API (`crypto.subtle`).
 * Runs natively in Edge Runtime, Cloudflare Workers, Node.js 18+, and browsers.
 */
export async function verifyMerchantSessionToken(
  token?: string | null,
  expectedTenantSlug?: string | null,
  customSecret?: string,
  canonicalTenant?: CanonicalTenantRecord | null
): Promise<VerifySessionResult> {
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
  const candidateSecrets = customSecret ? [customSecret] : await getMerchantSessionSecretsAsync();
  if (candidateSecrets.length === 0) {
    return {
      valid: false,
      status: 401,
      error: 'Unauthorized: Konfigurasi keamanan sesi belum lengkap pada server (Fail-Closed).',
    };
  }

  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(encodedPayload);
  let signatureMatched = false;
  let matchedSecretIndex = -1;

  for (let i = 0; i < candidateSecrets.length; i++) {
    const candidateSecret = candidateSecrets[i];
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(candidateSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', key, payloadBytes);
      const expectedSignature = Array.from(new Uint8Array(sigBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      if (constantTimeEqual(providedSignature.toLowerCase(), expectedSignature.toLowerCase())) {
        signatureMatched = true;
        matchedSecretIndex = i;
        break;
      }
    } catch {
      continue;
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
    const rawJson = decodeBase64Url(encodedPayload);
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
