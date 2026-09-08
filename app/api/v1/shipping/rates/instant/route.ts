import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    const slug = (body.slug || body.tenant_slug || searchParams.get('slug') || '').trim();

    const destinationPostalCode = (body.destination_postal_code || body.postal_code || '').trim();
    const weightInGrams = Math.max(100, Number(body.weight || body.weight_grams || 1000));

    // 1. Validasi Coverage / Konfigurasi
    let isShippingActive = true;
    if (slug) {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenant_settings')
            .select('biteship_config')
            .eq('tenant_slug', slug)
            .maybeSingle();

          if (data?.biteship_config) {
            isShippingActive = data.biteship_config.is_enabled ?? true;
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
        message: 'Layanan pengiriman dinonaktifkan oleh toko.',
        couriers: [],
      });
    }

    const biteshipKey = process.env.BITESHIP_API_KEY;
    const availableRates: any[] = [];

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
              });
            });
          }
        }
      } catch (bErr) {
        console.warn('[Rates Instant API] Fetch error:', bErr);
      }
    }

    // Fallback jika API Key offline atau belum diisi
    if (availableRates.length === 0) {
      availableRates.push(
        {
          id: 'instant_gosend',
          courier_name: 'GoSend Instant',
          service: 'Instant',
          price: 20000,
          etd: '1-2 Jam',
          type: 'instant',
        },
        {
          id: 'instant_grab',
          courier_name: 'GrabExpress Instant',
          service: 'Instant',
          price: 22000,
          etd: '1-2 Jam',
          type: 'instant',
        }
      );
    }

    return NextResponse.json({
      success: true,
      coverage: true,
      rates: availableRates,
    });
  } catch (error: any) {
    console.error('[Rates Instant API] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses tarif instan' },
      { status: 500 }
    );
  }
}