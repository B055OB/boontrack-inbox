import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Known B2B Retail / UMKM / Public Tenant Slugs.
 * Subdomains matching these slugs will be dispatched to the B2B Multi-Tenant engine (/[tenant]),
 * NOT to the Career/Resume template.
 */
const B2B_TENANT_SLUGS = new Set([
  'nyka',
  'atmosfitnes',
  'bale-pananggeuhan',
  'pelayanan-publik',
  'indra-public',
  'pelayanan-publik-dummy',
  'om-budi',
  'boontrack-demo',
  'holding',
  'boontrack-holding',
]);

/**
 * Extract subdomain from incoming request hostname.
 * Handles *.boontrack.com, *.localhost, and multi-segment hostnames.
 */
function extractSubdomain(hostWithPort: string): string | null {
  const hostClean = hostWithPort.split(':')[0].toLowerCase().trim();

  // Root localhost or direct IP -> no subdomain
  if (
    hostClean === 'localhost' ||
    hostClean === '127.0.0.1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostClean)
  ) {
    return null;
  }

  // Handle *.localhost (e.g., gym.localhost, nyka.localhost)
  if (hostClean.endsWith('.localhost')) {
    const parts = hostClean.replace('.localhost', '').split('.');
    return parts[parts.length - 1] || null;
  }

  // Handle *.boontrack.com (e.g., gym.boontrack.com, nyka.boontrack.com, cv.boontrack.com)
  if (hostClean.endsWith('.boontrack.com')) {
    const parts = hostClean.replace('.boontrack.com', '').split('.');
    return parts[parts.length - 1] || null;
  }

  // General fallback for sub.domain.com
  const parts = hostClean.split('.');
  if (parts.length > 2) {
    return parts[0] || null;
  }

  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0. Ignore static assets, internal Next.js paths, and API endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname === '/pilot-onboarding' ||
    pathname.startsWith('/pilot-onboarding/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const host = req.headers.get('host') || '';
  const hostClean = host.split(':')[0].toLowerCase().trim();

  // 1. Bypass Root & Admin hostnames (localhost, boontrack.com, admin.boontrack.com, app.boontrack.com)
  if (
    hostClean === 'localhost' ||
    hostClean === 'boontrack.com' ||
    hostClean === 'www.boontrack.com' ||
    hostClean === 'admin.boontrack.com' ||
    hostClean === 'app.boontrack.com' ||
    hostClean.startsWith('admin.') ||
    hostClean.startsWith('app.')
  ) {
    return NextResponse.next();
  }

  const subdomain = extractSubdomain(host);

  // If no subdomain detected or system subdomains, continue standard routing
  if (
    !subdomain ||
    subdomain === 'www' ||
    subdomain === 'admin' ||
    subdomain === 'app'
  ) {
    return NextResponse.next();
  }

  // ---------------------------------------------------------------------------
  // 2. Gym Subdomain (gym.* or atmosfitnes.*)
  // ---------------------------------------------------------------------------
  if (subdomain === 'gym' || subdomain === 'atmosfitnes') {
    const url = req.nextUrl.clone();

    // Clean URL enforcement: strip internal /atmosfitnes prefix from browser address bar
    if (pathname === '/atmosfitnes' || pathname === '/atmosfitnes/') {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname === '/atmosfitnes/dashboard') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith('/atmosfitnes/')) {
      url.pathname = pathname.replace('/atmosfitnes', '') || '/';
      return NextResponse.redirect(url, 307);
    }

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

    // If path already targets /gym or /admin, pass through
    if (pathname.startsWith('/gym') || pathname.startsWith('/admin')) {
      return NextResponse.next();
    }

    // Fallback for other paths on gym subdomain
    url.pathname = `/atmosfitnes${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 3. B2B Tenant Subdomain (Retail / Hijab / UMKM e.g. nyka, bale-pananggeuhan)
  // ---------------------------------------------------------------------------
  if (B2B_TENANT_SLUGS.has(subdomain)) {
    const url = req.nextUrl.clone();

    // Clean URL enforcement: strip internal /${subdomain} prefix from browser address bar
    if (pathname === `/${subdomain}` || pathname === `/${subdomain}/`) {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname === `/${subdomain}/dashboard`) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith(`/${subdomain}/`)) {
      url.pathname = pathname.replace(`/${subdomain}`, '') || '/';
      return NextResponse.redirect(url, 307);
    }

    // Root -> Webchat Demo Publik for this B2B tenant
    if (pathname === '/') {
      url.pathname = `/${subdomain}`;
      return NextResponse.rewrite(url);
    }

    // CS / Admin Inbox Dashboard for this B2B tenant
    if (
      pathname === '/dashboard' ||
      pathname === '/inbox' ||
      pathname === '/chat'
    ) {
      url.pathname = `/${subdomain}/dashboard`;
      return NextResponse.rewrite(url);
    }

    // Allow /admin paths to pass through
    if (pathname.startsWith('/admin')) {
      return NextResponse.next();
    }

    // Fallback for other subpaths on this B2B tenant domain
    url.pathname = `/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 4. Career Fallback: Jobseeker Profile Subdomains (e.g. cv, rayi-gemilang)
  // ---------------------------------------------------------------------------
  const url = req.nextUrl.clone();

  // Clean URL enforcement: strip internal /career/${subdomain} prefix
  if (
    pathname === `/career/${subdomain}` ||
    pathname === `/career/${subdomain}/`
  ) {
    url.pathname = '/';
    return NextResponse.redirect(url, 307);
  }
  if (pathname.startsWith(`/career/${subdomain}/`)) {
    url.pathname = pathname.replace(`/career/${subdomain}`, '') || '/';
    return NextResponse.redirect(url, 307);
  }

  // Root -> Candidate's Public Career Profile & ATS Resume
  if (pathname === '/') {
    url.pathname = `/career/${subdomain}`;
    return NextResponse.rewrite(url);
  }

  // Allow /admin paths to pass through
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Fallback for candidate profile subpaths (e.g. /portfolio, /resume)
  url.pathname = `/career/${subdomain}${pathname}`;
  return NextResponse.rewrite(url);
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
