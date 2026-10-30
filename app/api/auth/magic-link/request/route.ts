import { NextRequest, NextResponse } from 'next/server';
import { requestMagicLink } from '@/lib/auth/magic-link';
import { AuthProduct } from '@/lib/auth/host-session';

/**
 * POST /api/auth/magic-link/request
 * Initiates passwordless sign-in/registration for Studio & Creator
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').toString().trim();
    const product = (body.product || 'studio').toString().trim().toLowerCase() as AuthProduct;
    const redirectUrl = body.redirectUrl ? body.redirectUrl.toString().trim() : undefined;

    if (product !== 'studio' && product !== 'creator') {
      return NextResponse.json(
        { success: false, error: 'INVALID_PRODUCT', message: 'Produk harus studio atau creator.' },
        { status: 400 }
      );
    }

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const result = await requestMagicLink({
      email,
      product,
      redirectUrl,
      clientIp,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'REQUEST_REJECTED', message: result.message },
        { status: 429 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      ...(process.env.NODE_ENV === 'test' && result.debugToken ? { debugToken: result.debugToken } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Gagal memproses permintaan login.' },
      { status: 500 }
    );
  }
}
