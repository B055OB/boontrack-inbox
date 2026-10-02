import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Helper to process fulfillment query with ACT-02 Hard-Gate Sanitization.
 */
async function processFulfillmentRequest(orderIdParam: string) {
  const orderId = String(orderIdParam || '').trim();

  if (!orderId) {
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message: 'Parameter order_id wajib diisi.' },
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

  // 1. Fetch Order dari Supabase
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

  // 2. Evaluasi status pembayaran
  const rawStatus = String(order.status || '').toUpperCase().trim();
  const rawPaymentStatus = String(order.payment_status || '').toUpperCase().trim();
  const rawOrderStatus = String(order.order_status || '').toUpperCase().trim();

  const isPaid =
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawStatus) ||
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawPaymentStatus) ||
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawOrderStatus);

  // 3. HARD-GATE ASSET & FULFILLMENT LINK (ACT-02):
  // Jika order belum lunas (UNPAID / PENDING), tolak dan strip total seluruh aset fulfillment!
  if (!isPaid) {
    return NextResponse.json(
      {
        success: false,
        status: 'UNPAID',
        error: 'FULFILLMENT_LOCKED',
        message: 'Akses fulfillment terkunci hingga pembayaran terverifikasi lunas (PAID).',
        order_id: order.id,
        payment_status: order.payment_status || order.status || 'UNPAID',
        fulfillment_url: null,
        download_url: null,
        link_digital: null,
        access_url: null,
        google_meet_url: null,
        meeting_link: null,
        credentials: null,
        license_key: null,
        fulfillment_metadata: null,
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  }

  // 4. Resolusi fulfillment terisolasi per tenant (NO CROSS-TENANT INHERITANCE)
  let resolvedAccessUrl =
    order.fulfillment_metadata?.access_url ||
    order.download_url ||
    order.link_digital ||
    null;
  let resolvedGoogleMeet =
    order.fulfillment_metadata?.meeting_url ||
    order.fulfillment_metadata?.google_meet_url ||
    null;
  let resolvedCredentials = order.fulfillment_metadata?.credentials || null;
  let resolvedLicenseKey = order.license_key || order.fulfillment_metadata?.license_key || null;
  let resolvedInstructions = order.fulfillment_metadata?.instructions || null;

  if ((!resolvedAccessUrl) && order.tenant_slug) {
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
        resolvedAccessUrl =
          matchedProd.download_url ||
          matchedProd.fulfillment_metadata?.access_url ||
          matchedProd.link_digital ||
          matchedProd.access_url ||
          null;
        resolvedGoogleMeet =
          matchedProd.fulfillment_metadata?.meeting_url ||
          matchedProd.fulfillment_metadata?.google_meet_url ||
          resolvedGoogleMeet;
        resolvedInstructions = matchedProd.fulfillment_metadata?.instructions || matchedProd.instructions || resolvedInstructions;
      }
    } catch (tErr) {
      console.warn('[Fulfillment API ACT-02] Tenant product resolution note:', tErr);
    }
  }

  return NextResponse.json(
    {
      success: true,
      status: 'PAID',
      order_id: order.id,
      tenant_slug: order.tenant_slug,
      product_title: order.product_title || order.product_name,
      paid_at: order.paid_at || order.updated_at,
      fulfillment_url: resolvedAccessUrl,
      download_url: resolvedAccessUrl,
      link_digital: resolvedAccessUrl,
      access_url: resolvedAccessUrl,
      google_meet_url: resolvedGoogleMeet,
      meeting_link: resolvedGoogleMeet,
      credentials: resolvedCredentials,
      license_key: resolvedLicenseKey,
      instructions: resolvedInstructions,
      fulfillment_metadata: {
        access_url: resolvedAccessUrl,
        instructions: resolvedInstructions,
        google_meet_url: resolvedGoogleMeet,
        credentials: resolvedCredentials,
        license_key: resolvedLicenseKey,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}

/**
 * GET /api/v1/fulfillment?order_id=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId =
      searchParams.get('order_id') ||
      searchParams.get('orderId') ||
      searchParams.get('id') ||
      searchParams.get('token') ||
      '';

    return await processFulfillmentRequest(orderId);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/fulfillment
 * Body: { order_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body fallback
    }

    const { searchParams } = new URL(req.url);
    const orderId =
      body.order_id ||
      body.orderId ||
      body.id ||
      body.token ||
      searchParams.get('order_id') ||
      searchParams.get('orderId') ||
      '';

    return await processFulfillmentRequest(orderId);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: errorMsg },
      { status: 500 }
    );
  }
}
