import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { extractOrderAmount } from '@/lib/finance-engine';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
  validateTenantIdentityConsistency,
  type CanonicalTenantRecord,
  type MerchantSessionPayload,
} from '@/lib/auth/merchant-session';

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

    // ── 1. AUTH GUARD & TENANT ISOLATION (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(_req);
    let merchantAuth: MerchantSessionPayload | null = null;

    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(_req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      merchantAuth = authResult.payload;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database tidak tersedia.', orders: [], count: 0 },
        { status: 503 }
      );
    }

    // ── 2. FAIL-CLOSED CANONICAL TENANT RESOLUTION (§0.14 & §47.3) ──
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

    if (!tenantRow || !tenantRow.id || !tenantRow.slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant tidak ditemukan untuk: ${slug}`, orders: [], count: 0 },
        { status: 404 }
      );
    }

    const targetSlug = String(tenantRow.slug || slug);
    const tenantUuid = String(tenantRow.id || '');
    const canonicalTenant: CanonicalTenantRecord = {
      id: tenantUuid,
      slug: targetSlug,
    };

    // ── 3. STRICT TENANT IDENTITY CONSISTENCY CHECK AGAINST CANONICAL RECORD ──
    // If the signed token contains both tenant slug and tenant UUID, both must agree with that canonical record.
    // Do not accept a matching slug when the UUID contradicts it, or vice versa.
    // Deliberate legacy-token rotation compatibility is preserved when explicitly supported and safe.
    if (!isInternalAuth && merchantAuth) {
      const identityCheck = validateTenantIdentityConsistency(merchantAuth, canonicalTenant);
      if (!identityCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            error: identityCheck.error || 'Forbidden: Kontradiksi identitas tenant.',
            message: identityCheck.error || 'Forbidden: Kontradiksi identitas tenant.',
            orders: [],
            count: 0,
          },
          { status: identityCheck.status }
        );
      }
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
