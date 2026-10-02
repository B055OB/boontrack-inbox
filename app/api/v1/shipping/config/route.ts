import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getStoreShippingConfig, saveStoreShippingConfig } from '@/lib/shipping/self-pickup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/shipping/config?tenant=[slug]
 * Mengambil konfigurasi logistik & self-pickup toko.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug =
      searchParams.get('tenant') ||
      searchParams.get('tenant_slug') ||
      searchParams.get('slug') ||
      '';

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant wajib diisi' },
        { status: 400 }
      );
    }

    const config = await getStoreShippingConfig(tenantSlug);
    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    console.error('[API Shipping Config GET Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/shipping/config
 * Menyimpan konfigurasi logistik & self-pickup toko.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = body.tenantSlug || body.tenant_slug || '';

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'tenant_slug wajib diisi' },
        { status: 400 }
      );
    }

    const result = await saveStoreShippingConfig({
      tenant_slug: tenantSlug,
      is_self_pickup_enabled: body.is_self_pickup_enabled ?? body.isSelfPickupEnabled,
      pickup_address: body.pickup_address ?? body.pickupAddress,
      pickup_maps_url: body.pickup_maps_url ?? body.pickupMapsUrl,
      pickup_operational_hours: body.pickup_operational_hours ?? body.pickupOperationalHours,
      pickup_instructions: body.pickup_instructions ?? body.pickupInstructions,
      origin_address: body.origin_address ?? body.originAddress,
      origin_city: body.origin_city ?? body.originCity,
      origin_district: body.origin_district ?? body.originDistrict,
      origin_postal_code: body.origin_postal_code ?? body.originPostalCode,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Gagal menyimpan konfigurasi' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, config: result.config });
  } catch (err: any) {
    console.error('[API Shipping Config POST Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
