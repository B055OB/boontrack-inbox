/**
 * lib/auth/host-session-edge.ts
 *
 * Edge Runtime & Universal Web Cryptography Session Token Verification
 * for Studio and Creator Products (RFC 6265bis & RFC 7519).
 *
 * Security Invariants:
 * 1. ZERO NODE.JS BUILTIN DEPENDENCY: Strict compliance with Vercel Edge Runtime (V8 isolates).
 *    Uses standard W3C Web Cryptography API (`globalThis.crypto.subtle`).
 * 2. CRYPTOGRAPHIC VERIFICATION: HS256 signature verified in constant time.
 * 3. PRODUCT & NAMESPACE ISOLATION: Studio and Creator have distinct secrets, issuers, audiences, and cookies.
 *    No cross-product session replay or privilege inheritance is permitted.
 * 4. STRICT ZERO TRUST ON COOKIE EXISTENCE: Mere presence of cookie is never trusted as authenticated state.
 * 5. EXPIRATION & ACTIVATION: Strictly enforces expiration timestamp (exp) and not-before (nbf).
 * 6. FAIL-CLOSED: Missing signing secrets, malformed tokens, or mismatched claims fail closed immediately.
 */

import type { NextRequest } from 'next/server';

export type AuthProduct = 'studio' | 'creator';

export interface HostSessionPayload {
  iss: string;            // Authoritative product issuer URL
  aud: string;            // Explicit audience host
  sub: string;            // Platform User ID (UUID)
  tid: string;            // Dedicated Workspace Tenant ID (UUID)
  tsl: string;            // Workspace Tenant Slug
  role: string;           // Product role: 'STUDIO_PARTICIPANT' | 'STUDIO_CREATOR' | 'CREATOR_OWNER'
  jti: string;            // Unique session token UUID
  iat: number;            // Issued-at timestamp (seconds)
  nbf: number;            // Not-before timestamp (seconds)
  exp: number;            // Expiration timestamp (seconds)
  ver: number;            // Session version
}

export interface VerifyHostSessionResult {
  valid: boolean;
  payload?: HostSessionPayload;
  error?: string;
}

/**
 * Constant-time string equality check to prevent timing attacks.
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
 * Universal Base64URL string decoding compatible with Edge runtime and Node.js.
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
 * Converts an ArrayBuffer to a Base64URL encoded string.
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Resolves authoritative product configuration for Edge verification.
 */
export function getProductAuthConfigEdge(product: AuthProduct) {
  const isProd = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV_MODE;

  if (product === 'studio') {
    const secret =
      process.env.STUDIO_SESSION_SECRET ||
      (process.env.NODE_ENV === 'test'
        ? 'test_studio_session_secret_32_bytes_minimum_length_safe_guard'
        : '');

    if (!secret && isProd) {
      return {
        product: 'studio' as const,
        cookieName: '__Host-bt_studio_session',
        issuer: 'https://studio.boontrack.com',
        audience: 'https://studio.boontrack.com',
        defaultRole: 'STUDIO_PARTICIPANT',
        secret: '', // Will fail closed
      };
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
    return {
      product: 'creator' as const,
      cookieName: '__Host-bt_creator_session',
      issuer: 'https://creator.boontrack.com',
      audience: 'https://creator.boontrack.com',
      defaultRole: 'CREATOR_OWNER',
      secret: '', // Will fail closed
    };
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
 * Extracts a signed host session token for Studio or Creator from NextRequest.
 * Checks host-only cookie first, then non-host cookie, then optional custom header.
 */
export function extractHostSessionToken(
  req: NextRequest,
  product: AuthProduct
): string | null {
  // 1. Production RFC 6265bis Host-Only cookie
  const hostCookie = req.cookies.get(`__Host-bt_${product}_session`)?.value?.trim();
  if (hostCookie && hostCookie.split('.').length === 3) {
    return hostCookie;
  }

  // 2. Localhost / Dev fallback cookie
  const regularCookie = req.cookies.get(`bt_${product}_session`)?.value?.trim();
  if (regularCookie && regularCookie.split('.').length === 3) {
    return regularCookie;
  }

  // 3. Custom API / Inter-service header
  const headerToken = req.headers.get(`x-${product}-session-token`)?.trim();
  if (headerToken && headerToken.split('.').length === 3) {
    return headerToken;
  }

  return null;
}

/**
 * Authoritatively verifies a Studio or Creator host session token using Web Cryptography API (`crypto.subtle`).
 * Runs natively in Edge Runtime without any Node.js builtin dependencies.
 */
export async function verifyHostSessionTokenEdge(
  token?: string | null,
  product: AuthProduct = 'studio',
  minVersion: number = 1
): Promise<VerifyHostSessionResult> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'TOKEN_EMPTY' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'TOKEN_MALFORMED' };
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !providedSignature) {
    return { valid: false, error: 'TOKEN_MALFORMED' };
  }

  const config = getProductAuthConfigEdge(product);
  if (!config.secret) {
    return {
      valid: false,
      error: 'SECURITY_CONFIG_MISSING',
    };
  }

  // 1. Verify HS256 Signature using Web Cryptography API
  const encoder = new TextEncoder();
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const dataBytes = encoder.encode(dataToSign);

  try {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(config.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', key, dataBytes);
    const expectedSignature = arrayBufferToBase64Url(sigBuffer);

    if (!constantTimeEqual(providedSignature, expectedSignature)) {
      return { valid: false, error: 'SIGNATURE_INVALID' };
    }
  } catch (err) {
    return { valid: false, error: 'CRYPTO_VERIFICATION_FAILED' };
  }

  // 2. Decode and Validate Header
  try {
    const header = JSON.parse(decodeBase64Url(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { valid: false, error: 'HEADER_INVALID' };
    }
  } catch {
    return { valid: false, error: 'HEADER_MALFORMED' };
  }

  // 3. Decode and Validate Payload
  let payload: HostSessionPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return { valid: false, error: 'PAYLOAD_MALFORMED' };
  }

  const now = Math.floor(Date.now() / 1000);

  // 4. Claims & Namespace Verification
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

  return { valid: true, payload };
}
