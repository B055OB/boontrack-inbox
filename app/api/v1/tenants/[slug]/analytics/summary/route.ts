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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 2. Hitung Pengunjung Etalase (Visits) dari tracking_sessions, capi_events, & event_ledger
    const [sessionsRes, capiRes, ledgerRes] = await Promise.all([
      supabase
        .from('tracking_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_slug', slug)
        .gte('created_at', sevenDaysAgo),
      supabase
        .from('capi_events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_slug', slug)
        .gte('created_at', sevenDaysAgo),
      tenantId
        ? supabase
            .from('event_ledger')
            .select('*', { count: 'exact', head: true })
            .or(`tenant_id.eq.${slug},tenant_id.eq.${tenantId}`)
            .gte('created_at', sevenDaysAgo)
        : supabase
            .from('event_ledger')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', slug)
            .gte('created_at', sevenDaysAgo),
    ]);

    const totalVisits = (sessionsRes.count || 0) + (capiRes.count || 0) + (ledgerRes.count || 0);

    // 3. Hitung Chat Masuk WA Bot (Conversations 7 Hari Terakhir)
    const convQuery = tenantId
      ? supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${slug},tenant_slug.eq.${slug},tenant_id.eq.${tenantId}`)
          .gte('updated_at', sevenDaysAgo)
      : supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .or(`tenant_id.eq.${slug},tenant_slug.eq.${slug}`)
          .gte('updated_at', sevenDaysAgo);

    const { count: chatSessionsCount } = await convQuery;

    // 4. Hitung Pesanan / Orders (7 Hari Terakhir)
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, gross_amount, total_amount, payment_status, status, created_at')
      .eq('tenant_slug', slug)
      .gte('created_at', sevenDaysAgo);

    const ordersCount = recentOrders?.length || 0;
    const paidOmzet = (recentOrders || [])
      .filter((o: any) => {
        const s = (o.payment_status || o.status || '').toUpperCase();
        return ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS', 'LUNAS'].includes(s);
      })
      .reduce((sum: number, o: any) => sum + Number(o.gross_amount || o.total_amount || 0), 0);

    return NextResponse.json({
      success: true,
      visits: totalVisits,
      chat_sessions: chatSessionsCount || 0,
      orders_count: ordersCount,
      total_omzet: paidOmzet,
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
