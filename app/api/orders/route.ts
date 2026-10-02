import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { extractOrderAmount } from '@/lib/finance-engine';
import { orderEventBus } from '@/lib/email/order-event-bus';
import { normalizeBriefingUrl } from '@/lib/product-catalog';

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
    let tenantUuid: string | null = null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSlug);

    // Resolve BOTH tenant_slug and tenant_id (UUID) from Supabase tenants table
    try {
      let tenantQuery = supabase.from('tenants').select('id, slug');
      if (isUuid) {
        tenantQuery = tenantQuery.eq('id', targetSlug);
      } else {
        tenantQuery = tenantQuery.eq('slug', targetSlug);
      }
      const { data: tenantRow } = await tenantQuery.maybeSingle();

      if (tenantRow) {
        targetSlug = tenantRow.slug || targetSlug;
        tenantUuid = tenantRow.id || null;
      } else if (isUuid) {
        tenantUuid = targetSlug;
      }
    } catch (resolveErr) {
      console.warn('[Orders API] Tenant resolution note:', resolveErr);
    }

    if (!targetSlug && !tenantUuid) {
      return NextResponse.json({ success: true, orders: [], count: 0 });
    }

    // ── AUTH GUARD & TENANT ISOLATION (P0 SECURITY) ──
    const cleanCookie = (val?: string) => {
      if (!val) return '';
      try {
        return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
      } catch {
        return val.toLowerCase().trim();
      }
    };

    const cookieStore =
      cleanCookie(req.cookies.get('merchant_store')?.value) ||
      cleanCookie(req.cookies.get('merchant_session')?.value) ||
      cleanCookie(req.cookies.get('bt_tenant')?.value);

    const normalizedTarget = (targetSlug || '').toLowerCase().trim();

    if (!cookieStore || cookieStore !== normalizedTarget) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan untuk mengakses daftar pesanan.' },
        { status: 401 }
      );
    }

    const startDate = searchParams.get('start_date') || searchParams.get('startDate');
    const endDate = searchParams.get('end_date') || searchParams.get('endDate');

    // QUERY LANGSUNG KE TABEL orders (SINGLE SOURCE OF TRUTH)
    // Mencakup pencocokan ganda: tenant_slug ATAU tenant_id (UUID)
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

    // Soft-Archive Query Filter (SPRINT 3)
    const archiveParam = searchParams.get('archived') || searchParams.get('is_archived') || '';
    const includeArchivedParam = searchParams.get('include_archived') === 'true' || archiveParam === 'all';

    if (archiveParam === 'true' || archiveParam === 'only') {
      // Hanya pesanan yang diarsipkan
      query = query.eq('is_archived', true);
    } else if (!includeArchivedParam) {
      // Default: Pesanan Aktif (mengecualikan order yang diarsipkan)
      query = query.or('is_archived.is.null,is_archived.eq.false');
    }

    const { data: ordersData, error: ordersErr } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (ordersErr) {
      console.error('[Orders API] Database query error:', ordersErr);
      return NextResponse.json({ success: false, error: ordersErr.message, orders: [], count: 0 }, { status: 500 });
    }

    const rawOrders = ordersData || [];

    // Normalisasi kolom UI riil
    const normalizedOrders = rawOrders.map((o: any) => {
      const orderId = String(o.id || o.order_id || o.invoice_no || '');
      const rawStatus = String(o.status || o.payment_status || 'PENDING').toUpperCase();
      const grossAmount = extractOrderAmount(o);

      return {
        id: orderId,
        order_id: orderId,
        invoice_no: orderId,
        tenant_slug: o.tenant_slug || targetSlug,
        product_id: o.product_id || '',
        product_name: o.product_title || o.product_name || 'Pesanan Produk',
        product_title: o.product_title || o.product_name || 'Pesanan Produk',
        items_summary: o.product_title || o.product_name || 'Pesanan Produk',
        customer_name: o.customer_name || 'Pelanggan Toko',
        customer_phone: o.customer_phone || '',
        customer_email: o.customer_email || '',
        gross_amount: grossAmount,
        total_amount: grossAmount,
        status: rawStatus,
        payment_status: rawStatus,
        payment_method: o.payment_method || 'QRIS Dinamis',
        shipping_address: o.shipping_address || null,
        shipping_courier: o.shipping_courier || null,
        shipping_cost: Number(o.shipping_cost || 0),
        unique_code: Number(o.unique_code || 0),
        briefing_url: o.briefing_url || o.customer_briefing?.briefing_url || null,
        customer_briefing: o.customer_briefing || (o.briefing_url ? { briefing_url: o.briefing_url } : null),
        is_archived: Boolean(o.is_archived),
        created_at: o.created_at || new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
      count: normalizedOrders.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching orders';
    console.error('[Orders API Exception]:', err);
    return NextResponse.json({ success: false, error: msg, orders: [], count: 0 }, { status: 500 });
  }
}

/**
 * POST /api/orders
 * Ingress endpoint pembuatan order / penangkapan konteks tracking sesi pembeli.
 * Menangkap Client IP Address dari request headers dan menyimpan seluruh tracking_context
 * ke kolom metadata.tracking_context pada tabel orders di Supabase.
 * Sesuai ARCHITECTURE.md §20, §21.5, dan §27.1
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin() || getSupabase();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database unreachable' },
        { status: 500 }
      );
    }

    // 1. Tangkap Client IP Address asli pembeli dari server-side headers
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      null;

    const userAgentHeader = req.headers.get('user-agent') || null;

    // 2. Rekonstruksi tracking_context
    const rawContext = body.tracking_context || body.trackingContext || {};
    const trackingContext = {
      fbp: rawContext.fbp || body.fbp || null,
      fbc: rawContext.fbc || body.fbc || null,
      client_user_agent: rawContext.client_user_agent || body.client_user_agent || userAgentHeader,
      client_ip_address: clientIp || rawContext.client_ip_address || null,
      source_url: rawContext.source_url || body.source_url || req.headers.get('referer') || null,
    };

    const rawOrderId = body.order_id || body.orderId || body.id || '';
    const orderId = String(rawOrderId).trim();

    // Skenario A: Update tracking_context pada order yang sudah diterbitkan
    if (orderId) {
      const { data: existingOrder, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (existingOrder) {
        const mergedMetadata = {
          ...(existingOrder.metadata || {}),
          tracking_context: {
            ...(existingOrder.metadata?.tracking_context || {}),
            ...trackingContext,
          },
        };

        const updatePayload: any = {
          metadata: mergedMetadata,
        };

        if (body.briefing_url) {
          updatePayload.briefing_url = normalizeBriefingUrl(body.briefing_url);
        }
        if (body.customer_briefing) {
          updatePayload.customer_briefing = body.customer_briefing;
        }

        const { error: updateErr } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId);

        if (updateErr) {
          console.warn('[Orders API POST] Note updating metadata on order:', updateErr.message);
        }

        // Simpan juga ke order_items metadata sebagai fallback persistensi
        try {
          const { data: mainItem } = await supabase
            .from('order_items')
            .select('id, metadata')
            .eq('order_id', orderId)
            .eq('item_type', 'main')
            .maybeSingle();

          if (mainItem) {
            await supabase
              .from('order_items')
              .update({
                metadata: {
                  ...(mainItem.metadata || {}),
                  tracking_context: {
                    ...(mainItem.metadata?.tracking_context || {}),
                    ...trackingContext,
                  },
                },
              })
              .eq('id', mainItem.id);
          }
        } catch {}

        return NextResponse.json({
          success: true,
          order_id: orderId,
          tracking_context: trackingContext,
          message: 'Tracking context successfully recorded to order metadata',
        });
      } else if (body.tenant_slug || body.customer_name || body.total_amount || body.amount) {
        const gross = Number(body.total_amount || body.amount || body.gross_amount || 0);
        const now = new Date().toISOString();

        const insertPayload = sanitizeOrderPayload({
          id: orderId,
          tenant_slug: body.tenant_slug || '',
          tenant_id: body.tenant_id || null,
          product_id: body.product_id || 'prod_default',
          product_title: body.product_title || body.product_name || 'Pesanan Produk',
          customer_name: body.customer_name || 'Pelanggan Toko',
          customer_phone: body.customer_phone || '',
          customer_email: body.customer_email || null,
          gross_amount: gross,
          payment_status: 'PENDING',
          order_status: 'PENDING',
          status: 'PENDING',
          created_at: now,
          updated_at: now,
        });

        let { error: insertErr } = await supabase.from('orders').insert(insertPayload);
        if (insertErr) {
          console.warn('[Orders API POST] Primary insert failed, retrying with core fields:', insertErr);
          const corePayload = {
            id: orderId,
            tenant_slug: body.tenant_slug || '',
            tenant_id: body.tenant_id || null,
            product_id: body.product_id || 'prod_default',
            product_title: body.product_title || body.product_name || 'Pesanan Produk',
            gross_amount: gross,
            customer_name: body.customer_name || 'Pelanggan Toko',
            customer_phone: body.customer_phone || '',
            status: 'PENDING',
            created_at: now,
            updated_at: now,
          };
          await supabase.from('orders').insert(corePayload);
        }

        // Asynchronously dispatch ORDER_CREATED notification to buyer (Non-blocking)
        if (insertPayload.customer_email && insertPayload.customer_email.includes('@')) {
          orderEventBus
            .publishOrderCreated({
              order_id: orderId,
              tenant_slug: body.tenant_slug || '',
              tenant_id: body.tenant_id || null,
              customer_name: body.customer_name || 'Pelanggan Toko',
              customer_email: insertPayload.customer_email,
              customer_phone: body.customer_phone || null,
              items: [
                {
                  id: body.product_id || 'prod_default',
                  name: body.product_title || body.product_name || 'Pesanan Produk',
                  quantity: 1,
                  price: gross,
                  total: gross,
                },
              ],
              total_amount: gross,
              payment_method: body.payment_method || 'Transfer Bank / QRIS',
              unique_code: body.unique_code || body.uniqueCode || undefined,
            })
            .catch((err) => console.warn('[Orders API] Order created email dispatch note:', err));
        }

        return NextResponse.json({
          success: true,
          order_id: orderId,
          status: 'PENDING',
          payment_status: 'PENDING',
          order_status: 'PENDING',
          tracking_context: trackingContext,
          message: 'Order pre-created with PENDING status and tracking context',
        });
      }
    }

    return NextResponse.json({
      success: true,
      tracking_context: trackingContext,
      message: 'Tracking context captured from request headers',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error processing order context';
    console.error('[Orders API POST Exception]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}