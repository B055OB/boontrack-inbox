import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revokeBwmSessionToken } from '@/workforce-web/lib/auth/session';

function extractAndRevoke(req: NextRequest) {
  const tokenCookie = req.cookies.get('bwm_session_token')?.value;
  if (tokenCookie) {
    revokeBwmSessionToken(tokenCookie);
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    revokeBwmSessionToken(authHeader.substring(7).trim());
  }
}

function createLogoutResponse(req: NextRequest) {
  extractAndRevoke(req);

  const res = NextResponse.json({
    success: true,
    message: 'Sesi BWM telah diakhiri (Logged out). Token telah dicabut dan cookie telah diinvalidasi.',
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

export async function POST(req: NextRequest) {
  return createLogoutResponse(req);
}

export async function GET(req: NextRequest) {
  return createLogoutResponse(req);
}

