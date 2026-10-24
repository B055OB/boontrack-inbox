import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import {
  enforceLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/auth/rate-limiter';

export const dynamic = 'force-dynamic';

function safeComparePin(configured?: string | null, provided?: string | null): boolean {
  if (!configured || !provided) return false;
  const bufConfigured = Buffer.from(String(configured).trim());
  const bufProvided = Buffer.from(String(provided).trim());
  if (bufConfigured.length !== bufProvided.length) return false;
  return crypto.timingSafeEqual(bufConfigured, bufProvided);
}

/**
 * POST /api/v1/auth/owner-login
 * Server-authoritative Owner / Merchant Authentication
 *
 * Invariants:
 * 1. Single source of truth lookup from Supabase `tenants` table.
 * 2. Server-side PIN / Password validation (never trusts client assertions).
 * 3. Rate-limited against brute-force attacks (scoped by tenant and source IP).
 * 4. Mints cryptographically signed HMAC-SHA256 `bt_merchant_token`.
 * 5. Sets Host-Only cookies on dashboard origin (ZERO wildcard domain).
 * 6. Validates redirectTo with strict tenant binding against open/cross-tenant redirect.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantSlug, pin, accessKey, redirectTo } = body;

    const cleanSlug = String(tenantSlug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const rawPin = String(pin || accessKey || '').trim();

    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'Slug / nama domain toko wajib diisi.' },
        { status: 400 }
      );
    }

    // Fail-Closed Guard 1: Kredensial rahasia (PIN/Password) wajib disertakan
    if (!rawPin) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: 'PIN / Password akses toko wajib diisi.' },
        { status: 401 }
      );
    }

    // 0. Rate Limiting Check (Anti-Brute-Force Guard)
    const rateCheck = enforceLoginRateLimit(req, cleanSlug);
    if (rateCheck.isLimited) {
      return NextResponse.json(
        { success: false, error: rateCheck.error || 'Terlalu banyak percobaan login. Silakan tunggu sebentar.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds),
          },
        }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Koneksi database tidak tersedia.' },
        { status: 500 }
      );
    }

    // 1. Single Source of Truth: Lookup tenant dynamically from Supabase
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, metadata, access_password, template_code, business_type')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: `Toko "${cleanSlug}" belum terdaftar. Silakan periksa kembali nama toko Anda.` },
        { status: 404 }
      );
    }

    // 2. Validate Tenant PIN / Access Password on server with constant-time comparison
    const meta = tenant.metadata || {};
    const configuredPin =
      meta.access_pin ||
      meta.pin_hash ||
      meta.pin ||
      tenant.access_password ||
      null;

    // Fail-Closed Guard 2: Jika tenant belum mengonfigurasi PIN / Password, tolak dengan 403 Forbidden
    if (!configuredPin) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        {
          success: false,
          error: 'Toko ini belum mengonfigurasi PIN akses atau akun belum diaktifkan. Silakan hubungi tim dukungan BoonTrack untuk inisialisasi kredensial toko Anda.',
        },
        { status: 403 }
      );
    }

    // Fail-Closed Guard 3: Kredensial wajib cocok dengan perbandingan constant-time
    if (!safeComparePin(String(configuredPin), rawPin)) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: 'PIN / Password akses yang Anda masukkan salah.' },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful authentication
    recordLoginSuccess(req, cleanSlug);

    const isPublicService =
      tenant.template_code === 'PUBLIC_SERVICE_V1' ||
      tenant.business_type === 'PUBLIC_SERVICE' ||
      meta.category === 'public_service';

    // 3. Resolve Safe Destination (Open Redirect & Cross-Tenant Redirect Defense)
    let dest = isPublicService ? `/${cleanSlug}/desk` : `/${cleanSlug}/dashboard`;
    if (redirectTo && typeof redirectTo === 'string') {
      const cleanRedirect = redirectTo.trim();
      if (
        cleanRedirect.startsWith('/') &&
        !cleanRedirect.startsWith('//') &&
        !cleanRedirect.includes('://') &&
        !cleanRedirect.includes('\\')
      ) {
        // Enforce strict destination binding to target tenant to prevent cross-tenant redirect or auth loops
        if (cleanRedirect === `/${cleanSlug}` || cleanRedirect.startsWith(`/${cleanSlug}/`)) {
          dest = cleanRedirect;
        } else if (cleanRedirect === '/desk' || cleanRedirect.startsWith('/desk/')) {
          dest = `/${cleanSlug}/desk`;
        }
      }
    }

    // 4. Mint Cryptographically Signed Host-Only Merchant Token
    const ownerToken = signMerchantSessionToken({
      tenantSlug: cleanSlug,
      tenantId: tenant.id,
      role: 'OWNER',
      name: tenant.metadata?.title || tenant.name,
      ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    const response = NextResponse.json({
      success: true,
      message: `Toko terverifikasi! Mengalihkan ke ${isPublicService ? 'Desk' : 'Dashboard'}...`,
      redirectUrl: dest,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
    });

    // 5. Set Host-Only Secure Cookies (ZERO wildcard domain)
    const isProd = process.env.NODE_ENV === 'production';
    const cookieBaseOptions = {
      path: '/',
      maxAge: 2592000, // 30 days
      sameSite: 'lax' as const,
      secure: isProd,
    };

    response.cookies.set('bt_merchant_token', ownerToken, {
      ...cookieBaseOptions,
      httpOnly: true,
    });
    response.cookies.set('merchant_store', cleanSlug, cookieBaseOptions);
    response.cookies.set('merchant_session', cleanSlug, cookieBaseOptions);
    response.cookies.set('bt_tenant', cleanSlug, cookieBaseOptions);

    return response;
  } catch (err: any) {
    console.error('[Owner Login Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Terjadi kesalahan sistem saat memproses login merchant.' },
      { status: 500 }
    );
  }
}
