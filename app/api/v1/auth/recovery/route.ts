import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier } = body;

    const rawInput = (identifier || '').trim().toLowerCase();
    if (!rawInput) {
      return NextResponse.json(
        { success: false, error: 'Silakan masukkan slug toko, email, atau nomor WhatsApp terdaftar.' },
        { status: 400 }
      );
    }

    const cleanInput = rawInput
      .replace(/^https?:\/\//, '')
      .replace(/^shop\.boontrack\.com\//, '');

    const supabase = getSupabase();

    // 1. Query tenant by slug directly
    let matchedTenant: any = null;
    const { data: tenantBySlug } = await supabase
      .from('tenants')
      .select('slug, name, metadata, tier')
      .eq('slug', cleanInput)
      .maybeSingle();

    if (tenantBySlug) {
      matchedTenant = tenantBySlug;
    } else {
      // 2. Query tenant by email in metadata
      const { data: tenantsByEmail } = await supabase
        .from('tenants')
        .select('slug, name, metadata, tier')
        .filter('metadata->>email', 'eq', cleanInput)
        .limit(1);

      if (tenantsByEmail && tenantsByEmail.length > 0) {
        matchedTenant = tenantsByEmail[0];
      } else {
        // 3. Fallback check by whatsapp phone number
        const phoneDigits = cleanInput.replace(/[^0-9]/g, '');
        if (phoneDigits.length >= 8) {
          const { data: allTenants } = await supabase
            .from('tenants')
            .select('slug, name, metadata, tier')
            .limit(100);
          matchedTenant = (allTenants || []).find((t: any) => {
            const meta = t.metadata || {};
            const num = (meta.whatsapp_number || '').replace(/[^0-9]/g, '');
            return num && (num.includes(phoneDigits) || phoneDigits.includes(num));
          });
        }
      }
    }

    if (!matchedTenant) {
      return NextResponse.json(
        {
          success: false,
          error: `Data akun toko dengan identitas "${cleanInput}" tidak ditemukan. Pastikan email atau nomor WhatsApp sesuai saat pendaftaran.`,
        },
        { status: 404 }
      );
    }

    const meta = matchedTenant.metadata || {};
    const pin = meta.access_pin || meta.pin_hash || meta.pin || 'Belum diatur';
    const email = meta.email || null;
    const waNumber = meta.whatsapp_number || null;

    // Masked helpers
    const maskedEmail = email
      ? email.replace(/^(.{2})(.*)(@.*)$/, (_: any, a: string, b: string, c: string) => `${a}${'*'.repeat(Math.max(2, b.length))}${c}`)
      : null;

    const maskedPhone = waNumber
      ? waNumber.replace(/^(\d{4})(\d+)(\d{3})$/, (_: any, a: string, b: string, c: string) => `${a}${'*'.repeat(Math.max(2, b.length))}${c}`)
      : null;

    // Direct WhatsApp message text for recovery
    const waMessage = encodeURIComponent(
      `Halo Admin BoonTrack, saya ingin memulihkan akses toko "${matchedTenant.name || matchedTenant.slug}" (${matchedTenant.slug}). Mohon verifikasi kredensial saya.`
    );
    const redirectWaUrl = `https://wa.me/6281237450222?text=${waMessage}`;

    // Kirim email jika Resend aktif
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && email) {
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
            subject: `🔑 Pemulihan PIN & Akses Dashboard Toko ${matchedTenant.name || matchedTenant.slug}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
                <h2 style="color: #0f172a;">Pemulihan Akses Toko</h2>
                <p style="color: #475569; font-size: 14px;">Berikut adalah informasi kredensial toko Anda:</p>
                <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 16px 0; border: 1px solid #cbd5e1;">
                  <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Slug Toko:</strong> ${matchedTenant.slug}</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>PIN Akses:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${pin}</code></p>
                  <p style="margin: 0; font-size: 14px;"><a href="https://shop.boontrack.com/${matchedTenant.slug}/dashboard" style="color: #2563eb; font-weight: bold;">Masuk ke Dashboard Toko &rarr;</a></p>
                </div>
                <p style="color: #64748b; font-size: 12px;">Jika Anda tidak merasa meminta email ini, abaikan pesan ini.</p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn('Resend recovery email note:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Informasi pemulihan berhasil diproses untuk toko "${matchedTenant.slug}".`,
      slug: matchedTenant.slug,
      maskedEmail,
      maskedPhone,
      redirectWaUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses pemulihan akses';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
