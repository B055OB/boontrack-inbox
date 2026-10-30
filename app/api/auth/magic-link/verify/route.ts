import { NextRequest, NextResponse } from 'next/server';
import { redeemMagicLink } from '@/lib/auth/magic-link';
import { AuthProduct, getProductAuthConfig, getHostSessionCookieOptions } from '@/lib/auth/host-session';

/**
 * Handles Magic Link verification (both POST API and GET link clicks)
 */
async function processVerification(token: string, product: AuthProduct, req: NextRequest) {
  const result = await redeemMagicLink({ token, product });

  if (!result.success || !result.sessionToken) {
    return {
      success: false,
      status: result.status,
      message: result.message,
      httpStatus: result.status === 'TOKEN_INVALID' ? 404 : result.status === 'RATE_LIMIT_EXCEEDED' ? 429 : 401,
    };
  }

  const config = getProductAuthConfig(product);
  const isSecure = req.nextUrl.protocol === 'https:';
  const cookieOptions = getHostSessionCookieOptions(product, isSecure);

  return {
    success: true,
    result,
    cookieName: config.cookieName,
    cookieOptions,
  };
}

/**
 * POST /api/auth/magic-link/verify
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token || '').toString().trim();
    const product = (body.product || 'studio').toString().trim().toLowerCase() as AuthProduct;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PRODUCT', message: 'Produk harus studio atau creator.' },
        { status: 400 }
      );
    }

    const outcome = await processVerification(token, product, req);

    if (!outcome.success || !outcome.result) {
      return NextResponse.json(
        { success: false, error: outcome.status, message: outcome.message },
        { status: outcome.httpStatus || 401 }
      );
    }

    const res = NextResponse.json({
      success: true,
      message: outcome.result.message,
      token: outcome.result.sessionToken,
      userId: outcome.result.userId,
      tenantId: outcome.result.tenantId,
      tenantSlug: outcome.result.tenantSlug,
      product: outcome.result.product,
    });

    // Set Host-Only Session Cookie
    res.cookies.set(outcome.cookieName, outcome.result.sessionToken!, outcome.cookieOptions);

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Gagal memverifikasi login.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/magic-link/verify?token=...&product=...
 * For direct link clicks from email
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() || '';
    const product = (req.nextUrl.searchParams.get('product')?.trim().toLowerCase() || 'studio') as AuthProduct;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT' }, { status: 400 });
    }

    const outcome = await processVerification(token, product, req);

    if (!outcome.success || !outcome.result) {
      const redirectUrl = new URL(
        product === 'studio' ? 'https://studio.boontrack.com/login' : 'https://creator.boontrack.com/login'
      );
      redirectUrl.searchParams.set('error', outcome.status || 'VERIFICATION_FAILED');
      return NextResponse.redirect(redirectUrl);
    }

    const targetUrl = new URL(
      product === 'studio' ? 'https://studio.boontrack.com/desk' : 'https://creator.boontrack.com/admin'
    );
    const res = NextResponse.redirect(targetUrl);

    // Set Host-Only Cookie
    res.cookies.set(outcome.cookieName, outcome.result.sessionToken!, outcome.cookieOptions);

    return res;
  } catch {
    return NextResponse.redirect(new URL('https://studio.boontrack.com/login?error=SERVER_ERROR'));
  }
}
