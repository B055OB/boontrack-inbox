import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

interface RateOption {
  id: string;
  courier_name: string;
  service: string;
  price: number;
  etd: string;
  type: 'instant' | 'regular' | 'cargo';
  badge?: string;
  provider: 'biteship' | 'lincah' | 'platform';
}

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';
const LINCAH_API_URL = 'https://api.lincah.id/openapi/ongkir';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));

    const destinationCity = (body.destination_city || body.city || '').trim();
    const destinationDistrict = (body.destination_district || body.district || '').trim();
    const destinationPostalCode = (body.destination_postal_code || body.postal_code || '').trim();
    const destinationDistrictCode = (body.destination_district_code || body.district_code || '32.04.10').trim();
    const weightInGrams = Math.max(100, Number(body.weight || body.weight_grams || 1000));
    const weightInKg = Math.ceil(weightInGrams / 1000);

    // 1. Ambil Konfigurasi Kurir Tenant dari Supabase
    let enabledCouriers: any[] = [];
    let isShippingActive = true;

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('tenant_settings')
          .select('biteship_config')
          .eq('tenant_slug', slug)
          .maybeSingle();

        if (data?.biteship_config) {
          const cfg = data.biteship_config;
          isShippingActive = cfg.is_enabled ?? true;
          if (Array.isArray(cfg.couriers)) {
            enabledCouriers = cfg.couriers.filter((c: any) => c.enabled);
          }
        }
      }
    } catch (err) {
      console.warn('[Rates API] Tenant settings fallback:', err);
    }

    if (!isShippingActive) {
      return NextResponse.json({
        success: true,
        rates: [],
        message: 'Layanan pengiriman dinonaktifkan oleh toko.',
      });
    }

    const availableRates: RateOption[] = [];

    // 2. ADAPTER 1: INSTANT / SAMEDAY VIA BITESHIP
    const instantIds = ['gosend', 'grab'];
    const hasInstantEnabled =
      enabledCouriers.length === 0 || enabledCouriers.some((c) => instantIds.includes(c.id));

    const isBandungArea =
      destinationCity.toLowerCase().includes('bandung') ||
      /^40\d{3}$/.test(destinationPostalCode);

    if (hasInstantEnabled && isBandungArea) {
      const biteshipKey = process.env.BITESHIP_API_KEY;
      let instantLoaded = false;

      if (biteshipKey) {
        try {
          const biteshipRes = await fetch(BITESHIP_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${biteshipKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              origin_postal_code: 40286,
              destination_postal_code: Number(destinationPostalCode) || 40115,
              couriers: 'gosend,grab',
              items: [
                {
                  name: 'Barang Kiriman',
                  value: 50000,
                  weight: weightInGrams,
                  quantity: 1,
                },
              ],
            }),
          });

          if (biteshipRes.ok) {
            const bData = await biteshipRes.json();
            if (Array.isArray(bData?.pricing)) {
              bData.pricing.forEach((rate: any) => {
                availableRates.push({
                  id: `instant_${rate.courier_name}_${rate.service_type}`.toLowerCase(),
                  courier_name: `${rate.courier_name.toUpperCase()} (${rate.courier_service_name})`,
                  service: rate.service_type,
                  price: rate.price,
                  etd: rate.duration || '1-3 Jam',
                  type: 'instant',
                  badge: 'Paling Cepat / Tiba Hari Ini',
                  provider: 'biteship',
                });
              });
              instantLoaded = true;
            }
          }
        } catch (bErr) {
          console.warn('[Rates API] Biteship fetch error:', bErr);
        }
      }

      if (!instantLoaded) {
        availableRates.push(
          {
            id: 'instant_gosend',
            courier_name: 'GoSend Instant',
            service: 'Instant',
            price: 20000,
            etd: '1-2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini',
            provider: 'biteship',
          },
          {
            id: 'instant_grab',
            courier_name: 'GrabExpress Instant',
            service: 'Instant',
            price: 22000,
            etd: '1-2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini',
            provider: 'biteship',
          }
        );
      }
    }

    // 3. ADAPTER 2: REGULER, HEMAT & KARGO VIA LINCAH API
    const lincahPartnerId = process.env.LINCAH_PARTNER_ID;
    const lincahToken = process.env.LINCAH_API_TOKEN;
    let lincahLoaded = false;

    if (lincahPartnerId) {
      try {
        const lincahRes = await fetch(LINCAH_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'partner-id': lincahPartnerId,
            ...(lincahToken ? { Authorization: `Bearer ${lincahToken}` } : {}),
          },
          body: JSON.stringify({
            isPickup: true,
            isCod: false,
            dimensions: [10, 10, 10],
            weight: weightInGrams,
            packagePrice: 50000,
            origin: {
              code: '32.73.06', // Rancasari Bandung
              longitude: 107.6757,
              latitude: -6.9538,
            },
            destination: {
              code: destinationDistrictCode,
              longitude: 107.6108,
              latitude: -6.9085,
            },
            logistics: ['JNE', 'SiCepat Ekspres', 'J&T Express', 'Anteraja', 'Ninja Xpress', 'IDExpress'],
            services: ['Regular', 'Express', 'Cargo'],
          }),
        });

        if (lincahRes.ok) {
          const resJson = await lincahRes.json();
          if (resJson.success && Array.isArray(resJson.data)) {
            resJson.data.forEach((courier: any) => {
              if (Array.isArray(courier.costs)) {
                courier.costs.forEach((c: any) => {
                  const finalCost = c.cost?.afterDiscount || c.cost?.value || 10000;
                  availableRates.push({
                    id: `lincah_${courier.code}_${c.service}`.toLowerCase(),
                    courier_name: `${courier.name} (${c.service_name || c.service})`,
                    service: c.service,
                    price: finalCost,
                    etd: c.cost?.etd || `${c.cost?.est || 2} Hari`,
                    type: c.type === 'Cargo' ? 'cargo' : 'regular',
                    badge: c.cost?.discountValue > 0 ? `Diskon ${c.cost.discountValue}%` : undefined,
                    provider: 'lincah',
                  });
                });
              }
            });
            lincahLoaded = true;
          }
        }
      } catch (lincahErr) {
        console.warn('[Rates API] Lincah API call failed:', lincahErr);
      }
    }

    // Fallback kurir reguler jika Partner ID Lincah belum diisi
    if (!lincahLoaded) {
      const fallbackList = [
        { id: 'jne', name: 'JNE Express', service: 'REG', baseAdd: 0, etd: '1 - 2 Hari' },
        { id: 'jnt', name: 'J&T Express', service: 'EZ', baseAdd: 1000, etd: '1 - 2 Hari' },
        { id: 'sicepat', name: 'SiCepat Ekspres', service: 'SIUNT', baseAdd: 500, etd: '1 - 2 Hari' },
        { id: 'anteraja', name: 'Anteraja', service: 'Regular', baseAdd: 0, etd: '2 - 3 Hari' },
      ];

      fallbackList.forEach((item) => {
        const isAllowed =
          enabledCouriers.length === 0 ||
          enabledCouriers.some((c) => c.id === item.id);

        if (isAllowed) {
          availableRates.push({
            id: `reg_${item.id}_${item.service}`.toLowerCase(),
            courier_name: item.name,
            service: item.service,
            price: Math.max(9000, 11000 * weightInKg + item.baseAdd),
            etd: item.etd,
            type: 'regular',
            provider: 'lincah',
          });
        }
      });
    }

    return NextResponse.json({
      success: true,
      rates: availableRates,
      destination: {
        city: destinationCity,
        district: destinationDistrict,
        postal_code: destinationPostalCode,
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