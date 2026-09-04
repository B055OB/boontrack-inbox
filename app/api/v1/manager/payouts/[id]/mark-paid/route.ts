import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const payoutId = decodeURIComponent(rawId || '');
    const body = await req.json();
    const { proof_url, notes } = body;

    if (!proof_url) {
      return NextResponse.json(
        { success: false, message: 'URL bukti transfer bank wajib diisi.' },
        { status: 400 }
      );
    }

    const paidAt = new Date().toISOString();

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('payout_requests').update({
          status: 'PAID',
          proof_url,
          paid_at: paidAt,
          notes: notes || 'Pembayaran telah ditransfer dan diverifikasi.',
          updated_at: paidAt,
        }).eq('id', payoutId);
      }
    } catch (e) {
      console.warn('Supabase mark payout paid note:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Permohonan payout ${payoutId} berhasil ditandai LUNAS (PAID).`,
      payout: {
        id: payoutId,
        status: 'PAID',
        proof_url,
        paid_at: paidAt,
        notes,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error marking payout as paid';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
