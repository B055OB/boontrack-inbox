import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { verifyBwmSessionToken, signBwmSessionToken } from '@/workforce-web/lib/auth/session';

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

  const verification = verifyBwmSessionToken(tokenCookie);

  if (!verification.valid || !verification.payload) {
    return NextResponse.json(
      {
        success: false,
        error: verification.error || 'INVALID_SESSION_TOKEN',
        message: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.',
      },
      { status: 401 }
    );
  }

  const payload = verification.payload;
  const maxAgeSeconds = 60 * 60 * 24; // 24 hours

  const newSessionToken = signBwmSessionToken(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      role: payload.role,
      nik: payload.nik,
      name: payload.name,
      site: payload.site,
      siteId: payload.siteId,
      branch: payload.branch,
      agencyName: payload.agencyName,
      agencySlug: payload.agencySlug,
    },
    maxAgeSeconds
  );

  const newCsrfToken = crypto.randomBytes(24).toString('hex');
  const isProduction = process.env.NODE_ENV === 'production';

  const res = NextResponse.json({
    success: true,
    message: 'Sesi BWM berhasil diperbarui.',
    session: {
      agency_slug: payload.agencySlug || payload.tenantSlug,
      nik: payload.nik,
      role: payload.role,
    },
  });

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
}
