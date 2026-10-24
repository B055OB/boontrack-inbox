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

function normalizePhone(rawPhone: string): { international: string; local: string } {
  const digits = rawPhone.replace(/\D/g, '');
  let intl = digits;
  let loc = digits;

  if (digits.startsWith('0')) {
    intl = '62' + digits.slice(1);
    loc = digits;
  } else if (digits.startsWith('62')) {
    intl = digits;
    loc = '0' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    intl = '62' + digits;
    loc = '0' + digits;
  }

  return { international: intl, local: loc };
}

/**
 * POST /api/v1/auth/cs-login
 * Direct CS Access Authentication (Bypasses email magic link delays)
 * Rate-limited against brute-force attacks.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantSlug, phone, pin } = body;

    const cleanSlug = String(tenantSlug || '').trim().toLowerCase();
    const rawPhone = String(phone || '').trim();
    const rawPin = String(pin || '').trim();

    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'Slug toko wajib diisi.' },
        { status: 400 }
      );
    }

    if (!rawPhone) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp CS wajib diisi.' },
        { status: 400 }
      );
    }

    // Fail-Closed Guard 1: PIN Tenant wajib diisi
    if (!rawPin) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: 'PIN Tenant wajib diisi.' },
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
      .select('id, slug, name, tier, metadata, access_password')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: `Toko "${cleanSlug}" tidak ditemukan. Periksa kembali nama toko Anda.` },
        { status: 404 }
      );
    }

    // 2. Validate Tenant PIN with Fail-Closed Invariant
    const meta = tenant.metadata || {};
    const configuredPin =
      meta.access_pin ||
      meta.pin_hash ||
      meta.pin ||
      tenant.access_password ||
      null;

    // Fail-Closed Guard 2: Jika tenant belum mengonfigurasi PIN / Password, tolak 403 Forbidden
    if (!configuredPin) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        {
          success: false,
          error: 'Toko ini belum mengonfigurasi PIN akses atau akun belum diaktifkan. Silakan hubungi pemilik toko untuk inisialisasi PIN toko.',
        },
        { status: 403 }
      );
    }

    // Fail-Closed Guard 3: Kredensial wajib cocok dengan perbandingan constant-time
    if (!safeComparePin(String(configuredPin), rawPin)) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        { success: false, error: 'PIN Tenant salah. Silakan tanyakan PIN akses yang benar kepada pemilik toko.' },
        { status: 401 }
      );
    }

    // 3. Normalize CS Phone Number
    const { international: intlPhone, local: localPhone } = normalizePhone(rawPhone);

    // 4. Lookup registered CS Member from tenant_users
    const { data: csMembers } = await supabase
      .from('tenant_users')
      .select('*')
      .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
      .eq('is_active', true);

    let matchedMember = (csMembers || []).find((m: any) => {
      const mPhone = String(m.phone || '').replace(/\D/g, '');
      return mPhone === intlPhone || mPhone === localPhone || (mPhone && (intlPhone.endsWith(mPhone) || mPhone.endsWith(localPhone)));
    });

    // Check if phone matches owner phone in tenant metadata or whatsapp_connections
    if (!matchedMember) {
      const ownerWa = String(meta.whatsapp_number || '').replace(/\D/g, '');
      const isOwner = ownerWa && (ownerWa === intlPhone || ownerWa === localPhone);

      if (isOwner) {
        matchedMember = {
          id: tenant.id,
          name: meta.merchant_name || meta.display_name || tenant.name || 'Owner Lead CS',
          phone: intlPhone,
          role: 'OWNER_LEAD',
          access_level: 'FULL_DASHBOARD',
        };
      }
    }

    // Fallback: If tenant is in trial/solo and has 0 registered CS members, allow self-activation for duty CS
    if (!matchedMember && (!csMembers || csMembers.length === 0)) {
      matchedMember = {
        id: `cs_${Date.now()}`,
        name: 'CS Officer',
        phone: intlPhone,
        role: 'CS',
        access_level: 'LIVE_CHAT_ONLY',
      };
    }

    if (!matchedMember) {
      recordLoginFailure(req, cleanSlug);
      return NextResponse.json(
        {
          success: false,
          error: `Nomor WhatsApp ${rawPhone} belum terdaftar sebagai CS aktif di toko "${tenant.name || cleanSlug}". Hubungi pemilik toko untuk menambahkan nomor Anda ke daftar CS.`,
        },
        { status: 403 }
      );
    }

    // Reset rate limiter on successful login
    recordLoginSuccess(req, cleanSlug);

    // 5. Success - Set Response Cookies & Payload
    const redirectUrl = `/${cleanSlug}/dashboard?tab=inbox`;
    const response = NextResponse.json({
      success: true,
      message: `Login CS berhasil! Selamat datang, ${matchedMember.name}.`,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.tier,
      },
      cs: {
        id: matchedMember.id,
        name: matchedMember.name,
        phone: intlPhone,
        role: matchedMember.role || 'CS',
        access_level: matchedMember.access_level || 'LIVE_CHAT_ONLY',
      },
      redirectUrl,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const cookieBaseOptions = {
      path: '/',
      maxAge: 2592000,
      sameSite: 'lax' as const,
      secure: isProd,
    };

    // Mint server-signed cryptographic token for CS session
    const csToken = signMerchantSessionToken({
      tenantSlug: cleanSlug,
      tenantId: tenant.id,
      role: 'CS',
      userId: matchedMember.id,
      name: matchedMember.name,
      phone: intlPhone,
      ttlMs: 30 * 24 * 60 * 60 * 1000,
    });

    // Set secure authentication cookies (Strictly Host-Only, ZERO wildcard domain)
    response.cookies.set('bt_merchant_token', csToken, {
      ...cookieBaseOptions,
      httpOnly: true,
    });
    response.cookies.set('merchant_store', cleanSlug, cookieBaseOptions);
    response.cookies.set('merchant_session', cleanSlug, cookieBaseOptions);
    response.cookies.set('bt_tenant', cleanSlug, cookieBaseOptions);
    response.cookies.set('cs_session_name', matchedMember.name, cookieBaseOptions);
    response.cookies.set('cs_session_phone', intlPhone, cookieBaseOptions);

    return response;
  } catch (err: any) {
    console.error('[Direct CS Login Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Terjadi kesalahan sistem saat memproses login CS.' },
      { status: 500 }
    );
  }
}
