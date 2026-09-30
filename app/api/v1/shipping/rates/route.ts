import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { calculateDistanceKm, MAX_INSTANT_RADIUS_KM } from '@/app/api/v1/shipping/rates/instant/route';
import { resolveAreaCoordinates } from '@/app/api/v1/shipping/locations/search/route';

export interface RateOption {
  id: string;
  courier_name: string;
  service: string;
  price: number;
  etd: string;
  type: 'instant' | 'regular' | 'cargo';
  badge?: string;
  provider: 'biteship' | 'lincah' | 'platform';
  max_days: number;
  is_fnb_safe: boolean;
  warning?: string;
}

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';
const LINCAH_API_URL = 'https://api.lincah.id/openapi/ongkir';

// Helper: Menghitung batas maksimum durasi pengiriman dalam hari untuk validasi kesegaran produk FnB
export function parseMaxEtdDays(etd: string, serviceType?: string): number {
  if (!etd) return 3;
  const lower = etd.toLowerCase();
  if (lower.includes('jam') || lower.includes('hour') || serviceType === 'instant' || serviceType === 'same_day') {
    return 0.2;
  }
  if (serviceType === 'cargo' || lower.includes('kargo') || lower.includes('cargo')) {
    return 5;
  }
  const numbers = etd.match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    if (lower.includes('besok') || lower.includes('next day') || lower.includes('yes') || lower.includes('best') || lower.includes('ons')) {
      return 1;
    }
    return 3;
  }
  const parsed = numbers.map(Number);
  return Math.max(...parsed);
}

// Helper: Deteksi Zona Geografis Indonesia untuk Tarif Realistis (Anti Flat Rp 20.000)
interface ZoneInfo {
  name: string;
  baseReg: number;
  baseExp: number;
  baseCargo: number;
  etdReg: string;
  etdExp: string;
  etdCargo: string;
}

export function detectIndonesianZone(city: string, district: string, postal: string): ZoneInfo {
  const c = (city || '').toLowerCase();
  const d = (district || '').toLowerCase();
  const p = String(postal || '').trim();
  const text = `${c} ${d}`;

  // 1. Papua & Maluku (Zona 9)
  if (/^(97|98|99)/.test(p) || /papua|jayapura|sorong|manokwari|merauke|timika|mimika|ambon|ternate/.test(text)) {
    return {
      name: 'Papua & Maluku',
      baseReg: 110000,
      baseExp: 170000,
      baseCargo: 75000,
      etdReg: '4 - 7 Hari',
      etdExp: '2 - 3 Hari',
      etdCargo: '7 - 12 Hari',
    };
  }

  // 2. Sulawesi & Nusa Tenggara (Zona 8 & 9)
  if (
    /^(83|84|85|86|87|90|91|92|93|94|95|96)/.test(p) ||
    /sulawesi|makassar|manado|palu|kendari|gorontalo|mamuju|lombok|mataram|kupang|bima|sumbawa|ntb|ntt/.test(text)
  ) {
    return {
      name: 'Sulawesi & Nusa Tenggara',
      baseReg: 50000,
      baseExp: 75000,
      baseCargo: 45000,
      etdReg: '3 - 5 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '6 - 8 Hari',
    };
  }

  // 3. Kalimantan (Zona 7)
  if (
    /^(70|71|72|73|74|75|76|77|78|79)/.test(p) ||
    /kalimantan|banjarmasin|balikpapan|samarinda|pontianak|palangkaraya|tarakan|banjarbaru|bontang/.test(text)
  ) {
    return {
      name: 'Kalimantan',
      baseReg: 42000,
      baseExp: 65000,
      baseCargo: 40000,
      etdReg: '3 - 4 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '5 - 7 Hari',
    };
  }

  // 4. Sumatera Bagian Tengah & Utara (Riau / Pekanbaru, Sumut, Sumbar, Aceh, Kepri) (Zona 2)
  if (
    /^(20|21|22|23|24|25|26|27|28|29)/.test(p) ||
    /pekanbaru|riau|dumai|kampar|rokan|siak|medan|padang|aceh|batam|pinang|bukittinggi|deli|siantar/.test(text)
  ) {
    return {
      name: 'Sumatera Tengah & Utara',
      baseReg: 45000,
      baseExp: 68000,
      baseCargo: 35000,
      etdReg: '3 - 4 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '5 - 7 Hari',
    };
  }

  // 5. Sumatera Bagian Selatan (Lampung, Palembang, Jambi, Bengkulu, Babel) (Zona 3)
  if (
    /^(30|31|32|33|34|35|36|37|38|39)/.test(p) ||
    /palembang|lampung|bandar lampung|jambi|bengkulu|bangka|belitung|pangkalpinang|lahat|lubuklinggau/.test(text)
  ) {
    return {
      name: 'Sumatera Bagian Selatan',
      baseReg: 30000,
      baseExp: 48000,
      baseCargo: 28000,
      etdReg: '2 - 4 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '4 - 6 Hari',
    };
  }

  // 6. Jawa Timur & Bali (Zona 6 & 80-82)
  if (
    /^(60|61|62|63|64|65|66|67|68|69|80|81|82)/.test(p) ||
    /surabaya|malang|sidoarjo|gresik|jember|banyuwangi|kediri|madiun|probolinggo|pasuruan|bali|denpasar|badung|gianyar|buleleng/.test(
      text
    )
  ) {
    return {
      name: 'Jawa Timur & Bali',
      baseReg: 22000,
      baseExp: 38000,
      baseCargo: 22000,
      etdReg: '2 - 3 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '3 - 5 Hari',
    };
  }

  // 7. Jawa Tengah & DI Yogyakarta (Zona 5)
  if (
    /^(50|51|52|53|54|55|56|57|58|59)/.test(p) ||
    /semarang|solo|surakarta|jogja|yogyakarta|sleman|bantul|pati|kudus|magelang|pekalongan|tegal|purwokerto|banyumas|klaten|cilacap/.test(
      text
    )
  ) {
    return {
      name: 'Jawa Tengah & DIY',
      baseReg: 18000,
      baseExp: 30000,
      baseCargo: 20000,
      etdReg: '2 - 3 Hari',
      etdExp: '1 - 2 Hari',
      etdCargo: '3 - 4 Hari',
    };
  }

  // 8. Jabodetabek & Banten (Zona 1)
  if (
    /^(10|11|12|13|14|15|16|17)/.test(p) ||
    /jakarta|bogor|depok|tangerang|bekasi|banten|serang|cilegon/.test(text)
  ) {
    return {
      name: 'Jabodetabek & Banten',
      baseReg: 12000,
      baseExp: 22000,
      baseCargo: 18000,
      etdReg: '1 - 2 Hari',
      etdExp: '1 Hari',
      etdCargo: '2 - 3 Hari',
    };
  }

  // 9. Jawa Barat (Intra-Provinsi) (Zona 4)
  return {
    name: 'Jawa Barat (Intra-Provinsi)',
    baseReg: 10000,
    baseExp: 18000,
    baseCargo: 15000,
    etdReg: '1 - 2 Hari',
    etdExp: '1 Hari',
    etdCargo: '2 - 3 Hari',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const slug = (body.slug || body.tenant_slug || searchParams.get('slug') || '').trim();

    const destinationCity = (body.destination_city || body.city || '').trim();
    const destinationDistrict = (body.destination_district || body.district || '').trim();
    const destinationPostalCode = (body.destination_postal_code || body.postal_code || '').trim();
    const destinationAreaId = (body.destination_area_id || body.area_id || '').trim();
    const destinationDistrictCode = (body.destination_district_code || body.district_code || '32.04.10').trim();
    const weightInGrams = Math.max(100, Number(body.weight || body.weight_grams || 1000));
    const weightInKg = Math.ceil(weightInGrams / 1000);

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

    // Deteksi apakah produk adalah FnB / makanan segar mudah basi
    const isFnb = Boolean(
      body.is_fnb ||
      body.isFnb ||
      body.is_perishable ||
      body.perishable ||
      String(body.category || '').toLowerCase().includes('fnb') ||
      String(body.category || '').toLowerCase().includes('food') ||
      String(body.category || '').toLowerCase().includes('kuliner') ||
      String(body.category || '').toLowerCase().includes('makanan')
    );

    // 1. Ambil Konfigurasi Kurir & Origin Toko Tenant dari Supabase
    let enabledCouriers: any[] = [];
    let isShippingActive = true;

    let originCity = (body.origin_city || '').trim();
    let originDistrict = (body.origin_district || '').trim();
    let originPostalCode = (body.origin_postal_code || '').trim();
    let originSubdistrictId = (body.origin_subdistrict_id || body.origin_district_code || '').trim();
    let originAddress = (body.origin_address || '').trim();
    let originLat: number | null =
      body.origin_latitude !== undefined && body.origin_latitude !== null && body.origin_latitude !== ''
        ? Number(body.origin_latitude)
        : null;
    let originLon: number | null =
      body.origin_longitude !== undefined && body.origin_longitude !== null && body.origin_longitude !== ''
        ? Number(body.origin_longitude)
        : null;

    let tenantLincah: any = null;

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
          tenantLincah = metaShipping?.lincah || biteshipCfg?.lincah || meta.lincah_config || meta.shipping_settings || null;

          if (biteshipCfg) {
            isShippingActive = biteshipCfg.is_enabled ?? true;
            if (Array.isArray(biteshipCfg.couriers)) {
              enabledCouriers = biteshipCfg.couriers.filter((c: any) => c.enabled);
            }
          }

          // Prioritas data origin toko dinamis (biteship_config -> shipping_origin -> shipping_config -> basic_shipping -> warehouse_address)
          const originObj = biteshipCfg?.origin || shippingOrigin || metaShipping?.origin || meta.shipping_settings || meta.basic_shipping || {};

          originCity =
            originCity ||
            originObj.city ||
            originObj.origin_city ||
            metaShipping?.origin_city ||
            meta.origin_city ||
            meta.basic_shipping?.origin_city ||
            meta.warehouse_address?.city ||
            '';

          originDistrict =
            originDistrict ||
            originObj.district ||
            originObj.origin_district ||
            originObj.subdistrict ||
            metaShipping?.origin_district ||
            metaShipping?.origin_subdistrict ||
            meta.origin_district ||
            meta.basic_shipping?.origin_district ||
            meta.warehouse_address?.district ||
            '';

          originPostalCode =
            originPostalCode ||
            originObj.postal_code ||
            originObj.origin_postal_code ||
            metaShipping?.origin_postal_code ||
            meta.origin_postal_code ||
            meta.warehouse_address?.postal_code ||
            '';

          originSubdistrictId =
            originSubdistrictId ||
            originObj.subdistrict_id ||
            originObj.origin_subdistrict_id ||
            originObj.district_code ||
            metaShipping?.origin_subdistrict_id ||
            meta.origin_subdistrict_id ||
            meta.warehouse_address?.subdistrict_id ||
            '';

          originAddress =
            originAddress ||
            originObj.address ||
            originObj.origin_address ||
            metaShipping?.origin_address ||
            meta.origin_address ||
            meta.basic_shipping?.origin_address ||
            (typeof meta.warehouse_address === 'string' ? meta.warehouse_address : meta.warehouse_address?.address) ||
            '';

          if (originObj.latitude !== undefined && originObj.latitude !== null && originObj.latitude !== '') {
            originLat = Number(originObj.latitude);
          }
          if (originObj.longitude !== undefined && originObj.longitude !== null && originObj.longitude !== '') {
            originLon = Number(originObj.longitude);
          }

          if (!originPostalCode && typeof meta.warehouse_address === 'string') {
            const postalMatch = meta.warehouse_address.match(/\b\d{5}\b/);
            if (postalMatch) originPostalCode = postalMatch[0];
          }
        }
      } catch (err) {
        console.warn('[Rates API] Tenant settings fallback:', err);
      }
    }

    if (!isShippingActive) {
      return NextResponse.json({
        success: true,
        rates: [],
        message: 'Layanan pengiriman dinonaktifkan oleh toko.',
      });
    }

    // Default origin ke Bandung jika belum pernah diisi oleh toko
    const effectiveOriginCity = originCity || 'Kota Bandung';
    const effectiveOriginPostal = Number(originPostalCode) || 40286;
    const effectiveDestPostal = Number(destinationPostalCode) || 0;

    // Selesaikan titik koordinat origin toko
    if (originLat == null || isNaN(originLat) || originLon == null || isNaN(originLon)) {
      const originResolved = resolveAreaCoordinates(originCity || 'Kota Bandung', originDistrict || 'Buahbatu', String(effectiveOriginPostal));
      originLat = originResolved.latitude;
      originLon = originResolved.longitude;
    }

    // Selesaikan titik koordinat tujuan pembeli
    if (destLat == null || isNaN(destLat) || destLon == null || isNaN(destLon)) {
      if (destinationCity || destinationDistrict || destinationPostalCode) {
        const destResolved = resolveAreaCoordinates(destinationCity, destinationDistrict, destinationPostalCode);
        destLat = destResolved.latitude;
        destLon = destResolved.longitude;
      }
    }
    const finalDestLat = destLat ?? -6.9175;
    const finalDestLon = destLon ?? 107.6191;

    // Hitung jarak Haversine (KM) dari toko ke pembeli
    const distanceKm = calculateDistanceKm(originLat, originLon, finalDestLat, finalDestLon);

    const cleanOriginCity = effectiveOriginCity.toLowerCase().replace(/^(kota|kabupaten|kab\.)\s*/, '').trim();
    const cleanDestCity = destinationCity.toLowerCase().replace(/^(kota|kabupaten|kab\.)\s*/, '').trim();

    const isSameCity = cleanOriginCity && cleanDestCity && (
      cleanOriginCity.includes(cleanDestCity) || cleanDestCity.includes(cleanOriginCity)
    );

    const originPrefix = String(effectiveOriginPostal).slice(0, 2);
    const destPrefix = String(destinationPostalCode).slice(0, 2);
    const isSamePostalRegion = destPrefix.length >= 2 && originPrefix === destPrefix;

    // Batas radius maksimal kurir instan: MAKSIMAL 30 KM!
    // Jika jarak > 30 km, opsi GoSend/GrabExpress WAJIB disembunyikan dan hanya menampilkan kurir reguler
    const isInstantEligible =
      distanceKm > 0
        ? distanceKm <= MAX_INSTANT_RADIUS_KM
        : isSameCity || isSamePostalRegion;

    let availableRates: RateOption[] = [];
    let externalRatesLoaded = false;

    // 2. INTEGRASI BITESHIP: MENDUKUNG SELURUH KURIR (INSTAN, REGULER, KARGO)
    const biteshipKey = process.env.BITESHIP_API_KEY;
    if (biteshipKey && (effectiveDestPostal > 0 || destinationAreaId)) {
      try {
        // Tentukan daftar kurir Biteship yang diminta sesuai jangkauan area
        const couriersToQuery = isInstantEligible
          ? 'gosend,grab,jne,sicepat,jnt,anteraja'
          : 'jne,sicepat,jnt,anteraja';

        const biteshipPayload: any = {
          origin_postal_code: effectiveOriginPostal,
          couriers: couriersToQuery,
          items: [
            {
              name: isFnb ? 'Makanan / Minuman' : 'Barang Pesanan',
              value: 50000,
              weight: weightInGrams,
              quantity: 1,
            },
          ],
        };

        if (isInstantEligible) {
          biteshipPayload.origin_latitude = originLat;
          biteshipPayload.origin_longitude = originLon;
          biteshipPayload.destination_latitude = finalDestLat;
          biteshipPayload.destination_longitude = finalDestLon;
        }

        if (destinationAreaId) {
          biteshipPayload.destination_area_id = destinationAreaId;
        }
        if (effectiveDestPostal > 0) {
          biteshipPayload.destination_postal_code = effectiveDestPostal;
        }

        const biteshipRes = await fetch(BITESHIP_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${biteshipKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(biteshipPayload),
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

              const isInstant = rate.service_type === 'instant' || rate.service_type === 'same_day';
              const isCargo = rate.service_type === 'cargo';
              const etd = rate.duration || (rate.shipment_duration_range ? `${rate.shipment_duration_range} ${rate.shipment_duration_unit || 'Hari'}` : (isInstant ? '1-3 Jam' : '2-3 Hari'));
              const maxDays = parseMaxEtdDays(etd, rate.service_type);
              const isFnbSafe = maxDays <= 2;

              availableRates.push({
                id: `biteship_${courierCode}_${rate.courier_service_name || rate.service_type}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                courier_name: `${rate.courier_name.toUpperCase()} (${rate.courier_service_name || rate.service_type})`,
                service: rate.courier_service_name || rate.service_type,
                price: Number(rate.price) || 0,
                etd,
                type: isInstant ? 'instant' : (isCargo ? 'cargo' : 'regular'),
                badge: isInstant ? 'Paling Cepat / Tiba Hari Ini' : (isCargo ? 'Kargo' : 'Reguler Resmi'),
                provider: 'biteship',
                max_days: maxDays,
                is_fnb_safe: isFnbSafe,
              });
            });

            if (availableRates.length > 0) {
              externalRatesLoaded = true;
            }
          }
        }
      } catch (bErr) {
        console.warn('[Rates API] Biteship fetch error:', bErr);
      }
    }

    // 3. INTEGRASI LINCAH API (REGULER, HEMAT & KARGO)
    const lincahPartnerId = tenantLincah?.api_key || process.env.LINCAH_PARTNER_ID;
    const lincahToken = tenantLincah?.secret || tenantLincah?.api_key_read_only || process.env.LINCAH_API_TOKEN;

    const isLincahActive = Boolean(lincahPartnerId);

    if (isLincahActive && (!externalRatesLoaded || availableRates.filter((r) => r.type === 'regular').length === 0)) {
      try {
        const lincahHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(lincahPartnerId ? { 'partner-id': lincahPartnerId } : {}),
          ...(lincahToken ? { Authorization: `Bearer ${lincahToken}` } : {}),
          ...(tenantLincah?.secret ? { 'X-Lincah-Secret': tenantLincah.secret } : {}),
        };

        const lincahRes = await fetch(LINCAH_API_URL, {
          method: 'POST',
          headers: lincahHeaders,
          body: JSON.stringify({
            isPickup: true,
            isCod: false,
            dimensions: [10, 10, 10],
            weight: weightInGrams,
            packagePrice: 50000,
            origin: {
              code: originSubdistrictId || (effectiveOriginCity.toLowerCase().includes('gresik') ? '35.25.15' : '32.73.06'),
              longitude: originLon || 107.6757,
              latitude: originLat || -6.9538,
            },
            destination: {
              code: destinationDistrictCode || (destinationCity.toLowerCase().includes('jakarta') ? '31.71.01' : '32.73.01'),
              longitude: finalDestLon,
              latitude: finalDestLat,
            },
            logistics: ['JNE', 'SiCepat Ekspres', 'J&T Express', 'Anteraja'],
            services: ['Regular', 'Express', 'Cargo'],
          }),
        });

        if (lincahRes.ok) {
          const resJson = await lincahRes.json();
          if (resJson.success && Array.isArray(resJson.data)) {
            resJson.data.forEach((courier: any) => {
              if (Array.isArray(courier.costs)) {
                courier.costs.forEach((c: any) => {
                  const finalCost = c.cost?.afterDiscount || c.cost?.value;
                  if (!finalCost) return;

                  const isCargo = c.type === 'Cargo';
                  const etd = c.cost?.etd || `${c.cost?.est || 2} Hari`;
                  const maxDays = parseMaxEtdDays(etd, isCargo ? 'cargo' : 'regular');
                  const isFnbSafe = maxDays <= 2;

                  availableRates.push({
                    id: `lincah_${courier.code}_${c.service}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                    courier_name: `${courier.name} (${c.service_name || c.service})`,
                    service: c.service,
                    price: finalCost,
                    etd,
                    type: isCargo ? 'cargo' : 'regular',
                    badge: c.cost?.discountValue > 0 ? `Diskon ${c.cost.discountValue}%` : undefined,
                    provider: 'lincah',
                    max_days: maxDays,
                    is_fnb_safe: isFnbSafe,
                  });
                });
              }
            });
            if (availableRates.length > 0) {
              externalRatesLoaded = true;
            }
          }
        }
      } catch (lincahErr) {
        console.warn('[Rates API] Lincah API call failed:', lincahErr);
      }
    }

    // 4. SMART INDONESIAN REGIONAL ZONE ENGINE (ANTI TARIF FLAT BUTA RP 20.000)
    // Jika API pihak ketiga tidak merespons tarif (misal balance Biteship 0 atau rute Lincah offline),
    // hitung tarif berdasarkan zona wilayah asal dan tujuan resmi (Pekanbaru/Sumatera, Kalimantan, Jawa, Papua, dll)
    if (!externalRatesLoaded || availableRates.length === 0) {
      const zone = detectIndonesianZone(destinationCity, destinationDistrict, destinationPostalCode);

      // A. Jika dalam radius instan (<= 30 km), berikan opsi instan lokal berbasis jarak riil
      if (isInstantEligible) {
        const extraKm = Math.max(0, distanceKm - 4);
        const gosendPrice = Math.max(20000, Math.round((20000 + extraKm * 2500) / 1000) * 1000);
        const grabPrice = Math.max(18000, Math.round((18000 + extraKm * 2500) / 1000) * 1000);

        const allowGosend = enabledCouriers.length === 0 || enabledCouriers.some((c) => c.id === 'gosend');
        const allowGrab = enabledCouriers.length === 0 || enabledCouriers.some((c) => c.id === 'grab');

        if (allowGosend) {
          availableRates.push({
            id: 'instant_gosend',
            courier_name: 'GoSend Instant',
            service: 'Instant',
            price: gosendPrice,
            etd: '1 - 2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini (1-2 Jam)',
            provider: 'platform',
            max_days: 0.1,
            is_fnb_safe: true,
          });
        }
        if (allowGrab) {
          availableRates.push({
            id: 'instant_grab',
            courier_name: 'GrabExpress Instant',
            service: 'Instant',
            price: grabPrice,
            etd: '1 - 2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini (1-2 Jam)',
            provider: 'platform',
            max_days: 0.1,
            is_fnb_safe: true,
          });
        }
      }

      // B. Kurir Reguler Dinamis Berbasis Zona (Bukan Flat Buta Rp 20.000)
      const dynamicList = [
        {
          id: 'jne',
          name: 'JNE Express',
          service: 'REG',
          price: zone.baseReg * weightInKg,
          etd: zone.etdReg,
          type: 'regular' as const,
        },
        {
          id: 'jnt',
          name: 'J&T Express',
          service: 'EZ',
          price: (zone.baseReg + 1000) * weightInKg,
          etd: zone.etdReg,
          type: 'regular' as const,
        },
        {
          id: 'sicepat',
          name: 'SiCepat Ekspres',
          service: 'SIUNT',
          price: Math.max(9500, (zone.baseReg - 500) * weightInKg),
          etd: zone.etdReg,
          type: 'regular' as const,
        },
        {
          id: 'jne_yes',
          name: 'JNE Express Next Day',
          service: 'YES',
          price: zone.baseExp * weightInKg,
          etd: zone.etdExp,
          type: 'regular' as const,
        },
        {
          id: 'cargo',
          name: 'Kargo Hemat (JTR / SiCepat Gokil)',
          service: 'Cargo',
          price: Math.max(zone.baseCargo, zone.baseCargo * Math.max(1, weightInKg * 0.7)),
          etd: zone.etdCargo,
          type: 'cargo' as const,
        },
      ];

      dynamicList.forEach((item) => {
        const isAllowed =
          enabledCouriers.length === 0 ||
          enabledCouriers.some((c) => c.id === item.id || (item.id === 'jne_yes' && c.id === 'jne'));

        if (isAllowed) {
          const maxDays = parseMaxEtdDays(item.etd, item.type);
          availableRates.push({
            id: `dyn_${item.id}_${item.service}`.toLowerCase(),
            courier_name: item.name,
            service: item.service,
            price: Math.round(item.price),
            etd: item.etd,
            type: item.type,
            badge: item.type === 'cargo' ? 'Kargo' : item.id === 'jne_yes' ? 'Kilat 1-2 Hari' : 'Reguler',
            provider: 'platform',
            max_days: maxDays,
            is_fnb_safe: maxDays <= 2,
          });
        }
      });
    }

    // 5. VALIDASI KHUSUS PRODUK F&B (MAKANAN SEGAR / MUDAH BASI) & FILTER RADIUS INSTAN
    // Jika di luar radius 30 KM, pastikan seluruh opsi instan disembunyikan
    if (!isInstantEligible) {
      availableRates = availableRates.filter((r) => r.type !== 'instant');
    }

    let finalRates = availableRates;
    let fnbWarning: string | undefined = undefined;
    let hasSafeFnbOption = true;

    if (isFnb) {
      const safeRates = availableRates.filter((r) => r.is_fnb_safe);
      const unsafeRates = availableRates.filter((r) => !r.is_fnb_safe);

      if (safeRates.length > 0) {
        finalRates = safeRates;
        if (unsafeRates.length > 0) {
          fnbWarning = `Kurir berdurasi lebih dari 2 hari disembunyikan otomatis untuk menjaga kualitas kesegaran makanan.`;
        }
      } else {
        // Jika tidak ada kurir yang <= 2 hari untuk alamat tujuan ini
        finalRates = [];
        hasSafeFnbOption = false;
        fnbWarning = `Pengiriman makanan segar ke wilayah ${destinationCity || 'tujuan'} membutuhkan waktu lebih dari 2 hari. Layanan dinonaktifkan demi mencegah kerusakan produk saat diterima.`;
      }
    }

    return NextResponse.json({
      success: true,
      rates: finalRates,
      fnb_safe: hasSafeFnbOption,
      fnb_warning: fnbWarning,
      is_fnb: isFnb,
      distance_km: distanceKm,
      max_radius_km: MAX_INSTANT_RADIUS_KM,
      instant_eligible: isInstantEligible,
      origin: {
        address: originAddress,
        city: effectiveOriginCity,
        district: originDistrict,
        postal_code: String(effectiveOriginPostal),
        subdistrict_id: originSubdistrictId,
        latitude: originLat,
        longitude: originLon,
      },
      destination: {
        city: destinationCity,
        district: destinationDistrict,
        postal_code: destinationPostalCode,
        area_id: destinationAreaId,
        latitude: finalDestLat,
        longitude: finalDestLon,
      },
      weight_grams: weightInGrams,
    });
  } catch (error: any) {
    console.error('[API Shipping Rates] Fatal Error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses perhitungan tarif ongkir.' },
      { status: 500 }
    );
  }
}