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
import { verifyHostSessionToken } from '@/lib/auth/host-session';

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

  let signedCreatorToken = '';
  let cookieSbToken = '';
  let cookieCreatorHandle = '';
  let cookieCreatorSession = '';
  let cookieMerchantStore = '';

  if ('cookies' in req && typeof (req as any).cookies?.get === 'function') {
    const nextReq = req as NextRequest;
    signedCreatorToken =
      nextReq.cookies.get('__Host-bt_creator_session')?.value ||
      nextReq.cookies.get('bt_creator_session')?.value ||
      '';
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
    const matchSigned = cookieHeader.match(/(?:__Host-)?bt_creator_session=([^;]+)/i);
    if (matchSigned) signedCreatorToken = decodeURIComponent(matchSigned[1]);

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
    signedCreatorToken,
    creatorHandleCookie: cleanHandle(cookieCreatorHandle || cookieCreatorSession),
    merchantStoreCookie: cleanHandle(cookieMerchantStore),
  };
}

/**
 * P1: Anti-IDOR & Otorisasi Sesi Server untuk Kreator
 * Memvalidasi apakah requester memiliki token sesi kreator yang sah dan berhak mengakses/mengubah target.
 *
 * MANDAT CTO FINAL (PR #95):
 * 1. Wajib memiliki cryptographic signed Creator host-session token (__Host-bt_creator_session / bt_creator_session atau Bearer signed token).
 * 2. Generic Supabase bearer token dan sb-* cookie DILARANG KERAS mengotorisasi API Creator (Fail-closed 401).
 * 3. User-editable user_metadata DILARANG KERAS memberikan hak akses (Fail-closed 401).
 * 4. DILARANG fallback ke affiliate ADMIN atau generic Supabase ownership check.
 * 5. Anti-IDOR validasi ketat: target harus sesuai tsl (handle), tid (tenantId), atau sub (userId) dari signed token (atau ADMIN/SUPERADMIN).
 * 6. Wrong-product (Studio / Shop merchant session), expired, atau revoked token -> Fail-closed 401.
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

  const { token, signedCreatorToken, creatorHandleCookie } = extractAuthTokens(req);

  // Security Guard: SUPABASE_SERVICE_ROLE_KEY is strictly rejected as a human bearer token
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (serviceRoleKey && token === serviceRoleKey) {
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Service role key dilarang digunakan sebagai bearer token pengguna.',
    };
  }

  // ── 1. Ekstrak Candidate Signed Creator Token ──
  // Signed Creator Token dapat berasal dari cookie (__Host-bt_creator_session / bt_creator_session)
  // atau dari header Authorization: Bearer <signed_token> / x-creator-token: <signed_token>.
  const candidateToken = signedCreatorToken || (token && !token.startsWith('sb-') ? token : '');

  if (candidateToken) {
    const verification = await verifyHostSessionToken(candidateToken, 'creator');
    if (!verification.valid || !verification.payload) {
      return {
        authorized: false,
        errorStatus: 401,
        errorMessage: `Unauthorized: Token sesi kreator tidak valid (${verification.error || 'INVALID_SESSION'}). Silakan login kembali.`,
      };
    }

    const payload = verification.payload;
    const baseTarget = target.replace(/_+$/, '');
    const tokenSlug = (payload.tsl || '').toLowerCase().replace(/^@+/, '');
    const baseTokenSlug = tokenSlug.replace(/_+$/, '');
    const tokenTid = (payload.tid || '').toLowerCase();
    const tokenSub = (payload.sub || '').toLowerCase();

    // Verifikasi Anti-IDOR: apakah requester adalah pemilik target atau platform admin
    const isOwner =
      tokenSlug === target ||
      baseTokenSlug === baseTarget ||
      tokenTid === target ||
      tokenSub === target ||
      payload.role === 'ADMIN' ||
      payload.role === 'SUPERADMIN';

    if (isOwner) {
      return {
        authorized: true,
        role: payload.role as any,
        userId: payload.sub,
        handle: payload.tsl,
        tenantId: payload.tid,
      };
    }

    // Token sah, namun mencoba mengakses target milik kreator/tenant lain -> HTTP 403 Forbidden Anti-IDOR
    return {
      authorized: false,
      errorStatus: 403,
      errorMessage: `Forbidden: Sesi kreator aktif (@${payload.tsl}) tidak memiliki hak akses terhadap target '@${target}' (Anti-IDOR).`,
    };
  }

  // ── 2. Plaintext Creator Cookie Guard (Zero Trust / Fail-Closed) ──
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

    // Plaintext cookie cannot authorize server endpoints -> Reject with 401
    return {
      authorized: false,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Plaintext cookie dilarang untuk otorisasi server. Diperlukan signed token.',
    };
  }

  // ── 3. Fail-Closed: Tolak generic Supabase Auth atau request tanpa token sah ──
  return {
    authorized: false,
    errorStatus: 401,
    errorMessage: 'Unauthorized: Sesi atau token autentikasi kreator tidak ditemukan. Diperlukan signed token.',
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
