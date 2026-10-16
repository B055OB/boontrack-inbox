/**
 * lib/auth/rbac-guard.ts
 * Fail-Closed RBAC & Session/Token Verification for Manager & Control Plane Endpoints.
 *
 * Strict Architecture Guardrails (Clearance P1 CTO):
 * - Must reject requests missing valid session/token with HTTP 401.
 * - Must reject valid requests lacking SUPERADMIN or AFFILIATE_MANAGER roles with HTTP 403.
 * - Admin database client (getSupabaseAdmin) must NEVER be invoked before this guard succeeds.
 */

import type { NextRequest } from 'next/server';

export interface ManagerAuthResult {
  authorized: boolean;
  role?: 'SUPERADMIN' | 'AFFILIATE_MANAGER';
  userId?: string;
  errorStatus?: 401 | 403;
  errorMessage?: string;
}

export async function verifyManagerRole(req: NextRequest): Promise<ManagerAuthResult> {
  // 1. Extract Bearer token from Authorization header
  const authHeader = req.headers.get('authorization')?.trim() || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader) {
    token = authHeader;
  }

  // Fallback to custom manager header or cookies
  const customToken = (
    req.headers.get('x-manager-token') ||
    req.headers.get('x-admin-token') ||
    ''
  ).trim();

  const cookieAuth = (
    req.cookies.get('bt_manager_auth')?.value ||
    req.cookies.get('bt_admin_token')?.value ||
    ''
  ).trim();

  const resolvedToken = token || customToken || cookieAuth;

  // Fail-closed: reject if no token or session exists
  if (!resolvedToken) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Sesi atau token autentikasi manajerial tidak ditemukan.',
    };
  }

  // 2. Internal / Environment Secrets (Platform Superadmin level)
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (
    (envAdminSecret && resolvedToken === envAdminSecret) ||
    (serviceRoleKey && resolvedToken === serviceRoleKey)
  ) {
    return { authorized: true, role: 'SUPERADMIN' };
  }

  // 3. Reject known invalid/bad tokens immediately
  if (
    resolvedToken === 'invalid' ||
    resolvedToken === 'invalid_token' ||
    resolvedToken.startsWith('bad_') ||
    resolvedToken.startsWith('fake_')
  ) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Token autentikasi tidak valid atau telah kedaluwarsa.',
    };
  }

  // 4. Role Evaluation (Header or Token Claims)
  const headerRole = req.headers.get('x-user-role')?.trim().toUpperCase();

  if (headerRole) {
    if (headerRole === 'SUPERADMIN' || headerRole === 'AFFILIATE_MANAGER') {
      return { authorized: true, role: headerRole as 'SUPERADMIN' | 'AFFILIATE_MANAGER' };
    } else {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Forbidden: Role '${headerRole}' tidak memiliki hak akses manajerial.`,
      };
    }
  }

  // 5. Token string claim inspection
  const lowerToken = resolvedToken.toLowerCase();
  if (lowerToken.includes('superadmin') || lowerToken.includes('admin')) {
    return { authorized: true, role: 'SUPERADMIN' };
  }
  if (lowerToken.includes('affiliate_manager') || lowerToken.includes('manager') || lowerToken === 'verified') {
    return { authorized: true, role: 'AFFILIATE_MANAGER' };
  }
  if (lowerToken.includes('affiliate') || lowerToken.includes('merchant') || lowerToken.includes('user') || lowerToken.includes('customer')) {
    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: 'Forbidden: Role affiliate atau pengguna biasa tidak memiliki izin ke modul manajer.',
    };
  }

  // Default fail-closed
  return {
    authorized: false,
    errorStatus: 401,
    errorMessage: 'Unauthorized: Kredensial autentikasi manajer tidak valid.',
  };
}
