import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const tokenCookie = req.cookies.get('bwm_session_token')?.value;

  if (!tokenCookie) {
    return NextResponse.json(
      {
        success: false,
        error: 'NO_SESSION_COOKIE',
        message: 'Tidak ada sesi aktif yang ditemukan.',
      },
      { status: 401 }
    );
  }

  try {
    const raw = Buffer.from(tokenCookie, 'base64url').toString('utf8');
    const payload = JSON.parse(raw);

    // Verify expiry
    if (payload.expires_at && new Date(payload.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'Sesi telah kedaluwarsa. Silakan login kembali.',
        },
        { status: 401 }
      );
    }

    // Refresh token expiry by +24 hours
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 60 * 60 * 24; // 1 Hari (86400 detik)
    const newExpiresAt = new Date((now + maxAgeSeconds) * 1000).toISOString();

    const refreshedPayload = {
      ...payload,
      refreshed_at: new Date().toISOString(),
      expires_at: newExpiresAt,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const newSessionToken = Buffer.from(JSON.stringify(refreshedPayload)).toString('base64url');
    const newCsrfToken = crypto.randomBytes(24).toString('hex');

    const res = NextResponse.json({
      success: true,
      message: 'Sesi BWM berhasil diperbarui.',
      session: {
        agency_slug: refreshedPayload.agency_slug,
        nik: refreshedPayload.nik,
        role: refreshedPayload.role,
        expires_at: newExpiresAt,
      },
    });

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookies.set('bwm_session_token', newSessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    res.cookies.set('bwm_csrf_token', newCsrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return res;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_TOKEN_FORMAT',
        message: 'Format token sesi tidak valid.',
      },
      { status: 400 }
    );
  }
}

