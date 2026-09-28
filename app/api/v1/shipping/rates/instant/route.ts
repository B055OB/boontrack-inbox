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

    // 1. Validasi Coverage / Konfigurasi & Ambil Dynamic Origin
    let isShippingActive = true;
    let originPostalCode = (body.origin_postal_code || '').trim();

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
        message: 'Layanan pengiriman dinonaktifkan oleh toko.',
        couriers: [],
      });
    }

    const effectiveOriginPostal = Number(originPostalCode) || 40286;
    const effectiveDestPostal = Number(destinationPostalCode) || 40115;

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
            origin_postal_code: effectiveOriginPostal,
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

    return NextResponse.json({
      success: true,
      coverage: availableRates.length > 0,
      rates: availableRates,
      couriers: availableRates,
      message: availableRates.length === 0 ? 'Alamat tujuan berada di luar jangkauan kurir instan.' : undefined,
    });
  } catch (error: any) {
    console.error('[Rates Instant API] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses tarif instan' },
      { status: 500 }
    );
  }
}