import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidSlugFormat, INITIAL_PARTNERS } from '@/lib/partner-service';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawSlug = (body.slug || body.referral_code || '').trim().toUpperCase();
    const currentCode = (body.current_code || '').trim().toUpperCase();

    if (!rawSlug) {
      return NextResponse.json({
        available: false,
        message: 'Kode referral wajib diisi.',
      });
    }

    const validation = isValidSlugFormat(rawSlug);
    if (!validation.valid) {
      return NextResponse.json({
        available: false,
        message: validation.reason || 'Format kode tidak valid.',
      });
    }

    // Jika kode sama dengan kode aktif saat ini, anggap valid/tersedia
    if (currentCode && rawSlug === currentCode) {
      return NextResponse.json({
        available: true,
        message: 'Kode saat ini aktif milik Anda.',
      });
    }

    // Cek di Supabase jika terhubung
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: existing } = await supabase
          .from('affiliates')
          .select('id, referral_code')
          .ilike('referral_code', rawSlug)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            available: false,
            message: 'Kode sudah dipakai oleh mitra lain.',
          });
        }
      }
    } catch {
      // Fallback to local check
    }

    // Cek seed partners
    const inSeed = INITIAL_PARTNERS.some(
      (p) => p.referral_code.toUpperCase() === rawSlug && p.referral_code.toUpperCase() !== currentCode
    );

    if (inSeed) {
      return NextResponse.json({
        available: false,
        message: 'Kode sudah dipakai oleh mitra lain.',
      });
    }

    return NextResponse.json({
      available: true,
      message: 'Kode tersedia untuk diklaim!',
      slug: rawSlug,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error validating slug';
    return NextResponse.json({ available: false, message: msg }, { status: 500 });
  }
}
