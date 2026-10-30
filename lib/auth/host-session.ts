/**
 * lib/auth/host-session.ts
 * Host-Only Session Management Engine for Studio & Creator (RFC 6265bis & RFC 7519)
 * Directive RE-01 / CTO Execution Authorization (October 2026)
 *
 * Security Invariants:
 * 1. Zero Domain Attribute: Host-only cookie binding prevents cross-subdomain leakage.
 * 2. Zero PII in Claims: No email, phone number, or names stored in token claims.
 * 3. Cryptographic Verification: Explicit HS256 algorithm, signature, issuer, audience, and exp checks.
 * 4. Product Isolation: Studio and Creator use independent session secrets, issuers, audiences, and cookies.
 */

import crypto from 'crypto';

export type AuthProduct = 'studio' | 'creator';

export interface HostSessionPayload {
  iss: string;            // Authoritative product issuer URL
  aud: string;            // Explicit audience host
  sub: string;            // Platform User ID (UUID)
  tid: string;            // Dedicated Workspace Tenant ID (UUID)
  tsl: string;            // Workspace Tenant Slug
  role: string;           // Product role: 'STUDIO_PARTICIPANT' | 'STUDIO_CREATOR' | 'CREATOR_OWNER'
  jti: string;            // Unique session token UUID for revocation tracking
  iat: number;            // Issued-at timestamp (seconds)
  nbf: number;            // Not-before timestamp (seconds)
  exp: number;            // Expiration timestamp (seconds)
  ver: number;            // Session version for bulk revocation
}

// In-memory blacklist fallback for test / fast-path checks
const revokedJtiCache = new Map<string, number>();

/**
 * Resolves product-specific configuration
 */
export function getProductAuthConfig(product: AuthProduct) {
  const isProd = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV_MODE;

  if (product === 'studio') {
    const secret =
      process.env.STUDIO_SESSION_SECRET ||
      (process.env.NODE_ENV === 'test'
        ? 'test_studio_session_secret_32_bytes_minimum_length_safe_guard'
        : '');

    if (!secret && isProd) {
      throw new Error('[Security Guard] STUDIO_SESSION_SECRET is required in production.');
    }

    return {
      product: 'studio' as const,
      cookieName: isProd ? '__Host-bt_studio_session' : 'bt_studio_session',
      issuer: 'https://studio.boontrack.com',
      audience: 'https://studio.boontrack.com',
      defaultRole: 'STUDIO_PARTICIPANT',
      secret: secret || 'dev_studio_secret_must_be_rotated_before_production_deployment',
    };
  }

  const secret =
    process.env.CREATOR_SESSION_SECRET ||
    (process.env.NODE_ENV === 'test'
      ? 'test_creator_session_secret_32_bytes_minimum_length_safe_guard'
      : '');

  if (!secret && isProd) {
    throw new Error('[Security Guard] CREATOR_SESSION_SECRET is required in production.');
  }

  return {
    product: 'creator' as const,
    cookieName: isProd ? '__Host-bt_creator_session' : 'bt_creator_session',
    issuer: 'https://creator.boontrack.com',
    audience: 'https://creator.boontrack.com',
    defaultRole: 'CREATOR_OWNER',
    secret: secret || 'dev_creator_secret_must_be_rotated_before_production_deployment',
  };
}

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs a structured host-only session JWT
 */
export function signHostSessionToken(params: {
  product: AuthProduct;
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role?: string;
  version?: number;
  ttlSeconds?: number;
}): string {
  const config = getProductAuthConfig(params.product);
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds || 7 * 24 * 60 * 60; // 7 days default

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: HostSessionPayload = {
    iss: config.issuer,
    aud: config.audience,
    sub: params.userId,
    tid: params.tenantId,
    tsl: params.tenantSlug,
    role: params.role || config.defaultRole,
    jti: crypto.randomUUID(),
    iat: now,
    nbf: now,
    exp: now + ttl,
    ver: params.version ?? 1,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', config.secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Authoritatively verifies a host session token
 */
export async function verifyHostSessionToken(
  token: string,
  product: AuthProduct,
  minVersion: number = 1
): Promise<{ valid: boolean; payload?: HostSessionPayload; error?: string }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'TOKEN_EMPTY' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'TOKEN_MALFORMED' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const config = getProductAuthConfig(product);

  // 1. Verify Signature
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = crypto
    .createHmac('sha256', config.secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSig);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return { valid: false, error: 'SIGNATURE_INVALID' };
  }

  // 2. Parse Payload
  let payload: HostSessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { valid: false, error: 'PAYLOAD_INVALID_JSON' };
  }

  const now = Math.floor(Date.now() / 1000);

  // 3. Claims Validation
  if (payload.iss !== config.issuer) {
    return { valid: false, error: 'ISSUER_MISMATCH' };
  }

  if (payload.aud !== config.audience) {
    return { valid: false, error: 'AUDIENCE_MISMATCH' };
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    return { valid: false, error: 'SUBJECT_MISSING' };
  }

  if (!payload.tid || typeof payload.tid !== 'string') {
    return { valid: false, error: 'TENANT_ID_MISSING' };
  }

  if (payload.exp && payload.exp <= now) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  if (payload.nbf && payload.nbf > now) {
    return { valid: false, error: 'TOKEN_NOT_ACTIVE' };
  }

  if (payload.ver && payload.ver < minVersion) {
    return { valid: false, error: 'SESSION_VERSION_SUPERSEDED' };
  }

  // 4. Revocation List Check
  if (payload.jti && revokedJtiCache.has(payload.jti)) {
    return { valid: false, error: 'TOKEN_REVOKED' };
  }

  return { valid: true, payload };
}

/**
 * Returns cookie options enforcing RFC 6265bis host-only semantics
 */
export function getHostSessionCookieOptions(product: AuthProduct, isSecure?: boolean) {
  const isProd = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV_MODE;
  const secure = isSecure !== undefined ? isSecure : isProd;

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    // Crucial: Omit domain to enforce host-only cookie
  };
}

/**
 * Records a session JTI as revoked
 */
export async function revokeHostSession(jti: string, expSeconds: number) {
  revokedJtiCache.set(jti, expSeconds);
}
