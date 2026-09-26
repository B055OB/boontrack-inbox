import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  dispatchMetaCAPIEvent,
  checkAdsTrackingEntitlement,
  MetaCAPIEventName,
} from '@/lib/capi.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/tracking/capi
 * Multi-Stage Meta Conversions API (CAPI) Gateway Endpoint
 *
 * Mendukung tahapan konversi:
 * 1. 'Lead': Saat user pertama kali memicu tombol paket / submit info
 * 2. 'InitiateCheckout': Saat QRIS PT atau payment link diterbitkan
 * 3. 'Purchase': Saat order terkonfirmasi PAID
 *
 * Menyimpan parameter atribusi ctwa_clid (Click-to-WhatsApp) tanpa menimpa order_id/session_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenantSlug,
      eventName,
      eventId,
      orderId,
      amount,
      currency,
      customerPhone,
      customerName,
      customerEmail,
      ctwa_clid,
      ctwaClid,
      contentName,
      contentIds,
      contentType,
      testEventCode,
      fbc,
      fbp,
      userAgent,
      ipAddress,
      customData,
    } = body;

    const cleanSlug = String(tenantSlug || '').trim().toLowerCase();
    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'tenantSlug is required' },
        { status: 400 }
      );
    }

    const validEventNames: MetaCAPIEventName[] = ['Lead', 'InitiateCheckout', 'Purchase'];
    const resolvedEventName: MetaCAPIEventName = validEventNames.includes(eventName)
      ? eventName
      : 'Lead';

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable' },
        { status: 500 }
      );
    }

    // 1. Single Source of Truth: Ambil data tenant & konfigurasi pixel dari database
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, tier, plan, metadata')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // 2. Entitlement Check: Cek apakah tenant berhak atas CAPI (Pro Scale, Enterprise, etc.)
    const isEntitled = await checkAdsTrackingEntitlement(supabase, tenant.id);
    if (!isEntitled) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'Tenant tier not entitled for server-side CAPI tracking'
      });
    }

    const pixelConfig = tenant.metadata?.pixel_config || {};
    const trackingMeta = tenant.metadata?.tracking || {};
    const metaPixelId =
      trackingMeta.meta_pixel_id ||
      pixelConfig.meta_pixel_id ||
      tenant.metadata?.meta_pixel_id ||
      tenant.metadata?.pixel_id ||
      tenant.metadata?.facebook_pixel_id;
    const metaAccessToken =
      trackingMeta.meta_access_token ||
      pixelConfig.meta_access_token ||
      tenant.metadata?.meta_access_token ||
      tenant.metadata?.facebook_access_token;

    if (!metaPixelId || !metaAccessToken) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'Meta Pixel ID or Access Token not configured for this tenant'
      });
    }

    const finalTestEventCode =
      testEventCode ||
      trackingMeta.test_event_code ||
      trackingMeta.meta_test_event_code ||
      tenant.metadata?.capi_test_event_code ||
      pixelConfig.meta_test_event_code ||
      pixelConfig.test_event_code ||
      tenant.metadata?.meta_test_event_code ||
      process.env.META_CAPI_TEST_EVENT_CODE ||
      undefined;

    const resolvedCtwaClid = ctwa_clid || ctwaClid || null;

    // Deduplication Key: Event Purchase WAJIB identik dengan browser pixel: PURCHASE_${orderId}
    let resolvedEventId = eventId;
    if (!resolvedEventId) {
      if (resolvedEventName === 'Purchase' && orderId) {
        resolvedEventId = `PURCHASE_${orderId}`;
      } else if (orderId) {
        resolvedEventId = `${resolvedEventName.toUpperCase()}_${orderId}`;
      } else {
        resolvedEventId = `${resolvedEventName.toUpperCase()}_${cleanSlug}_${Date.now()}`;
      }
    }

    // Resolusi data order & tracking_context dari Supabase jika orderId tersedia
    let resolvedFbp = fbp;
    let resolvedFbc = fbc;
    let resolvedIp = ipAddress;
    let resolvedUserAgent = userAgent;
    let resolvedPhone = customerPhone;
    let resolvedEmail = customerEmail;
    let resolvedName = customerName;
    let resolvedAmount = amount;

    if (orderId) {
      try {
        const { data: dbOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .maybeSingle();

        if (dbOrder) {
          const tContext = dbOrder.metadata?.tracking_context || {};
          resolvedFbp = resolvedFbp || tContext.fbp || dbOrder.metadata?.fbp;
          resolvedFbc =
            resolvedFbc ||
            tContext.fbc ||
            dbOrder.metadata?.fbc ||
            (dbOrder.fbclid ? `fb.1.${Date.now()}.${dbOrder.fbclid}` : undefined);
          resolvedIp =
            resolvedIp ||
            tContext.client_ip_address ||
            dbOrder.metadata?.client_ip_address;
          resolvedUserAgent =
            resolvedUserAgent ||
            tContext.client_user_agent ||
            dbOrder.metadata?.client_user_agent;
          resolvedPhone = resolvedPhone || dbOrder.customer_phone || dbOrder.phone;
          resolvedEmail = resolvedEmail || dbOrder.customer_email;
          resolvedName = resolvedName || dbOrder.customer_name || dbOrder.buyer_name;
          resolvedAmount = resolvedAmount !== undefined ? resolvedAmount : dbOrder.gross_amount;
        }
      } catch (orderLookupErr) {
        console.warn('[CAPI Route] Order lookup note:', orderLookupErr);
      }
    }

    const clientIpFromHeaders =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      undefined;

    // 3. Dispatch Event via CAPI Service
    const capiResult = await dispatchMetaCAPIEvent(metaPixelId, metaAccessToken, {
      eventName: resolvedEventName,
      eventId: resolvedEventId,
      orderId: orderId || undefined,
      tenantId: tenant.id || cleanSlug,
      grossAmount: resolvedAmount !== undefined ? Number(resolvedAmount) : undefined,
      currency: currency || 'IDR',
      customerPhone: resolvedPhone,
      customerName: resolvedName,
      customerEmail: resolvedEmail,
      fbc: resolvedFbc || null,
      fbp: resolvedFbp || null,
      ctwaClid: resolvedCtwaClid,
      userAgent: resolvedUserAgent || req.headers.get('user-agent') || undefined,
      ipAddress: resolvedIp || clientIpFromHeaders,
      contentName,
      contentIds,
      contentType,
      testEventCode: finalTestEventCode,
      customData,
    });

    return NextResponse.json({
      success: true,
      eventName: resolvedEventName,
      eventId: resolvedEventId,
      ctwaClid: resolvedCtwaClid,
      result: capiResult,
    });
  } catch (error: any) {
    console.error('[API Tracking CAPI Exception]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
