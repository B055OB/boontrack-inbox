import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const { pathname } = req.nextUrl;

  // Ignore static assets, internal Next.js routes, and API endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const hostLower = host.toLowerCase();

  // 1. Gym Subdomain Routing (e.g., gym.boontrack.com or gym.localhost:3000)
  const isGymSubdomain =
    hostLower === 'gym.boontrack.com' ||
    hostLower.startsWith('gym.');

  if (isGymSubdomain) {
    const url = req.nextUrl.clone();

    // Root -> Public Webchat Demo & Dummy QRIS for Atmosfitnes
    if (pathname === '/') {
      url.pathname = '/atmosfitnes';
      return NextResponse.rewrite(url);
    }

    // CS / Admin Inbox Dashboard
    if (
      pathname === '/dashboard' ||
      pathname === '/inbox' ||
      pathname === '/chat'
    ) {
      url.pathname = '/atmosfitnes/dashboard';
      return NextResponse.rewrite(url);
    }

    // Gym Operational Hub subroutes (RFID Gate, Members, POS, Invoices)
    const gymSubroutes = [
      '/members',
      '/access-logs',
      '/controllers',
      '/invoices',
      '/pos',
      '/classes',
      '/reports',
      '/settings',
    ];

    if (gymSubroutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      url.pathname = `/gym${pathname}`;
      return NextResponse.rewrite(url);
    }

    // If path already targets /gym or /atmosfitnes or /admin, pass through
    if (
      pathname.startsWith('/gym') ||
      pathname.startsWith('/atmosfitnes') ||
      pathname.startsWith('/admin')
    ) {
      return NextResponse.next();
    }

    // Default fallback for any other subpath on gym.boontrack.com -> rewrite to /atmosfitnes/subpath
    url.pathname = `/atmosfitnes${pathname}`;
    return NextResponse.rewrite(url);
  }

  // 2. App Subdomain Routing (e.g., app.boontrack.com or app.localhost:3000)
  // Request path app.boontrack.com/[tenant] renders app/[tenant]/ directly
  const isAppSubdomain =
    hostLower === 'app.boontrack.com' ||
    hostLower.startsWith('app.');

  if (isAppSubdomain) {
    return NextResponse.next();
  }

  // Other hostnames continue standard Next.js routing
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
