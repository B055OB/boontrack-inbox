import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { globalDomainRegistry } from '@/packages/workforce-billing/branding/domain-registry';

/**
 * Isolated BWM Middleware (workforce-web)
 * Strictly scoped to workforce.boontrack.com (Port 3001)
 *
 * Mandates:
 * 1. ROOT PATH ('/') IS A PUBLIC ROUTE: Renders modern BWM Landing Page (app/page.tsx)
 *    freely for the public without any redirect to /login.
 * 2. PROTECTED INTERNAL ROUTES: Redirects to /login ONLY when attempting to access
 *    internal/dashboard routes (/dashboard, /portal, /supervisor, /field, /admin, /ops, /attendance, /patrol)
 *    without a valid session token (bwm_session_token).
 * 3. ZERO EXTERNAL REDIRECT: Absolute prohibition of redirects to dashboard.boontrack.com.
 * 4. DYNAMIC BRANDING: Injects tenant branding headers (x-tenant-id, x-workforce-brand-name, etc.).
 * 5. DEFAULT-DENY: Unknown/unregistered hostnames are rejected fail-closed.
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

  // 2. Dynamic Host Resolution & Edge Reverse Proxy Token
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const edgeToken =
    req.headers.get('x-railway-edge-token') ||
    req.headers.get('cf-ray') ||
    req.headers.get('x-edge-verified') ||
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-forwarded-proto') ||
    req.headers.get('x-request-id') ||
    (process.env.RAILWAY_ENVIRONMENT ? 'railway-edge-verified' : null);

  const resolution = globalDomainRegistry.resolveHost(host, edgeToken);

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

  // 3. Strict Default-Deny on unregistered or suspended hosts
  if (resolution.status === 'DEFAULT_DENY') {
    const fallbackUrl = req.nextUrl.clone();
    fallbackUrl.hostname = 'workforce.boontrack.com';
    fallbackUrl.pathname = '/login';
    return NextResponse.redirect(fallbackUrl);
  }

  // 4. PUBLIC ROUTE 1: Root path ('/') renders Landing Page freely for all visitors
  if (pathname === '/' || pathname === '') {
    return createBrandedNextResponse();
  }

  // 5. PUBLIC ROUTE 2: /login renders login portal locally
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return createBrandedNextResponse();
  }

  // 6. PROTECTED INTERNAL ROUTES: Redirect to /login if no valid bwm_session_token
  const isInternalProtectedPath =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/') ||
    pathname === '/portal' || pathname.startsWith('/portal/') ||
    pathname === '/admin' || pathname.startsWith('/admin/') ||
    pathname === '/supervisor' || pathname.startsWith('/supervisor/') ||
    pathname === '/field' || pathname.startsWith('/field/') ||
    pathname === '/ops' || pathname.startsWith('/ops/') ||
    pathname === '/attendance' || pathname.startsWith('/attendance/') ||
    pathname === '/patrol' || pathname.startsWith('/patrol/');

  if (isInternalProtectedPath) {
    const sessionToken = req.cookies.get('bwm_session_token')?.value;
    if (!sessionToken) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }

    // Fast edge verification of token structure and expiry
    try {
      const parts = sessionToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Malformed token structure');
      }
      // base64url decode in Edge runtime
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = atob(base64);
      const payload = JSON.parse(jsonStr);
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }
    } catch {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }
  }

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
