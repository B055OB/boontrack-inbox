/**
 * lib/auth/rbac-guard.ts
 * Strict Fail-Closed RBAC & Session Token Verification for Manager & Control Plane Endpoints.
 *
 * Security Directives (CTO Hardening Clearance P0):
 * 1. ZERO TRUST ON CLIENT HEADERS: Total elimination of `x-user-role` or client-supplied role claims.
 * 2. NO SUBSTRING MATCHING: Prohibit weak heuristics like includes('admin') or includes('manager').
 * 3. NO SERVICE ROLE AS BEARER: Explicitly reject SUPABASE_SERVICE_ROLE_KEY used as a human bearer token.
 * 4. MANDATORY OFFICIAL SUPABASE AUTH: Validate token via `supabaseAdmin.auth.getUser(token)`
 *    to resolve verified user_id, then resolve role directly from user metadata or database.
 * 5. STRICT FAIL-CLOSED: Non-manager roles (e.g. AFFILIATE, CUSTOMER) rejected with 403.
 *    Invalid/expired tokens rejected with 401.
 */

import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface ManagerAuthOptions {
  allowMachine?: boolean;
}

export interface ManagerAuthResult {
  authorized: boolean;
  role?: 'SUPERADMIN' | 'AFFILIATE_MANAGER' | 'INTERNAL_SERVICE';
  userId?: string;
  isMachine?: boolean;
  errorStatus?: 401 | 403;
  errorMessage?: string;
}

export async function verifyManagerRole(
  req: NextRequest,
  options: ManagerAuthOptions = {}
): Promise<ManagerAuthResult> {
  // 1. Extract Bearer token from Authorization header or secure cookie
  const authHeader = req.headers.get('authorization')?.trim() || '';
  let token = '';

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (!token) {
    token = (
      req.cookies.get('sb-access-token')?.value ||
      req.cookies.get('bt_manager_token')?.value ||
      req.headers.get('x-manager-token') ||
      ''
    ).trim();
  }

  // Fail-closed: Reject immediately if no token is presented
  if (!token) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Sesi atau token autentikasi tidak ditemukan.',
    };
  }

  // 2. Security Guard: SUPABASE_SERVICE_ROLE_KEY is strictly forbidden as a human bearer token
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (serviceRoleKey && token === serviceRoleKey) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: SUPABASE_SERVICE_ROLE_KEY dilarang keras digunakan sebagai token login pengguna.',
    };
  }

  // 3. Machine Identity Isolation (CTO Directive P1 - Blocker 5):
  // Shared machine secret (ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET) is strictly isolated
  // to machine-to-machine integrations and MUST NOT be granted universal SUPERADMIN privileges.
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();
  if (envAdminSecret && token === envAdminSecret) {
    if (options.allowMachine) {
      return {
        authorized: true,
        role: 'INTERNAL_SERVICE',
        userId: 'machine:internal-service',
        isMachine: true,
      };
    }
    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: 'Forbidden: Machine secret (ADMIN_INTERNAL_SECRET) dilarang digunakan untuk aksi manajerial universal SUPERADMIN.',
    };
  }

  // 4. Validate Token via Official Supabase Auth Session
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (adminClientErr) {
    console.error('[RBAC Guard] Failed to acquire Supabase Admin client:', adminClientErr);
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Database auth engine unreachable.',
    };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Token autentikasi tidak valid atau telah kedaluwarsa.',
    };
  }

  const user = authData.user;
  const userId = user.id;
  const userEmail = (user.email || '').trim().toLowerCase();

  // 5. Strict app_metadata RBAC (CTO Directive P1 - Blocker 1):
  // ZERO TRUST ON user_metadata: In Supabase Auth, user_metadata is mutable by end-users via client SDK
  // and constitutes a severe Privilege Escalation vector. ONLY app_metadata (immutable by users, controlled
  // strictly by backend service_role) and Database SSOT (affiliates table) are trusted!
  let resolvedRole: 'SUPERADMIN' | 'AFFILIATE_MANAGER' | null = null;

  const appRole = String(user.app_metadata?.role || user.app_metadata?.user_role || '').trim().toUpperCase();

  if (appRole === 'SUPERADMIN') {
    resolvedRole = 'SUPERADMIN';
  } else if (appRole === 'AFFILIATE_MANAGER' || appRole === 'AM') {
    resolvedRole = 'AFFILIATE_MANAGER';
  }

  // If not declared in token claims, query Single Source of Truth in database (affiliates table)
  if (!resolvedRole) {
    try {
      const { data: affRow, error: affErr } = await supabaseAdmin
        .from('affiliates')
        .select('id, role, status')
        .or(`id.eq.${userId},email.eq.${userEmail}`)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (!affErr && affRow) {
        const dbRole = String(affRow.role || '').trim().toUpperCase();
        if (dbRole === 'SUPERADMIN') {
          resolvedRole = 'SUPERADMIN';
        } else if (dbRole === 'AM' || dbRole === 'AFFILIATE_MANAGER') {
          resolvedRole = 'AFFILIATE_MANAGER';
        }
      }
    } catch (dbErr) {
      console.warn('[RBAC Guard] Database role check warning:', dbErr);
    }
  }

  // 6. Fail-Closed Role Enforcement
  if (!resolvedRole) {
    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: 'Forbidden: Pengguna terautentikasi tidak memiliki role manajerial (SUPERADMIN atau AFFILIATE_MANAGER).',
    };
  }

  return {
    authorized: true,
    role: resolvedRole,
    userId,
  };
}
