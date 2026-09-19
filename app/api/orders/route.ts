import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam =
      searchParams.get('tenant') ||
      searchParams.get('tenant_id') ||
      searchParams.get('tenant_slug') ||
      searchParams.get('slug') ||
      '';
    const tenantSlug = normalizeTenantSlug(tenantParam);

    const coreBackendUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.boontrack.com'
    ).replace(/\/$/, '');

    // 1. Coba proxy ke Backend URL jika online
    if (tenantSlug) {
      try {
        const coreRes = await fetch(
          `${coreBackendUrl}/api/v1/orders?tenant=${encodeURIComponent(tenantSlug)}`,
          {
            headers: { 'X-Tenant-ID': tenantSlug },
            cache: 'no-store',
          }
        );
        if (coreRes.ok) {
          const data = await coreRes.json();
          if (data && (Array.isArray(data.orders) || Array.isArray(data.data))) {
            return NextResponse.json(data);
          }
        }
      } catch {
        // Fallback ke Supabase jika Core Backend offline
      }
    }

    // 2. Query Supabase database murni
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: true, orders: [] });
    }

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 5000) : 3500;

    let orders: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let fetchError: any = null;

    while (orders.length < limit) {
      const fetchSize = Math.min(batchSize, limit - orders.length);
      let query = supabase.from('orders').select('*');

      if (tenantParam) {
        if (tenantSlug && tenantSlug !== tenantParam) {
          query = query.or(`tenant_slug.eq.${tenantParam},tenant_id.eq.${tenantParam},tenant_slug.eq.${tenantSlug}`);
        } else {
          query = query.or(`tenant_slug.eq.${tenantParam},tenant_id.eq.${tenantParam}`);
        }
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
      // Coba fallback ke tabel product_orders jika tabel orders berbeda skema
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
