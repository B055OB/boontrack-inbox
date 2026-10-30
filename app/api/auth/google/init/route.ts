import { NextRequest, NextResponse } from 'next/server';
import { generateServerOAuthState } from '@/lib/auth/google-oauth';
import { AuthProduct } from '@/lib/auth/host-session';

/**
 * POST /api/auth/google/init
 * Initializes a Google OAuth login attempt with server-generated state & nonce
 * Prevents client-fabricated nonce injection
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const product = (body.product || 'studio').toString().trim().toLowerCase() as AuthProduct;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PRODUCT', message: 'Produk harus studio atau creator.' },
        { status: 400 }
      );
    }

    const { state, nonce } = generateServerOAuthState(product);

    const isSecure = req.nextUrl.protocol === 'https:';
    const res = NextResponse.json({
      success: true,
      state,
      nonce,
      clientId: process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id.apps.googleusercontent.com',
    });

    // Set Ephemeral State Cookie (10-minute TTL)
    res.cookies.set('__Host-oauth_state', state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INIT_FAILED', message: 'Gagal menginisialisasi sesi Google OAuth.' },
      { status: 500 }
    );
  }
}
