import { NextResponse } from 'next/server';
import { INITIAL_PAYOUTS, PayoutRequestItem } from '@/lib/partner-service';
import { getSupabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('payout_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: PayoutRequestItem[] = data.map((p: any) => ({
          id: p.id,
          partner_id: p.partner_id || 'unknown',
          partner_name: p.metadata?.name || 'Mitra Partner',
          partner_phone: p.metadata?.phone || '-',
          amount: Number(p.amount) || 0,
          bank_name: p.bank_name || 'BCA',
          account_number: p.account_number || '-',
          account_holder: p.account_holder || '-',
          status: (p.status as 'PENDING' | 'PAID' | 'REJECTED') || 'PENDING',
          proof_url: p.proof_url,
          notes: p.notes || p.metadata?.notes,
          created_at: p.created_at || new Date().toISOString(),
          paid_at: p.paid_at,
        }));
        return NextResponse.json({ success: true, payouts: mapped });
      }
    }
  } catch (err) {
    console.warn('Supabase fetch payouts note:', err);
  }

  return NextResponse.json({ success: true, payouts: INITIAL_PAYOUTS });
}
