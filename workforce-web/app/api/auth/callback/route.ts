import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Workforce Web Standalone Auth Callback Handler
 *
 * Ensures all OAuth, SSO, and magic link callbacks resolve strictly
 * on workforce.boontrack.com without leaking or redirecting to dashboard.boontrack.com.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get('error') || searchParams.get('error_description');
  const code = searchParams.get('code');
  const token = searchParams.get('token');

  // Handle explicit errors
  if (error) {
    const errorUrl = req.nextUrl.clone();
    errorUrl.pathname = '/login';
    errorUrl.searchParams.set('auth_error', encodeURIComponent(error));
    return NextResponse.redirect(errorUrl);
  }

  // If callback has code or token, resolve locally
  if (code || token) {
    // Redirect to root "/" on workforce domain
    const successUrl = req.nextUrl.clone();
    successUrl.pathname = '/';
    successUrl.search = '';
    return NextResponse.redirect(successUrl);
  }

  // Default: redirect back to login
  const defaultUrl = req.nextUrl.clone();
  defaultUrl.pathname = '/login';
  return NextResponse.redirect(defaultUrl);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
