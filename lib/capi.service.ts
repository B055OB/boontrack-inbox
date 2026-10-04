import crypto from 'crypto';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export type MetaCAPIEventName = 'Lead' | 'InitiateCheckout' | 'Purchase';

export interface CAPIEventPayload {
  eventName?: MetaCAPIEventName;
  /** Deduplication Key (Order ID, Lead Token, atau unique event ID) */
  eventId?: string;
  orderId?: string;
  tenantId: string;
  tenantSlug?: string;
  grossAmount?: number;
  currency?: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  firstName?: string;
  lastName?: string;
  city?: string | null;
  customerCity?: string | null;
  country?: string | null;
  zip?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  eventSourceUrl?: string | null;
  sourceUrl?: string | null;
  /** Parameter Atribusi Click-to-WhatsApp Meta */
  ctwaClid?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  /** Optional: Meta CAPI Test Event Code (dari Events Manager → Test Events tab) */
  testEventCode?: string;
  customData?: Record<string, any>;
  trackingContext?: Record<string, any>;
}

export type PurchaseEventPayload = CAPIEventPayload;

import {
  hashSha256,
  normalizePhone,
  hashPhone,
  normalizeEmail,
  hashEmail,
  parseName,
  hashFirstName,
  hashLastName,
  hashCity,
  hashZip,
  hashCountry,
  isValidIpAddress,
  formatFbc,
  sanitizeUserData,
  assertNoRawPii,
  buildMetaUserData,
  buildMetaCAPIEventPayload,
  extractServerTrackingContext,
  normalizeMetaAdAccountId,
  fetchMetaDailySpend,
  MetaDailySpendResult,
} from '@/lib/tracking/meta-capi';

export {
  hashSha256,
  normalizePhone,
  hashPhone,
  normalizeEmail,
  hashEmail,
  parseName,
  hashFirstName,
  hashLastName,
  hashCity,
  hashZip,
  hashCountry,
  isValidIpAddress,
  formatFbc,
  sanitizeUserData,
  assertNoRawPii,
  buildMetaUserData,
  buildMetaCAPIEventPayload,
  extractServerTrackingContext,
  normalizeMetaAdAccountId,
  fetchMetaDailySpend,
};
export type { MetaDailySpendResult };

/**
 * Dispatch server-side event ke Meta Conversions API (CAPI)
 * Mendukung tahapan konversi terpisah: 'Lead', 'InitiateCheckout', dan 'Purchase'
 * Sesuai ARCHITECTURE.md §20, §21.5, dan §27.1
 */
export async function dispatchMetaCAPIEvent(
  pixelId: string,
  accessToken: string,
  payload: CAPIEventPayload
) {
  if (!pixelId || !accessToken) return null;

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const resolvedEventName: MetaCAPIEventName = payload.eventName || 'Purchase';

  // DEDUPLICATION KEY:
  // Event 'Purchase' WAJIB identik dengan browser pixel: PURCHASE_${orderId}
  let resolvedEventId: string;
  if (payload.eventId) {
    resolvedEventId = payload.eventId;
    if (resolvedEventName === 'Purchase' && payload.orderId && resolvedEventId === payload.orderId) {
      resolvedEventId = `PURCHASE_${payload.orderId}`;
    }
  } else if (payload.orderId) {
    resolvedEventId = resolvedEventName === 'Purchase'
      ? `PURCHASE_${payload.orderId}`
      : `${resolvedEventName.toUpperCase()}_${payload.orderId}`;
  } else {
    resolvedEventId = `${resolvedEventName.toUpperCase()}_${Date.now()}`;
  }

  // 1. Normalisasi & Hashing User Data (EMQ Optimization 8.0+)
  const hashedPhone = hashPhone(payload.customerPhone);
  const hashedEmail = hashEmail(payload.customerEmail);
  const hashedFn = payload.firstName
    ? (hashFirstName(payload.firstName) || hashSha256(payload.firstName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '')))
    : hashFirstName(payload.customerName);
  const hashedLn = payload.lastName
    ? (hashLastName(payload.lastName) || hashSha256(payload.lastName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '')))
    : hashLastName(payload.customerName);
  const hashedCity = hashCity(payload.city || payload.customerCity);
  const hashedCountry = hashCountry(payload.country || 'id');
  const hashedZip = hashZip(payload.zip);

  // 2. Client Context (IP Address, User Agent, fbp, fbc)
  const clientIp = isValidIpAddress(payload.ipAddress) ? payload.ipAddress!.trim() : undefined;
  const clientUserAgent =
    payload.userAgent && payload.userAgent.trim() ? payload.userAgent.trim() : undefined;
  const rawFbp = payload.fbp && payload.fbp.trim() ? payload.fbp.trim() : undefined;
  const rawFbc = payload.fbc && payload.fbc.trim() ? payload.fbc.trim() : undefined;

  // 3. Bangun objek user_data mentah dan lakukan sanitasi ketat (Zero Null Keys)
  const rawUserData: Record<string, any> = {
    ph: hashedPhone ? [hashedPhone] : undefined,
    em: hashedEmail ? [hashedEmail] : undefined,
    fn: hashedFn ? [hashedFn] : undefined,
    ln: hashedLn ? [hashedLn] : undefined,
    ct: hashedCity ? [hashedCity] : undefined,
    country: hashedCountry ? [hashedCountry] : undefined,
    zp: hashedZip ? [hashedZip] : undefined,
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent,
    fbp: rawFbp,
    fbc: rawFbc || formatFbc(null, payload.trackingContext?.fbclid || (payload as any).fbclid) || undefined,
    ...(payload.ctwaClid ? { ctwa_clid: payload.ctwaClid.trim() } : {}),
  };

  const cleanUserData = sanitizeUserData(rawUserData);
  assertNoRawPii(cleanUserData);

  const customDataObj: Record<string, any> = {
    currency: payload.currency || 'IDR',
    value: payload.grossAmount !== undefined ? payload.grossAmount : 0,
    ...(payload.contentName ? { content_name: payload.contentName } : {}),
    ...(payload.contentIds && payload.contentIds.length > 0 ? { content_ids: payload.contentIds } : {}),
    ...(payload.contentType ? { content_type: payload.contentType } : {}),
    ...(payload.customData || {})
  };

  // 4. Resolusi event_source_url (WAJIB valid domain storefront per spesifikasi Meta CAPI)
  let resolvedEventSourceUrl =
    payload.eventSourceUrl ||
    payload.sourceUrl ||
    payload.trackingContext?.source_url ||
    undefined;

  if (!resolvedEventSourceUrl) {
    const slug = payload.tenantSlug || payload.tenantId;
    if (slug) {
      resolvedEventSourceUrl = payload.orderId
        ? `https://shop.boontrack.com/${slug}/order/${payload.orderId}`
        : `https://shop.boontrack.com/${slug}`;
    }
  }

  const eventItem: Record<string, any> = {
    event_name: resolvedEventName,
    event_time: currentTimestamp,
    event_id: resolvedEventId, // 100% DEDUPLICATION KEY MATCH
    action_source: 'website',
    user_data: cleanUserData,
    custom_data: customDataObj,
  };

  if (resolvedEventSourceUrl) {
    eventItem.event_source_url = resolvedEventSourceUrl;
  }

  const body: Record<string, any> = {
    data: [eventItem],
    // test_event_code disematkan di root body (bukan di dalam data[]) per spesifikasi Meta CAPI
    ...(payload.testEventCode ? { test_event_code: payload.testEventCode.trim() } : {})
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();

    if (!res.ok) {
      console.warn(`[Meta CAPI] Dispatch returned status ${res.status} (${resolvedEventName}):`, {
        error: result?.error?.message || result,
        eventId: resolvedEventId,
      });
    }

    return result;
  } catch (error: any) {
    console.error(`[Meta CAPI Dispatch Error] (${resolvedEventName}):`, error?.message || error);
    return null;
  }
}

/** Trigger CAPI Event: Lead (saat user pertama kali memicu tombol paket / submit kontak) */
export async function dispatchMetaCAPILead(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'Lead'
  });
}

/** Trigger CAPI Event: InitiateCheckout (saat QRIS PT atau payment link diterbitkan) */
export async function dispatchMetaCAPIInitiateCheckout(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'InitiateCheckout'
  });
}

/** Trigger CAPI Event: Purchase (saat order terkonfirmasi PAID) */
export async function dispatchMetaCAPIPurchase(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'Purchase'
  });
}

/** Backward-compatible alias for existing Purchase dispatches */
export const dispatchMetaCAPI = dispatchMetaCAPIPurchase;

/**
 * Resolver Entitlement: Mengecek apakah tenant berhak atas fitur Ads Tracking Pro (P3-A.6)
 */
export async function checkAdsTrackingEntitlement(supabase: any, tenantId: string): Promise<boolean> {
  try {
    // 1. Cek Tier / Plan Tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('plan, tier')
      .eq('id', tenantId)
      .maybeSingle();

    const tier = (tenant?.tier || tenant?.plan || '').toUpperCase();
    if (tier === 'CHECKOUT_LITE' || tier === 'SOLO' || tier === 'STARTER') {
      return false;
    }
    if (
      tier === 'PRO_SCALE' ||
      tier === 'ADS_PERFORMANCE' ||
      tier === 'ENTERPRISE' ||
      tier === 'TEAM_SCALE' ||
      tier === 'GROWTH_PRO' ||
      tier === 'GROWTH_TRACKING' ||
      tier === 'GROWTHPLUS' ||
      tenantId === 'growthplus'
    ) {
      return true;
    }

    // 2. Cek Add-on Entitlement di tabel tenant_entitlements
    const { data: entitlement } = await supabase
      .from('tenant_entitlements')
      .select('is_active')
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ads_tracking_pro')
      .eq('is_active', true)
      .maybeSingle();

    return !!entitlement;
  } catch (e) {
    console.error('Entitlement check error:', e);
    return false;
  }
}

/**
 * End-to-End Meta CAPI 'Purchase' Dispatcher for an Order
 * Mengambil data order, tracking_context dari metadata, tenant credentials, dan test_event_code,
 * lalu menembakkan Purchase event dengan deduplikasi 100% (PURCHASE_${orderId}).
 */
export async function dispatchMetaCAPIPurchaseForOrder(
  orderId: string,
  supabaseClient?: any
): Promise<{ success: boolean; result?: any; skipped?: boolean; reason?: string }> {
  try {
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase || !orderId) {
      return { success: false, skipped: true, reason: 'Missing supabase client or orderId' };
    }

    // 1. Ambil data order aktual (mendukung id, order_number, order_id, invoice_no)
    let { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`order_number.eq.${orderId},order_id.eq.${orderId},invoice_no.eq.${orderId}`)
        .maybeSingle();
      if (altOrder) {
        order = altOrder;
        orderErr = null;
      }
    }

    if (orderErr || !order) {
      return { success: false, skipped: true, reason: `Order #${orderId} not found` };
    }

    const tenantSlug = (order.tenant_slug || '').toLowerCase();
    const tenantId = order.tenant_id;
    if (!tenantSlug && !tenantId) {
      return { success: false, skipped: true, reason: 'Missing tenant identifier on order' };
    }

    // 2. Ambil data tenant & kredensial pixel
    let tenantQuery = supabase.from('tenants').select('id, slug, tier, plan, metadata');
    if (tenantId) {
      tenantQuery = tenantQuery.eq('id', tenantId);
    } else {
      tenantQuery = tenantQuery.eq('slug', tenantSlug);
    }
    const { data: tenantData } = await tenantQuery.maybeSingle();

    if (!tenantData) {
      return { success: false, skipped: true, reason: 'Tenant not found' };
    }

    // 3. Entitlement check
    const isEntitled = await checkAdsTrackingEntitlement(supabase, tenantData.id);
    if (!isEntitled) {
      return { success: false, skipped: true, reason: 'Tenant tier not entitled for Meta CAPI' };
    }

    // 4. Kredensial Pixel & Access Token
    const pixelConfig = tenantData.metadata?.pixel_config || {};
    const trackingMeta = tenantData.metadata?.tracking || {};
    const metaPixelId =
      trackingMeta.meta_pixel_id ||
      pixelConfig.meta_pixel_id ||
      tenantData.metadata?.meta_pixel_id ||
      tenantData.metadata?.pixel_id ||
      tenantData.metadata?.facebook_pixel_id;

    const metaAccessToken =
      trackingMeta.meta_access_token ||
      pixelConfig.meta_access_token ||
      tenantData.metadata?.meta_access_token ||
      tenantData.metadata?.facebook_access_token;

    if (!metaPixelId || !metaAccessToken) {
      return { success: false, skipped: true, reason: 'Meta Pixel ID or Access Token not configured' };
    }

    // 5. Ekstraksi test_event_code
    const testEventCode =
      trackingMeta.test_event_code ||
      trackingMeta.meta_test_event_code ||
      tenantData.metadata?.capi_test_event_code ||
      pixelConfig.meta_test_event_code ||
      pixelConfig.test_event_code ||
      tenantData.metadata?.meta_test_event_code ||
      process.env.META_CAPI_TEST_EVENT_CODE ||
      undefined;

    // 6. Ekstraksi tracking_context dari orders.metadata (atau fallback order_items)
    let trackingContext = order.metadata?.tracking_context || {};
    if (!trackingContext.fbp && !trackingContext.client_user_agent) {
      try {
        const { data: itemWithMeta } = await supabase
          .from('order_items')
          .select('metadata')
          .eq('order_id', orderId)
          .not('metadata', 'is', null)
          .limit(1)
          .maybeSingle();
        if (itemWithMeta?.metadata?.tracking_context) {
          trackingContext = { ...itemWithMeta.metadata.tracking_context, ...trackingContext };
        }
      } catch {}
    }

    const fbp = trackingContext.fbp || order.metadata?.fbp || undefined;
    const fbc =
      trackingContext.fbc ||
      order.metadata?.fbc ||
      (order.fbclid ? `fb.1.${Date.now()}.${order.fbclid}` : undefined);

    const clientIp =
      trackingContext.client_ip_address ||
      order.metadata?.client_ip_address ||
      order.metadata?.client_ip ||
      undefined;

    const userAgent =
      trackingContext.client_user_agent ||
      order.metadata?.client_user_agent ||
      order.metadata?.user_agent ||
      undefined;

    const customerPhone =
      order.customer_phone || order.phone || order.whatsapp_number || undefined;
    const customerEmail =
      order.customer_email || order.metadata?.customer_email || undefined;
    const customerName =
      order.customer_name || order.buyer_name || 'Pelanggan Toko';

    const customerCity =
      order.customer_city ||
      order.city ||
      order.shipping_city ||
      order.metadata?.city ||
      order.metadata?.customer_city ||
      order.metadata?.shipping_address?.city ||
      trackingContext.city ||
      undefined;

    const postalCode =
      order.postal_code ||
      order.zip ||
      order.metadata?.postal_code ||
      order.metadata?.zip ||
      order.metadata?.shipping_address?.postal_code ||
      undefined;

    const resolvedSlug = tenantData.slug || order.tenant_slug || tenantSlug;
    const sourceUrl =
      trackingContext.source_url ||
      order.metadata?.source_url ||
      `https://shop.boontrack.com/${resolvedSlug}/order/${order.id}`;

    const grossAmount = Number(
      order.gross_amount ?? order.total_amount ?? order.amount ?? 0
    );

    const eventId = `PURCHASE_${order.id}`;

    // 7. Dispatch Event Purchase
    const capiResult = await dispatchMetaCAPIPurchase(metaPixelId, metaAccessToken, {
      orderId: String(order.id),
      eventId,
      tenantId: tenantData.id || tenantData.slug,
      tenantSlug: resolvedSlug,
      grossAmount,
      currency: 'IDR',
      customerPhone,
      customerEmail,
      customerName,
      city: customerCity,
      zip: postalCode,
      country: 'id',
      eventSourceUrl: sourceUrl,
      sourceUrl,
      fbp,
      fbc,
      ipAddress: clientIp,
      userAgent,
      testEventCode,
      contentName: order.product_title || 'Pesanan Produk',
      contentIds: order.product_id ? [String(order.product_id)] : undefined,
      contentType: 'product',
      ctwaClid: order.ctwa_clid || order.metadata?.ctwa_clid || undefined,
    });

    return {
      success: true,
      result: capiResult,
    };
  } catch (dispatchErr: any) {
    console.error(`[Meta CAPI Purchase Exception] Order #${orderId}:`, dispatchErr?.message || dispatchErr);
    return { success: false, reason: dispatchErr?.message || 'Exception during CAPI dispatch' };
  }
}

/**
 * End-to-End Meta CAPI 'InitiateCheckout' Dispatcher for an Order
 * Dispatches InitiateCheckout with Deduplication Key IC_${order.id} and EMQ hashing.
 */
export async function dispatchMetaCAPIInitiateCheckoutForOrder(
  orderId: string,
  supabaseClient?: any
): Promise<{ success: boolean; result?: any; skipped?: boolean; reason?: string }> {
  try {
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase || !orderId) {
      return { success: false, skipped: true, reason: 'Missing supabase client or orderId' };
    }

    let { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`order_number.eq.${orderId},order_id.eq.${orderId},invoice_no.eq.${orderId}`)
        .maybeSingle();
      if (altOrder) {
        order = altOrder;
        orderErr = null;
      }
    }

    if (orderErr || !order) {
      return { success: false, skipped: true, reason: `Order #${orderId} not found` };
    }

    const tenantSlug = (order.tenant_slug || '').toLowerCase();
    const tenantId = order.tenant_id;
    if (!tenantSlug && !tenantId) {
      return { success: false, skipped: true, reason: 'Missing tenant identifier on order' };
    }

    let tenantQuery = supabase.from('tenants').select('id, slug, tier, plan, metadata');
    if (tenantId) {
      tenantQuery = tenantQuery.eq('id', tenantId);
    } else {
      tenantQuery = tenantQuery.eq('slug', tenantSlug);
    }
    const { data: tenantData } = await tenantQuery.maybeSingle();

    if (!tenantData) {
      return { success: false, skipped: true, reason: 'Tenant not found' };
    }

    const isEntitled = await checkAdsTrackingEntitlement(supabase, tenantData.id);
    if (!isEntitled) {
      return { success: false, skipped: true, reason: 'Tenant tier not entitled for Meta CAPI' };
    }

    const pixelConfig = tenantData.metadata?.pixel_config || {};
    const trackingMeta = tenantData.metadata?.tracking || {};
    const metaPixelId =
      trackingMeta.meta_pixel_id ||
      pixelConfig.meta_pixel_id ||
      tenantData.metadata?.meta_pixel_id ||
      tenantData.metadata?.pixel_id ||
      tenantData.metadata?.facebook_pixel_id;

    const metaAccessToken =
      trackingMeta.meta_access_token ||
      pixelConfig.meta_access_token ||
      tenantData.metadata?.meta_access_token ||
      tenantData.metadata?.facebook_access_token;

    if (!metaPixelId || !metaAccessToken) {
      return { success: false, skipped: true, reason: 'Meta Pixel ID or Access Token not configured' };
    }

    const testEventCode =
      trackingMeta.test_event_code ||
      trackingMeta.meta_test_event_code ||
      tenantData.metadata?.capi_test_event_code ||
      pixelConfig.meta_test_event_code ||
      pixelConfig.test_event_code ||
      tenantData.metadata?.meta_test_event_code ||
      process.env.META_CAPI_TEST_EVENT_CODE ||
      undefined;

    let trackingContext = order.metadata?.tracking_context || {};
    if (!trackingContext.fbp && !trackingContext.client_user_agent) {
      try {
        const { data: itemWithMeta } = await supabase
          .from('order_items')
          .select('metadata')
          .eq('order_id', orderId)
          .not('metadata', 'is', null)
          .limit(1)
          .maybeSingle();
        if (itemWithMeta?.metadata?.tracking_context) {
          trackingContext = { ...itemWithMeta.metadata.tracking_context, ...trackingContext };
        }
      } catch {}
    }

    const fbp = trackingContext.fbp || order.metadata?.fbp || undefined;
    const fbc =
      trackingContext.fbc ||
      order.metadata?.fbc ||
      (order.fbclid ? `fb.1.${Date.now()}.${order.fbclid}` : undefined);

    const clientIp =
      trackingContext.client_ip_address ||
      order.metadata?.client_ip_address ||
      order.metadata?.client_ip ||
      undefined;

    const userAgent =
      trackingContext.client_user_agent ||
      order.metadata?.client_user_agent ||
      order.metadata?.user_agent ||
      undefined;

    const customerPhone =
      order.customer_phone || order.phone || order.whatsapp_number || undefined;
    const customerEmail =
      order.customer_email || order.metadata?.customer_email || undefined;
    const customerName =
      order.customer_name || order.buyer_name || 'Pelanggan Toko';

    const customerCity =
      order.customer_city ||
      order.city ||
      order.shipping_city ||
      order.metadata?.city ||
      order.metadata?.customer_city ||
      order.metadata?.shipping_address?.city ||
      trackingContext.city ||
      undefined;

    const postalCode =
      order.postal_code ||
      order.zip ||
      order.metadata?.postal_code ||
      order.metadata?.zip ||
      order.metadata?.shipping_address?.postal_code ||
      undefined;

    const resolvedSlug = tenantData.slug || order.tenant_slug || tenantSlug;
    const sourceUrl =
      trackingContext.source_url ||
      order.metadata?.source_url ||
      `https://shop.boontrack.com/${resolvedSlug}/order/${order.id}`;

    const grossAmount = Number(
      order.gross_amount ?? order.total_amount ?? order.amount ?? 0
    );

    const eventId = `IC_${order.id}`;

    const capiResult = await dispatchMetaCAPIInitiateCheckout(metaPixelId, metaAccessToken, {
      orderId: String(order.id),
      eventId,
      tenantId: tenantData.id || tenantData.slug,
      tenantSlug: resolvedSlug,
      grossAmount,
      currency: 'IDR',
      customerPhone,
      customerEmail,
      customerName,
      city: customerCity,
      zip: postalCode,
      country: 'id',
      eventSourceUrl: sourceUrl,
      sourceUrl,
      fbp,
      fbc,
      ipAddress: clientIp,
      userAgent,
      testEventCode,
      contentName: order.product_title || 'Tagihan Custom CS',
      contentIds: order.product_id ? [String(order.product_id)] : undefined,
      contentType: 'product',
      ctwaClid: order.ctwa_clid || order.metadata?.ctwa_clid || undefined,
    });

    return {
      success: true,
      result: capiResult,
    };
  } catch (dispatchErr: any) {
    console.error(`[Meta CAPI InitiateCheckout Exception] Order #${orderId}:`, dispatchErr?.message || dispatchErr);
    return { success: false, reason: dispatchErr?.message || 'Exception during CAPI dispatch' };
  }
}