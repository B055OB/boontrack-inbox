/**
 * lib/auth/studio-session-guard.ts
 * Authoritative Server-Side Studio Session & Multi-Tenant Authorization Guard
 * CTO Remediation Directive: SEC-P0-02, SEC-P0-03, SEC-P1-01, SEC-P1-02
 *
 * Security Invariants:
 * 1. Zero Trust on Client Tenant Claims: Authorization is derived strictly from cryptographic session claims.
 * 2. Host-Only Cookie Extraction: Authoritatively reads RFC 6265bis __Host-bt_studio_session (and bt_studio_session).
 * 3. Product Realm Isolation: Verifies token strictly under the 'studio' product realm (rejects Creator sessions).
 * 4. Revocation & Expiration Enforcement: Validates JTI against product-scoped revocation cache and checks exp/nbf.
 * 5. Strict Tenant Mismatch Denial: If client explicitly supplies a tenant identifier that differs from session claims, immediately deny with 403.
 */

import { verifyHostSessionToken } from './host-session';

export interface AuthenticatedStudioSession {
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  tenantSlug?: string;
  role?: string;
  jti?: string;
  error?: string;
}

/**
 * Parses cookies safely from either NextRequest (cookies map) or standard Request (Cookie header).
 */
export function extractStudioSessionToken(req: any): string | null {
  if (!req) return null;

  // 1. Try NextRequest.cookies map
  if (req.cookies && typeof req.cookies.get === 'function') {
    const hostCookie = req.cookies.get('__Host-bt_studio_session')?.value;
    if (hostCookie) return hostCookie;

    const standardCookie = req.cookies.get('bt_studio_session')?.value;
    if (standardCookie) return standardCookie;
  }

  // 2. Try parsing Cookie header string
  let rawCookie: string | null = null;
  if (req.headers) {
    if (typeof req.headers.get === 'function') {
      rawCookie = req.headers.get('cookie');
    } else if (typeof req.headers.cookie === 'string') {
      rawCookie = req.headers.cookie;
    }
  }

  if (rawCookie) {
    // Look for __Host-bt_studio_session first
    const hostMatch = rawCookie.match(/(?:^|;\s*)__Host-bt_studio_session=([^;]+)/);
    if (hostMatch && hostMatch[1]) {
      return decodeURIComponent(hostMatch[1].trim());
    }

    // Fallback to bt_studio_session
    const devMatch = rawCookie.match(/(?:^|;\s*)bt_studio_session=([^;]+)/);
    if (devMatch && devMatch[1]) {
      return decodeURIComponent(devMatch[1].trim());
    }
  }

  // 3. Fallback: Authorization header Bearer token (for automated testing / CLI)
  if (req.headers) {
    const authHeader = typeof req.headers.get === 'function'
      ? req.headers.get('authorization')
      : req.headers.authorization;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
  }

  return null;
}

/**
 * Authoritatively verifies the caller's Studio session and returns verified identity.
 */
export async function getAuthenticatedStudioSession(req: any): Promise<AuthenticatedStudioSession> {
  const token = extractStudioSessionToken(req);

  if (!token) {
    return {
      authenticated: false,
      error: 'NO_SESSION',
    };
  }

  const verification = await verifyHostSessionToken(token, 'studio');

  if (!verification.valid || !verification.payload) {
    return {
      authenticated: false,
      error: verification.error || 'INVALID_SESSION',
    };
  }

  const payload = verification.payload;

  if (!payload.tid) {
    return {
      authenticated: false,
      error: 'TENANT_ID_MISSING',
    };
  }

  return {
    authenticated: true,
    userId: payload.sub,
    tenantId: payload.tid,
    tenantSlug: payload.tsl,
    role: payload.role,
    jti: payload.jti,
  };
}

/**
 * Validates that any client-supplied tenant identifier matches the cryptographically verified session.
 * Prevents cross-tenant impersonation and tenant parameter tampering.
 */
export function validateTenantOwnership(
  sessionTenantId: string,
  sessionTenantSlug: string,
  clientTenantIdentifier?: string | null
): { allowed: boolean; reason?: string } {
  if (!clientTenantIdentifier || !clientTenantIdentifier.trim()) {
    return { allowed: true }; // Client did not override, session tenant will be used
  }

  const clean = clientTenantIdentifier.trim().toLowerCase();
  const authorizedId = (sessionTenantId || '').trim().toLowerCase();
  const authorizedSlug = (sessionTenantSlug || '').trim().toLowerCase();

  if (clean === authorizedId || clean === authorizedSlug) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Akses ditolak: Tenant identifier yang diminta (${clean}) tidak sesuai dengan tenant terverifikasi pada sesi (${authorizedSlug || authorizedId}).`,
  };
}
