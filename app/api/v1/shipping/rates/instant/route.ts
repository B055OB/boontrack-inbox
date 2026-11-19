import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { resolveAreaCoordinates, geocodeDestinationAddress } from '@/app/api/v1/shipping/locations/search/route';
import { calculateShabuAjhiRate } from '@/lib/delivery/shabuAjhiRates';
import {
  CateringItem,
  countCateringPackages,
  LARGE_ORDER_WARNING_MESSAGE,
} from '@/lib/shipping/deliveryCalculator';

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';

// Batas radius maksimal kurir instan (GoSend & GrabExpress) adalah 30 km dari gudang toko
export const MAX_INSTANT_RADIUS_KM = 30;
export const DEFAULT_FNB_INSTANT_RADIUS_KM = 40;
export const MIN_MERCHANT_RADIUS_KM = 1;
export const MAX_MERCHANT_RADIUS_KM = 60;

export function parseValidRadiusKm(raw: unknown): number | null {
  if (typeof raw === 'boolean' || raw === null || raw === undefined || raw === '') {
    return null;
  }
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (
    !Number.isFinite(parsed) ||
    Number.isNaN(parsed) ||
    parsed < MIN_MERCHANT_RADIUS_KM ||
    parsed > MAX_MERCHANT_RADIUS_KM
  ) {
    return null;
  }
  return parsed;
}

export function isFnbCateringShippingContext(
  biteshipCfg?: any,
  metaShipping?: any,
  tenantMeta?: any,
  explicitIsFnb?: boolean
): boolean {
  const fnbFlag = tenantMeta?.fnb_catering;
  const tierMode = String(metaShipping?.tier_mode || '').toUpperCase();
  const category = String(tenantMeta?.business_category || tenantMeta?.category || '').toUpperCase();
  const vertical = String(tenantMeta?.vertical || '').toLowerCase();
  return Boolean(
    explicitIsFnb ||
      fnbFlag === true ||
      fnbFlag?.is_enabled === true ||
      fnbFlag?.is_fnb_home_service === true ||
      tierMode === 'CATERING_13_TIER' ||
      tierMode === '13_TIER' ||
      metaShipping?.fnb_settings?.fnb_catering === true ||
      metaShipping?.fnb_settings?.is_fnb_store === true ||
      biteshipCfg?.fnb_settings?.fnb_catering === true ||
      biteshipCfg?.fnb_settings?.is_fnb_store === true ||
      tenantMeta?.logistics?.primary === 'internal_fleet' ||
      vertical === 'fnb-culinary' ||
      category.includes('FOOD') ||
      category.includes('F&B') ||
      category.includes('FNB') ||
      category.includes('CATERING') ||
      Boolean(metaShipping?.internal_courier) ||
      Boolean(metaShipping?.lalamove_internal)
  );
}

/**
 * Resolves authoritative instant courier max radius (KM):
 * - Generic non-F&B without explicit override: 30 km (MAX_INSTANT_RADIUS_KM)
 * - Configured F&B / catering default & defensive fallback: 40 km
 * - Valid merchant override (1..60 km) honored only when valid and synchronized
 *   (unsynced tenant_settings.biteship_config.fnb_settings without updated_at/radius_synced_at
 *    cannot silently downgrade F&B 40 km policy).
 */
export function resolveEffectiveInstantRadius(
  biteshipCfg?: any,
  metaShipping?: any,
  tenantMeta?: any,
  explicitIsFnb?: boolean
): number {
  const isFnbContext = isFnbCateringShippingContext(
    biteshipCfg,
    metaShipping,
    tenantMeta,
    explicitIsFnb
  );

  const biteshipFnb = biteshipCfg?.fnb_settings;
  const biteshipSynced = Boolean(
    biteshipFnb?.radius_synced_at || biteshipFnb?.updated_at
  );
  const biteshipRadius = biteshipSynced
    ? parseValidRadiusKm(biteshipFnb?.max_radius_km)
    : null;

  const metaCandidates = [
    metaShipping?.fnb_settings?.max_radius_km,
    metaShipping?.max_radius_km,
    metaShipping?.internal_courier?.max_radius_km,
    metaShipping?.lalamove_internal?.max_radius_km,
    tenantMeta?.fnb_settings?.max_radius_km,
  ];
  let metaRadius: number | null = null;
  for (const cand of metaCandidates) {
    const parsed = parseValidRadiusKm(cand);
    if (parsed !== null) {
      metaRadius = parsed;
      break;
    }
  }

  if (biteshipRadius !== null && metaRadius !== null) {
    if (biteshipRadius === metaRadius) return biteshipRadius;
    return biteshipFnb?.radius_synced_at ? biteshipRadius : metaRadius;
  }
  if (biteshipRadius !== null) {
    return biteshipRadius;
  }
  if (metaRadius !== null) {
    return metaRadius;
  }

  return isFnbContext ? DEFAULT_FNB_INSTANT_RADIUS_KM : MAX_INSTANT_RADIUS_KM;
}

export function isExplicitBandungInput(
  city?: string,
  district?: string,
  postalCode?: string,
  address?: string
): boolean {
  const combined = `${city || ''} ${district || ''} ${address || ''}`.toLowerCase();
  const cleanPostal = String(postalCode || '').trim();
  return combined.includes('bandung') || cleanPostal.startsWith('40');
}

// Helper: Menghitung jarak geospasial presisi antara dua titik koordinat (Haversine Formula) dalam KM
export function calculateDistanceKm(
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

// Helper: Menghitung estimasi jarak rute jalan riil (Road Distance) dengan faktor kurvatur jalanan Indonesia (1.30x)
export function calculateRoadDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const straight = calculateDistanceKm(lat1, lon1, lat2, lon2);
  if (straight <= 0) return 0;
  return Math.round(straight * 1.30 * 10) / 10;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const slug = (body.slug || body.tenant_slug || searchParams.get('slug') || '').trim();

    const destinationPostalCode = String(body.destination_postal_code || body.postal_code || '').trim();
    const destinationAreaId = (body.destination_area_id || body.area_id || '').trim();
    const destinationCity = (body.destination_city || body.city || '').trim();
    const destinationDistrict = (body.destination_district || body.district || '').trim();
    const destinationAddress = (body.destination_address || body.address || '').trim();

    // Ekstraksi parameter koordinat tujuan (latitude & longitude)
    let destLat: number | null =
      body.destination_latitude !== undefined && body.destination_latitude !== null && body.destination_latitude !== ''
        ? Number(body.destination_latitude)
        : body.latitude !== undefined && body.latitude !== null && body.latitude !== ''
        ? Number(body.latitude)
        : null;

    let destLon: number | null =
      body.destination_longitude !== undefined && body.destination_longitude !== null && body.destination_longitude !== ''
        ? Number(body.destination_longitude)
        : body.longitude !== undefined && body.longitude !== null && body.longitude !== ''
        ? Number(body.longitude)
        : null;

    // Jika koordinat belum dikirim eksplisit, selesaikan via resolver berdasarkan kota, distrik, kode pos, atau alamat
    if (destLat == null || isNaN(destLat) || destLon == null || isNaN(destLon)) {
      if (destinationAddress || destinationCity || destinationDistrict || destinationPostalCode) {
        const resolved = await geocodeDestinationAddress(
          destinationAddress,
          destinationCity,
          destinationDistrict,
          destinationPostalCode
        );
        const isSyntheticBandungFallback =
          resolved.latitude === -6.9175 &&
          resolved.longitude === 107.6191 &&
          !isExplicitBandungInput(
            destinationCity,
            destinationDistrict,
            destinationPostalCode,
            destinationAddress
          );
        if (!isSyntheticBandungFallback) {
          destLat = resolved.latitude;
          destLon = resolved.longitude;
        }
      }
    }

    // Fail-closed: wajib memiliki koordinat tujuan yang valid (dilarang fallback ke koordinat Bandung)
    if (destLat == null || isNaN(destLat) || destLon == null || isNaN(destLon)) {
      return NextResponse.json(
        {
          success: false,
          error_code: 'DESTINATION_COORDINATES_REQUIRED',
          error:
            'Parameter koordinat tujuan (destination_latitude, destination_longitude) atau lokasi tujuan yang dapat di-geocode wajib disertakan.',
          coverage: false,
          is_instant_eligible: false,
          rates: [],
          couriers: [],
        },
        { status: 400 }
      );
    }

    let rawWeight = Number(body.weight || body.weight_grams || 0);
    if (Array.isArray(body.items) && body.items.length > 0) {
      const itemsWeight = body.items.reduce((sum: number, it: any) => {
        const itemWeight = Number(it.weight_grams || it.weight || 0);
        const itemQty = Number(it.quantity || 1);
        return sum + (itemWeight * itemQty);
      }, 0);
      if (itemsWeight > 0) {
        rawWeight = itemsWeight;
      }
    }
    const weightInGrams = Math.max(100, rawWeight || 1000);

    // 1. Validasi Coverage / Konfigurasi & Ambil Dynamic Origin dari Supabase
    let isShippingActive = true;
    let originPostalCode = String(body.origin_postal_code || '').trim();
    let originCity = (body.origin_city || '').trim();
    let originDistrict = (body.origin_district || '').trim();
    let originAddress = (body.origin_address || '').trim();
    let originLat: number | null =
      body.origin_latitude !== undefined && body.origin_latitude !== null && body.origin_latitude !== ''
        ? Number(body.origin_latitude)
        : null;
    let originLon: number | null =
      body.origin_longitude !== undefined && body.origin_longitude !== null && body.origin_longitude !== ''
        ? Number(body.origin_longitude)
        : null;
    let enabledCouriers: any[] = [];
    let biteshipCfg: any = null;
    let metaShipping: any = null;
    let tenantMeta: any = null;

    if (slug) {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return NextResponse.json(
          {
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            coverage: false,
            is_instant_eligible: false,
            rates: [],
            couriers: [],
            message: 'Database admin client is unavailable.',
          },
          { status: 503 }
        );
      }

      const [settingsRes, tenantRes] = await Promise.all([
        supabase
          .from('tenant_settings')
          .select('biteship_config')
          .eq('tenant_slug', slug)
          .maybeSingle(),
        supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('slug', slug)
          .maybeSingle(),
      ]);

      if (settingsRes?.error || tenantRes?.error) {
        return NextResponse.json(
          {
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            coverage: false,
            is_instant_eligible: false,
            rates: [],
            couriers: [],
            message: settingsRes?.error?.message || tenantRes?.error?.message || 'Gagal membaca konfigurasi toko.',
          },
          { status: 503 }
        );
      }

      if (!tenantRes?.data) {
        return NextResponse.json(
          {
            success: false,
            error: 'TENANT_NOT_FOUND',
            coverage: false,
            is_instant_eligible: false,
            rates: [],
            couriers: [],
            message: 'Toko tidak ditemukan.',
          },
          { status: 404 }
        );
      }

      biteshipCfg = settingsRes.data?.biteship_config || null;
      const shippingOrigin = (settingsRes.data as any)?.shipping_origin;
      const meta = tenantRes.data?.metadata || {};
      tenantMeta = meta;
      metaShipping = meta.shipping_config;

      if (biteshipCfg) {
        isShippingActive = biteshipCfg.is_enabled ?? true;
        if (Array.isArray(biteshipCfg.couriers)) {
          enabledCouriers = biteshipCfg.couriers.filter((c: any) => c.enabled);
        }
      }

      const originObj = biteshipCfg?.origin || shippingOrigin || metaShipping?.origin || {};
      originPostalCode =
        originPostalCode ||
        originObj.postal_code ||
        originObj.origin_postal_code ||
        metaShipping?.origin_postal_code ||
        meta.origin_postal_code ||
        meta.warehouse_address?.postal_code ||
        '';

      originCity =
        originCity ||
        originObj.city ||
        originObj.origin_city ||
        metaShipping?.origin_city ||
        meta.origin_city ||
        meta.warehouse_address?.city ||
        '';

      originDistrict =
        originDistrict ||
        originObj.district ||
        originObj.origin_district ||
        metaShipping?.origin_district ||
        meta.origin_district ||
        meta.warehouse_address?.district ||
        '';

      originAddress =
        originAddress ||
        originObj.address ||
        originObj.origin_address ||
        metaShipping?.origin_address ||
        meta.origin_address ||
        (typeof meta.warehouse_address === 'string' ? meta.warehouse_address : meta.warehouse_address?.address) ||
        '';

      if (originObj.latitude !== undefined && originObj.latitude !== null && originObj.latitude !== '') {
        originLat = Number(originObj.latitude);
      }
      if (originObj.longitude !== undefined && originObj.longitude !== null && originObj.longitude !== '') {
        originLon = Number(originObj.longitude);
      }

      const fnbSettings = biteshipCfg?.fnb_settings || metaShipping?.fnb_settings || meta?.fnb_settings || {};
      if ((originLat == null || isNaN(originLat)) && fnbSettings.latitude !== undefined && fnbSettings.latitude !== null && fnbSettings.latitude !== '') {
        originLat = Number(fnbSettings.latitude);
      }
      if ((originLon == null || isNaN(originLon)) && fnbSettings.longitude !== undefined && fnbSettings.longitude !== null && fnbSettings.longitude !== '') {
        originLon = Number(fnbSettings.longitude);
      }

      const metaOriginFallback = meta?.outlet_coordinates || metaShipping?.origin || {};
      if ((originLat == null || isNaN(originLat)) && metaOriginFallback.latitude !== undefined && metaOriginFallback.latitude !== null && metaOriginFallback.latitude !== '') {
        originLat = Number(metaOriginFallback.latitude);
      }
      if ((originLon == null || isNaN(originLon)) && metaOriginFallback.longitude !== undefined && metaOriginFallback.longitude !== null && metaOriginFallback.longitude !== '') {
        originLon = Number(metaOriginFallback.longitude);
      }
      if ((originLat == null || isNaN(originLat)) && metaShipping?.origin_latitude !== undefined && metaShipping?.origin_latitude !== null && metaShipping?.origin_latitude !== '') {
        originLat = Number(metaShipping.origin_latitude);
      }
      if ((originLon == null || isNaN(originLon)) && metaShipping?.origin_longitude !== undefined && metaShipping?.origin_longitude !== null && metaShipping?.origin_longitude !== '') {
        originLon = Number(metaShipping.origin_longitude);
      }

      if (!originPostalCode && typeof meta.warehouse_address === 'string') {
        const match = meta.warehouse_address.match(/\b\d{5}\b/);
        if (match) originPostalCode = match[0];
      }
    }

    if (!isShippingActive) {
      return NextResponse.json({
        success: true,
        coverage: false,
        is_instant_eligible: false,
        message: 'Layanan pengiriman dinonaktifkan oleh toko.',
        couriers: [],
        rates: [],
      });
    }

    const effectiveOriginPostal = Number(originPostalCode) || undefined;
    const effectiveDestPostal = Number(destinationPostalCode) || undefined;

    // Selesaikan koordinat origin gudang toko ONLY dari input/config toko yang eksplisit (NO silent Bandung fallback)
    if (originLat == null || isNaN(originLat) || originLon == null || isNaN(originLon)) {
      if (originCity || originDistrict || originPostalCode) {
        const originResolved = resolveAreaCoordinates(originCity, originDistrict, originPostalCode);
        const isSyntheticBandungFallback =
          originResolved.latitude === -6.9175 &&
          originResolved.longitude === 107.6191 &&
          !isExplicitBandungInput(originCity, originDistrict, originPostalCode, originAddress);
        if (!isSyntheticBandungFallback) {
          originLat = originResolved.latitude;
          originLon = originResolved.longitude;
        }
      }
    }

    // Fail-closed: origin koordinat wajib ada sebelum menghitung tarif instan
    if (originLat == null || isNaN(originLat) || originLon == null || isNaN(originLon)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ORIGIN_NOT_CONFIGURED',
          coverage: false,
          is_instant_eligible: false,
          rates: [],
          couriers: [],
          message: 'Titik koordinat dapur/gudang asal toko belum dikonfigurasi.',
        },
        { status: 422 }
      );
    }

    const finalDestLat = destLat;
    const finalDestLon = destLon;

    // 2. Hitung Jarak Geospasial Haversine & Validasi Radius Maksimal
    const straightDistanceKm = calculateDistanceKm(originLat, originLon, finalDestLat, finalDestLon);
    const roadDistanceKm = calculateRoadDistanceKm(originLat, originLon, finalDestLat, finalDestLon);
    const distanceKm = roadDistanceKm > 0 ? roadDistanceKm : straightDistanceKm;

    const effectiveMaxRadius = resolveEffectiveInstantRadius(
      biteshipCfg,
      metaShipping,
      tenantMeta,
      Boolean(body.is_fnb)
    );

    if (distanceKm > effectiveMaxRadius) {
      return NextResponse.json({
        success: true,
        coverage: false,
        is_instant_eligible: false,
        instant_eligible: false,
        out_of_range: true,
        distance_km: distanceKm,
        max_radius_km: effectiveMaxRadius,
        origin_coordinates: { latitude: originLat, longitude: originLon },
        destination_coordinates: { latitude: finalDestLat, longitude: finalDestLon },
        message: `Alamat tujuan berada di luar radius kurir instan (jarak: ${distanceKm} km, batas maksimal: ${effectiveMaxRadius} km). Silakan hubungi CS untuk koordinasi manual.`,
        rates: [],
        couriers: [],
      });
    }

    // 3. Jarak Masuk Radius (<= 30 KM): Tarik Tarif Real-Time GoSend & GrabExpress via Biteship
    const biteshipKey = process.env.BITESHIP_API_KEY;
    const availableRates: any[] = [];
    let biteshipSuccess = false;

    // Deteksi apakah tenant mengaktifkan skema FnB Catering / Home Service (13-Tier + Jemput Alat Masak Kotor)
    const isCateringTenant = Boolean(
      metaShipping?.tier_mode === 'CATERING_13_TIER' ||
      metaShipping?.tier_mode === '13_TIER' ||
      tenantMeta?.fnb_catering?.is_enabled ||
      tenantMeta?.fnb_catering?.is_fnb_home_service ||
      metaShipping?.internal_courier?.label?.includes('Alat Masak Kotor')
    );

    if (isCateringTenant) {
      const cateringItems: CateringItem[] = Array.isArray(body.items)
        ? body.items.map((it: any) => ({
            name: it.productTitle || it.title || it.name || '',
            qty: Number(it.quantity || it.qty || 1),
            price: Number(it.unitPrice || it.price || 0),
            isAddon: Boolean(it.isAddon || it.is_addon),
            is_addon: Boolean(it.isAddon || it.is_addon),
            requires_equipment: it.requires_equipment !== undefined ? Boolean(it.requires_equipment) : undefined,
            category: it.category || it.category_name,
            soupVariant: it.soupVariant || it.variant,
            selectedSoups: it.selectedSoups,
          }))
        : [];

      const hasInternalDriver = metaShipping?.internal_courier?.is_enabled !== false;
      const cateringResult = calculateShabuAjhiRate(distanceKm, {
        hasInternalDriver,
        items: cateringItems.length > 0 ? cateringItems : undefined,
      });

      if (cateringResult.outOfRange || !cateringResult.isDeliverable) {
        return NextResponse.json({
          success: true,
          coverage: false,
          is_instant_eligible: false,
          instant_eligible: false,
          out_of_range: true,
          distance_km: distanceKm,
          max_radius_km: effectiveMaxRadius,
          origin_coordinates: { latitude: originLat, longitude: originLon },
          destination_coordinates: { latitude: finalDestLat, longitude: finalDestLon },
          message:
            cateringResult.notes ||
            `Alamat tujuan berada di luar jangkauan pengantaran armada (jarak: ${distanceKm} km, batas maksimal: ${effectiveMaxRadius} km).`,
          rates: [],
          couriers: [],
        });
      }

      const packageCount = countCateringPackages(cateringItems);
      const requiresManualCoordination = Boolean(
        (cateringResult.fleetType === 'custom' && cateringResult.multiplier === 0) ||
          packageCount >= 5
      );
      const isAlacarteOnly = !cateringResult.requires_pickup;
      const officialCourierName = requiresManualCoordination
        ? 'Armada Khusus Katering (Konfirmasi CS / Manual)'
        : isAlacarteOnly
          ? (metaShipping?.internal_courier?.label_oneway || 'Kurir Instan Toko (Pengantaran 1 Arah)')
          : (metaShipping?.internal_courier?.label || 'Kurir Dapur Instan (Armada Toko Antar-Jemput Alat Masak)');

      availableRates.push({
        id: requiresManualCoordination
          ? 'catering_armada_manual'
          : isAlacarteOnly
            ? 'alacarte_armada_internal'
            : 'catering_armada_internal',
        courier_name: officialCourierName,
        service: requiresManualCoordination
          ? 'Armada Khusus — Konfirmasi CS / Manual (Pesanan >= 5 Paket)'
          : cateringResult.fleetDescription || (isAlacarteOnly ? 'Pengantaran Menu Makanan (Tanpa Pinjam Alat)' : 'Antar & Jemput Alat Masak Kotor H+1'),
        price: requiresManualCoordination ? null : cateringResult.totalFee,
        ...(requiresManualCoordination ? { price_label: 'Konfirmasi CS / Manual' } : {}),
        etd: requiresManualCoordination
          ? 'Jadwal & Tarif Dikonfirmasi CS'
          : isAlacarteOnly
            ? 'Hari Ini (1 - 2 Jam Diantar Langsung)'
            : 'Hari Ini (Termasuk Jemput Alat Masak Kotor)',
        type: 'instant',
        badge: requiresManualCoordination
          ? 'Konfirmasi CS / Manual'
          : cateringResult.totalFee === 0
            ? 'Gratis Ongkir'
            : isAlacarteOnly
              ? 'Kurir 1 Arah'
              : cateringResult.surchargeFee > 0
                ? 'Surcharge Jarak Ekstrem'
                : 'Armada Toko PP',
        distance_km: distanceKm,
        provider: 'internal',
        requires_manual_coordination: requiresManualCoordination,
        requires_pickup: cateringResult.requires_pickup,
        notes: requiresManualCoordination ? LARGE_ORDER_WARNING_MESSAGE : cateringResult.notes,
      });

      biteshipSuccess = true;
    }

    if (biteshipKey) {
      try {
        const payload: any = {
          origin_latitude: originLat,
          origin_longitude: originLon,
          ...(effectiveOriginPostal ? { origin_postal_code: effectiveOriginPostal } : {}),
          destination_latitude: finalDestLat,
          destination_longitude: finalDestLon,
          ...(effectiveDestPostal ? { destination_postal_code: effectiveDestPostal } : {}),
          couriers: 'gosend,grab',
          items: [
            {
              name: 'Barang Kiriman',
              value: 50000,
              weight: weightInGrams,
              quantity: 1,
            },
          ],
        };

        if (destinationAreaId) {
          payload.destination_area_id = destinationAreaId;
        }

        const biteshipRes = await fetch(BITESHIP_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${biteshipKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (biteshipRes.ok) {
          const bData = await biteshipRes.json();
          if (Array.isArray(bData?.pricing) && bData.pricing.length > 0) {
            bData.pricing.forEach((rate: any) => {
              const courierCode = String(rate.courier_name || '').toLowerCase();
              const isAllowed =
                enabledCouriers.length === 0 ||
                enabledCouriers.some((c) => c.id === courierCode || c.name.toLowerCase().includes(courierCode));

              if (!isAllowed) return;

              availableRates.push({
                id: `instant_${courierCode}_${rate.service_type || rate.courier_service_name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                courier_name: `${rate.courier_name.toUpperCase()} (${rate.courier_service_name || rate.service_type})`,
                service: rate.courier_service_name || rate.service_type,
                price: Number(rate.price) || 0,
                etd: rate.duration || '1-2 Jam',
                type: 'instant',
                badge: 'Tiba Hari Ini (1-2 Jam)',
                distance_km: distanceKm,
                provider: 'biteship',
              });
            });

            if (availableRates.length > 0) {
              biteshipSuccess = true;
            }
          }
        }
      } catch (bErr) {
        console.warn('[Rates Instant API] Fetch error:', bErr);
      }
    }

    // 4. Fallback Dinamis Berbasis Jarak KM jika API Biteship Offline / Sandbox Saldo Habis
    // Dihitung adil berdasarkan jarak nyata km (bukan flat buta Rp 20.000)
    if (!biteshipSuccess) {
      const extraKm = Math.max(0, distanceKm - 4);
      const internalCourier = metaShipping?.internal_courier || metaShipping?.lalamove_internal;

      if (internalCourier && internalCourier.is_enabled !== false) {
        const motorBase = internalCourier.rates?.motor?.base_price ?? internalCourier.motor_base_rate ?? 12000;
        const motorPerKm = internalCourier.rates?.motor?.per_km_price ?? internalCourier.motor_per_km_rate ?? 2800;
        const carBase = internalCourier.rates?.car?.base_price ?? internalCourier.car_base_rate ?? 40000;
        const carPerKm = internalCourier.rates?.car?.per_km_price ?? internalCourier.car_per_km_rate ?? 4500;
        const officialCourierName = 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)';

        const motorPrice = Math.max(motorBase, Math.round((motorBase + extraKm * motorPerKm) / 500) * 500);
        const carPrice = Math.max(carBase, Math.round((carBase + extraKm * carPerKm) / 500) * 500);

        availableRates.push({
          id: 'armada_motor',
          courier_name: officialCourierName,
          service: 'Paket 2–4 Pax (Motor / Kurir Ringan)',
          price: motorPrice,
          etd: '1 - 2 Jam (Antar + Jemput Alat Masak Kotor)',
          type: 'instant',
          badge: 'Armada Internal Toko',
          distance_km: distanceKm,
          provider: 'internal',
        });

        availableRates.push({
          id: 'armada_car',
          courier_name: officialCourierName,
          service: 'Paket 10 Pax / Rombongan / Multi-Kompor (Mobil / MPV)',
          price: carPrice,
          etd: '1 - 2 Jam (Antar + Jemput Alat Masak Kotor)',
          type: 'instant',
          badge: 'Armada Internal Toko',
          distance_km: distanceKm,
          provider: 'internal',
        });
      } else {
        const gosendPrice = Math.max(20000, Math.round((20000 + extraKm * 2500) / 1000) * 1000);
        const grabPrice = Math.max(18000, Math.round((18000 + extraKm * 2500) / 1000) * 1000);

        const isGosendAllowed = enabledCouriers.length === 0 || enabledCouriers.some((c) => c.id === 'gosend');
        const isGrabAllowed = enabledCouriers.length === 0 || enabledCouriers.some((c) => c.id === 'grab');

        if (isGosendAllowed) {
          availableRates.push({
            id: 'instant_gosend_instant',
            courier_name: 'GOSEND (Instant)',
            service: 'Instant',
            price: gosendPrice,
            etd: '1 - 2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini (1-2 Jam)',
            distance_km: distanceKm,
            provider: 'biteship',
          });
        }

        if (isGrabAllowed) {
          availableRates.push({
            id: 'instant_grab_instant',
            courier_name: 'GRAB (Instant)',
            service: 'Instant',
            price: grabPrice,
            etd: '1 - 2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini (1-2 Jam)',
            distance_km: distanceKm,
            provider: 'biteship',
          });
        }
      }
    }

    const hasManualCoordination = availableRates.some((r) => Boolean(r?.requires_manual_coordination));

    return NextResponse.json({
      success: true,
      coverage: availableRates.length > 0,
      is_instant_eligible: true,
      instant_eligible: true,
      requires_manual_coordination: hasManualCoordination,
      distance_km: distanceKm,
      max_radius_km: effectiveMaxRadius,
      origin_coordinates: { latitude: originLat, longitude: originLon },
      destination_coordinates: { latitude: finalDestLat, longitude: finalDestLon },
      rates: availableRates,
      couriers: availableRates,
      message: availableRates.length === 0 ? 'Kurir instan dinonaktifkan pada toko ini.' : undefined,
    });
  } catch (error: any) {
    console.error('[Rates Instant API] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses tarif instan' },
      { status: 500 }
    );
  }
}