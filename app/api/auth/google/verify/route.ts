import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleAuth } from '@/lib/auth/google-oauth';
import { AuthProduct, getProductAuthConfig, getHostSessionCookieOptions } from '@/lib/auth/host-session';

/**
 * POST /api/auth/google/verify
 * Handles Google OAuth ID Token / Credential exchange
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = (body.idToken || body.credential || '').toString().trim();
    const product = (body.product || 'studio').toString().trim().toLowerCase() as AuthProduct;
    const state = body.state ? body.state.toString().trim() : undefined;
    const expectedNonce = body.expectedNonce ? body.expectedNonce.toString().trim() : undefined;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PRODUCT', message: 'Produk harus studio atau creator.' },
        { status: 400 }
      );
    }

    const result = await handleGoogleAuth({
      idToken,
      product,
      state,
      expectedNonce,
    });

    if (!result.success || !result.sessionToken) {
      return NextResponse.json(
        { success: false, error: result.status, message: result.message },
        { status: result.status === 'ACCOUNT_TAKEOVER_PREVENTED' ? 409 : 401 }
      );
    }

    const config = getProductAuthConfig(product);
    const isSecure = req.nextUrl.protocol === 'https:';
    const cookieOptions = getHostSessionCookieOptions(product, isSecure);

    const res = NextResponse.json({
      success: true,
      message: result.message,
      token: result.sessionToken,
      userId: result.userId,
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      product: result.product,
    });

    // Set Host-Only Cookie
    res.cookies.set(config.cookieName, result.sessionToken, cookieOptions);

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Gagal memproses autentikasi Google.' },
      { status: 500 }
    );
  }
}
