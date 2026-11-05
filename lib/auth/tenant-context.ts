/**
 * @file lib/auth/tenant-context.ts
 * @description Authoritative Server-Side Verified Tenant Context Contract (Team B)
 *
 * Strict Architecture Invariants (CTO Directive P0):
 * 1. Single Authoritative Contract: Provides `VerifiedTenantContext` encompassing authenticated user,
 *    canonical tenant ID, tenant slug, membership, and role.
 * 2. Zero-Trust on Client-Generated Plaintext Cookies: Plain cookies (merchant_store, merchant_session,
 *    bt_tenant, studio_session) are NEVER accepted as cryptographic proof of session or authorization.
 * 3. Zero-Trust on Client-Supplied Headers: Headers (x-tenant-id, x-tenant-slug) sent from the browser/client
 *    are untrusted and never grant tenant authorization.
 * 4. Dual-Identifier Canonical Database Binding: The token's tenantSlug and tenantId must both resolve
 *    and match the authoritative record in the Supabase 'tenants' table.
 * 5. Strict Fail-Closed Policy: Any unauthenticated request returns 401 UNAUTHORIZED. Any cross-tenant
 *    attempt returns 403 FORBIDDEN with zero data/telemetry leakage.
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  extractMerchantSessionToken,
  verifyMerchantSessionToken,
  type MerchantSessionPayload,
} from './merchant-session';

export type UserTenantRole = 'OWNER' | 'MERCHANT' | 'CS' | 'OPERATOR' | 'SUPERADMIN';

export interface VerifiedTenantContext {
  userId: string;
  userEmail?: string;
  tenantId: string;
  tenantSlug: string;
  role: UserTenantRole;
  tier: string;
  membershipValid: boolean;
  authSource: 'MERCHANT_TOKEN' | 'SUPABASE_AUTH';
  metadata?: Record<string, any>;
}

export type ResolveTenantContextResult =
  | { success: true; context: VerifiedTenantContext }
  | { success: false; status: 401 | 403; code: 'UNAUTHORIZED' | 'FORBIDDEN'; error: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extracts a Supabase Bearer Auth token from Request headers or cookies.
 */
export async function extractSupabaseBearerToken(req: Request | NextRequest): Promise<string> {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const candidate = authHeader.slice(7).trim();
    if (candidate) {
      return candidate;
    }
  }

  // Check Supabase session cookies
  const rawCookie = req.headers.get('cookie') || '';
  if (rawCookie) {
    const sbMatch = rawCookie.match(/(?:sb-[a-z0-9_-]+-auth-token|supabase-auth-token)=([^;]+)/i);
    if (sbMatch && sbMatch[1]) {
      try {
        const decoded = decodeURIComponent(sbMatch[1].trim());
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
        if (parsed.access_token) return parsed.access_token;
      } catch {
        return sbMatch[1].trim();
      }
    }
  }

  return '';
}

/**
 * Authoritatively resolves and verifies tenant context server-side.
 * Enforces cryptographic validation, canonical DB matching, and fail-closed authorization.
 *
 * @param req The incoming Request or NextRequest
 * @param expectedTenantSlugOrId Optional target tenant slug or UUID to enforce tenant isolation
 */
export async function resolveVerifiedTenantContext(
  req: Request | NextRequest,
  expectedTenantSlugOrId?: string | null
): Promise<ResolveTenantContextResult> {
  let supabase: any;
  try {
    supabase = getSupabaseAdmin() || getSupabase();
  } catch {
    supabase = getSupabase();
  }

  if (!supabase) {
    return {
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Konfigurasi database tidak tersedia.',
    };
  }

  const cleanExpected = expectedTenantSlugOrId ? expectedTenantSlugOrId.trim().toLowerCase() : '';

  // ──────────────────────────────────────────────────────────────────────────
  // PATH A: Cryptographically Signed Merchant Token (bt_merchant_token)
  // ──────────────────────────────────────────────────────────────────────────
  let candidateMerchantToken = '';
  try {
    candidateMerchantToken = extractMerchantSessionToken(req as any);
  } catch {
    const rawCookie = req.headers.get('cookie') || '';
    const match = rawCookie.match(/(?:^|;\s*)bt_merchant_token=([^;]+)/);
    if (match && match[1]) {
      candidateMerchantToken = decodeURIComponent(match[1].trim());
    }
  }

  if (candidateMerchantToken) {
    const verified = await verifyMerchantSessionToken(candidateMerchantToken);
    if (!verified.valid || !verified.payload) {
      return {
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: verified.error || 'Unauthorized: Token sesi merchant tidak valid atau telah kedaluwarsa.',
      };
    }

    const payload = verified.payload;
    const tokenSlug = (payload.tenantSlug || '').trim().toLowerCase();
    const tokenId = (payload.tenantId || '').trim().toLowerCase();

    // Cross-tenant verification: If an expected tenant was requested, ensure the token belongs to it
    if (cleanExpected && cleanExpected !== 'studio' && cleanExpected !== 'creator') {
      const isExpectedUuid = UUID_REGEX.test(cleanExpected);
      const isMatch = isExpectedUuid
        ? tokenId === cleanExpected
        : tokenSlug === cleanExpected;

      if (!isMatch) {
        return {
          success: false,
          status: 403,
          code: 'FORBIDDEN',
          error: `Forbidden: Token sesi (${tokenSlug || tokenId}) tidak memiliki wewenang untuk tenant '${cleanExpected}'.`,
        };
      }
    }

    // Query canonical tenant from Supabase DB to guarantee consistency
    const queryTarget = cleanExpected && cleanExpected !== 'studio' && cleanExpected !== 'creator'
      ? cleanExpected
      : (tokenSlug || tokenId);

    const isTargetUuid = UUID_REGEX.test(queryTarget);
    let tQuery = supabase.from('tenants').select('id, slug, tier, metadata');
    if (isTargetUuid) {
      tQuery = tQuery.eq('id', queryTarget);
    } else {
      tQuery = tQuery.eq('slug', queryTarget);
    }

    const { data: canonicalTenant, error: tErr } = await tQuery.maybeSingle();
    if (tErr || !canonicalTenant) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: 'Forbidden: Rekor tenant tidak ditemukan pada basis data kanonikal.',
      };
    }

    // Verify token identifiers against canonical database record
    const canonSlug = (canonicalTenant.slug || '').trim().toLowerCase();
    const canonId = (canonicalTenant.id || '').trim().toLowerCase();

    if (tokenSlug && tokenSlug !== canonSlug) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: 'Forbidden: Kontradiksi slug tenant antara token dan database kanonikal.',
      };
    }

    if (tokenId && tokenId !== canonId) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: 'Forbidden: Kontradiksi ID tenant antara token dan database kanonikal.',
      };
    }

    const role: UserTenantRole = (payload.role as UserTenantRole) || 'MERCHANT';

    return {
      success: true,
      context: {
        userId: payload.userId || canonId,
        tenantId: canonicalTenant.id,
        tenantSlug: canonicalTenant.slug,
        role,
        tier: canonicalTenant.tier || 'PRO_SCALE',
        membershipValid: true,
        authSource: 'MERCHANT_TOKEN',
        metadata: canonicalTenant.metadata || {},
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PATH B: Supabase Auth JWT (User Session via Bearer Header or Session Cookie)
  // ──────────────────────────────────────────────────────────────────────────
  const bearerToken = await extractSupabaseBearerToken(req);
  if (bearerToken) {
    const { data: authData, error: authErr } = await supabase.auth.getUser(bearerToken);
    if (authErr || !authData?.user) {
      return {
        success: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized: Sesi pengguna Supabase tidak valid atau kedaluwarsa.',
      };
    }

    const user = authData.user;
    const userRole = String(user.app_metadata?.role || user.app_metadata?.user_role || '').toUpperCase();
    const isSuperAdmin = userRole === 'SUPERADMIN';

    // Resolve target tenant from query or expectation
    if (!cleanExpected || cleanExpected === 'studio' || cleanExpected === 'creator') {
      // Lookup tenant where user is active member
      let tuQuery = supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('is_active', true)
        .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
        .limit(1);

      const { data: memberRow } = await tuQuery.maybeSingle();
      if (!memberRow?.tenant_id) {
        return {
          success: false,
          status: 403,
          code: 'FORBIDDEN',
          error: 'Forbidden: Pengguna tidak terdaftar pada workspace tenant mana pun.',
        };
      }

      const { data: tData } = await supabase
        .from('tenants')
        .select('id, slug, tier, metadata')
        .eq('id', memberRow.tenant_id)
        .maybeSingle();

      if (!tData) {
        return {
          success: false,
          status: 403,
          code: 'FORBIDDEN',
          error: 'Forbidden: Tenant pengguna tidak ditemukan.',
        };
      }

      return {
        success: true,
        context: {
          userId: user.id,
          userEmail: user.email,
          tenantId: tData.id,
          tenantSlug: tData.slug,
          role: (memberRow.role as UserTenantRole) || 'MERCHANT',
          tier: tData.tier || 'PRO_SCALE',
          membershipValid: true,
          authSource: 'SUPABASE_AUTH',
          metadata: tData.metadata || {},
        },
      };
    }

    // Explicit expected tenant requested
    const isExpectedUuid = UUID_REGEX.test(cleanExpected);
    let tQuery = supabase.from('tenants').select('id, slug, tier, user_id, owner_id, metadata');
    if (isExpectedUuid) {
      tQuery = tQuery.eq('id', cleanExpected);
    } else {
      tQuery = tQuery.eq('slug', cleanExpected);
    }

    const { data: targetTenant, error: targetErr } = await tQuery.maybeSingle();
    if (targetErr || !targetTenant) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: `Forbidden: Tenant '${cleanExpected}' tidak ditemukan.`,
      };
    }

    if (isSuperAdmin) {
      return {
        success: true,
        context: {
          userId: user.id,
          userEmail: user.email,
          tenantId: targetTenant.id,
          tenantSlug: targetTenant.slug,
          role: 'SUPERADMIN',
          tier: targetTenant.tier || 'PRO_SCALE',
          membershipValid: true,
          authSource: 'SUPABASE_AUTH',
          metadata: targetTenant.metadata || {},
        },
      };
    }

    const isOwner =
      targetTenant.user_id === user.id ||
      targetTenant.owner_id === user.id ||
      targetTenant.metadata?.user_id === user.id ||
      targetTenant.metadata?.owner_id === user.id;

    if (isOwner) {
      return {
        success: true,
        context: {
          userId: user.id,
          userEmail: user.email,
          tenantId: targetTenant.id,
          tenantSlug: targetTenant.slug,
          role: 'OWNER',
          tier: targetTenant.tier || 'PRO_SCALE',
          membershipValid: true,
          authSource: 'SUPABASE_AUTH',
          metadata: targetTenant.metadata || {},
        },
      };
    }

    // Check membership in tenant_users
    const { data: memberRecord } = await supabase
      .from('tenant_users')
      .select('id, role')
      .eq('tenant_id', targetTenant.id)
      .eq('is_active', true)
      .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
      .limit(1)
      .maybeSingle();

    if (!memberRecord) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        error: `Forbidden: Pengguna tidak memiliki hak akses ke tenant '${targetTenant.slug}'.`,
      };
    }

    return {
      success: true,
      context: {
        userId: user.id,
        userEmail: user.email,
        tenantId: targetTenant.id,
        tenantSlug: targetTenant.slug,
        role: (memberRecord.role as UserTenantRole) || 'MERCHANT',
        tier: targetTenant.tier || 'PRO_SCALE',
        membershipValid: true,
        authSource: 'SUPABASE_AUTH',
        metadata: targetTenant.metadata || {},
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PATH C: Missing Credentials (Zero-Trust Fallback)
  // ──────────────────────────────────────────────────────────────────────────
  return {
    success: false,
    status: 401,
    code: 'UNAUTHORIZED',
    error: 'Unauthorized: Sesi autentikasi diperlukan. Plaintext cookie tidak diakui sebagai bukti.',
  };
}

