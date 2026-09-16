import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function cleanPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

async function handleUpdateSlug(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      affiliate_id,
      partner_id,
      id,
      current_code,
      referral_code,
      phone,
      new_slug,
    } = body;

    const rawSlug = (new_slug || '').trim().toLowerCase();
    const cleanSlug = rawSlug.replace(/[^a-z0-9-]/g, '');

    if (!cleanSlug || cleanSlug.length < 3 || cleanSlug.length > 30) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Slug referral minimal 3 karakter dan maksimal 30 karakter (hanya huruf kecil, angka, dan strip).',
        },
        { status: 400 }
      );
    }

    const RESERVED = new Set([
      'login', 'register', 'daftar', 'api', 'dashboard', 'auth', 'admin',
      'affiliate', 'manager', 'shop', 'creator', 'www', 'app', 'career', 'static', 'chat',
      'portal'
    ]);
    if (RESERVED.has(cleanSlug)) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Slug ini dicadangkan untuk sistem, gunakan nama lain.',
        },
        { status: 400 }
      );
    }

    const targetId = affiliate_id || partner_id || id;
    const targetPhone = phone ? cleanPhone(phone) : null;
    const targetCode = (current_code || referral_code || '').trim().toLowerCase();

    let updatedAffiliate = null;

    // 1. Single Source of Truth: Supabase
    try {
      const supabase = getSupabase();
      if (supabase) {
        // Cari affiliate yang ditarget
        let query = supabase.from('affiliates').select('*');
        if (targetId) {
          query = query.eq('id', targetId);
        } else if (targetCode) {
          query = query.ilike('referral_code', targetCode);
        } else if (targetPhone) {
          query = query.or(`phone.eq.${targetPhone},phone_number.eq.${targetPhone}`);
        }

        const { data: existingRecords } = await query.limit(1);
        const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

        if (existing) {
          // Cek keunikan slug di Supabase
          const { data: duplicateRecords } = await supabase
            .from('affiliates')
            .select('id, referral_code')
            .ilike('referral_code', cleanSlug)
            .neq('id', existing.id)
            .limit(1);

          if (duplicateRecords && duplicateRecords.length > 0) {
            return NextResponse.json(
              {
                success: false,
                status: 'error',
                message: 'Slug sudah dipakai, gunakan nama lain',
              },
              { status: 400 }
            );
          }

          const { data: updated } = await supabase
            .from('affiliates')
            .update({
              referral_code: cleanSlug,
              is_ref_customized: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select('*')
            .maybeSingle();

          if (updated) {
            updatedAffiliate = updated;
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Affiliate Slug Gateway] Supabase update note:', dbErr);
    }

    // 2. Forward ke Backend Core
    try {
      const coreBase =
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.boontrack.com';

      const backendRes = await fetch(`${coreBase.replace(/\/$/, '')}/api/v1/affiliate/slug`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          affiliate_id: targetId,
          current_code: targetCode,
          phone: targetPhone,
          new_slug: cleanSlug,
        }),
      });

      const backendData = await backendRes.json().catch(() => ({}));
      if (!backendRes.ok && backendData?.detail) {
        return NextResponse.json(
          {
            success: false,
            status: 'error',
            message: backendData.detail,
          },
          { status: backendRes.status }
        );
      }

      if (backendData?.affiliate) {
        updatedAffiliate = backendData.affiliate;
      }
    } catch (coreErr) {
      console.warn('[Affiliate Slug Gateway] Core forward note:', coreErr);
    }

    return NextResponse.json({
      success: true,
      status: 'success',
      message: 'Slug referral berhasil diperbarui.',
      slug: cleanSlug,
      referral_code: cleanSlug,
      affiliate: updatedAffiliate || {
        id: targetId,
        referral_code: cleanSlug,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memperbarui slug.';
    return NextResponse.json({ success: false, status: 'error', message: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return handleUpdateSlug(req);
}

export async function POST(req: NextRequest) {
  return handleUpdateSlug(req);
}
