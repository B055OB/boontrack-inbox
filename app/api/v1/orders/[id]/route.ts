import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/v1/orders/[id]
 * Endpoint rincian order dengan Hard-Gate Asset & Fulfillment Link (ACT-02).
 *
 * Security Invariant:
 * Properti `fulfillment_url`, link Google Meet, download link, kredensial/token akses
 * WAJIB bernilai `null` atau di-strip total jika order.payment_status !== 'PAID'.
 * Isolasi tenant: dilarang melakukan cross-tenant template asset fallback.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = String(id || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ORDER_ID', message: 'Parameter id order wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNREACHABLE', message: 'Database connection unreachable.' },
        { status: 500 }
      );
    }

    // 1. Fetch Order dari Supabase (Single Source of Truth)
    let order: any = null;
    const { data: primaryOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (primaryOrder) {
      order = primaryOrder;
    } else {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('correlation_id', orderId)
        .maybeSingle();
      if (altOrder) {
        order = altOrder;
      }
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'ORDER_NOT_FOUND', message: `Pesanan #${orderId} tidak ditemukan.` },
        { status: 404 }
      );
    }

    // 2. Tentukan status pembayaran secara ketat
    const rawStatus = String(order.status || '').toUpperCase().trim();
    const rawPaymentStatus = String(order.payment_status || '').toUpperCase().trim();
    const rawOrderStatus = String(order.order_status || '').toUpperCase().trim();

    const isPaid =
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawStatus) ||
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawPaymentStatus) ||
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawOrderStatus);

    // 3. Resolusi fulfillment HANYA jika status = PAID dengan isolasi tenant ketat
    let resolvedFulfillmentUrl: string | null = null;
    let resolvedDownloadUrl: string | null = null;
    let resolvedGoogleMeetUrl: string | null = null;
    let resolvedCredentials: any = null;
    let resolvedLicenseKey: string | null = null;
    let resolvedFulfillmentMetadata: any = null;

    if (isPaid) {
      // Ambil data dari kolom order langsung terlebih dahulu
      resolvedFulfillmentUrl =
        order.fulfillment_metadata?.access_url ||
        order.download_url ||
        order.link_digital ||
        null;
      resolvedDownloadUrl = resolvedFulfillmentUrl;
      resolvedGoogleMeetUrl =
        order.fulfillment_metadata?.meeting_url ||
        order.fulfillment_metadata?.google_meet_url ||
        null;
      resolvedCredentials = order.fulfillment_metadata?.credentials || null;
      resolvedLicenseKey = order.license_key || order.fulfillment_metadata?.license_key || null;
      resolvedFulfillmentMetadata = order.fulfillment_metadata || null;

      // Jika belum lengkap di kolom order, ambil dari katalog tenant terisolasi (NO CROSS-TENANT)
      if ((!resolvedFulfillmentUrl || !resolvedFulfillmentMetadata) && order.tenant_slug) {
        try {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', order.tenant_slug)
            .maybeSingle();

          const prods = Array.isArray(tenantRow?.metadata?.products) ? tenantRow.metadata.products : [];
          const pId = String(order.product_id || '').trim();
          const pTitle = String(order.product_title || '').trim().toLowerCase();

          const matchedProd = prods.find((p: any) =>
            (pId && (String(p.id) === pId || String(p.sku) === pId || String(p.slug) === pId)) ||
            (pTitle && p.name && p.name.trim().toLowerCase() === pTitle)
          );

          if (matchedProd) {
            const accUrl =
              matchedProd.download_url ||
              matchedProd.fulfillment_metadata?.access_url ||
              matchedProd.link_digital ||
              matchedProd.access_url ||
              null;

            resolvedFulfillmentUrl = accUrl || resolvedFulfillmentUrl;
            resolvedDownloadUrl = resolvedFulfillmentUrl;
            resolvedGoogleMeetUrl =
              matchedProd.fulfillment_metadata?.meeting_url ||
              matchedProd.fulfillment_metadata?.google_meet_url ||
              resolvedGoogleMeetUrl;
            resolvedFulfillmentMetadata = matchedProd.fulfillment_metadata || (accUrl ? {
              delivery_type: matchedProd.delivery_type || 'DOWNLOAD_LINK',
              access_url: accUrl,
              instructions: matchedProd.instructions || '',
            } : resolvedFulfillmentMetadata);
          }
        } catch (tErr) {
          console.warn('[Order API ACT-02] Tenant product resolution note:', tErr);
        }
      }
    }

    // 4. SANITASI MUTLAK: Jika belum PAID, seluruh properti fulfillment WAJIB null / stripped
    const responsePayload = {
      success: true,
      order_id: order.id,
      correlation_id: order.correlation_id || null,
      status: isPaid ? 'PAID' : (order.status || 'PENDING'),
      payment_status: isPaid ? 'PAID' : (order.payment_status || 'UNPAID'),
      order_status: isPaid ? 'COMPLETED' : (order.order_status || 'PENDING'),
      gross_amount: Number(order.gross_amount ?? order.total_amount ?? 0),
      tenant_slug: order.tenant_slug || null,
      customer_name: order.customer_name || null,
      customer_email: order.customer_email || null,
      customer_phone: order.customer_phone || null,
      product_id: order.product_id || null,
      product_title: order.product_title || order.product_name || 'Pesanan Produk',
      paid_at: isPaid ? (order.paid_at || order.updated_at) : null,
      created_at: order.created_at || null,

      // Hard-Gated Asset & Fulfillment Properties (ACT-02)
      fulfillment_url: isPaid ? resolvedFulfillmentUrl : null,
      download_url: isPaid ? resolvedDownloadUrl : null,
      link_digital: isPaid ? resolvedFulfillmentUrl : null,
      access_url: isPaid ? resolvedFulfillmentUrl : null,
      google_meet_url: isPaid ? resolvedGoogleMeetUrl : null,
      meeting_link: isPaid ? resolvedGoogleMeetUrl : null,
      credentials: isPaid ? resolvedCredentials : null,
      license_key: isPaid ? resolvedLicenseKey : null,
      fulfillment_metadata: isPaid ? resolvedFulfillmentMetadata : null,
      briefing_url: isPaid ? (order.briefing_url || null) : null,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Order API ACT-02] Exception:', errorMsg);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 }
    );
  }
}
