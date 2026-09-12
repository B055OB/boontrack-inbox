import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTenant = searchParams.get('tenant') || searchParams.get('tenant_slug') || searchParams.get('slug') || '';
    const tenantSlug = normalizeTenantSlug(rawTenant);

    const coreBackendUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://boontrack-core-production.up.railway.app'
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

    let tenantId = '';
    if (tenantSlug) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('slug', tenantSlug)
        .maybeSingle();
      if (tenantRow) {
        tenantId = tenantRow.id;
      }
    }

    let query = supabase.from('orders').select('*');
    if (tenantId && tenantSlug) {
      query = query.or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantId}`);
    } else if (tenantSlug) {
      query = query.eq('tenant_slug', tenantSlug);
    }

    const { data: orders, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
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
