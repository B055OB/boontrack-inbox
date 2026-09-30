/**
 * lib/shipping/instant-shipping-service.ts
 * Instant Courier Shipping Engine for F&B and Physical Multi-Tenant Merchants.
 *
 * Implements:
 * 1. Precision Haversine distance calculation (KM) between merchant outlet/kitchen and buyer GPS pin.
 * 2. Instant Courier Rate calculation (GoSend Instant, GrabExpress Instant, GoSend SameDay).
 * 3. Dynamic tenant outlet coordinates resolution from Supabase (tenants.metadata.outlet_coordinates, fnb_settings, etc.).
 * 4. Automated WhatsApp reply recommendation for buyers sharing location pins during ordering sessions.
 * 5. Multi-provider WhatsApp dispatcher (Meta Cloud API WABA & Evolution API).
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { resolveAreaCoordinates } from '@/app/api/v1/shipping/locations/search/route';
import { metaWabaAdapter } from '@/services/waba';
import { sendEvolutionTextMessage } from '@/lib/whatsapp/evolution-webhook-handler';
import { sendWhatsAppSessionMessage } from '@/lib/whatsapp';

export interface InstantCourierRate {
  id: string;
  courier_name: string;
  service: string;
  price: number;
  etd: string;
  distance_km: number;
}

export interface TenantOutletCoordinates {
  latitude: number;
  longitude: number;
  name: string;
  address?: string;
  city?: string;
}

/**
 * Calculates straight-line geospatial distance using Haversine formula (KM).
 * Accurate up to 1 decimal place.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  const R = 6371; // Radius bumi dalam kilometer
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Computes Instant Courier Rates (GoSend & GrabExpress) based on distance.
 * Standard Indonesian instant delivery model (max 30 km radius for two-wheelers).
 */
export function computeInstantCourierRates(distanceKm: number): {
  isEligible: boolean;
  rates: InstantCourierRate[];
  maxRadiusKm: number;
} {
  const maxRadiusKm = 30;
  if (distanceKm > maxRadiusKm) {
    return {
      isEligible: false,
      rates: [],
      maxRadiusKm,
    };
  }

  const extraKm = Math.max(0, distanceKm - 4);
  // GoSend: Rp 20.000 for first 4 km, + Rp 2.500 per additional km
  const gosendPrice = Math.max(20000, Math.round((20000 + extraKm * 2500) / 1000) * 1000);
  // GrabExpress: Rp 18.000 for first 4 km, + Rp 2.500 per additional km
  const grabPrice = Math.max(18000, Math.round((18000 + extraKm * 2500) / 1000) * 1000);

  const rates: InstantCourierRate[] = [
    {
      id: 'gosend_instant',
      courier_name: 'GoSend Instant',
      service: 'Instant (Roda Dua)',
      price: gosendPrice,
      etd: '1 - 2 Jam Tiba',
      distance_km: distanceKm,
    },
    {
      id: 'grab_instant',
      courier_name: 'GrabExpress Instant',
      service: 'Instant (Roda Dua)',
      price: grabPrice,
      etd: '1 - 2 Jam Tiba',
      distance_km: distanceKm,
    },
  ];

  // Optional: SameDay service if distance <= 15 km
  if (distanceKm <= 15) {
    rates.push({
      id: 'gosend_sameday',
      courier_name: 'GoSend SameDay',
      service: 'SameDay (Hemat)',
      price: 15000,
      etd: '3 - 6 Jam Tiba',
      distance_km: distanceKm,
    });
  }

  return {
    isEligible: true,
    rates,
    maxRadiusKm,
  };
}

/**
 * Extracts merchant outlet coordinates dynamically from tenants.metadata.
 * Zero hardcoded coordinates or slugs.
 */
export function extractOutletCoordinates(metadata: any, tenantName?: string): TenantOutletCoordinates | null {
  if (!metadata || typeof metadata !== 'object') return null;

  // 1. Direct outlet_coordinates field
  const oc = metadata.outlet_coordinates;
  if (oc && typeof oc === 'object') {
    const lat = Number(oc.latitude ?? oc.lat);
    const lon = Number(oc.longitude ?? oc.lon ?? oc.lng);
    if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
      return {
        latitude: lat,
        longitude: lon,
        name: oc.name || oc.outlet_name || tenantName || 'Dapur / Outlet Toko',
        address: oc.address || '',
        city: oc.city || '',
      };
    }
  }

  // 2. shipping_config.fnb_settings
  const fnbCfg = metadata.shipping_config?.fnb_settings || metadata.fnb_settings;
  if (fnbCfg && typeof fnbCfg === 'object') {
    const lat = Number(fnbCfg.latitude ?? fnbCfg.lat);
    const lon = Number(fnbCfg.longitude ?? fnbCfg.lon ?? fnbCfg.lng);
    if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
      return {
        latitude: lat,
        longitude: lon,
        name: fnbCfg.outlet_name || tenantName || 'Dapur / Outlet Toko',
        address: fnbCfg.kitchen_address || fnbCfg.address || '',
        city: fnbCfg.city || '',
      };
    }
  }

  // 3. shipping_config.origin
  const origin = metadata.shipping_config?.origin || metadata.shipping_origin;
  if (origin && typeof origin === 'object') {
    const lat = Number(origin.latitude ?? origin.lat);
    const lon = Number(origin.longitude ?? origin.lon ?? origin.lng);
    if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
      return {
        latitude: lat,
        longitude: lon,
        name: origin.sender_name || tenantName || 'Gudang / Outlet Toko',
        address: origin.address || '',
        city: origin.city || '',
      };
    }
  }

  // 4. Fallback resolve from address/city using resolveAreaCoordinates
  const cityName =
    metadata.basic_shipping?.origin_city ||
    metadata.shipping_config?.origin_city ||
    metadata.origin_city ||
    (typeof metadata.warehouse_address === 'object' ? metadata.warehouse_address?.city : null) ||
    '';
  const districtName =
    metadata.basic_shipping?.origin_district ||
    metadata.shipping_config?.origin_subdistrict ||
    metadata.origin_district ||
    '';
  const postalCode =
    metadata.shipping_config?.origin_postal_code ||
    metadata.origin_postal_code ||
    '';
  const addrText =
    metadata.basic_shipping?.origin_address ||
    metadata.shipping_config?.origin_address ||
    (typeof metadata.warehouse_address === 'string' ? metadata.warehouse_address : metadata.warehouse_address?.address) ||
    '';

  if (cityName || districtName || postalCode) {
    try {
      const resolved = resolveAreaCoordinates(cityName || 'Bandung', districtName, postalCode);
      if (resolved && !isNaN(resolved.latitude) && !isNaN(resolved.longitude)) {
        return {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          name: tenantName || 'Dapur / Toko',
          address: addrText || cityName,
          city: cityName,
        };
      }
    } catch {}
  }

  return null;
}

/**
 * Checks whether tenant is in FOOD, CULINARY, FNB, PHYSICAL, or RETAIL category.
 */
export function isInstantCourierTenantCategory(metadata: any): boolean {
  if (!metadata || typeof metadata !== 'object') return false;

  const category = String(
    metadata.business_category ||
    metadata.category ||
    metadata.vertical_type ||
    metadata.business_type ||
    metadata.industry ||
    ''
  ).toUpperCase();

  const isMatchingCat =
    category === 'FOOD' ||
    category === 'CULINARY' ||
    category === 'FNB' ||
    category === 'PHYSICAL' ||
    category === 'RETAIL' ||
    category.includes('FOOD') ||
    category.includes('FNB') ||
    category.includes('PHYSICAL') ||
    category.includes('CULINARY');

  const hasFnbSettings = Boolean(
    metadata.outlet_coordinates ||
    metadata.fnb_settings ||
    metadata.shipping_config?.fnb_settings ||
    metadata.basic_shipping ||
    metadata.shipping_config
  );

  return isMatchingCat || hasFnbSettings;
}

/**
 * Checks if there is an active ordering or conversation session with the customer.
 */
export async function isOrderingSessionActive(
  supabase: any,
  tenantId: string,
  customerPhone: string,
  conversationId?: string | null
): Promise<boolean> {
  if (!supabase) return true;

  try {
    // 1. Check conversation_sessions state
    const { data: session } = await supabase
      .from('conversation_sessions')
      .select('current_state, is_paused, updated_at')
      .eq('tenant_id', tenantId)
      .eq('user_identifier', customerPhone)
      .maybeSingle();

    if (session) {
      const state = String(session.current_state || '').toUpperCase();
      if (state === 'CLOSED') {
        return false;
      }
      return true;
    }

    // 2. Check recent messages in conversations
    if (conversationId) {
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('text, message_body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (Array.isArray(recentMsgs) && recentMsgs.length > 0) {
        return true;
      }
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Formats WhatsApp instant courier recommendation reply message.
 */
export function formatInstantCourierRecommendationReply(params: {
  storeName: string;
  outletName: string;
  outletAddress?: string;
  customerAddress?: string;
  customerName?: string;
  distanceKm: number;
  rates: InstantCourierRate[];
  isEligible: boolean;
  maxRadiusKm: number;
}): string {
  const {
    storeName,
    outletName,
    customerAddress,
    customerName,
    distanceKm,
    rates,
    isEligible,
    maxRadiusKm,
  } = params;

  const greeting = customerName ? `Hai Kak ${customerName}!` : 'Hai Kak!';

  if (!isEligible) {
    return (
      `📍 *ESTIMASI ONGKIR & PENGIRIMAN*\n\n` +
      `${greeting} Terima kasih sudah membagikan titik lokasi pengiriman Anda ke *${storeName}*. 🙏\n\n` +
      `📏 *Jarak Pengiriman:* ${distanceKm} km dari ${outletName}\n\n` +
      `⚠️ *Pemberitahuan Radius Kurir Instan:*\n` +
      `Titik lokasi Kakak berada di luar batas radius kurir motor instan (maksimal ${maxRadiusKm} km).\n\n` +
      `📦 *Solusi Pengiriman:*\n` +
      `Pesanan Kakak tetap dapat dikirimkan menggunakan *Kurir Reguler (JNE / SiCepat / J&T)* atau Ekspedisi Kargo.\n\n` +
      `Silakan konfirmasi pesanan atau tanyakan ke CS kami untuk opsi pengiriman terbaik ya Kak! 😊`
    );
  }

  let courierLines = '';
  rates.forEach((r, idx) => {
    courierLines += `${idx + 1}. 🛵 *${r.courier_name}*\n   • Tarif: *Rp ${r.price.toLocaleString('id-ID')}*\n   • Estimasi: ${r.etd}\n\n`;
  });

  return (
    `📍 *REKOMENDASI ONGKIR KURIR INSTAN* 🛵💨\n\n` +
    `${greeting} Titik lokasi pengiriman Anda telah terdeteksi oleh sistem kami:\n\n` +
    `🏠 *Dapur/Toko:* ${outletName}\n` +
    `📍 *Titik Antar:* ${customerAddress || 'Lokasi Pembeli'}\n` +
    `📏 *Jarak Pengiriman:* *${distanceKm} km*\n\n` +
    `Pilihan kurir instan yang siap mengantar pesanan Kakak:\n\n` +
    courierLines +
    `💡 *Catatan:* Tarif dihitung otomatis berdasarkan koordinat GPS presisi.\n\n` +
    `Ketik *Lanjut Pesan* jika ingin segera kami siapkan dan kirimkan ya Kak! 🙏✨`
  );
}

/**
 * Main coordinator: Calculates instant shipping rates from location pin,
 * formats recommendation, and sends automated WhatsApp reply.
 */
export async function sendInstantShippingRecommendation(params: {
  tenantId: string;
  tenantSlug?: string;
  customerPhone: string;
  customerName?: string;
  locationData: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  conversationId?: string | null;
  messageId?: string | null;
}): Promise<{
  success: boolean;
  distanceKm?: number;
  rates?: InstantCourierRate[];
  sentMessage?: string;
  error?: string;
}> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return { success: false, error: 'Supabase client unavailable' };

  const { tenantId, tenantSlug, customerPhone, customerName, locationData, conversationId, messageId } = params;

  try {
    // 1. Fetch tenant data dynamically from Supabase
    let tQuery: any = supabase
      .from('tenants')
      .select('id, slug, name, metadata');

    if (tenantId && tenantId.includes('-') && tenantId.length > 30) {
      tQuery = tQuery.eq('id', tenantId);
    } else {
      tQuery = tQuery.or(`id.eq.${tenantId},slug.eq.${tenantId || tenantSlug}`);
    }

    const { data: tenant, error: tenantErr } = await tQuery.maybeSingle();

    if (tenantErr || !tenant) {
      console.warn(`[InstantCourier] Tenant not found for ${tenantId}:`, tenantErr?.message);
      return { success: false, error: 'Tenant not found' };
    }

    const tenantMeta = tenant.metadata || {};

    // 2. Validate tenant category: FOOD, PHYSICAL, etc.
    if (!isInstantCourierTenantCategory(tenantMeta)) {
      console.log(`[InstantCourier] Tenant '${tenant.slug}' is not FOOD/PHYSICAL. Skipping instant shipping calculation.`);
      return { success: false, error: 'Tenant not FOOD/PHYSICAL category' };
    }

    // 3. Check if ordering session or conversation is active
    const isOrdering = await isOrderingSessionActive(supabase, tenant.id, customerPhone, conversationId);
    if (!isOrdering) {
      console.log(`[InstantCourier] No active ordering session for ${customerPhone}. Skipping auto-reply.`);
      return { success: false, error: 'No active ordering session' };
    }

    // 4. Extract merchant outlet coordinates
    const outlet = extractOutletCoordinates(tenantMeta, tenant.name);
    if (!outlet) {
      console.warn(`[InstantCourier] Merchant '${tenant.slug}' has no configured outlet coordinates or origin address.`);
      return { success: false, error: 'No outlet coordinates configured' };
    }

    // 5. Calculate Haversine distance in KM
    const distanceKm = calculateHaversineDistanceKm(
      outlet.latitude,
      outlet.longitude,
      locationData.latitude,
      locationData.longitude
    );

    // 6. Compute Instant Courier Rates
    const rateResult = computeInstantCourierRates(distanceKm);

    // 7. Format WhatsApp recommendation message
    const replyText = formatInstantCourierRecommendationReply({
      storeName: tenant.name || 'Toko',
      outletName: outlet.name || 'Dapur Merchant',
      outletAddress: outlet.address,
      customerAddress: locationData.name || locationData.address || `${locationData.latitude}, ${locationData.longitude}`,
      customerName: customerName || undefined,
      distanceKm,
      rates: rateResult.rates,
      isEligible: rateResult.isEligible,
      maxRadiusKm: rateResult.maxRadiusKm,
    });

    // 8. Dispatch reply to customer via tenant's active WhatsApp connection
    let sentSuccess = false;
    let connQuery: any = supabase
      .from('whatsapp_connections')
      .select('instance_name, credential_ref, phone_number_id, phone_number, status')
      .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug},tenant_id.eq.${tenant.slug}`);

    const { data: conn } = await connQuery.maybeSingle();

    if (conn && conn.status !== 'refused' && conn.status !== 'close') {
      // Option A: Meta Cloud API WABA
      if (conn.credential_ref && conn.phone_number_id) {
        const resolvedToken =
          process.env[`META_TOKEN_${tenant.slug.toUpperCase()}`] ||
          process.env.META_WA_TOKEN ||
          process.env.WHATSAPP_API_TOKEN ||
          conn.credential_ref;

        try {
          await metaWabaAdapter.dispatchTenantMessage(
            tenant.slug,
            conn,
            customerPhone,
            {
              type: 'text',
              text: { preview_url: false, body: replyText },
            },
            resolvedToken,
            conn.credential_ref
          );
          sentSuccess = true;
        } catch (wabaErr) {
          console.warn('[InstantCourier] Meta WABA send error:', wabaErr);
        }
      }

      // Option B: Evolution API v2
      if (!sentSuccess && conn.instance_name) {
        try {
          sentSuccess = await sendEvolutionTextMessage(
            conn.instance_name,
            customerPhone,
            replyText,
            conn.credential_ref
          );
        } catch (evoErr) {
          console.warn('[InstantCourier] Evolution send error:', evoErr);
        }
      }
    }

    // Fallback: Default session message helper
    if (!sentSuccess) {
      try {
        const res = await sendWhatsAppSessionMessage(customerPhone, replyText);
        sentSuccess = res.success;
      } catch (fbErr) {
        console.warn('[InstantCourier] Fallback session send error:', fbErr);
      }
    }

    const nowIso = new Date().toISOString();

    // 9. Persist outbound reply into conversations & messages
    let resolvedConvId = conversationId;
    if (!resolvedConvId) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
        .eq('customer_phone', customerPhone)
        .maybeSingle();
      resolvedConvId = convData?.id || null;
    }

    if (resolvedConvId) {
      await supabase.from('messages').insert({
        conversation_id: resolvedConvId,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        sender_type: 'bot',
        sender: 'bot',
        type: 'TEXT',
        message_body: replyText,
        text: replyText,
        raw_payload: {
          trigger: 'instant_shipping_recommendation',
          distance_km: distanceKm,
          rates: rateResult.rates,
        },
        payload: {
          trigger: 'instant_shipping_recommendation',
          distance_km: distanceKm,
          rates: rateResult.rates,
        },
        channel: 'whatsapp',
        user_name: 'BoonPilot Kurir Instan',
        user_phone: customerPhone,
        created_at: nowIso,
      });

      await supabase
        .from('conversations')
        .update({
          last_message: `🛵 Estimasi Ongkir Instan: ${distanceKm} km (GoSend / Grab)`,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', resolvedConvId);
    }

    // 10. Update the inbound location message with distance and calculated rates
    if (messageId) {
      try {
        const { data: origMsg } = await supabase
          .from('messages')
          .select('payload, metadata')
          .eq('id', messageId)
          .maybeSingle();

        const updatedPayload = {
          ...(origMsg?.payload || {}),
          is_location: true,
          location: {
            ...locationData,
            distanceKm,
            rates: rateResult.rates,
          },
        };

        const updatedMetadata = {
          ...(origMsg?.metadata || {}),
          location: {
            ...locationData,
            distanceKm,
            rates: rateResult.rates,
          },
          distance_km: distanceKm,
          rates: rateResult.rates,
        };

        await supabase
          .from('messages')
          .update({
            payload: updatedPayload,
            metadata: updatedMetadata,
          })
          .eq('id', messageId);
      } catch (updErr) {
        console.warn('[InstantCourier] Error updating inbound message metadata:', updErr);
      }
    }

    console.info(
      `[InstantCourier] Successfully calculated shipping for tenant '${tenant.slug}', phone ${customerPhone}: distance=${distanceKm}km, rates=${rateResult.rates.length}`
    );

    return {
      success: true,
      distanceKm,
      rates: rateResult.rates,
      sentMessage: replyText,
    };
  } catch (err: any) {
    console.error('[InstantCourier] Exception in sendInstantShippingRecommendation:', err);
    return { success: false, error: err?.message || 'Server error' };
  }
}
