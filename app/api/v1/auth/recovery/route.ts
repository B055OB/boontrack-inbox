import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getResendApiKey } from '@/lib/boonpilot-email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawEmail = (body.email || body.identifier || '').trim().toLowerCase();

    if (!rawEmail) {
      return NextResponse.json(
        { success: false, error: 'Silakan masukkan alamat email terdaftar toko Anda.' },
        { status: 400 }
      );
    }

    // Standard email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return NextResponse.json(
        { success: false, error: 'Format email tidak valid. Masukkan alamat email yang benar (contoh: nama@bisnis.com).' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // 1. Query tenant directly by metadata->>email
    let matchedTenant: any = null;

    const { data: tenantsByEmail } = await supabase
      .from('tenants')
      .select('slug, name, metadata, tier')
      .filter('metadata->>email', 'eq', rawEmail)
      .limit(1);

    if (tenantsByEmail && tenantsByEmail.length > 0) {
      matchedTenant = tenantsByEmail[0];
    } else {
      // Fallback search in case email casing or whitespace differs
      const { data: allTenants } = await supabase
        .from('tenants')
        .select('slug, name, metadata, tier')
        .limit(200);

      matchedTenant = (allTenants || []).find((t: any) => {
        const meta = t.metadata || {};
        const registeredEmail = (meta.email || '').trim().toLowerCase();
        return registeredEmail && registeredEmail === rawEmail;
      });
    }

    // 2. Error handling jika email tidak ditemukan di database Supabase
    if (!matchedTenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email tidak terdaftar. Pastikan memasukkan alamat email yang digunakan saat mendaftar toko.',
        },
        { status: 404 }
      );
    }

    const meta = matchedTenant.metadata || {};
    const pin = meta.access_pin || meta.pin_hash || meta.pin || '123456';
    const storeName = matchedTenant.name || matchedTenant.slug;
    const storeSlug = matchedTenant.slug;

    // 3. Kirim PIN akses dan link dashboard via Resend Email resmi
    const resendKey = getResendApiKey();
    let emailSent = false;

    if (resendKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
            'User-Agent': 'BoonTrack-Engine/1.0 (Next.js/Commerce)',
          },
          body: JSON.stringify({
            from: 'BoonTrack Security <support@boontrack.com>',
            to: [rawEmail],
            subject: `🔑 PIN Akses Dashboard Toko ${storeName}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0;">BoonTrack Shop</h2>
                  <span style="font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase;">Commerce Engine</span>
                </div>
                
                <h3 style="color: #1e293b; font-size: 16px; font-weight: 700; margin-top: 0;">Pemulihan Akses Toko</h3>
                <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                  Halo Pemilik Toko <strong>${storeName}</strong>,<br/>
                  Berikut adalah informasi kredensial login Anda untuk mengelola dashboard toko di BoonTrack:
                </p>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
                  <div style="margin-bottom: 12px;">
                    <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Slug / Domain Toko:</span>
                    <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px;">${storeSlug}</div>
                  </div>
                  <div style="margin-bottom: 16px;">
                    <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">PIN Akses Rahasia:</span>
                    <div style="margin-top: 4px;">
                      <span style="display: inline-block; background-color: #e0e7ff; color: #3730a3; font-family: monospace; font-size: 18px; font-weight: 800; padding: 6px 14px; border-radius: 8px; letter-spacing: 0.15em;">
                        ${pin}
                      </span>
                    </div>
                  </div>
                  <a href="https://shop.boontrack.com/${storeSlug}/dashboard" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 10px;">
                    Masuk ke Dashboard Toko &rarr;
                  </a>
                </div>

                <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
                  Pesan ini dikirimkan otomatis demi keamanan akun toko Anda. Jangan bagikan PIN ini kepada pihak yang tidak berwenang. Jika Anda tidak merasa meminta email ini, abaikan pesan ini.
                </p>
              </div>
            `,
          }),
        });
        emailSent = res.ok;
      } catch (emailErr) {
        console.warn('[Recovery API] Resend email dispatch note:', emailErr);
      }
    }

    // 4. Return respon sukses (WhatsApp trigger dinonaktifkan sepenuhnya untuk hemat biaya WABA)
    return NextResponse.json({
      success: true,
      message: 'PIN akses berhasil dikirimkan ke email Anda. Silakan periksa kotak masuk atau spam.',
      slug: storeSlug,
      emailSent,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses pemulihan akses';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
