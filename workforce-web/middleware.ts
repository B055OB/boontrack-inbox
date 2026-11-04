import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Isolated BWM Middleware (workforce-web)
 * Strictly scoped to workforce.boontrack.com (Port 3001)
 *
 * Mandates:
 * 1. ZERO EXTERNAL REDIRECT: Absolute prohibition of redirects to dashboard.boontrack.com
 *    or any external merchant domain.
 * 2. STANDALONE WORKFORCE ROUTING: Serves only workforce portal routes.
 * 3. ROUTE PROTECTION: Unauthenticated requests to "/" redirect locally to "/login".
 * 4. PROXY-SAFE REDIRECTS: Uses req.nextUrl.clone() to preserve public hostname and HTTPS protocol.
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

  // 3. Catch legacy /dashboard routes and redirect locally to "/"
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = '/';
    return NextResponse.redirect(homeUrl);
  }

  // 4. Protected route: If accessing root "/" without 'bwm_session_token', redirect locally to "/login"
  if (pathname === '/' || pathname === '') {
    const sessionToken = req.cookies.get('bwm_session_token')?.value;
    if (!sessionToken) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
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
