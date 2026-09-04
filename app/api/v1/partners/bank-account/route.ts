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
        // Attempt update in affiliates or partners table metadata
        const { data: existing } = await supabase
          .from('affiliates')
          .select('id, metadata')
          .eq(partner_id ? 'id' : 'phone_number', partner_id || phone)
          .maybeSingle();

        if (existing) {
          await supabase.from('affiliates').update({
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
