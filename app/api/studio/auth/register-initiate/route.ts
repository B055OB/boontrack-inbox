import { NextResponse } from 'next/server';
import { initiateStudioRegistration } from '@/lib/studio/auth';

/**
 * POST /api/studio/auth/register-initiate
 * Initiates Studio workspace activation via WhatsApp Bot (no email/password required).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { whatsapp, name, email, password } = body;
    const referralCode = (body.referral_code || body.referralCode || body.ref || null)?.toString().trim() || null;

    const cleanWa = (whatsapp || body.phone || '').toString().replace(/[^0-9]/g, '');
    if (!cleanWa || cleanWa.length < 8) {
      return NextResponse.json(
        { success: false, error: 'INVALID_WHATSAPP', message: 'Nomor WhatsApp aktif minimal 8 digit.' },
        { status: 400 }
      );
    }

    const result = await initiateStudioRegistration({
      whatsapp: cleanWa,
      name: (name || '').trim() || undefined,
      email: (email || '').trim() || undefined,
      password: (password || '').trim() || undefined,
      referral_code: referralCode,
    });

    return NextResponse.json({
      success: true,
      already_active: (result as any).already_active || false,
      token: result.token,
      slug: result.slug,
      name: (result as any).name,
      expires_at: result.expires_at,
      wa_number: result.wa_number,
      wa_message: result.wa_message,
      wa_link: result.wa_link,
    });
  } catch (err: any) {
    console.error('[Studio Register Initiate API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'SERVER_ERROR', message: err.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
