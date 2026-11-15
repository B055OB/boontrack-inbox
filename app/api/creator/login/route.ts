import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { verifyPassword } from '@/lib/auth/password-hasher';
import {
  signHostSessionToken,
  getProductAuthConfig,
  getHostSessionCookieOptions,
} from '@/lib/auth/host-session';

export const runtime = 'nodejs';

export const ALLOWED_CREATOR_ROLES = ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN'] as const;
export type CreatorSessionRole = (typeof ALLOWED_CREATOR_ROLES)[number];

/**
 * Issues signed Creator host-session cookie adhering to RFC 6265bis host-only semantics.
 * Eliminates plaintext authentication cookies and prevents merchant privilege leakage.
 *
 * MANDAT CTO:
 * 1. params.role wajib mandatory string.
 * 2. Tidak ada implicit fallback ke 'CREATOR_OWNER'.
 * 3. Wajib divalidasi terhadap ALLOWED_CREATOR_ROLES sebelum signing token.
 * 4. Invalid atau missing role menghasilkan zero signed token dan zero authenticated cookie.
 */
export function applyCreatorSessionCookie(
  res: NextResponse,
  params: {
    userId: string;
    tenantId: string;
    tenantSlug: string;
    role: string;
  },
  isSecure?: boolean
): boolean {
  const normalizedRole = String(params.role || '').trim().toUpperCase();

  // Validate the role against the explicit Creator role allowlist before token signing
  if (!normalizedRole || !ALLOWED_CREATOR_ROLES.includes(normalizedRole as any)) {
    // Missing or unsupported role: strictly refuse to sign token or set session cookies
    return false;
  }

  const signedToken = signHostSessionToken({
    product: 'creator',
    userId: params.userId,
    tenantId: params.tenantId,
    tenantSlug: params.tenantSlug,
    role: normalizedRole,
  });

  const config = getProductAuthConfig('creator');
  const cookieOptions = getHostSessionCookieOptions('creator', isSecure);

  // Set authoritative signed cookie (__Host-bt_creator_session in prod, bt_creator_session in dev)
  res.cookies.set(config.cookieName, signedToken, cookieOptions);

  // Fallback for local non-https testing if production host prefix is configured
  if (config.cookieName !== 'bt_creator_session' && !isSecure) {
    res.cookies.set('bt_creator_session', signedToken, {
      ...cookieOptions,
      secure: false,
    });
  }

  // Non-authoritative display cookie only (for client-side UI greeting / handle display)
  res.cookies.set('creator_handle', params.tenantSlug, {
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    sameSite: 'lax',
  });

  return true;
}

/**
 * POST /api/creator/login
 * Dedicated authentication route handler for Creator Workspace.
 * Supports:
 * 1. Handle + PIN / Password (creator_profiles & tenants)
 * 2. Email + Password (Supabase Auth & Admin verification)
 */
export async function POST(req: Request) {
  try {
    const isSecure = req.headers.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production';
    const body = await req.json().catch(() => ({}));
    const { identifier, pin, password, email } = body;

    const rawId = (identifier || email || '').toString().trim();
    const rawSecret = (pin || password || '').toString().trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle bio link atau email wajib diisi.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // ── 1. Cek apakah identifier adalah Email -> Login via Supabase Auth ──
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawId);

    if (isEmail) {
      if (!rawSecret) {
        return NextResponse.json(
          { success: false, error: 'SECRET_REQUIRED', message: 'Password wajib diisi untuk login email.' },
          { status: 400 }
        );
      }

      // Login via Supabase Auth Client
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: rawId.toLowerCase(),
        password: rawSecret,
      });

      if (authError || !authData?.user) {
        return NextResponse.json(
          { success: false, error: 'AUTH_FAILED', message: authError?.message || 'Email atau password tidak sesuai.' },
          { status: 401 }
        );
      }

      const user = authData.user;

      // Authoritative role validation: ONLY trust server-controlled app_metadata, NEVER user_metadata
      const serverAppRole = String(user.app_metadata?.role || '').trim().toUpperCase();
      const isPlatformAdmin = serverAppRole === 'ADMIN' || serverAppRole === 'SUPERADMIN';

      // Cek apakah ada creator_profile yang terhubung secara sah
      const { data: creatorProf } = await supabaseAdmin
        .from('creator_profiles')
        .select('id, handle, display_name, tenant_id, role, status, is_active')
        .or(`tenant_id.eq.${user.id},handle.eq.${user.email},id.eq.${user.id}`)
        .maybeSingle();

      // Mandat CTO: Generic Supabase user tanpa relasi Creator TIDAK BOLEH diberi token Creator
      if (!creatorProf) {
        return NextResponse.json(
          {
            success: false,
            error: 'CREATOR_MEMBERSHIP_REQUIRED',
            message: 'Akun Anda tidak terhubung dengan profil atau membership Creator yang sah.',
          },
          { status: 403 }
        );
      }

      // Tolak jika profil kreator inactive atau suspended
      const profStatus = String(creatorProf.status || '').toLowerCase().trim();
      if (profStatus === 'inactive' || profStatus === 'suspended' || creatorProf.is_active === false) {
        return NextResponse.json(
          {
            success: false,
            error: 'CREATOR_SUSPENDED',
            message: 'Profil kreator sedang berstatus nonaktif atau ditangguhkan.',
          },
          { status: 403 }
        );
      }

      // Wajib explicit, non-empty tenant_id (DILARANG KERAS substitusi user.id atau profile.id)
      const explicitTenantId = (creatorProf.tenant_id || '').toString().trim();
      if (!explicitTenantId) {
        return NextResponse.json(
          {
            success: false,
            error: 'CREATOR_TENANT_MISSING',
            message: 'Profil kreator tidak memiliki relasi tenant yang sah.',
          },
          { status: 403 }
        );
      }

      // Wajib linked tenant row exist
      const { data: linkedTenant } = await supabaseAdmin
        .from('tenants')
        .select('id, slug, status, is_active')
        .eq('id', explicitTenantId)
        .maybeSingle();

      if (!linkedTenant) {
        return NextResponse.json(
          {
            success: false,
            error: 'CREATOR_TENANT_MISSING',
            message: 'Tenant terkait tidak ditemukan.',
          },
          { status: 403 }
        );
      }

      // Tolak tenant inactive, suspended, atau tidak memenuhi syarat
      const tenantStatus = String(linkedTenant.status || '').toLowerCase().trim();
      const isTenantEligible = linkedTenant.is_active !== false && tenantStatus !== 'inactive' && tenantStatus !== 'suspended' && tenantStatus !== 'expired';
      if (!isTenantEligible) {
        return NextResponse.json(
          {
            success: false,
            error: 'TENANT_INELIGIBLE',
            message: 'Tenant kreator tidak aktif atau tidak memenuhi syarat.',
          },
          { status: 403 }
        );
      }

      // Validasi Role: DILARANG default ke CREATOR_OWNER jika role missing atau unsupported
      let assignedRole: string;
      if (isPlatformAdmin) {
        assignedRole = serverAppRole;
      } else {
        const rawRole = String(creatorProf.role || '').trim().toUpperCase();
        const supportedRoles = ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN'];
        if (!rawRole || !supportedRoles.includes(rawRole)) {
          return NextResponse.json(
            {
              success: false,
              error: 'CREATOR_ROLE_UNAUTHORIZED',
              message: 'Role akun kreator tidak valid atau tidak memiliki hak akses.',
            },
            { status: 403 }
          );
        }
        assignedRole = rawRole;
      }

      const res = NextResponse.json({
        success: true,
        message: 'Login berhasil.',
        data: {
          user_id: user.id,
          email: user.email,
          role: assignedRole,
          handle: creatorProf.handle,
          redirect: `/admin?handle=${encodeURIComponent(creatorProf.handle)}`,
        },
      });

      const sessionApplied = applyCreatorSessionCookie(
        res,
        {
          userId: user.id,
          tenantId: explicitTenantId,
          tenantSlug: creatorProf.handle,
          role: assignedRole,
        },
        isSecure
      );

      if (!sessionApplied) {
        return NextResponse.json(
          {
            success: false,
            error: 'CREATOR_ROLE_UNAUTHORIZED',
            message: 'Penerbitan sesi Creator tidak diizinkan untuk role ini.',
          },
          { status: 403 }
        );
      }

      return res;
    }

    // ── 2. Handle Bio Link + PIN / Password ──
    const cleanHandle = rawId.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase();
    const baseHandle = cleanHandle.replace(/_+$/, '');

    // Cari di creator_profiles (Hanya entitas sah creator_profiles yang berhak mengakses)
    const { data: profile } = await supabaseAdmin
      .from('creator_profiles')
      .select('*')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: `Handle @${cleanHandle} belum terdaftar sebagai kreator. Silakan daftar terlebih dahulu.`,
        },
        { status: 404 }
      );
    }

    // Mandat CTO A2: Wajib verifikasi PIN/password secara ketat — TIDAK ADA passwordless path
    if (!rawSecret) {
      return NextResponse.json(
        { success: false, error: 'SECRET_REQUIRED', message: 'PIN atau password akses wajib diisi.' },
        { status: 400 }
      );
    }

    const storedPin = String(profile.pin || profile.theme_config?.pin || '').trim();
    const storedHash = String(profile.pin_hash || profile.theme_config?.pin_hash || '').trim();

    if (!storedPin && !storedHash) {
      return NextResponse.json(
        {
          success: false,
          error: 'CREDENTIAL_UNCONFIGURED',
          message: 'Kredensial akun kreator belum dikonfigurasi. Hubungi admin untuk mengeset PIN/password.',
        },
        { status: 401 }
      );
    }

    let pinValid = false;
    if (storedHash) {
      pinValid = await verifyPassword(rawSecret, storedHash);
    } else if (storedPin) {
      pinValid = storedPin === rawSecret;
    }

    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PIN', message: 'PIN atau password akses salah.' },
        { status: 401 }
      );
    }

    // Tolak profil kreator inactive atau suspended
    const profStatus = String(profile.status || '').toLowerCase().trim();
    if (profStatus === 'inactive' || profStatus === 'suspended' || profile.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_SUSPENDED', message: 'Profil kreator sedang berstatus nonaktif atau ditangguhkan.' },
        { status: 403 }
      );
    }

    // Wajib explicit, non-empty tenant_id (DILARANG KERAS substitusi profile.id)
    const explicitTenantId = (profile.tenant_id || '').toString().trim();
    if (!explicitTenantId) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_TENANT_MISSING', message: 'Relasi tenant kreator tidak ditemukan.' },
        { status: 403 }
      );
    }

    // Wajib linked tenant row exist
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, status, is_active')
      .eq('id', explicitTenantId)
      .maybeSingle();

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_TENANT_MISSING', message: 'Tenant terkait tidak ditemukan.' },
        { status: 403 }
      );
    }

    // Tolak tenant inactive, suspended, atau tidak memenuhi syarat
    const tenantStatus = String(tenantRow.status || '').toLowerCase().trim();
    const isTenantEligible = tenantRow.is_active !== false && tenantStatus !== 'inactive' && tenantStatus !== 'suspended' && tenantStatus !== 'expired';
    if (!isTenantEligible) {
      return NextResponse.json(
        { success: false, error: 'TENANT_INELIGIBLE', message: 'Tenant kreator sedang nonaktif atau tidak memenuhi syarat.' },
        { status: 403 }
      );
    }

    // Validasi Role: DILARANG default ke CREATOR_OWNER jika role missing atau unsupported
    const rawRole = String(profile.role || '').trim().toUpperCase();
    const supportedRoles = ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN'];
    if (!rawRole || !supportedRoles.includes(rawRole)) {
      return NextResponse.json(
        {
          success: false,
          error: 'CREATOR_ROLE_UNAUTHORIZED',
          message: 'Role akun kreator tidak valid atau tidak memiliki hak akses.',
        },
        { status: 403 }
      );
    }
    const resolvedRole = rawRole;

    const res = NextResponse.json({
      success: true,
      message: `Selamat datang kembali, ${profile.display_name || profile.handle}!`,
      data: {
        handle: profile.handle,
        display_name: profile.display_name,
        role: resolvedRole,
        redirect: `/admin?handle=${encodeURIComponent(profile.handle)}`,
      },
    });

    const sessionApplied = applyCreatorSessionCookie(
      res,
      {
        userId: profile.id,
        tenantId: explicitTenantId,
        tenantSlug: profile.handle,
        role: resolvedRole,
      },
      isSecure
    );

    if (!sessionApplied) {
      return NextResponse.json(
        {
          success: false,
          error: 'CREATOR_ROLE_UNAUTHORIZED',
          message: 'Penerbitan sesi Creator tidak diizinkan untuk role ini.',
        },
        { status: 403 }
      );
    }

    return res;
  } catch (err: any) {
    console.error('[Creator Login API] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Terjadi kesalahan sistem saat proses masuk.' },
      { status: 500 }
    );
  }
}
