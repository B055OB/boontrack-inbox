import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      store_name,
      merchant_name,
      email,
      phone,
      pin,
      plan_tier = 'solo_trial',
    } = body;

    if (!tenant_slug || !email) {
      return NextResponse.json(
        { success: false, error: 'Slug toko dan email wajib disertakan.' },
        { status: 400 }
      );
    }

    // 1. Forward trigger ke Core Backend Notification Service (Railway / api.boontrack.com)
    try {
      await fetch('https://api.boontrack.com/api/v1/shop/subscriptions/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug,
          store_name: store_name || tenant_slug,
          merchant_name,
          email,
          phone,
          pin,
          plan_tier,
          event: 'WELCOME_TRIAL_CREDENTIALS',
        }),
        cache: 'no-store',
      });
    } catch (coreErr) {
      console.warn('Core backend welcome notification note:', coreErr);
    }

    // 2. Jika ada Resend API Key di env, kirim email kredensial resmi
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'BoonTrack <support@boontrack.com>',
            to: [email],
            subject: `🎉 Selamat Datang di BoonTrack Shop! Kredensial Toko ${store_name || tenant_slug}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 16px;">
                <h2 style="color: #0f172a;">Selamat Datang, ${merchant_name || 'Merchant'}!</h2>
                <p style="color: #475569; font-size: 14px;">
                  Toko online <strong>${store_name || tenant_slug}</strong> telah berhasil dibuat dengan <strong>Masa Coba Gratis (Reverse Trial 14 Hari)</strong>.
                </p>
                <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #cbd5e1;">
                  <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Domain Toko:</strong> shop.boontrack.com/${tenant_slug}</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>PIN / Password Akses:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${pin || '******'}</code></p>
                  <p style="margin: 0; font-size: 14px;"><strong>Dashboard:</strong> <a href="https://shop.boontrack.com/${tenant_slug}/dashboard" style="color: #2563eb;">Masuk ke Dashboard Toko</a></p>
                </div>
                <p style="color: #64748b; font-size: 12px;">Simpan email ini untuk keamanan dan login toko Anda berikutnya.</p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn('Resend email trigger note:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Kredensial toko dan notifikasi selamat datang berhasil diproses.',
      credentials: {
        tenant_slug,
        email,
        phone,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses notifikasi kredensial';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
