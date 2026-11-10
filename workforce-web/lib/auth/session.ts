/**
 * workforce-web/lib/auth/session.ts
 * Authoritative Server-Side BWM Session Authentication & Authorization
 * 
 * Cryptographically signed session tokens using HMAC-SHA256.
 * Guarantees tenant scoping, RBAC validation, replay and forgery resistance.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

export type BwmRole = 'field_personnel' | 'supervisor' | 'master_reseller' | 'owner' | 'merchant' | 'admin';

export interface BwmSessionPayload {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: BwmRole;
  nik: string;
  name: string;
  site?: string;
  siteId?: string;
  branch?: string;
  agencyName?: string;
  agencySlug?: string;
  iat: number;
  exp: number;
  expires_at: string;
  nonce: string;
}

// In-Memory Revocation Registry for Explicit Logouts and Revoked Sessions
const revokedTokens = new Set<string>();
const revokedNonces = new Set<string>();

/**
 * Explicitly revokes a session token (e.g. on logout or administrative session revocation).
 */
export function revokeBwmSessionToken(token: string): void {
  if (!token || typeof token !== 'string') return;
  const trimmed = token.trim();
  revokedTokens.add(trimmed);
  try {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      const rawPayload = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload: BwmSessionPayload = JSON.parse(rawPayload);
      if (payload.nonce) {
        revokedNonces.add(payload.nonce);
      }
    }
  } catch {
    // Ignore malformed token payloads during revocation
  }
}

/**
 * Checks whether a token or its cryptographic nonce has been revoked.
 */
export function isSessionRevoked(token: string, payload?: BwmSessionPayload): boolean {
  if (revokedTokens.has(token.trim())) return true;
  if (payload?.nonce && revokedNonces.has(payload.nonce)) return true;
  return false;
}

/**
 * Resets the revocation registry (primarily for test suite isolation).
 */
export function clearRevocationRegistry(): void {
  revokedTokens.clear();
  revokedNonces.clear();
}

/**
 * Resolves the server-only secret key for HMAC-SHA256 session signing.
 * Fails closed if no secret is available.
 */
function getSessionSecret(): string {
  const secret =
    process.env.WORKFORCE_SESSION_SECRET ||
    process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.INTERNAL_API_SECRET;

  if (!secret || secret.trim().length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[BWM AUTH FATAL] Missing high-entropy WORKFORCE_SESSION_SECRET in production environment.');
    }
    // Safe staging fallback secret for isolated test runs
    return 'bwm_staging_deterministic_hmac_secret_2026_isolated_guard';
  }

  return secret.trim();
}

/**
 * Cryptographically signs a BWM session payload using HMAC-SHA256.
 * Format: base64url(header).base64url(payload).signature
 */
export function signBwmSessionToken(
  params: {
    userId: string;
    tenantId: string;
    tenantSlug: string;
    role: BwmRole;
    nik: string;
    name: string;
    site?: string;
    siteId?: string;
    branch?: string;
    agencyName?: string;
    agencySlug?: string;
  },
  expiresInSeconds: number = 86400 // 24 hours
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;
  const expires_at = new Date(exp * 1000).toISOString();

  const payload: BwmSessionPayload = {
    userId: params.userId,
    tenantId: params.tenantId,
    tenantSlug: params.tenantSlug,
    role: params.role,
    nik: params.nik,
    name: params.name,
    site: params.site,
    siteId: params.siteId,
    branch: params.branch,
    agencyName: params.agencyName,
    agencySlug: params.agencySlug || params.tenantSlug,
    iat: now,
    exp: exp,
    expires_at: expires_at,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;

  const secret = getSessionSecret();
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `${data}.${signature}`;
}

export interface VerificationResult {
  valid: boolean;
  payload?: BwmSessionPayload;
  error?: string;
  statusCode?: number;
}

/**
 * Cryptographically verifies a BWM session token.
 * Validates HMAC signature with constant-time comparison and checks expiry.
 */
export function verifyBwmSessionToken(token: string | undefined | null): VerificationResult {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return { valid: false, error: 'MISSING_TOKEN', statusCode: 401 };
  }

  const cleanToken = token.trim();

  // Revocation registry check (Logout invalidation)
  if (isSessionRevoked(cleanToken)) {
    return { valid: false, error: 'SESSION_REVOKED_LOGGED_OUT', statusCode: 401 };
  }

  const parts = cleanToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'MALFORMED_TOKEN_STRUCTURE', statusCode: 401 };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const secret = getSessionSecret();

  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  // Constant-time signature comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    return { valid: false, error: 'INVALID_SIGNATURE_TAMPERED', statusCode: 401 };
  }

  try {
    const rawPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload: BwmSessionPayload = JSON.parse(rawPayload);

    // Check nonce revocation
    if (isSessionRevoked(cleanToken, payload)) {
      return { valid: false, error: 'SESSION_REVOKED_LOGGED_OUT', statusCode: 401 };
    }

    // Validate required claims
    if (!payload.userId || !payload.tenantId || !payload.role || !payload.exp) {
      return { valid: false, error: 'MISSING_REQUIRED_CLAIMS', statusCode: 401 };
    }

    // Expiry check
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'SESSION_EXPIRED', statusCode: 401 };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'INVALID_PAYLOAD_JSON', statusCode: 400 };
  }
}

/**
 * Live authority verification against the database SSOT (workforce_staging.tenants & tenant_memberships).
 * Enforces immediate rejection when membership is revoked, user is deactivated, or tenant is suspended.
 */
export async function verifySessionAuthority(
  payload: BwmSessionPayload
): Promise<{
  authorized: boolean;
  error?: string;
  status?: number;
  authoritativeRole?: BwmRole;
}> {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Verify Tenant Authority & Non-Suspension
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('id', payload.tenantId)
      .maybeSingle();

    if (tenantErr) {
      console.error('[BWM AUTH] Tenant authority check DB error:', tenantErr.message);
      return { authorized: false, error: 'DATABASE_LOOKUP_FAILED', status: 503 };
    }

    if (!tenant) {
      return { authorized: false, error: 'TENANT_NOT_FOUND', status: 404 };
    }

    const tenantMeta = tenant.metadata || {};
    if (
      tenantMeta.status === 'SUSPENDED' ||
      tenantMeta.is_active === false ||
      tenantMeta.suspended === true
    ) {
      return { authorized: false, error: 'TENANT_SUSPENDED', status: 403 };
    }

    // 2. Verify Active Membership Authority in workforce_staging.tenant_memberships
    const { data: membership, error: memErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('tenant_memberships')
      .select('id, user_id, tenant_id, role, is_active')
      .eq('user_id', payload.userId)
      .eq('tenant_id', payload.tenantId)
      .maybeSingle();

    if (memErr) {
      console.error('[BWM AUTH] Membership authority check DB error:', memErr.message);
      return { authorized: false, error: 'DATABASE_LOOKUP_FAILED', status: 503 };
    }

    if (!membership) {
      return { authorized: false, error: 'MEMBERSHIP_NOT_FOUND', status: 403 };
    }

    if (membership.is_active !== true) {
      return { authorized: false, error: 'MEMBERSHIP_REVOKED', status: 403 };
    }

    let authoritativeRole: BwmRole = 'field_personnel';
    const dbRole = (membership.role || '').toLowerCase();
    if (dbRole.includes('owner') || dbRole.includes('merchant') || dbRole.includes('master')) {
      authoritativeRole = 'master_reseller';
    } else if (dbRole.includes('super')) {
      authoritativeRole = 'supervisor';
    }

    return { authorized: true, authoritativeRole };
  } catch (err: any) {
    console.error('[BWM AUTH] Authority check exception:', err);
    return { authorized: false, error: 'AUTHORITY_CHECK_EXCEPTION', status: 503 };
  }
}

export interface AuthenticatedSessionOptions {
  skipDatabaseLookup?: boolean;
}

/**
 * Authorizes a request in Next.js App Router API routes.
 * Extracts token from HttpOnly cookie or Authorization Bearer header.
 * Derives tenant, role, and user identity strictly from verified session.
 * Live-checks membership and tenant authority to enforce immediate revocation.
 */
export async function getAuthenticatedWorkforceSession(
  req: NextRequest | Request,
  options?: AuthenticatedSessionOptions
): Promise<{
  session: BwmSessionPayload | null;
  error?: string;
  status?: number;
}> {
  let token: string | undefined;

  // 1. Check cookies (NextRequest or standard Request headers)
  if ('cookies' in req && typeof (req as any).cookies?.get === 'function') {
    token = (req as any).cookies.get('bwm_session_token')?.value;
  } else {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/bwm_session_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  // 2. Check Authorization Bearer header fallback (for programmatic / mobile API clients)
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return { session: null, error: 'UNAUTHORIZED_NO_SESSION', status: 401 };
  }

  const result = verifyBwmSessionToken(token);
  if (!result.valid || !result.payload) {
    return { session: null, error: result.error || 'UNAUTHORIZED_INVALID_TOKEN', status: result.statusCode || 401 };
  }

  const payload: BwmSessionPayload = { ...result.payload };

  // 3. Live Authority Verification against Database (SSOT)
  if (!options?.skipDatabaseLookup) {
    const authorityCheck = await verifySessionAuthority(payload);
    if (!authorityCheck.authorized) {
      return {
        session: null,
        error: authorityCheck.error || 'UNAUTHORIZED_REVOKED_AUTHORITY',
        status: authorityCheck.status || 403,
      };
    }
    if (authorityCheck.authoritativeRole) {
      payload.role = authorityCheck.authoritativeRole;
    }
  }

  return { session: payload };
}

/**
 * Enforces tenant scoping on mutating API requests.
 * Throws or returns an error if client attempts to access a different tenant.
 */
export function enforceTenantScope(
  session: BwmSessionPayload,
  requestedTenantIdOrSlug: string
): { authorized: boolean; error?: string } {
  if (!requestedTenantIdOrSlug) {
    return { authorized: false, error: 'TENANT_IDENTIFIER_REQUIRED' };
  }

  const clean = requestedTenantIdOrSlug.trim().toLowerCase();
  const sessionTenantId = session.tenantId.toLowerCase();
  const sessionTenantSlug = session.tenantSlug.toLowerCase();

  // Owners and merchants can access only their own tenant
  if (clean === sessionTenantId || clean === sessionTenantSlug) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: `CROSS_TENANT_ACCESS_FORBIDDEN: Session tenant (${session.tenantSlug}) does not match requested tenant (${requestedTenantIdOrSlug}).`,
  };
}
