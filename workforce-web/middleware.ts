import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Isolated BWM Middleware (workforce-web)
 *
 * Strict Isolation Mandates:
 * 1. ZERO external redirect to dashboard.boontrack.com or any external domain.
 * 2. Allow /login and public assets to render cleanly.
 * 3. If route "/" is accessed without a valid session token, redirect locally to "/login".
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Skip Next.js internals, API routes, manifest, service worker, and static icons
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname === '/workforce.webmanifest' ||
    pathname === '/sw-workforce.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Allow /login to render locally without any external redirect
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return NextResponse.next();
  }

  // 3. Protected route: If accessing root "/" without 'bwm_session_token', redirect locally to "/login"
  if (pathname === '/' || pathname === '') {
    const sessionToken = req.cookies.get('bwm_session_token')?.value;
    if (!sessionToken) {
      const loginUrl = new URL('/login', req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
