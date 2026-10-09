import { NextResponse } from 'next/server';
import { initiateStudioRegistration } from '@/lib/studio/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, whatsapp, password } = body;
    const referralCode = (body.referral_code || body.referralCode || body.ref || null)?.toString().trim() || null;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'INVALID_NAME', message: 'Nama lengkap minimal 2 karakter.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: 'INVALID_EMAIL', message: 'Format alamat email tidak valid.' },
        { status: 400 }
      );
    }

    const cleanWa = (whatsapp || '').toString().replace(/[^0-9]/g, '');
    if (!cleanWa || cleanWa.length < 8) {
      return NextResponse.json(
        { success: false, error: 'INVALID_WHATSAPP', message: 'Nomor WhatsApp aktif minimal 8 digit.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PASSWORD', message: 'Kata sandi minimal 8 karakter.' },
        { status: 400 }
      );
    }

    const result = await initiateStudioRegistration({
      name: name.trim(),
      email: email.trim(),
      whatsapp: cleanWa,
      password,
      referral_code: referralCode,
    });

    return NextResponse.json({
      success: true,
      token: result.token,
      slug: result.slug,
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
