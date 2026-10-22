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

export interface VerifySessionResult {
  valid: boolean;
  status: 200 | 401 | 403;
  payload?: MerchantSessionPayload;
  error?: string;
}

/**
 * Resolves all candidate signing secrets for verification, supporting zero-downtime secret rotation.
 * Priority:
 * 1. Active: BOONTRACK_SESSION_SECRET / MERCHANT_SESSION_SECRET
 * 2. Rotation Transition: BOONTRACK_SESSION_SECRET_PREVIOUS / MERCHANT_SESSION_SECRET_PREVIOUS
 * 3. Derived: Hash of ADMIN_INTERNAL_SECRET (fallback)
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

  const adminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();
  if (adminSecret && adminSecret.length >= 16) {
    const derived = crypto.createHash('sha256').update(`bt_merchant_session_derived:${adminSecret}`).digest('hex');
    if (!secrets.includes(derived)) {
      secrets.push(derived);
    }
  }

  if (secrets.length === 0) {
    secrets.push('bt_dev_merchant_session_secret_default_key_2026_minimum_32_bytes!');
  }

  return secrets;
}

/**
 * Resolves the active signing secret for newly minted tokens.
 */
export function getMerchantSessionSecret(): string {
  const secrets = getMerchantSessionSecrets();
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
 * Verifies a server-signed merchant session token.
 */
export function verifyMerchantSessionToken(
  token?: string | null,
  expectedTenantSlug?: string | null,
  customSecret?: string
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

  // Check tenant binding if expected tenant is specified
  if (expectedTenantSlug) {
    const normExpected = expectedTenantSlug.toLowerCase().trim();
    const normTokenTenant = (payload.tenantSlug || '').toLowerCase().trim();

    if (normTokenTenant !== normExpected) {
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
 * Extracts a signed merchant session token from NextRequest (Cookie or Header).
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
