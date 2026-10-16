import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { extractOrderAmount } from '@/lib/finance-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_IDENTIFIER_REQUIRED', message: 'Identifier tenant wajib diisi.', orders: [], count: 0 },
        { status: 400 }
      );
    }

    // ── AUTH GUARD & TENANT ISOLATION (P0 SECURITY) ──
    const cleanCookie = (val?: string | null) => {
      if (!val) return '';
      try {
        return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
      } catch {
        return val.toLowerCase().trim();
      }
    };

    const cookieStore =
      cleanCookie(_req.cookies.get('merchant_store')?.value) ||
      cleanCookie(_req.cookies.get('merchant_session')?.value) ||
      cleanCookie(_req.cookies.get('bt_tenant')?.value);

    const headerTenant = cleanCookie(
      _req.headers.get('x-tenant-slug') || _req.headers.get('x-tenant-id')
    );

    const authHeader = _req.headers.get('authorization')?.trim();
    const internalSecret = _req.headers.get('x-internal-secret')?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

    const isInternalAuth =
      (envAdminSecret && (internalSecret === envAdminSecret || authHeader === `Bearer ${envAdminSecret}`)) ||
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);

    const normalizedReqSlug = slug.toLowerCase().trim();

    // Early fail-closed on missing authentication
    if (!isInternalAuth && !cookieStore && !headerTenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan untuk mengakses daftar pesanan.', message: 'Unauthorized: Sesi login merchant diperlukan untuk mengakses daftar pesanan.', orders: [], count: 0 },
        { status: 401 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const cookieMatchesReqSlug = cookieStore === normalizedReqSlug;
    const headerMatchesReqSlug = headerTenant === normalizedReqSlug;
    if (!isInternalAuth && !isUuid && !cookieMatchesReqSlug && !headerMatchesReqSlug) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Akses ditolak untuk tenant ini.', message: 'Unauthorized: Akses ditolak untuk tenant ini.', orders: [], count: 0 },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database tidak tersedia.', orders: [], count: 0 },
        { status: 503 }
      );
    }

    // Fail-Closed Tenant Resolution (§0.14 & §47.3)
    let tenantQuery = supabase.from('tenants').select('id, slug');
    if (isUuid) {
      tenantQuery = tenantQuery.eq('id', slug);
    } else {
      tenantQuery = tenantQuery.eq('slug', slug);
    }
    const { data: tenantRow, error: tenantErr } = await tenantQuery.maybeSingle();

    if (tenantErr) {
      console.error('[Tenant Orders API] Tenant resolution error:', tenantErr);
      return NextResponse.json(
        { success: false, error: 'TENANT_LOOKUP_FAILED', message: tenantErr.message, orders: [], count: 0 },
        { status: 503 }
      );
    }

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant tidak ditemukan untuk: ${slug}`, orders: [], count: 0 },
        { status: 404 }
      );
    }

    const targetSlug = String(tenantRow.slug || slug);
    const tenantUuid = String(tenantRow.id || '');

    const normalizedTargetSlug = targetSlug.toLowerCase().trim();
    const normalizedTargetUuid = tenantUuid.toLowerCase().trim();

    const isAuthorized =
      isInternalAuth ||
      (cookieStore && (cookieStore === normalizedTargetSlug || cookieStore === normalizedTargetUuid)) ||
      (headerTenant && (headerTenant === normalizedTargetSlug || headerTenant === normalizedTargetUuid));

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan untuk mengakses daftar pesanan.', message: 'Sesi login merchant diperlukan untuk mengakses daftar pesanan.', orders: [], count: 0 },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(_req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 500) : 100;
    const startDate = searchParams.get('start_date') || searchParams.get('startDate');
    const endDate = searchParams.get('end_date') || searchParams.get('endDate');

    // Soft-Archive Query Filter
    const archiveParam = searchParams.get('archived') || searchParams.get('is_archived') || '';
    const includeArchivedParam = searchParams.get('include_archived') === 'true' || archiveParam === 'all';

    // QUERY LANGSUNG KE TABEL orders (SINGLE SOURCE OF TRUTH)
    // Isolasi ketat: tenant_slug ATAU tenant_id (UUID)
    let query = supabase.from('orders').select('*');

    if (targetSlug && tenantUuid) {
      query = query.or(`tenant_slug.eq.${targetSlug},tenant_id.eq.${tenantUuid}`);
    } else if (targetSlug) {
      query = query.eq('tenant_slug', targetSlug);
    } else if (tenantUuid) {
      query = query.eq('tenant_id', tenantUuid);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    if (archiveParam === 'true' || archiveParam === 'only') {
      query = query.eq('is_archived', true);
    } else if (!includeArchivedParam) {
      query = query.or('is_archived.is.null,is_archived.eq.false');
    }

    let { data: ordersData, error: ordersErr } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    // Resilient Schema Fallback jika kolom is_archived melempar error
    if (ordersErr && (ordersErr.message?.includes('is_archived') || ordersErr.message?.includes('does not exist'))) {
      console.warn('[Tenant Orders API] is_archived query fallback triggered:', ordersErr.message);
      let fallbackQuery = supabase.from('orders').select('*');
      if (targetSlug && tenantUuid) {
        fallbackQuery = fallbackQuery.or(`tenant_slug.eq.${targetSlug},tenant_id.eq.${tenantUuid}`);
      } else if (targetSlug) {
        fallbackQuery = fallbackQuery.eq('tenant_slug', targetSlug);
      } else if (tenantUuid) {
        fallbackQuery = fallbackQuery.eq('tenant_id', tenantUuid);
      }
      if (startDate) fallbackQuery = fallbackQuery.gte('created_at', startDate);
      if (endDate) fallbackQuery = fallbackQuery.lte('created_at', endDate);

      const retryRes = await fallbackQuery
        .order('created_at', { ascending: false })
        .limit(limit);
      ordersData = retryRes.data;
      ordersErr = retryRes.error;

      if (Array.isArray(ordersData)) {
        if (archiveParam === 'true' || archiveParam === 'only') {
          ordersData = ordersData.filter((o: any) => Boolean(o.is_archived || o.metadata?.is_archived));
        } else if (!includeArchivedParam) {
          ordersData = ordersData.filter((o: any) => !Boolean(o.is_archived || o.metadata?.is_archived));
        }
      }
    }

    if (ordersErr) {
      console.error('[Tenant Orders API] Database query error:', ordersErr);
      return NextResponse.json(
        { success: false, error: 'ORDER_LOOKUP_FAILED', message: ordersErr.message, orders: [], count: 0 },
        { status: 503 }
      );
    }

    const rawOrders = Array.isArray(ordersData) ? ordersData : [];

    // Normalisasi kolom DTO tervalidasi (semua field string wajib dijamin non-undefined)
    const normalizedOrders = rawOrders.map((o: any) => {
      const orderId = String(o.id || o.order_id || o.invoice_no || '');
      const orderNum = String(o.order_number || o.id || o.order_id || orderId);
      const rawStatus = String(o.status || o.payment_status || 'PENDING').toUpperCase();
      const grossAmount = extractOrderAmount(o);
      const buyerName = String(o.customer_name || 'Pelanggan Toko');

      return {
        id: orderId,
        order_id: orderId,
        order_number: orderNum,
        invoice_no: orderNum,
        tenant_slug: String(o.tenant_slug || targetSlug),
        product_id: String(o.product_id || ''),
        product_name: String(o.product_title || o.product_name || 'Pesanan Produk'),
        product_title: String(o.product_title || o.product_name || 'Pesanan Produk'),
        items_summary: String(o.product_title || o.product_name || 'Pesanan Produk'),
        customer_name: buyerName,
        buyer_name: buyerName,
        customer_phone: String(o.customer_phone || ''),
        customer_email: String(o.customer_email || ''),
        gross_amount: grossAmount,
        total_amount: grossAmount,
        status: rawStatus,
        payment_status: rawStatus,
        payment_method: String(o.payment_method || 'QRIS Dinamis'),
        shipping_address: o.shipping_address || null,
        shipping_courier: o.shipping_courier || null,
        shipping_cost: Number(o.shipping_cost || 0),
        unique_code: Number(o.unique_code || 0),
        is_archived: Boolean(o.is_archived || o.metadata?.is_archived),
        created_at: String(o.created_at || new Date().toISOString()),
      };
    });

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
      count: normalizedOrders.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching orders';
    console.error('[Tenant Orders API Exception]:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: msg, orders: [], count: 0 }, { status: 500 });
  }
}
