import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partner_id,
      phone,
      bank_name,
      account_number,
      account_holder,
    } = body;

    if (!bank_name || !account_number || !account_holder) {
      return NextResponse.json(
        { success: false, message: 'Bank, Nomor Rekening, dan Nama Pemilik Rekening wajib diisi lengkap.' },
        { status: 400 }
      );
    }

    const cleanAccount = account_number.trim().replace(/\s+/g, '');
    const cleanHolder = account_holder.trim().toUpperCase();

    try {
      const supabase = getSupabase();
      if (supabase && (partner_id || phone)) {
        let query = supabase.from('affiliates').select('id, metadata');
        if (partner_id) {
          query = query.eq('id', partner_id);
        } else if (phone) {
          const cp = String(phone).replace(/[^0-9]/g, '');
          const norm = cp.startsWith('0') ? '62' + cp.slice(1) : cp;
          query = query.or(`phone.eq.${norm},phone_number.eq.${norm},phone.eq.${phone},phone_number.eq.${phone}`);
        }

        const { data: existingRecords } = await query.limit(1);
        const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

        if (existing) {
          await supabase.from('affiliates').update({
            bank_name,
            bank_account_number: cleanAccount,
            bank_account_holder: cleanHolder,
            payout_bank_details: {
              bank_name,
              account_number: cleanAccount,
              account_holder: cleanHolder,
            },
            is_bank_verified: true,
            metadata: {
              ...(existing.metadata || {}),
              bank_name,
              bank_account_number: cleanAccount,
              bank_account_holder: cleanHolder,
            },
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
        }
      }
    } catch (e) {
      console.warn('Supabase partner bank save note:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Rekening pencairan dana berhasil disimpan!',
      bank_account: {
        bank_name,
        account_number: cleanAccount,
        account_holder: cleanHolder,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving bank account';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
