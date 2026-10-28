import { NextResponse } from 'next/server';
import { activateStudioRegistrationByToken, normalizeStudioPhone } from '@/lib/studio/auth';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

/**
 * POST /api/studio/auth/activate
 * Direct verification and activation of Studio workspace using WhatsApp Token.
 * Accepts: { whatsapp, token }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawToken = (body.token || body.code || '').toString().trim();
    const rawPhone = (body.whatsapp || body.phone || '').toString().trim();

    if (!rawToken) {
      return NextResponse.json(
        { success: false, error: 'TOKEN_REQUIRED', message: 'Kode / Token Aktivasi Bot wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanToken = rawToken.toUpperCase().replace(/\s+/g, '');
    const cleanPhone = rawPhone ? normalizeStudioPhone(rawPhone) : undefined;

    const activatedTenant = await activateStudioRegistrationByToken(cleanToken, cleanPhone);

    if (!activatedTenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'TOKEN_INVALID',
          message: `Kode aktivasi "${cleanToken}" tidak ditemukan atau telah kedaluwarsa. Pastikan nomor WhatsApp dan kode aktivasi sesuai.`,
        },
        { status: 404 }
      );
    }

    const tenantSlug = activatedTenant.slug || 'studio';
    const tenantName = activatedTenant.name || 'Studio Workspace';

    const sessionData = {
      tenant_id: activatedTenant.id,
      slug: tenantSlug,
      name: tenantName,
      whatsapp: activatedTenant.metadata?.whatsapp || cleanPhone,
      email: activatedTenant.metadata?.email,
      render_credits: activatedTenant.metadata?.studio_workspace?.render_credits ?? 1,
    };

    const signedToken = signMerchantSessionToken({
      tenantSlug,
      tenantId: activatedTenant.id,
      role: 'OWNER',
      name: tenantName,
      phone: cleanPhone,
    });

    const isProd = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV_MODE;
    const cookieDomain = isProd ? '.boontrack.com' : undefined;

    const res = NextResponse.json({
      success: true,
      message: `Selamat! Workspace Studio "${tenantName}" berhasil diaktifkan dengan 1 Kredit Render Gratis.`,
      slug: tenantSlug,
      token: signedToken,
      session: sessionData,
      redirect: '/desk',
    });

    // 1. Mandatory Cryptographically Signed Session Cookie (Enforced by Middleware & Edge Guards)
    res.cookies.set('bt_merchant_token', signedToken, {
      path: '/',
      maxAge: 2592000,
      sameSite: 'lax',
      httpOnly: true,
      secure: isProd,
      domain: cookieDomain,
    });

    // 2. Set cross-subdomain compatible routing cookies (.boontrack.com)
    res.cookies.set('studio_session', tenantSlug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
    res.cookies.set('merchant_store', tenantSlug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
    res.cookies.set('merchant_session', tenantSlug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });
    res.cookies.set('bt_tenant', tenantSlug, { path: '/', maxAge: 2592000, sameSite: 'lax', domain: cookieDomain });

    return res;
  } catch (err: any) {
    console.error('[Studio Activate API] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: 'SERVER_ERROR', message: err.message || 'Terjadi gangguan saat memverifikasi token.' },
      { status: 500 }
    );
  }
}
