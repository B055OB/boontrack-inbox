/**
 * app/api/v1/auth/logout/route.ts
 *
 * Dedicated Server-Side Logout Endpoint
 *
 * Security Invariants:
 * 1. SERVER-SIDE COOKIE INVALIDATION: Expires the HttpOnly `bt_merchant_token` cookie
 *    using matching path ('/') and scope attributes. JavaScript cannot clear HttpOnly cookies.
 * 2. CLEARS LEGACY CONTEXT COOKIES: Also expires merchant_store, merchant_session, bt_tenant,
 *    studio_session, cs_session_name, cs_session_phone.
 * 3. DEFENSE-IN-DEPTH: Ensures that a subsequent request from the browser has no valid session
 *    evidence and fails closed on protected dashboard access.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function clearSessionCookies(res: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';
  const expireOptions = {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    sameSite: 'lax' as const,
    secure: isProd,
  };

  // 1. Invalidate Primary Cryptographic Token (HttpOnly)
  res.cookies.set('bt_merchant_token', '', {
    ...expireOptions,
    httpOnly: true,
  });

  // 2. Invalidate Non-Authoritative / Legacy Routing Cookies
  res.cookies.set('merchant_store', '', expireOptions);
  res.cookies.set('merchant_session', '', expireOptions);
  res.cookies.set('bt_tenant', '', expireOptions);
  res.cookies.set('studio_session', '', expireOptions);
  res.cookies.set('cs_session_name', '', expireOptions);
  res.cookies.set('cs_session_phone', '', expireOptions);

  return res;
}

export async function POST(_req: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Sesi login merchant berhasil diakhiri (Logged out successfully).',
    });
    return clearSessionCookies(response);
  } catch (err: any) {
    console.error('[Logout Route Error]:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal mengakhiri sesi pada server.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Support GET redirect if accessed directly
  const response = NextResponse.redirect(new URL('/login', req.url));
  return clearSessionCookies(response);
}
