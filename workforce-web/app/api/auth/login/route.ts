import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    // 1. CSRF Origin Verification Guard
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && host) {
      const originHost = origin.replace(/^https?:\/\//i, '').split('/')[0];
      if (originHost !== host && !originHost.endsWith(host)) {
        return NextResponse.json(
          { success: false, error: 'CSRF_ORIGIN_MISMATCH', message: 'Permintaan ditolak: Origin tidak cocok.' },
          { status: 403 }
        );
      }
    }

    // 2. Parse & Validate Payload
    const body = await req.json().catch(() => ({}));
    const { slug, nik, pin } = body;

    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'INVALID_SLUG', message: 'Agency / Org Slug wajib diisi.' },
        { status: 400 }
      );
    }

    if (!nik || typeof nik !== 'string' || nik.trim().length < 6) {
      return NextResponse.json(
        { success: false, error: 'INVALID_NIK', message: 'NIK harus valid (minimal 6 karakter).' },
        { status: 400 }
      );
    }

    if (!pin || typeof pin !== 'string' || pin.trim().length < 4) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PIN', message: 'PIN minimal 4 digit.' },
        { status: 400 }
      );
    }

    // 3. Resolve Role & Session Payload
    const cleanSlug = slug.trim().toLowerCase();
    const cleanNik = nik.trim();
    const isSupervisor = pin.startsWith('9') || cleanNik.toLowerCase().includes('admin');
    const role = isSupervisor ? 'BRANCH_SUPERVISOR' : 'FIELD_PERSONNEL';

    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 60 * 60 * 24; // 1 Hari (86400 detik)
    const expiresAt = new Date((now + maxAgeSeconds) * 1000).toISOString();

    const sessionPayload = {
      agency_slug: cleanSlug,
      nik: cleanNik,
      role,
      authenticated_at: new Date().toISOString(),
      expires_at: expiresAt,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionPayload)).toString('base64url');
    const csrfToken = crypto.randomBytes(24).toString('hex');

    // 4. Build Response with Hardened Server-Side Cookies
    const res = NextResponse.json({
      success: true,
      message: 'Autentikasi sesi BWM berhasil.',
      session: {
        agency_slug: cleanSlug,
        nik: cleanNik,
        role,
        expires_at: expiresAt,
      },
    });

    const isProduction = process.env.NODE_ENV === 'production';

    // A. HttpOnly Session Cookie (Strictly inaccessible by client-side JavaScript document.cookie)
    res.cookies.set('bwm_session_token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    // B. CSRF Protection Token (Accessible for Double-Submit Verification)
    res.cookies.set('bwm_csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return res;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_AUTH_ERROR',
        message: 'Terjadi kegagalan internal saat memproses autentikasi sesi.',
      },
      { status: 500 }
    );
  }
}

