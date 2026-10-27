import { NextResponse } from 'next/server';
import { getStudioRegistrationStatus, activateStudioRegistrationByToken } from '@/lib/studio/auth';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

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

    const isSuccess = result.status === 'SUCCESS' && result.session?.slug;
    let signedToken: string | undefined = undefined;

    if (isSuccess && result.session) {
      signedToken = signMerchantSessionToken({
        tenantSlug: result.session.slug,
        tenantId: result.session.tenant_id,
        role: 'OWNER',
        name: result.session.name,
        phone: result.session.whatsapp,
      });
    }

    const res = NextResponse.json({
      success: true,
      ...result,
      token: signedToken,
    });

    if (isSuccess && signedToken && result.session) {
      const isProd = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV_MODE;
      const cookieDomain = isProd ? '.boontrack.com' : undefined;
      const slug = result.session.slug;

      // 1. Mandatory Signed Session Cookie
      res.cookies.set('bt_merchant_token', signedToken, {
        path: '/',
        maxAge: 2592000,
        sameSite: 'lax',
        httpOnly: true,
        secure: isProd,
        domain: cookieDomain,
      });

      // 2. Set cross-subdomain compatible routing cookies (.boontrack.com)
      res.cookies.set('studio_session', slug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
      res.cookies.set('merchant_store', slug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
      res.cookies.set('merchant_session', slug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
      res.cookies.set('bt_tenant', slug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
    }

    return res;
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
