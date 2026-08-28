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
    // If accessing chat or inbox on gym subdomain, rewrite directly to dynamic tenant atmosfitnes shell
    if (pathname === '/inbox' || pathname === '/chat' || pathname === '/atmosfitnes') {
      const url = req.nextUrl.clone();
      url.pathname = '/atmosfitnes';
      return NextResponse.rewrite(url);
    }

    // If the path already has /gym prefix, proceed normally
    if (pathname.startsWith('/gym')) {
      return NextResponse.next();
    }

    // Rewrite root and subpaths:
    // gym.boontrack.com/ -> /gym
    // gym.boontrack.com/members -> /gym/members
    // gym.boontrack.com/access-logs -> /gym/access-logs
    // gym.boontrack.com/controllers -> /gym/controllers
    const url = req.nextUrl.clone();
    url.pathname = `/gym${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  // 2. App Subdomain Routing (e.g., app.boontrack.com or app.localhost:3000)
  // Request path app.boontrack.com/[tenant] langsung merender shell app/[tenant]/
  const isAppSubdomain =
    hostLower === 'app.boontrack.com' ||
    hostLower.startsWith('app.');

  if (isAppSubdomain) {
    return NextResponse.next();
  }

  // Other hostnames (e.g., bossob.boontrack.com, chat.boontrack.com, etc.) continue standard routing
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
