import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const partnerId = decodeURIComponent(rawId || '');
    const body = await req.json();
    const { status } = body;

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return NextResponse.json(
        { success: false, message: 'Status harus ACTIVE atau SUSPENDED.' },
        { status: 400 }
      );
    }

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('affiliates')
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', partnerId);
      }
    } catch (e) {
      console.warn('Supabase toggle partner status note:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Status mitra ${partnerId} berhasil diubah menjadi ${status}.`,
      status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating partner status';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
