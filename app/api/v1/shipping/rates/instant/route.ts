import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { resolveAreaCoordinates } from '@/app/api/v1/shipping/locations/search/route';

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';

// Batas radius maksimal kurir instan (GoSend & GrabExpress) adalah 30 km dari gudang toko
export const MAX_INSTANT_RADIUS_KM = 30;

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

    // Jika koordinat belum dikirim eksplisit, selesaikan via resolver berdasarkan kota, distrik, atau kode pos
    if (destLat == null || isNaN(destLat) || destLon == null || isNaN(destLon)) {
      if (destinationCity || destinationDistrict || destinationPostalCode) {
        const resolved = resolveAreaCoordinates(destinationCity, destinationDistrict, destinationPostalCode);
        destLat = resolved.latitude;
        destLon = resolved.longitude;
      }
    }

    // Validasi: Wajib membawa koordinat presisi atau minimal kode pos tujuan yang valid
    if (
      (destLat == null || isNaN(destLat) || destLon == null || isNaN(destLon)) &&
      (!destinationPostalCode || destinationPostalCode.length < 5)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Parameter koordinat (destination_latitude, destination_longitude) atau minimal destination_postal_code 5 digit wajib disertakan.',
        },
        { status: 400 }
      );
    }

    const weightInGrams = Math.max(100, Number(body.weight || body.weight_grams || 1000));

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

    if (slug) {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const [settingsRes, tenantRes] = await Promise.all([
            supabase
              .from('tenant_settings')
              .select('biteship_config')
              .eq('tenant_slug', slug)
              .maybeSingle(),
            supabase
              .from('tenants')
              .select('metadata')
              .eq('slug', slug)
              .maybeSingle(),
          ]);

          const biteshipCfg = settingsRes.data?.biteship_config;
          const shippingOrigin = (settingsRes.data as any)?.shipping_origin;
          const meta = tenantRes.data?.metadata || {};
          const metaShipping = meta.shipping_config;

          if (biteshipCfg) {
            isShippingActive = biteshipCfg.is_enabled ?? true;
            if (Array.isArray(biteshipCfg.couriers)) {
              enabledCouriers = biteshipCfg.couriers.filter((c: any) => c.enabled);
            }
          }

          const originObj = biteshipCfg?.origin || shippingOrigin || {};
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

          if (originObj.latitude !== undefined && originObj.latitude !== null) {
            originLat = Number(originObj.latitude);
          }
          if (originObj.longitude !== undefined && originObj.longitude !== null) {
            originLon = Number(originObj.longitude);
          }

          const fnbSettings = biteshipCfg?.fnb_settings || metaShipping?.fnb_settings || meta?.fnb_settings || {};
          if ((originLat == null || isNaN(originLat)) && fnbSettings.latitude !== undefined && fnbSettings.latitude !== null) {
            originLat = Number(fnbSettings.latitude);
          }
          if ((originLon == null || isNaN(originLon)) && fnbSettings.longitude !== undefined && fnbSettings.longitude !== null) {
            originLon = Number(fnbSettings.longitude);
          }

          if (!originPostalCode && typeof meta.warehouse_address === 'string') {
            const match = meta.warehouse_address.match(/\b\d{5}\b/);
            if (match) originPostalCode = match[0];
          }
        }
      } catch (err) {
        console.warn('[Rates Instant API] Tenant settings fallback:', err);
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

    // Default origin ke gudang toko pusat jika belum ditentukan
    const effectiveOriginPostal = Number(originPostalCode) || 40286;
    const effectiveDestPostal = Number(destinationPostalCode) || 40115;

    // Selesaikan koordinat origin gudang toko
    if (originLat == null || isNaN(originLat) || originLon == null || isNaN(originLon)) {
      const originResolved = resolveAreaCoordinates(originCity || 'Kota Bandung', originDistrict || 'Buahbatu', String(effectiveOriginPostal));
      originLat = originResolved.latitude;
      originLon = originResolved.longitude;
    }

    // Pastikan koordinat destinasi final terdefinisi
    const finalDestLat = destLat ?? -6.9175;
    const finalDestLon = destLon ?? 107.6191;

    // 2. Hitung Jarak Geospasial Haversine & Validasi Radius Maksimal 30 KM
    const distanceKm = calculateDistanceKm(originLat, originLon, finalDestLat, finalDestLon);

    if (distanceKm > MAX_INSTANT_RADIUS_KM) {
      return NextResponse.json({
        success: true,
        coverage: false,
        is_instant_eligible: false,
        distance_km: distanceKm,
        max_radius_km: MAX_INSTANT_RADIUS_KM,
        message: `Alamat tujuan berada di luar radius kurir instan (jarak: ${distanceKm} km, batas maksimal: ${MAX_INSTANT_RADIUS_KM} km). Silakan gunakan kurir reguler atau kargo.`,
        rates: [],
        couriers: [],
      });
    }

    // 3. Jarak Masuk Radius (<= 30 KM): Tarik Tarif Real-Time GoSend & GrabExpress via Biteship
    const biteshipKey = process.env.BITESHIP_API_KEY;
    const availableRates: any[] = [];
    let biteshipSuccess = false;

    if (biteshipKey) {
      try {
        const payload: any = {
          origin_latitude: originLat,
          origin_longitude: originLon,
          origin_postal_code: effectiveOriginPostal,
          destination_latitude: finalDestLat,
          destination_longitude: finalDestLon,
          destination_postal_code: effectiveDestPostal,
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

    return NextResponse.json({
      success: true,
      coverage: availableRates.length > 0,
      is_instant_eligible: true,
      distance_km: distanceKm,
      max_radius_km: MAX_INSTANT_RADIUS_KM,
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