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
      return NextResponse.json({ success: true, orders: [] });
    }

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 500) : 100;

    let targetSlug = tenantSlug || tenantParam.trim();
    // Jika tenantParam berbentuk UUID, selesaikan ke tenant_slug dari tabel tenants
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantParam);
    if (isUuid) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', tenantParam)
        .maybeSingle();
      if (tenantRow?.slug) {
        targetSlug = tenantRow.slug;
      }
    }

    // 1. QUERY UTAMA: Tabel `product_orders` (transaksi riil checkout)
    let rawProductOrders: any[] = [];
    try {
      // Cek variasi filter tenant_id
      const { data: poByTenantId, error: errId } = await supabase
        .from('product_orders')
        .select('*')
        .eq('tenant_id', targetSlug)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!errId && poByTenantId && poByTenantId.length > 0) {
        rawProductOrders = poByTenantId;
      } else {
        // Cek variasi filter tenant_slug
        const { data: poByTenantSlug, error: errSlug } = await supabase
          .from('product_orders')
          .select('*')
          .eq('tenant_slug', targetSlug)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!errSlug && poByTenantSlug && poByTenantSlug.length > 0) {
          rawProductOrders = poByTenantSlug;
        } else {
          // Jika kolom tenant tidak ada di skema product_orders, ambil data order riil
          const { data: poAll, error: errAll } = await supabase
            .from('product_orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

          if (!errAll && poAll && poAll.length > 0) {
            rawProductOrders = poAll;
          }
        }
      }
    } catch (poErr) {
      console.warn('[Orders API] Warning querying product_orders:', poErr);
    }

    // 2. FALLBACK DATABASE RIIL: Tabel `orders` (jika product_orders kosong)
    if (rawProductOrders.length === 0 && targetSlug) {
      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_slug', targetSlug)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!ordersErr && ordersData) {
        rawProductOrders = ordersData;
      }
    }

    // 3. NORMALISASI KOLOM UI RIIL
    // Invoice -> order_id
    // Nominal -> gross_amount / total_amount
    // Status -> status (PAID / PENDING)
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

    // Urutkan descending berdasarkan created_at / order_id
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
