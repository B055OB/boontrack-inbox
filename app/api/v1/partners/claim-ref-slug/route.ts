import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidSlugFormat } from '@/lib/partner-service';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newSlug = (body.new_slug || body.slug || '').trim().toUpperCase();
    const phone = (body.phone || '').trim();
    const partnerId = body.partner_id;

    if (!newSlug) {
      return NextResponse.json({ success: false, message: 'Kode referral baru wajib diisi.' }, { status: 400 });
    }

    const validation = isValidSlugFormat(newSlug);
    if (!validation.valid) {
      return NextResponse.json({ success: false, message: validation.reason || 'Format kode tidak valid.' }, { status: 400 });
    }

    // Update in Supabase if partnerId or phone provided
    try {
      const supabase = getSupabase();
      if (supabase && (partnerId || phone)) {
        let query = supabase.from('affiliates').update({
          referral_code: newSlug,
          updated_at: new Date().toISOString(),
        });

        if (partnerId) {
          query = query.eq('id', partnerId);
        } else if (phone) {
          query = query.eq('phone_number', phone);
        }

        await query;
      }
    } catch (dbErr) {
      console.warn('Supabase update partner referral_code note:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Kode referral berhasil dikunci menjadi ${newSlug}!`,
      referral_code: newSlug,
      is_ref_customized: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error claiming slug';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
