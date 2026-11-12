import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifySuperAdminAccess } from '@/lib/security/admin-auth';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

export const runtime = 'nodejs';

function sha256Buffer(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function getCookieSigningSecret(): string {
  return (
    process.env.ADMIN_COOKIE_SECRET ||
    process.env.MERCHANT_SESSION_SECRET ||
    process.env.ADMIN_INTERNAL_SECRET ||
    ''
  );
}

function signStudioVerifiedCookie(): string {
  const secret = getCookieSigningSecret();
  const payload = `verified:${Date.now()}`;
  if (!secret) {
    return createHash('sha256').update(payload).digest('hex');
  }
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

/**
 * POST /api/admin/studio/verify-pin
 * Server-side Super Admin Studio verification.
 * Hardcoded legacy '998877' PIN has been eliminated (BT-SEC-2026-001).
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Prefer verified Supabase SUPERADMIN session
    const sessionAuth = await verifySuperAdminAccess(req, { allowMachine: false });
    if (sessionAuth.authorized) {
      const res = NextResponse.json({
        success: true,
        verified: true,
        role: sessionAuth.role,
        message: 'Otorisasi Studio Super Admin terverifikasi via sesi resmi.',
      });

      res.cookies.set('studio_admin_verified', signStudioVerifiedCookie(), {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 12,
        path: '/',
      });
      return res;
    }

    // 2. Otherwise validate explicitly configured ADMIN_STUDIO_PIN (min 8 chars, never default '998877')
    const body = await req.json().catch(() => ({}));
    const submittedPin = typeof body?.pin === 'string' ? body.pin.trim() : '';

    if (!submittedPin || submittedPin === '998877') {
      await recordTenantConfigAudit({
        tenantSlug: '_platform_studio',
        actorRole: 'ANONYMOUS',
        authMethod: 'studio_verify_pin',
        action: 'STUDIO_PIN_REJECTED',
        resourceType: 'admin_studio',
        status: 'BLOCKED',
        req,
      });
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Silakan login sebagai Super Admin.' },
        { status: 401 }
      );
    }

    const expectedPin = (process.env.ADMIN_STUDIO_PIN || '').trim();
    if (!expectedPin || expectedPin.length < 8 || expectedPin === '998877') {
      return NextResponse.json(
        {
          success: false,
          error: 'PIN_AUTH_NOT_CONFIGURED',
          message: 'PIN Studio tidak dikonfigurasi di server. Gunakan login akun Super Admin.',
        },
        { status: 503 }
      );
    }

    const match = timingSafeEqual(sha256Buffer(submittedPin), sha256Buffer(expectedPin));
    if (!match) {
      await recordTenantConfigAudit({
        tenantSlug: '_platform_studio',
        actorRole: 'ANONYMOUS',
        authMethod: 'studio_verify_pin',
        action: 'STUDIO_PIN_INVALID',
        resourceType: 'admin_studio',
        status: 'BLOCKED',
        req,
      });
      return NextResponse.json(
        { success: false, message: 'PIN Master Studio tidak valid.' },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      success: true,
      verified: true,
      message: 'PIN Master terverifikasi.',
    });

    res.cookies.set('studio_admin_verified', signStudioVerifiedCookie(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 12,
      path: '/',
    });

    await recordTenantConfigAudit({
      tenantSlug: '_platform_studio',
      actorRole: 'SUPERADMIN_PIN',
      authMethod: 'studio_verify_pin',
      action: 'STUDIO_PIN_VERIFIED',
      resourceType: 'admin_studio',
      req,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Error verifying studio authorization' },
      { status: 500 }
    );
  }
}
