import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function createLogoutResponse() {
  const res = NextResponse.json({
    success: true,
    message: 'Sesi BWM telah diakhiri (Logged out). Cookie telah diinvalidasi.',
  });

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookies.set('bwm_session_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  res.cookies.set('bwm_csrf_token', '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  return res;
}

export async function POST(_req: NextRequest) {
  return createLogoutResponse();
}

export async function GET(_req: NextRequest) {
  return createLogoutResponse();
}

