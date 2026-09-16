import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partner_id,
      partner_name,
      partner_phone,
      amount,
      payout_type,
      bank_name,
      account_number,
      account_holder,
      notes,
    } = body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 50000) {
      return NextResponse.json(
        { success: false, message: 'Nominal penarikan minimal Rp 50.000.' },
        { status: 400 }
      );
    }

    if (!bank_name || !account_number || !account_holder) {
      return NextResponse.json(
        { success: false, message: 'Informasi rekening bank tujuan penarikan belum lengkap. Lengkapi kartu rekening terlebih dahulu.' },
        { status: 400 }
      );
    }

    const payoutType = payout_type === 'AM_OVERRIDE' ? 'AM_OVERRIDE' : 'PERSONAL_COMMISSION';
    const prefix = payoutType === 'AM_OVERRIDE' ? 'PO-AM' : 'PO';
    const payoutId = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const payoutItem = {
      id: payoutId,
      partner_id: partner_id || 'partner-active',
      partner_name: partner_name || 'Mitra Partner',
      partner_phone: partner_phone || '08123456789',
      amount: numAmount,
      payout_type: payoutType,
      bank_name,
      account_number,
      account_holder,
      status: 'PENDING',
      notes: notes || (payoutType === 'AM_OVERRIDE' ? 'Penarikan Hak Override AM (5%)' : 'Pengajuan penarikan dana komisi platform'),
      created_at: new Date().toISOString(),
    };

    // Save to Supabase (dual persistence: payout_requests table & affiliate payout history)
    try {
      const supabase = getSupabaseAdmin() || getSupabase();
      if (supabase) {
        try {
          await supabase.from('payout_requests').insert({
            id: payoutId,
            partner_id: payoutItem.partner_id,
            amount: numAmount,
            payout_type: payoutType,
            bank_name,
            account_number,
            account_holder,
            status: 'PENDING',
            notes: payoutItem.notes,
            metadata: {
              notes: payoutItem.notes,
              phone: payoutItem.partner_phone,
              name: payoutItem.partner_name,
              payout_type: payoutType,
            },
            created_at: payoutItem.created_at,
          });
        } catch (tErr) {
          console.warn('Supabase payout_requests table insert note:', tErr);
        }

        if (partner_id && partner_id !== 'partner-active') {
          const { data: aff } = await supabase
            .from('affiliates')
            .select('id, balance, total_withdrawn, payout_bank_details, metadata')
            .eq('id', partner_id)
            .maybeSingle();

          if (aff) {
            const curDetails = aff.payout_bank_details || {};
            const hist = Array.isArray(curDetails.history) ? curDetails.history : [];
            await supabase
              .from('affiliates')
              .update({
                bank_name,
                bank_account_number: account_number,
                bank_account_holder: account_holder,
                payout_bank_details: {
                  ...curDetails,
                  bank_name,
                  account_number,
                  account_holder,
                  history: [payoutItem, ...hist],
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', aff.id);
          }
        }
      }
    } catch (e) {
      console.warn('Supabase payout insert note:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Pengajuan penarikan dana sebesar Rp ${numAmount.toLocaleString('id-ID')} berhasil dibuat! Menunggu verifikasi AM/Manager.`,
      payout: payoutItem,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error requesting payout';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
