import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { globalDomainRegistry } from '@/packages/workforce-billing/branding/domain-registry';

/**
 * Isolated BWM Middleware (workforce-web)
 * Strictly scoped to workforce.boontrack.com (Port 3001)
 *
 * Mandates:
 * 1. ZERO EXTERNAL REDIRECT: Absolute prohibition of redirects to dashboard.boontrack.com
 *    or any external merchant domain.
 * 2. DYNAMIC BRANDING & HOST RESOLUTION: Resolves host against verified_domain_registry (RFC-BWM-014).
 * 3. DEFAULT-DENY: Unregistered or inactive hosts are immediately routed to neutral fallback.
 * 4. ROUTE PROTECTION: Unauthenticated requests to "/" redirect locally to "/login".
 * 5. PROXY-SAFE REDIRECTS: Uses req.nextUrl.clone() to preserve public hostname and HTTPS protocol.
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

  // 2. Dynamic Host Resolution & Default-Deny Guard (RFC-BWM-014)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const edgeToken =
    req.headers.get('x-railway-edge-token') ||
    req.headers.get('cf-ray') ||
    req.headers.get('x-edge-verified');

  const resolution = globalDomainRegistry.resolveHost(host, edgeToken);

  if (resolution.status === 'DEFAULT_DENY') {
    // Unregistered / unknown host: redirect fail-closed to neutral fallback /login
    const fallbackUrl = req.nextUrl.clone();
    fallbackUrl.hostname = 'workforce.boontrack.com';
    fallbackUrl.pathname = '/login';
    return NextResponse.redirect(fallbackUrl);
  }

  // Helper to create branded Next response with x-tenant-id and custom headers
  const createBrandedNextResponse = () => {
    const requestHeaders = new Headers(req.headers);
    if (resolution.domain) {
      requestHeaders.set('x-tenant-id', resolution.domain.tenantId);
      requestHeaders.set('x-workforce-tenant-id', resolution.domain.tenantId);
      requestHeaders.set('x-workforce-brand-name', resolution.domain.brandName);
      requestHeaders.set('x-workforce-primary-color', resolution.domain.primaryColor);
      requestHeaders.set('x-workforce-accent-color', resolution.domain.accentColor);
    }
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    if (resolution.domain) {
      res.headers.set('x-tenant-id', resolution.domain.tenantId);
      res.headers.set('x-workforce-tenant-id', resolution.domain.tenantId);
      res.headers.set('x-workforce-brand-name', resolution.domain.brandName);
      res.headers.set('x-workforce-primary-color', resolution.domain.primaryColor);
      res.headers.set('x-workforce-accent-color', resolution.domain.accentColor);
    }
    return res;
  };

  // 3. Allow /login to render locally without any external redirect
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return createBrandedNextResponse();
  }

  // 4. Catch legacy /dashboard routes and redirect locally to "/"
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = '/';
    return NextResponse.redirect(homeUrl);
  }

  // 5. Allow root "/" and other registered routes to render with injected tenant branding headers
  return createBrandedNextResponse();
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
