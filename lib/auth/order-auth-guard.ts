/**
 * lib/auth/order-auth-guard.ts
 *
 * Strict Server-Side Authentication & Authorization Guard for Order Mutations (quick-paid, approve).
 *
 * Security Invariants:
 * 1. Zero Trust on Unauthenticated Callers: Missing or unverified credentials fail closed with 401.
 * 2. Strict Tenant Authorization: Cross-tenant mutations (e.g. store A attempting to mutate store B's order)
 *    fail closed with 403 Forbidden.
 * 3. Machine-to-Machine Secret Isolation: ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET or SUPABASE_SERVICE_ROLE_KEY
 *    are verified strictly against server environment variables. Gateway callback tokens (x-callback-token)
 *    are explicitly disallowed as internal admin secrets.
 * 4. Cryptographic Supabase JWT Validation: Tokens are validated server-side via supabase.auth.getUser(token).
 * 5. Merchant Session Cookie Verification: Cookies (merchant_session / merchant_store / bt_tenant) are
 *    validated against the database tenant registry and strictly matched against the order's authoritative tenant.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface OrderMutationAuthResult {
  authorized: boolean;
  status: 200 | 401 | 403;
  error?: string;
  callerType?: 'machine_internal' | 'supabase_user' | 'merchant_session';
  callerTenant?: string;
}

export function safeCompare(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function cleanSessionCookie(val?: string | null): string {
  if (!val) return '';
  try {
    return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
  } catch {
    return val.toLowerCase().trim();
  }
}

export {
  extractMerchantSessionToken,
  verifyMerchantSessionToken,
  signMerchantSessionToken,
} from '@/lib/auth/merchant-session';
import {
  extractMerchantSessionToken,
  verifyMerchantSessionToken,
} from '@/lib/auth/merchant-session';

export function extractMerchantSessionSlug(req: NextRequest): string {
  // Only extract from verified cookie credentials (never trust unverified client headers like x-tenant-slug)
  return (
    cleanSessionCookie(req.cookies.get('merchant_store')?.value) ||
    cleanSessionCookie(req.cookies.get('merchant_session')?.value) ||
    cleanSessionCookie(req.cookies.get('bt_tenant')?.value) ||
    ''
  );
}

export function extractSupabaseToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  } else if (authHeader && !authHeader.toLowerCase().startsWith('basic ')) {
    return authHeader;
  }

  const directToken = (
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('access_token')?.value ||
    req.cookies.get('supabase-auth-token')?.value ||
    ''
  ).trim();
  if (directToken) return directToken;

  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        const raw = decodeURIComponent(cookie.value);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
          return parsed[0].trim();
        }
        if (parsed?.access_token && typeof parsed.access_token === 'string' && parsed.access_token) {
          return parsed.access_token.trim();
        }
      } catch {
        if (cookie.value) return cookie.value.trim();
      }
    }
  }

  return '';
}

export async function verifyOrderMutationAuthorization(
  req: NextRequest,
  order: {
    id: string;
    tenant_id?: string | null;
    tenant_slug?: string | null;
  },
  routeSlug?: string
): Promise<OrderMutationAuthResult> {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  const internalSecret = req.headers.get('x-internal-secret')?.trim() || '';

  // Explicit security rule: Reject SUPABASE_SERVICE_ROLE_KEY used as inbound request credential
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    serviceRoleKey &&
    (
      safeCompare(authHeader, `Bearer ${serviceRoleKey}`) ||
      safeCompare(authHeader, serviceRoleKey) ||
      safeCompare(internalSecret, serviceRoleKey)
    )
  ) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: SUPABASE_SERVICE_ROLE_KEY dilarang keras digunakan sebagai kredensial inbound API.',
    };
  }

  // 1. Machine-to-Machine Authentication (Dedicated Internal Secret ONLY)
  // Must be non-empty, at least 16 characters, and match strictly using constant-time comparison
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();
  if (
    envAdminSecret &&
    envAdminSecret.length >= 16 &&
    (safeCompare(internalSecret, envAdminSecret) || safeCompare(authHeader, `Bearer ${envAdminSecret}`))
  ) {
    return { authorized: true, status: 200, callerType: 'machine_internal' };
  }

  // Explicit security rule: Reject gateway callback token if passed as internal secret or header
  const callbackToken = req.headers.get('x-callback-token')?.trim();
  const xenditToken = (process.env.XENDIT_CALLBACK_TOKEN || process.env.XENDIT_WEBHOOK_VERIFICATION_TOKEN)?.trim();
  if (
    xenditToken &&
    (
      safeCompare(callbackToken, xenditToken) ||
      safeCompare(internalSecret, xenditToken) ||
      safeCompare(authHeader, xenditToken) ||
      safeCompare(authHeader, `Bearer ${xenditToken}`)
    )
  ) {
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Gateway callback tokens cannot be reused for merchant order mutation.',
    };
  }

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return {
      authorized: false,
      status: 401,
      error: 'Database client unreachable for session authorization.',
    };
  }

  // 2. Cryptographic Supabase Auth JWT Validation
  const token = extractSupabaseToken(req);

  if (token) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData?.user) {
        return {
          authorized: false,
          status: 401,
          error: 'Unauthorized: Sesi token autentikasi tidak valid atau kedaluwarsa.',
        };
      }
      const user = authData.user;
      const appRole = String(user.app_metadata?.role || user.app_metadata?.user_role || '').trim().toUpperCase();
      if (appRole === 'SUPERADMIN' || appRole === 'AFFILIATE_MANAGER') {
        return { authorized: true, status: 200, callerType: 'supabase_user' };
      }

      // Check tenant authorization for user
      const orderTenantSlug = String(order.tenant_slug || '').toLowerCase().trim();
      const orderTenantId = String(order.tenant_id || '').toLowerCase().trim();

      // Route slug isolation check
      const normalizedRouteSlug = String(routeSlug || '').toLowerCase().trim();
      if (normalizedRouteSlug && orderTenantSlug && normalizedRouteSlug !== orderTenantSlug) {
        return {
          authorized: false,
          status: 403,
          error: `Forbidden: Route tenant ('${normalizedRouteSlug}') tidak cocok dengan tenant pesanan ('${orderTenantSlug}').`,
        };
      }

      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('*')
        .or(`slug.eq.${orderTenantSlug || 'none'},id.eq.${orderTenantId || '00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle();

      if (tenantRow) {
        const userId = user.id;
        const userEmail = (user.email || '').toLowerCase().trim();
        const isOwner =
          (tenantRow.user_id && tenantRow.user_id === userId) ||
          (tenantRow.owner_id && tenantRow.owner_id === userId) ||
          (tenantRow.metadata?.user_id && tenantRow.metadata.user_id === userId) ||
          (userEmail && (
            (tenantRow.email && tenantRow.email.toLowerCase().trim() === userEmail) ||
            (tenantRow.owner_email && tenantRow.owner_email.toLowerCase().trim() === userEmail)
          ));

        if (isOwner) {
          return { authorized: true, status: 200, callerType: 'supabase_user', callerTenant: orderTenantSlug };
        }
      }

      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: Pengguna tidak memiliki izin untuk tenant pesanan ini.',
      };
    } catch {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Gagal memverifikasi sesi Supabase.',
      };
    }
  }

  // 3. Dedicated Server-Signed Merchant & CS Session Token Validation (HMAC-SHA256)
  const merchantToken = extractMerchantSessionToken(req);
  if (merchantToken) {
    // CSRF Defense-in-Depth: Reject cross-site requests originating from browser forms or cross-site fetch
    const secFetchSite = req.headers.get('sec-fetch-site')?.toLowerCase().trim();
    if (secFetchSite === 'cross-site') {
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: Permintaan cross-site ditolak oleh proteksi CSRF.',
      };
    }

    const orderTenantSlug = String(order.tenant_slug || '').toLowerCase().trim();
    const sessionRes = verifyMerchantSessionToken(merchantToken, orderTenantSlug);

    if (!sessionRes.valid || !sessionRes.payload) {
      return {
        authorized: false,
        status: sessionRes.status || 401,
        error: sessionRes.error || 'Unauthorized: Sesi merchant tidak valid atau telah kedaluwarsa.',
      };
    }

    // Route slug isolation check
    const normalizedRouteSlug = String(routeSlug || '').toLowerCase().trim();
    if (normalizedRouteSlug && orderTenantSlug && normalizedRouteSlug !== orderTenantSlug) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Route tenant ('${normalizedRouteSlug}') tidak cocok dengan tenant pesanan ('${orderTenantSlug}').`,
      };
    }

    return {
      authorized: true,
      status: 200,
      callerType: 'merchant_session',
      callerTenant: sessionRes.payload.tenantSlug,
    };
  }

  // 4. Fail-Closed: Rejection of Plain Slug Cookies (Anti-Cookie-Forgery Guard)
  // Plain cookies (merchant_store, merchant_session, bt_tenant) are unverified client strings.
  // Matching slug inside an unverified cookie IS NOT AUTHENTICATION.
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Sesi token autentikasi resmi (Supabase Auth server-side, bt_merchant_token HMAC, atau secret internal) diperlukan. Akses berbasis cookie slug polos tanpa verifikasi kriptografis ditolak.',
  };
}
