import { NextRequest, NextResponse } from 'next/server';

const BITESHIP_API_URL = 'https://api.biteship.com/v1/rates/couriers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));

    const destinationCity = (body.destination_city || body.city || '').trim().toLowerCase();
    const destinationPostalCode = (body.destination_postal_code || body.postal_code || '').trim();
    const destinationAddress = (body.destination_address || body.address || '').trim().toLowerCase();
    const weightInGrams = Number(body.weight || body.weight_grams || 1000);

    // Deteksi jangkauan kurir instan Bandung (Kota / Kab Bandung & Kode Pos 40xxx)
    const isBandungArea =
      destinationCity.includes('bandung') ||
      destinationAddress.includes('bandung') ||
      /^40\d{3}$/.test(destinationPostalCode) ||
      /\b40\d{3}\b/.test(destinationAddress);

    if (!isBandungArea) {
      return NextResponse.json({
        success: true,
        coverage: false,
        message: 'Layanan instan saat ini diprioritaskan untuk area Bandung & sekitarnya (Kode Pos 40xxx).',
        couriers: [],
      });
    }

    const apiKey = process.env.BITESHIP_API_KEY;

    // Call Real Biteship API jika API key tersedia
    if (apiKey) {
      try {
        const biteshipRes = await fetch(BITESHIP_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            origin_postal_code: 40286, // MTC Bandung default
            destination_postal_code: Number(destinationPostalCode) || 40115,
            couriers: 'gosend,grab',
            items: [
              {
                name: 'Pesanan Toko',
                value: 100000,
                weight: weightInGrams,
                quantity: 1,
              },
            ],
          }),
        });

        if (biteshipRes.ok) {
          const biteshipData = await biteshipRes.json();
          if (Array.isArray(biteshipData?.pricing) && biteshipData.pricing.length > 0) {
            const mappedCouriers = biteshipData.pricing.map((rate: any) => ({
              id: `biteship_${rate.courier_name}_${rate.service_type}`.toLowerCase(),
              name: `${rate.courier_name.toUpperCase()} (${rate.courier_service_name})`,
              service: rate.service_type,
              price: rate.price,
              eta: rate.duration || '1-3 Jam',
              type: 'instant',
              badge: 'Instant / SameDay',
              provider: 'biteship',
            }));

            return NextResponse.json({
              success: true,
              coverage: true,
              city: 'Bandung',
              couriers: mappedCouriers,
            });
          }
        }
      } catch (biteshipErr) {
        console.warn('[Biteship Live] Request failed, fallback to defaults:', biteshipErr);
      }
    }

    // Fallback default jika token belum live atau rute point-to-point sedang cooldown
    return NextResponse.json({
      success: true,
      coverage: true,
      city: 'Bandung',
      couriers: [
        {
          id: 'biteship_gosend_instant',
          name: 'GoSend Instant',
          service: 'Instant',
          price: 20000,
          eta: '1-2 Jam',
          type: 'instant',
          badge: 'Paling Cepat / Tiba Hari Ini',
          provider: 'biteship',
        },
        {
          id: 'biteship_grab_instant',
          name: 'GrabExpress Instant',
          service: 'Instant',
          price: 22000,
          eta: '1-2 Jam',
          type: 'instant',
          badge: 'Tiba Hari Ini',
          provider: 'biteship',
        },
      ],
    });
  } catch (error: any) {
    console.error('[API Shipping Rates Instant] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses kalkulasi tarif kurir instan.' },
      { status: 500 }
    );
  }
}