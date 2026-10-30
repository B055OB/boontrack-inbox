import { NextRequest, NextResponse } from 'next/server';
import {
  AuthProduct,
  getProductAuthConfig,
  verifyHostSessionToken,
  revokeHostSession,
  getHostSessionCookieOptions,
} from '@/lib/auth/host-session';

/**
 * GET /api/auth/session
 * Introspects active host-only session (Zero PII returned)
 */
export async function GET(req: NextRequest) {
  try {
    const product = (req.nextUrl.searchParams.get('product') || 'studio').toLowerCase() as AuthProduct;
    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json({ authenticated: false, error: 'INVALID_PRODUCT' }, { status: 400 });
    }

    const config = getProductAuthConfig(product);
    const token = req.cookies.get(config.cookieName)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const verification = await verifyHostSessionToken(token, product);
    if (!verification.valid || !verification.payload) {
      return NextResponse.json({ authenticated: false, error: verification.error }, { status: 401 });
    }

    // Return Strictly Sanitized Identity (No PII)
    return NextResponse.json({
      authenticated: true,
      product,
      userId: verification.payload.sub,
      tenantId: verification.payload.tid,
      tenantSlug: verification.payload.tsl,
      role: verification.payload.role,
      expiresAt: verification.payload.exp,
    });
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/**
 * POST /api/auth/session (Logout & Revocation)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const product = (body.product || 'studio').toLowerCase() as AuthProduct;
    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT' }, { status: 400 });
    }

    const config = getProductAuthConfig(product);
    const token = req.cookies.get(config.cookieName)?.value;

    if (token) {
      const verification = await verifyHostSessionToken(token, product);
      if (verification.valid && verification.payload) {
        await revokeHostSession(verification.payload.jti, verification.payload.exp);
      }
    }

    const cookieOptions = getHostSessionCookieOptions(product, req.nextUrl.protocol === 'https:');
    const res = NextResponse.json({ success: true, message: 'Sesi berhasil diakhiri.' });

    // Clear Host Cookie
    res.cookies.set(config.cookieName, '', {
      ...cookieOptions,
      maxAge: 0,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'LOGOUT_FAILED' }, { status: 500 });
  }
}
