import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      partner_id,
      partner_name,
      partner_phone,
      amount,
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

    const payoutId = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const payoutItem = {
      id: payoutId,
      partner_id: partner_id || 'partner-active',
      partner_name: partner_name || 'Mitra Partner',
      partner_phone: partner_phone || '08123456789',
      amount: numAmount,
      bank_name,
      account_number,
      account_holder,
      status: 'PENDING',
      notes: notes || 'Pengajuan penarikan dana komisi platform',
      created_at: new Date().toISOString(),
    };

    // Try saving to Supabase if table exists
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('payout_requests').insert({
          id: payoutId,
          partner_id: payoutItem.partner_id,
          amount: numAmount,
          bank_name,
          account_number,
          account_holder,
          status: 'PENDING',
          metadata: { notes: payoutItem.notes, phone: payoutItem.partner_phone, name: payoutItem.partner_name },
          created_at: payoutItem.created_at,
        });
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
