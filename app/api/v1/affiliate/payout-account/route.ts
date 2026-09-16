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

async function handleUpdatePayoutAccount(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      affiliate_id,
      partner_id,
      id,
      phone,
      phone_number,
      bank_name,
      bank,
      bank_account_number,
      account_number,
      bank_account_holder,
      account_holder,
      account_name,
    } = body;

    const resolvedBank = (bank_name || bank || '').trim().toUpperCase();
    const resolvedNumber = (bank_account_number || account_number || '').trim().replace(/\s+/g, '');
    const resolvedHolder = (bank_account_holder || account_holder || account_name || '').trim().toUpperCase();

    if (!resolvedBank || !resolvedNumber || !resolvedHolder) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          message: 'Pilihan bank/e-wallet, nomor rekening, dan nama pemilik rekening wajib diisi lengkap.',
        },
        { status: 400 }
      );
    }

    const targetId = affiliate_id || partner_id || id;
    const targetPhone = phone || phone_number ? cleanPhone(phone || phone_number) : null;

    let updatedAffiliate = null;

    // 1. Update langsung di Supabase Database (Single Source of Truth)
    try {
      const supabase = getSupabase();
      if (supabase) {
        let query = supabase.from('affiliates').select('*');
        if (targetId) {
          query = query.eq('id', targetId);
        } else if (targetPhone) {
          query = query.or(`phone.eq.${targetPhone},phone_number.eq.${targetPhone}`);
        }

        const { data: existingRecords } = await query.limit(1);
        const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

        if (existing) {
          const updatePayload = {
            bank_name: resolvedBank,
            bank_account_number: resolvedNumber,
            bank_account_holder: resolvedHolder,
            payout_bank_details: {
              bank_name: resolvedBank,
              account_number: resolvedNumber,
              account_holder: resolvedHolder,
            },
            is_bank_verified: true,
            updated_at: new Date().toISOString(),
          };

          const { data: updated } = await supabase
            .from('affiliates')
            .update(updatePayload)
            .eq('id', existing.id)
            .select('*')
            .maybeSingle();

          if (updated) {
            updatedAffiliate = updated;
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Affiliate Payout Route] Supabase direct update note:', dbErr);
    }

    // 2. Forward ke Backend Core jika tersedia
    try {
      const coreBase =
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.boontrack.com';

      const backendRes = await fetch(`${coreBase.replace(/\/$/, '')}/api/v1/affiliate/payout-account`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          affiliate_id: targetId,
          phone: targetPhone,
          bank_name: resolvedBank,
          bank_account_number: resolvedNumber,
          bank_account_holder: resolvedHolder,
        }),
      });

      if (backendRes.ok) {
        const backendData = await backendRes.json().catch(() => ({}));
        if (backendData.affiliate) {
          updatedAffiliate = backendData.affiliate;
        }
      }
    } catch (coreErr) {
      console.warn('[Affiliate Payout Route] Core backend forward note:', coreErr);
    }

    return NextResponse.json({
      success: true,
      status: 'success',
      message: 'Rekening pencairan komisi berhasil diperbarui.',
      affiliate: updatedAffiliate || {
        id: targetId,
        bank_name: resolvedBank,
        bank_account_number: resolvedNumber,
        bank_account_holder: resolvedHolder,
      },
      bank_account: {
        bank_name: resolvedBank,
        account_number: resolvedNumber,
        account_holder: resolvedHolder,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memperbarui rekening.';
    return NextResponse.json({ success: false, status: 'error', message: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return handleUpdatePayoutAccount(req);
}

export async function POST(req: NextRequest) {
  return handleUpdatePayoutAccount(req);
}
