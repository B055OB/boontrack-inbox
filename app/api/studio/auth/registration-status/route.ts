import { NextResponse } from 'next/server';
import { getStudioRegistrationStatus, activateStudioRegistrationByToken } from '@/lib/studio/auth';

/**
 * GET /api/studio/auth/registration-status?token={TOKEN}
 * Polling endpoint to check WABA activation status
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token || token.trim().length === 0) {
      return NextResponse.json(
        { success: false, status: 'EXPIRED', message: 'Token tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const result = await getStudioRegistrationStatus(token);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[Studio Registration Status API] Error:', err);
    return NextResponse.json(
      { success: false, status: 'EXPIRED', message: err.message || 'Gagal mengecek status verifikasi.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/studio/auth/registration-status
 * Development / Test simulator for inbound WABA activation
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = body.token;

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token diperlukan.' },
        { status: 400 }
      );
    }

    const activatedTenant = await activateStudioRegistrationByToken(token, '6285181830080');

    if (!activatedTenant) {
      return NextResponse.json(
        { success: false, message: 'Tenant dengan token tersebut tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Workspace berhasil diaktifkan.',
      slug: activatedTenant.slug,
    });
  } catch (err: any) {
    console.error('[Studio Simulation API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
