/**
 * lib/auth/creator-auth-guard.ts
 * Strict Fail-Closed Security Guard & Anti-IDOR Engine for Creator & Reseller Endpoints.
 * Directive RE-01 / PR #67 Hardening (CTO Security Mandate)
 *
 * Rules:
 * 1. P0 DTO SANITIZATION: Strip all sensitive credentials (PIN, pin_hash, password_hash, tokens).
 * 2. P1 ANTI-IDOR ENFORCEMENT: Never trust client-supplied ID/handle in URL or body without session verification.
 * 3. STRICT FAIL-CLOSED:
 *    - Unauthenticated requests -> HTTP 401 Unauthorized
 *    - Cross-tenant / cross-user requests -> HTTP 403 Forbidden
 * 4. CANONICAL TENANT SCOPING: Validate that caller owns the target tenant/creator resource.
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface CreatorAuthResult {
  authorized: boolean;
  role?: 'SUPERADMIN' | 'ADMIN' | 'CREATOR_OWNER' | 'TENANT_OWNER' | 'CREATOR_COOKIE';
  userId?: string;
  email?: string;
  handle?: string;
  tenantId?: string;
  errorStatus?: 401 | 403;
  errorMessage?: string;
}

/**
 * P0: Sanitasi DTO Profil Kreator
 * DILARANG KERAS mengekspos PIN plaintext, password hash, atau token rahasia dalam response JSON.
 */
export function sanitizeCreatorProfileDto<T = any>(profile: T): T | null {
  if (!profile || typeof profile !== 'object') return null;

  const sanitized: any = Array.isArray(profile)
    ? [...profile]
    : { ...profile };

  // Strip root credentials
  delete sanitized.pin;
  delete sanitized.pin_hash;
  delete sanitized.password_hash;
  delete sanitized.access_password;
  delete sanitized.access_pin;
  delete sanitized.password;
  delete sanitized.secret;
  delete sanitized.token;
  delete sanitized.internal_token;
  delete sanitized.telegram_chat_id;

  // Strip theme_config credentials
  if (sanitized.theme_config && typeof sanitized.theme_config === 'object') {
    sanitized.theme_config = { ...sanitized.theme_config };
    delete sanitized.theme_config.pin;
    delete sanitized.theme_config.pin_hash;
    delete sanitized.theme_config.password_hash;
    delete sanitized.theme_config.access_password;
    delete sanitized.theme_config.access_pin;
    delete sanitized.theme_config.password;
    delete sanitized.theme_config.secret;
    delete sanitized.theme_config.token;
  }

  // Strip metadata credentials
  if (sanitized.metadata && typeof sanitized.metadata === 'object') {
    sanitized.metadata = { ...sanitized.metadata };
    delete sanitized.metadata.pin;
    delete sanitized.metadata.pin_hash;
    delete sanitized.metadata.password_hash;
    delete sanitized.metadata.access_password;
    delete sanitized.metadata.access_pin;
    delete sanitized.metadata.password;
    delete sanitized.metadata.secret;
    delete sanitized.metadata.token;
  }

  return sanitized as T;
}

/**
 * Helper to extract authentication tokens and session cookies from Request / NextRequest.
 */
export function extractAuthTokens(req: Request | NextRequest) {
  let bearerToken = '';
  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  } else if (authHeader) {
    bearerToken = authHeader.trim();
  }

  let cookieSbToken = '';
  let cookieCreatorHandle = '';
  let cookieCreatorSession = '';
  let cookieMerchantStore = '';

  if ('cookies' in req && typeof (req as any).cookies?.get === 'function') {
    const nextReq = req as NextRequest;
    cookieSbToken = nextReq.cookies.get('sb-access-token')?.value || '';
    if (!cookieSbToken) {
      for (const c of nextReq.cookies.getAll()) {
        if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
          try {
            const parsed = JSON.parse(decodeURIComponent(c.value));
            if (Array.isArray(parsed) && parsed[0]) {
              cookieSbToken = parsed[0];
              break;
            } else if (parsed?.access_token) {
              cookieSbToken = parsed.access_token;
              break;
            }
          } catch {}
        }
      }
    }
    cookieCreatorHandle = nextReq.cookies.get('creator_handle')?.value || '';
    cookieCreatorSession = nextReq.cookies.get('creator_session')?.value || '';
    cookieMerchantStore = nextReq.cookies.get('merchant_store')?.value || '';
  } else {
    // Standard Request headers
    const cookieHeader = req.headers.get('cookie') || '';
    const matchSb = cookieHeader.match(/sb-access-token=([^;]+)/i);
    if (matchSb) cookieSbToken = decodeURIComponent(matchSb[1]);

    const matchHandle = cookieHeader.match(/creator_handle=([^;]+)/i);
    if (matchHandle) cookieCreatorHandle = decodeURIComponent(matchHandle[1]);

    const matchSession = cookieHeader.match(/creator_session=([^;]+)/i);
    if (matchSession) cookieCreatorSession = decodeURIComponent(matchSession[1]);

    const matchMerchant = cookieHeader.match(/merchant_store=([^;]+)/i);
    if (matchMerchant) cookieMerchantStore = decodeURIComponent(matchMerchant[1]);
  }

  const customToken =
    req.headers.get('x-creator-token') ||
    req.headers.get('x-manager-token') ||
    '';

  const token = (bearerToken || cookieSbToken || customToken).trim();

  const cleanHandle = (val: string) => {
    if (!val) return '';
    try {
      return decodeURIComponent(val).replace(/^["']|["']$/g, '').replace(/^@+/, '').toLowerCase().trim();
    } catch {
      return val.replace(/^["']|["']$/g, '').replace(/^@+/, '').toLowerCase().trim();
    }
  };

  return {
    token,
    creatorHandleCookie: cleanHandle(cookieCreatorHandle || cookieCreatorSession),
    merchantStoreCookie: cleanHandle(cookieMerchantStore),
  };
}

/**
 * P1: Anti-IDOR & Otorisasi Sesi Server untuk Kreator
 * Memvalidasi apakah requester berhak mengakses/mengubah data milik targetHandle atau targetTenantId.
 */
export async function verifyCreatorSession(
  req: Request | NextRequest,
  targetHandleOrTenantId: string,
  options: { supabaseClient?: any } = {}
): Promise<CreatorAuthResult> {
  const target = (targetHandleOrTenantId || '').replace(/^@+/, '').trim().toLowerCase();
  if (!target) {
    return {
      authorized: false,
      errorStatus: 400 as any,
      errorMessage: 'Bad Request: Target handle atau tenant_id wajib disertakan.',
    };
  }

  const { token, creatorHandleCookie } = extractAuthTokens(req);

  // Security Guard: SUPABASE_SERVICE_ROLE_KEY is strictly rejected as a human bearer token
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (serviceRoleKey && token === serviceRoleKey) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Service role key dilarang digunakan sebagai bearer token pengguna.',
    };
  }

  const supabase = options.supabaseClient || getSupabaseAdmin();
  if (!supabase) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Database engine tidak tersedia.',
    };
  }

  // ── Skenario 1: Verifikasi via Supabase Auth Session Token (auth.uid()) ──
  if (token) {
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
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
    const appRole = String(user.app_metadata?.role || user.user_metadata?.role || '').trim().toUpperCase();

    // 1. Admin Bypass
    if (appRole === 'ADMIN' || appRole === 'SUPERADMIN') {
      return {
        authorized: true,
        role: 'ADMIN',
        userId,
        email: userEmail,
        handle: target,
      };
    }

    // Check affiliates table for ADMIN role
    const { data: affAdmin } = await supabase
      .from('affiliates')
      .select('role')
      .or(`id.eq.${userId},email.eq.${userEmail}`)
      .maybeSingle();

    if (affAdmin && (String(affAdmin.role).toUpperCase() === 'ADMIN' || String(affAdmin.role).toUpperCase() === 'SUPERADMIN')) {
      return {
        authorized: true,
        role: 'ADMIN',
        userId,
        email: userEmail,
        handle: target,
      };
    }

    // 2. Ownership Verification against creator_profiles and tenants (Anti-IDOR)
    const baseTarget = target.replace(/_+$/, '');

    // Check if target is a tenant_id UUID or matching profile
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('id, handle, tenant_id')
      .or(`handle.eq.${target},handle.eq.${baseTarget},tenant_id.eq.${target},id.eq.${target}`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      const isOwner =
        profile.tenant_id === userId ||
        profile.id === userId ||
        (userEmail && profile.handle === userEmail.split('@')[0]);

      if (isOwner) {
        return {
          authorized: true,
          role: 'CREATOR_OWNER',
          userId,
          email: userEmail,
          handle: profile.handle,
          tenantId: profile.tenant_id,
        };
      }
    }

    // Check against tenants table
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, slug, metadata')
      .or(`slug.eq.${target},id.eq.${target}`)
      .maybeSingle();

    if (tenant) {
      const isOwner =
        tenant.id === userId ||
        tenant.metadata?.user_id === userId ||
        tenant.metadata?.owner_id === userId ||
        (userEmail && tenant.metadata?.email === userEmail);

      if (isOwner) {
        return {
          authorized: true,
          role: 'CREATOR_OWNER',
          userId,
          email: userEmail,
          handle: tenant.slug,
          tenantId: tenant.id,
        };
      }
    }

    // Direct match: if target itself is the user's UUID
    if (target === userId.toLowerCase()) {
      return {
        authorized: true,
        role: 'CREATOR_OWNER',
        userId,
        email: userEmail,
        handle: target,
        tenantId: userId,
      };
    }

    // User is authenticated, but trying to access/mutate someone else's resource -> 403 Forbidden!
    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: `Forbidden: Akun Anda (${userEmail || userId}) tidak memiliki izin mengakses atau mengubah data kreator '@${target}' (Anti-IDOR).`,
    };
  }

  // ── Skenario 2: Verifikasi via Creator Session Cookie ──
  if (creatorHandleCookie) {
    const baseTarget = target.replace(/_+$/, '');
    const isMatchingCookie =
      creatorHandleCookie === target ||
      creatorHandleCookie === baseTarget;

    if (!isMatchingCookie) {
      // Cookie belongs to Creator A, but request targets Creator B -> IDOR Blocked!
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Forbidden: Sesi kreator aktif (@${creatorHandleCookie}) tidak memiliki hak akses terhadap target '@${target}' (Anti-IDOR).`,
      };
    }

    // Verify that the cookie corresponds to a real existing profile in the database
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('id, handle, tenant_id')
      .or(`handle.eq.${creatorHandleCookie},handle.eq.${baseTarget}`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      return {
        authorized: true,
        role: 'CREATOR_COOKIE',
        handle: profile.handle,
        tenantId: profile.tenant_id,
      };
    }

    // Check tenants
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('slug', creatorHandleCookie)
      .maybeSingle();

    if (tenant) {
      return {
        authorized: true,
        role: 'CREATOR_COOKIE',
        handle: tenant.slug,
        tenantId: tenant.id,
      };
    }
  }

  // ── Skenario 3: Fail-Closed: Tidak ada token atau sesi valid ──
  return {
    authorized: false,
    errorStatus: 401,
    errorMessage: 'Unauthorized: Sesi atau token autentikasi tidak ditemukan. Silakan login kembali.',
  };
}

/**
 * P1: Anti-IDOR & Otorisasi Pemilik Toko / Tenant
 * Digunakan untuk endpoint merchant (misal: PATCH /api/v1/tenants/[slug]/resellers/[id]).
 */
export async function verifyTenantOwnerOrAdmin(
  req: Request | NextRequest,
  tenantSlugOrId: string,
  options: { supabaseClient?: any } = {}
): Promise<CreatorAuthResult> {
  const target = (tenantSlugOrId || '').trim().toLowerCase();
  if (!target) {
    return {
      authorized: false,
      errorStatus: 400 as any,
      errorMessage: 'Bad Request: Parameter slug atau tenant_id wajib diisi.',
    };
  }

  const { token, merchantStoreCookie, creatorHandleCookie } = extractAuthTokens(req);

  const supabase = options.supabaseClient || getSupabaseAdmin();
  if (!supabase) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Database engine tidak tersedia.',
    };
  }

  // 1. Resolve Target Tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .or(`slug.eq.${target},id.eq.${target}`)
    .maybeSingle();

  if (tErr || !tenant) {
    return {
      authorized: false,
      errorStatus: 404 as any,
      errorMessage: 'Tenant tidak ditemukan.',
    };
  }

  // 2. Validate via Supabase Auth Session Token
  if (token) {
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
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
    const appRole = String(user.app_metadata?.role || user.user_metadata?.role || '').trim().toUpperCase();

    if (appRole === 'ADMIN' || appRole === 'SUPERADMIN') {
      return {
        authorized: true,
        role: 'ADMIN',
        userId,
        email: userEmail,
        tenantId: tenant.id,
      };
    }

    const isOwner =
      tenant.id === userId ||
      tenant.metadata?.user_id === userId ||
      tenant.metadata?.owner_id === userId ||
      (userEmail && tenant.metadata?.email === userEmail);

    if (isOwner) {
      return {
        authorized: true,
        role: 'TENANT_OWNER',
        userId,
        email: userEmail,
        tenantId: tenant.id,
      };
    }

    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: `Forbidden: Akun Anda tidak memiliki izin mengelola tenant '${tenant.slug}' (Anti-IDOR).`,
    };
  }

  // 3. Validate via Merchant Session Cookie
  const activeMerchant = merchantStoreCookie || creatorHandleCookie;
  if (activeMerchant && (activeMerchant === tenant.slug.toLowerCase() || activeMerchant === tenant.id.toLowerCase())) {
    return {
      authorized: true,
      role: 'TENANT_OWNER',
      handle: tenant.slug,
      tenantId: tenant.id,
    };
  }

  // 4. Fail-Closed
  return {
    authorized: false,
    errorStatus: 401,
    errorMessage: 'Unauthorized: Sesi atau token autentikasi toko tidak ditemukan. Silakan login kembali.',
  };
}
