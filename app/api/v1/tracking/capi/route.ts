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
    const metaPixelId =
      pixelConfig.meta_pixel_id ||
      tenant.metadata?.meta_pixel_id ||
      tenant.metadata?.facebook_pixel_id;
    const metaAccessToken =
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
      pixelConfig.meta_test_event_code ||
      tenant.metadata?.meta_test_event_code ||
      process.env.META_CAPI_TEST_EVENT_CODE ||
      undefined;

    const resolvedCtwaClid = ctwa_clid || ctwaClid || null;
    const resolvedEventId =
      eventId ||
      orderId ||
      `${resolvedEventName.toUpperCase()}_${cleanSlug}_${Date.now()}`;

    // 3. Dispatch Event via CAPI Service
    const capiResult = await dispatchMetaCAPIEvent(metaPixelId, metaAccessToken, {
      eventName: resolvedEventName,
      eventId: resolvedEventId,
      orderId: orderId || undefined,
      tenantId: tenant.id || cleanSlug,
      grossAmount: amount !== undefined ? Number(amount) : undefined,
      currency: currency || 'IDR',
      customerPhone,
      customerName,
      customerEmail,
      fbc: fbc || null,
      fbp: fbp || null,
      ctwaClid: resolvedCtwaClid,
      userAgent: userAgent || req.headers.get('user-agent') || undefined,
      ipAddress:
        ipAddress ||
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        undefined,
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
