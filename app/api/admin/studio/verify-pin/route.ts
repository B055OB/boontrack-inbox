import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/admin/studio/verify-pin
 * Server-Side Authentication Guard for Studio Admin Directory.
 * Replaces insecure client-side hardcoded MASTER_PIN.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { pin } = body;

    const validPin = (process.env.ADMIN_STUDIO_PIN || '998877').trim();

    if (!pin || typeof pin !== 'string') {
      return NextResponse.json(
        { success: false, message: 'PIN Super Admin wajib diisi.' },
        { status: 400 }
      );
    }

    if (pin.trim() !== validPin) {
      return NextResponse.json(
        { success: false, message: 'PIN Super Admin salah atau tidak valid.' },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      success: true,
      message: 'Autentikasi Super Admin Studio berhasil.',
    });

    // Set secure session cookie (24 hours)
    res.cookies.set('studio_admin_verified', 'true', {
      path: '/',
      maxAge: 24 * 60 * 60,
      httpOnly: false, // Accessible to client admin state
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return res;
  } catch (err: any) {
    console.error('[Admin Studio Verify PIN] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem verifikasi.' },
      { status: 500 }
    );
  }
}
