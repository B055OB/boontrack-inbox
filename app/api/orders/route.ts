import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

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

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: true, orders: [], count: 0 });
    }

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 500) : 100;

    let targetSlug = tenantSlug || tenantParam.trim();
    let tenantUUID: string | null = null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSlug);

    if (isUuid) {
      tenantUUID = targetSlug;
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', tenantUUID)
        .maybeSingle();
      if (tenantRow?.slug) targetSlug = tenantRow.slug;
    } else if (targetSlug) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', targetSlug)
        .maybeSingle();
      if (tenantRow?.id) tenantUUID = tenantRow.id;
    }

    // 1. QUERY UTAMA: product_orders (transaksi riil checkout)
    let rawProductOrders: any[] = [];
    try {
      let poQuery = supabase.from('product_orders').select('*');

      if (tenantUUID) {
        poQuery = poQuery.eq('tenant_id', tenantUUID);
      } else if (targetSlug) {
        poQuery = poQuery.eq('tenant_slug', targetSlug);
      }

      const { data: poData, error: poErr } = await poQuery
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!poErr && poData && poData.length > 0) {
        rawProductOrders = poData;
      }
    } catch (poErr) {
      console.warn('[Orders API] Warning querying product_orders:', poErr);
    }

    // 2. QUERY CADANGAN: orders riil (hanya jika product_orders kosong dan terfilter tenant)
    if (rawProductOrders.length === 0) {
      try {
        let ordQuery = supabase.from('orders').select('*');
        if (tenantUUID) {
          ordQuery = ordQuery.eq('tenant_id', tenantUUID);
        } else if (targetSlug) {
          ordQuery = ordQuery.eq('tenant_slug', targetSlug);
        }

        const { data: ordersData, error: ordersErr } = await ordQuery
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!ordersErr && ordersData && ordersData.length > 0) {
          // Filter seeder dummy agar tidak menyusup
          rawProductOrders = ordersData.filter(
            (o: any) => !String(o.id || o.order_id || '').includes('1789861911189-646')
          );
        }
      } catch (ordErr) {
        console.warn('[Orders API] Warning querying orders:', ordErr);
      }
    }

    // 3. NORMALISASI DATA UNTUK UI
    const normalizedOrders = rawProductOrders.map((o: any) => {
      const orderId = String(o.order_id || o.id || o.invoice_no || '');
      const rawStatus = String(o.status || o.payment_status || 'PENDING').toUpperCase();
      const grossAmount = Number(o.gross_amount ?? o.total_amount ?? o.amount ?? o.total_price ?? 0);
      const totalAmount = Number(o.total_amount ?? o.gross_amount ?? o.amount ?? o.total_price ?? 0);

      return {
        id: orderId,
        order_id: orderId,
        invoice_no: orderId,
        customer_name: o.customer_name || 'Pelanggan Toko',
        customer_phone: o.customer_phone || '',
        customer_email: o.customer_email || '',
        product_name: o.product_name || o.product_title || 'Pesanan Produk',
        product_title: o.product_title || o.product_name || 'Pesanan Produk',
        items_summary: o.product_name || o.product_title || 'Pesanan Produk',
        gross_amount: grossAmount,
        total_amount: totalAmount,
        status: rawStatus,
        payment_status: rawStatus,
        payment_method: o.payment_method || 'QRIS Dinamis',
        shipping_address: o.shipping_address || null,
        shipping_courier: o.shipping_courier || null,
        shipping_cost: Number(o.shipping_cost || 0),
        unique_code: Number(o.unique_code || 0),
        created_at: o.created_at || new Date().toISOString(),
      };
    });

    normalizedOrders.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
      count: normalizedOrders.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching orders';
    console.error('[Orders API Exception]:', err);
    return NextResponse.json({ success: false, error: msg, orders: [] }, { status: 500 });
  }
}