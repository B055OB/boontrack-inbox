import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/orders/[orderId]/status
 * Endpoint realtime polling status pembayaran order untuk frontend checkout
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId?: string; order_id?: string }> }
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(req.url);

    const rawOrderId =
      resolvedParams?.orderId ||
      resolvedParams?.order_id ||
      searchParams.get('orderId') ||
      searchParams.get('order_id') ||
      searchParams.get('id') ||
      '';

    const orderId = String(rawOrderId).trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, status: 'INVALID_REQUEST', message: 'Parameter orderId wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, status: 'ERROR', message: 'Database connection unreachable' },
        { status: 500 }
      );
    }

    // 1. Cari berdasarkan ID utama
    let order: any = null;
    const { data: primaryOrder, error: pErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (primaryOrder) {
      order = primaryOrder;
    } else {
      // Fallback: coba cari di correlation_id jika ID utama tidak cocok
      try {
        const { data: altOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('correlation_id', orderId)
          .maybeSingle();
        if (altOrder) {
          order = altOrder;
        }
      } catch (altErr) {
        console.debug('[Order Status API] Alt query note:', altErr);
      }
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          status: 'NOT_FOUND',
          order_id: orderId,
          message: `Pesanan #${orderId} tidak ditemukan`,
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
    }

    // 2. Tentukan status pembayaran secara akurat (Single Source of Truth)
    const rawStatus = String(order.status || '').toUpperCase().trim();
    const rawPaymentStatus = String(order.payment_status || '').toUpperCase().trim();
    const rawOrderStatus = String(order.order_status || '').toUpperCase().trim();

    const isPaid =
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawStatus) ||
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawPaymentStatus) ||
      ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawOrderStatus);

    const isExpired =
      ['EXPIRED', 'CANCELLED', 'FAILED'].includes(rawStatus) ||
      ['EXPIRED', 'CANCELLED', 'FAILED'].includes(rawPaymentStatus) ||
      ['EXPIRED', 'CANCELLED', 'FAILED'].includes(rawOrderStatus);

    const finalStatus = isPaid ? 'PAID' : isExpired ? 'EXPIRED' : 'PENDING';

    // 3. Resolusi data fulfillment & payload link secara dinamis dari katalog Supabase jika order belum memuatnya
    let resolvedFulfillment = order.fulfillment_metadata || null;
    let resolvedLinkDigital = order.link_digital || order.download_url || order.fulfillment_metadata?.access_url || null;
    let resolvedFileFormat = order.file_format || null;
    let resolvedButtonText = order.button_text || null;

    if (supabase && (!resolvedLinkDigital || !resolvedFulfillment?.access_url) && order.tenant_slug) {
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
            '';
          resolvedLinkDigital = accUrl || resolvedLinkDigital;
          resolvedFileFormat = matchedProd.promo || matchedProd.format_file || matchedProd.fulfillment_metadata?.file_format || resolvedFileFormat;
          resolvedButtonText = matchedProd.button_text || matchedProd.fulfillment_metadata?.button_text || resolvedButtonText;
          resolvedFulfillment = matchedProd.fulfillment_metadata || (accUrl ? {
            delivery_type: matchedProd.delivery_type || 'DOWNLOAD_LINK',
            access_url: accUrl,
            instructions: matchedProd.instructions || '',
            file_format: resolvedFileFormat || '',
            button_text: resolvedButtonText || '',
          } : resolvedFulfillment);
        }
      } catch (tErr) {
        console.warn('[Order Status API] Tenant product resolution note:', tErr);
      }
    }

    const responsePayload = {
      success: true,
      order_id: order.id,
      status: finalStatus,
      payment_status: isPaid ? 'PAID' : order.payment_status || finalStatus,
      order_status: isPaid ? 'PAID' : order.order_status || finalStatus,
      gross_amount: Number(order.gross_amount ?? order.total_amount ?? order.amount ?? 0),
      customer_name: order.customer_name || null,
      customer_phone: order.customer_phone || null,
      customer_email: order.customer_email || null,
      product_id: order.product_id || null,
      product_title: order.product_title || order.product_name || 'Pesanan Produk',
      tenant_slug: order.tenant_slug || null,
      payment_method: order.payment_method || 'QRIS Dinamis',
      paid_at: order.paid_at || null,
      created_at: order.created_at || null,
      link_digital: resolvedLinkDigital,
      download_url: resolvedLinkDigital,
      fulfillment_metadata: resolvedFulfillment,
      file_format: resolvedFileFormat,
      button_text: resolvedButtonText,
      shipping_address: order.shipping_address || null,
      shipping_courier: order.shipping_courier || null,
      shipping_cost: Number(order.shipping_cost || 0),
      unique_code: Number(order.unique_code || 0),
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Order Status API] Exception:', errorMsg);
    return NextResponse.json(
      { success: false, status: 'ERROR', error: errorMsg },
      { status: 500 }
    );
  }
}
