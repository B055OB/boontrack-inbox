import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: commissionId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug || !commissionId) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug and commission ID are required' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const payoutNotes = body.payout_notes ? String(body.payout_notes).trim() : 'Manual bank transfer by merchant';

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    // 1. Resolve tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const paidAt = new Date().toISOString();

    // 2. Update commission status to PAID
    const { data: updated, error: uErr } = await supabase
      .from('reseller_commissions')
      .update({
        status: 'PAID',
        paid_at: paidAt,
        payout_notes: payoutNotes,
        updated_at: paidAt,
      })
      .eq('id', commissionId)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();

    if (uErr) {
      console.error('[Commission Settle PATCH] Update error:', uErr);
      return NextResponse.json({ success: false, error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Komisi reseller berhasil ditandai sebagai PAID (Lunas Ditransfer).',
      commission: updated,
    });
  } catch (err: any) {
    console.error('[Commission Settle PATCH] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
