import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database service unavailable' }, { status: 503 });
    }

    // 1. Resolve tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2. Fetch commissions with reseller and order relations
    const { data: commissions, error: cErr } = await supabase
      .from('reseller_commissions')
      .select(`
        id,
        tenant_id,
        reseller_id,
        order_id,
        commission_base,
        commission_rate,
        commission_type,
        commission_amount,
        currency,
        status,
        earned_at,
        approved_at,
        paid_at,
        reversed_at,
        payout_notes,
        metadata,
        created_at,
        store_resellers (
          id,
          code,
          name,
          phone
        ),
        orders (
          id,
          order_number,
          gross_amount,
          customer_name,
          product_title,
          created_at,
          payment_status
        )
      `)
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (cErr) {
      console.warn('[Reseller Commissions GET] Error fetching:', cErr);
      return NextResponse.json({ success: false, error: cErr.message }, { status: 500 });
    }

    const commList = Array.isArray(commissions) ? commissions : [];

    // 3. Count active resellers
    const { count: activeResellerCount } = await supabase
      .from('store_resellers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'ACTIVE');

    // 4. Calculate metrics summary
    let totalOrders = 0;
    let totalGmv = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;

    for (const c of commList) {
      totalOrders += 1;
      totalGmv += Number(c.commission_base || (c.orders as any)?.gross_amount || 0);
      const amt = Number(c.commission_amount || 0);
      if (c.status === 'PAID') {
        totalPaid += amt;
      } else if (c.status !== 'REVERSED') {
        totalOutstanding += amt;
      }
    }

    return NextResponse.json({
      success: true,
      commissions: commList,
      metrics: {
        active_resellers: activeResellerCount || 0,
        total_orders: totalOrders,
        total_gmv: totalGmv,
        total_outstanding_commission: totalOutstanding,
        total_paid_commission: totalPaid,
      },
    });
  } catch (err: any) {
    console.error('[Reseller Commissions GET] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
