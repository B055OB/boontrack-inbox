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

  // Check if request comes from Gym Subdomain (e.g., gym.boontrack.com or gym.localhost:3000)
  const isGymSubdomain =
    host.toLowerCase() === 'gym.boontrack.com' ||
    host.toLowerCase().startsWith('gym.');

  if (isGymSubdomain) {
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
