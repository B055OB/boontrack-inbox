import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // Query Supabase database murni
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: true, orders: [] });
    }

    let targetSlug = slug;
    // Jika slug berbentuk UUID, selesaikan ke tenant_slug dari tabel tenants
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    if (isUuid) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', slug)
        .maybeSingle();
      if (tenantRow?.slug) {
        targetSlug = tenantRow.slug;
      }
    }

    const { searchParams } = new URL(_req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 5000) : 3500;

    let orders: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let fetchError: any = null;

    while (orders.length < limit) {
      const fetchSize = Math.min(batchSize, limit - orders.length);
      let query = supabase.from('orders').select('*');
      if (targetSlug) {
        query = query.eq('tenant_slug', targetSlug);
      }
      const { data: chunk, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + fetchSize - 1);

      if (error) {
        fetchError = error;
        break;
      }
      if (!chunk || chunk.length === 0) break;
      orders = orders.concat(chunk);
      if (chunk.length < fetchSize) break;
      from += fetchSize;
    }

    if (fetchError && orders.length === 0) {
      // Fallback ke tabel product_orders
      const { data: productOrders } = await supabase
        .from('product_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return NextResponse.json({
        success: true,
        orders: productOrders || [],
      });
    }

    return NextResponse.json({
      success: true,
      orders: orders || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching orders';
    return NextResponse.json({ success: false, error: msg, orders: [] }, { status: 500 });
  }
}
