import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { calculateFinancialMetrics } from '@/lib/finance-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json({
        success: true,
        visits: 0,
        chat_sessions: 0,
        orders_count: 0,
        total_omzet: 0,
      });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({
        success: true,
        visits: 0,
        chat_sessions: 0,
        orders_count: 0,
        total_omzet: 0,
      });
    }

    // 1. Ambil tenant row untuk ID
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    const tenantId = tenantRow?.id;
    const { searchParams } = new URL(_req.url);
    const startDate = searchParams.get('start_date') || searchParams.get('startDate');
    const endDate = searchParams.get('end_date') || searchParams.get('endDate');
    const effectiveStart = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 2. Hitung Pengunjung Etalase (Visits) dari tracking_sessions, capi_events, & event_ledger
    let sessionsQ = supabase
      .from('tracking_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_slug', slug)
      .gte('created_at', effectiveStart);
    if (endDate) sessionsQ = sessionsQ.lte('created_at', endDate);

    let capiQ = supabase
      .from('capi_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_slug', slug)
      .gte('created_at', effectiveStart);
    if (endDate) capiQ = capiQ.lte('created_at', endDate);

    let ledgerQ = tenantId
      ? supabase
          .from('event_ledger')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${slug},tenant_id.eq.${tenantId}`)
          .gte('created_at', effectiveStart)
      : supabase
          .from('event_ledger')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', slug)
          .gte('created_at', effectiveStart);
    if (endDate) ledgerQ = ledgerQ.lte('created_at', endDate);

    const [sessionsRes, capiRes, ledgerRes] = await Promise.all([
      sessionsQ,
      capiQ,
      ledgerQ,
    ]);

    const totalVisits = (sessionsRes.count || 0) + (capiRes.count || 0) + (ledgerRes.count || 0);

    // 3. Hitung Chat Masuk WA Bot (Conversations)
    let convQuery = tenantId
      ? supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${slug},tenant_slug.eq.${slug},tenant_id.eq.${tenantId}`)
          .gte('updated_at', effectiveStart)
      : supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${slug},tenant_slug.eq.${slug}`)
          .gte('updated_at', effectiveStart);
    if (endDate) convQuery = convQuery.lte('updated_at', endDate);

    const { count: chatSessionsCount } = await convQuery;

    // 4. Hitung Pesanan / Orders (Universal Agnostic Query: tenant_slug ATAU tenant_id)
    let ordersQuery = supabase
      .from('orders')
      .select('id, gross_amount, total_amount, final_amount, amount, total_price, payment_status, status, created_at');

    if (tenantId) {
      ordersQuery = ordersQuery.or(`tenant_slug.eq.${slug},tenant_id.eq.${tenantId}`);
    } else {
      ordersQuery = ordersQuery.eq('tenant_slug', slug);
    }

    ordersQuery = ordersQuery.gte('created_at', effectiveStart);
    if (endDate) ordersQuery = ordersQuery.lte('created_at', endDate);

    const { data: recentOrders } = await ordersQuery;
    const { totalRevenue, totalSuccessfulOrders, aov, pendingVerificationCount } = calculateFinancialMetrics(recentOrders || []);

    return NextResponse.json({
      success: true,
      visits: totalVisits,
      chat_sessions: chatSessionsCount || 0,
      orders_count: recentOrders?.length || 0,
      successful_orders_count: totalSuccessfulOrders,
      total_omzet: totalRevenue,
      aov,
      pending_verification_count: pendingVerificationCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching analytics summary';
    console.error('[Analytics Summary API Error]:', msg);
    return NextResponse.json({
      success: false,
      error: msg,
      visits: 0,
      chat_sessions: 0,
      orders_count: 0,
      total_omzet: 0,
    }, { status: 500 });
  }
}
