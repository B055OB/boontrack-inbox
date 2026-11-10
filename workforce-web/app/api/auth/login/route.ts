import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';
import { signBwmSessionToken, BwmRole } from '@/workforce-web/lib/auth/session';
import {
  enforceLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/workforce-web/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    // 1. CSRF Origin Verification Guard (Proxy & Reverse-Proxy Aware)
    const origin = req.headers.get('origin');
    const forwardedHost = req.headers.get('x-forwarded-host');
    const rawHost = req.headers.get('host');
    const effectiveHost = (forwardedHost || rawHost || '').split(':')[0].toLowerCase();

    if (origin && effectiveHost) {
      const originHost = origin.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      const isAllowed =
        originHost === effectiveHost ||
        originHost.endsWith('.boontrack.com') ||
        effectiveHost.endsWith('.boontrack.com') ||
        originHost === 'localhost' ||
        originHost === '127.0.0.1';

      if (!isAllowed) {
        return NextResponse.json(
          { success: false, error: 'CSRF_ORIGIN_MISMATCH', message: 'Request rejected: Origin mismatch.' },
          { status: 403 }
        );
      }
    }

    // 2. Parse & Validate Payload
    const body = await req.json().catch(() => ({}));
    const { slug, nik, pin } = body;

    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'INVALID_SLUG', message: 'Organization / Agency Slug is required.' },
        { status: 400 }
      );
    }

    const cleanSlug = slug.trim().toLowerCase();
    const VALID_SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_SLUG_REGEX.test(cleanSlug) || cleanSlug.length > 64) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_SLUG',
          message: 'Slug contains invalid characters or exceeds maximum length.',
        },
        { status: 400 }
      );
    }

    if (!nik || typeof nik !== 'string' || nik.trim().length < 3 || nik.trim().length > 128) {
      return NextResponse.json(
        { success: false, error: 'INVALID_NIK', message: 'Officer ID / Email must be between 3 and 128 characters.' },
        { status: 400 }
      );
    }

    if (!pin || typeof pin !== 'string' || pin.trim().length < 4 || pin.trim().length > 64) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PIN', message: 'PIN must be between 4 and 64 characters.' },
        { status: 400 }
      );
    }

    const cleanIdentifier = nik.trim().toLowerCase().normalize('NFKC');
    const cleanPin = pin.trim();

    // 2.5 Rate Limiting Check (Anti-Brute-Force Guard / BLOCKER-CRED-01 Remediation)
    const rateCheck = enforceLoginRateLimit(req, cleanSlug, cleanIdentifier);
    if (rateCheck.isLimited) {
      return NextResponse.json(
        {
          success: false,
          error: rateCheck.code || 'TOO_MANY_REQUESTS',
          message: rateCheck.error || 'Terlalu banyak percobaan login. Silakan tunggu beberapa saat.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds),
          },
        }
      );
    }

    // 3. Dynamic Tenant Verification from Supabase Database (SSOT)
    // UUID regex (8-4-4-4-12 hex) to prevent PostgreSQL 22P02 cast errors on alphanumeric slugs
    const CANONICAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isCanonicalUuid = CANONICAL_UUID_REGEX.test(cleanSlug);

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .schema('workforce_staging')
      .from('tenants')
      .select('id, name, slug, tier, metadata');

    if (isCanonicalUuid) {
      query = query.or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`);
    } else {
      query = query.eq('slug', cleanSlug);
    }

    const { data: tenant, error: tenantErr } = await query.maybeSingle();

    if (tenantErr) {
      console.error('[BWM AUTH] Tenant lookup error:', tenantErr.message);
      return NextResponse.json(
        { success: false, error: 'DATABASE_QUERY_ERROR', message: 'Gagal memverifikasi tenant di database.' },
        { status: 500 }
      );
    }

    if (!tenant) {
      // Fail closed: Unknown tenant must return 404
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: `Organisasi / Agency '${cleanSlug}' tidak terdaftar di sistem.`,
        },
        { status: 404 }
      );
    }

    // 4. Authenticate Credentials (PIN / Password) against DB SSOT
    const tenantMeta = tenant.metadata || {};
    const configuredPin =
      tenantMeta.access_pin ||
      tenantMeta.pin_hash ||
      tenantMeta.pin ||
      (tenant as any).access_password ||
      tenantMeta.access_password ||
      null;

    if (!configuredPin) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'CREDENTIAL_NOT_CONFIGURED',
          message: 'Kredensial akses belum dikonfigurasi untuk organisasi ini. Akses login dinonaktifkan.',
        },
        { status: 403 }
      );
    }

    function safeComparePin(configured?: string | null, provided?: string | null): boolean {
      if (!configured || !provided) return false;
      const bufConfigured = Buffer.from(String(configured).trim());
      const bufProvided = Buffer.from(String(provided).trim());
      if (bufConfigured.length !== bufProvided.length) return false;
      return crypto.timingSafeEqual(bufConfigured, bufProvided);
    }

    if (!safeComparePin(String(configuredPin), cleanPin)) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'PIN / Kredensial akses yang Anda masukkan salah.',
        },
        { status: 401 }
      );
    }

    // 5. Verify Tenant Authority & Non-Suspension
    if (
      tenantMeta.status === 'SUSPENDED' ||
      tenantMeta.is_active === false ||
      tenantMeta.suspended === true
    ) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'TENANT_SUSPENDED',
          message: 'Organisasi / Agency sedang disuspensi atau tidak aktif.',
        },
        { status: 403 }
      );
    }

    // 6. Resolve Membership Authority with Zero-Trust Enforcement
    const isIdentifierUuid = CANONICAL_UUID_REGEX.test(cleanIdentifier);

    // Query count of registered memberships in workforce_staging.tenant_memberships
    const { count: enrolledCount, error: countErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('tenant_memberships')
      .select('*', { count: 'exact', head: true })
      .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`);

    if (countErr) {
      console.error('[BWM AUTH] Membership count query error:', countErr.message);
      return NextResponse.json(
        { success: false, error: 'DATABASE_QUERY_ERROR', message: 'Gagal memverifikasi status keanggotaan di database.' },
        { status: 500 }
      );
    }

    // Zero enrolled membership must fail closed
    if (!enrolledCount || enrolledCount === 0) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'NO_ENROLLED_MEMBERSHIP',
          message: 'Organisasi belum memiliki keanggotaan terdaftar. Akses login dinonaktifkan hingga onboarding anggota selesai.',
        },
        { status: 403 }
      );
    }

    // User identity must be a valid registered membership UUID
    if (!isIdentifierUuid) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'MEMBERSHIP_REQUIRED',
          message: 'Identitas pengguna wajib berupa UUID kanonis yang terdaftar dalam keanggotaan.',
        },
        { status: 403 }
      );
    }

    const { data: memberRows, error: memberErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('tenant_memberships')
      .select('id, user_id, tenant_id, tenant_slug, role, is_active')
      .eq('user_id', cleanIdentifier);

    if (memberErr) {
      console.error('[BWM AUTH] Membership user lookup error:', memberErr.message);
      return NextResponse.json(
        { success: false, error: 'DATABASE_QUERY_ERROR', message: 'Gagal memverifikasi keanggotaan pengguna.' },
        { status: 500 }
      );
    }

    if (!memberRows || memberRows.length === 0) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'MEMBERSHIP_REQUIRED',
          message: 'Pengguna tidak terdaftar dalam keanggotaan organisasi ini.',
        },
        { status: 403 }
      );
    }

    const matchingMembership = memberRows.find(
      (m: any) => m.tenant_id === tenant.id || m.tenant_slug === tenant.slug
    );

    if (!matchingMembership) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'CROSS_TENANT_MEMBERSHIP_FORBIDDEN',
          message: 'Pengguna terdaftar pada organisasi lain dan tidak memiliki izin akses ke organisasi ini.',
        },
        { status: 403 }
      );
    }

    if (matchingMembership.is_active !== true) {
      recordLoginFailure(req, cleanSlug, cleanIdentifier);
      return NextResponse.json(
        {
          success: false,
          error: 'MEMBERSHIP_REVOKED',
          message: 'Keanggotaan organisasi telah dinonaktifkan atau dicabut.',
        },
        { status: 403 }
      );
    }

    const resolvedUserId = matchingMembership.user_id;

    // Authoritative role resolution from database
    let resolvedRole: BwmRole = 'field_personnel';
    const dbRole = (matchingMembership.role || '').toLowerCase();
    if (dbRole.includes('owner') || dbRole.includes('merchant') || dbRole.includes('master')) {
      resolvedRole = 'master_reseller';
    } else if (dbRole.includes('super')) {
      resolvedRole = 'supervisor';
    } else {
      resolvedRole = 'field_personnel';
    }

    // Resolve name and display properties
    const displayName = cleanIdentifier.includes('@')
      ? cleanIdentifier.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : `Officer ${cleanIdentifier}`;

    const maxAgeSeconds = 60 * 60 * 24; // 24 hours

    // Successful authentication: Reset rate-limit attempt counter
    recordLoginSuccess(req, cleanSlug, cleanIdentifier);

    // 5. Sign Cryptographic Session Token
    const sessionToken = signBwmSessionToken(
      {
        userId: resolvedUserId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        role: resolvedRole,
        nik: cleanIdentifier,
        name: displayName,
        site: `${tenant.name} Facility Hub`,
        branch: 'Regional Command',
        agencyName: tenant.name,
        agencySlug: tenant.slug,
      },
      maxAgeSeconds
    );

    const csrfToken = crypto.randomBytes(24).toString('hex');

    const redirectUrl =
      resolvedRole === 'master_reseller'
        ? '/dashboard'
        : resolvedRole === 'supervisor'
        ? '/ops'
        : '/portal';

    const res = NextResponse.json({
      success: true,
      message: 'BWM session authenticated successfully.',
      redirect_url: redirectUrl,
      session: {
        userId: resolvedUserId,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        agency_slug: tenant.slug,
        agency_name: tenant.name,
        nik: cleanIdentifier,
        name: displayName,
        role: resolvedRole,
        site: `${tenant.name} Facility Hub`,
        branch: 'Regional Command',
        redirect_url: redirectUrl,
      },
    });

    const isProduction = process.env.NODE_ENV === 'production';

    // A. HttpOnly Session Cookie (Inaccessible by document.cookie)
    res.cookies.set('bwm_session_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    // B. CSRF Protection Token
    res.cookies.set('bwm_csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return res;
  } catch (error) {
    console.error('[BWM AUTH ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_AUTH_ERROR',
        message: 'Internal failure while processing session authentication.',
      },
      { status: 500 }
    );
  }
}
