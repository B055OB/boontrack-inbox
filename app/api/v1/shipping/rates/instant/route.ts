import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const destinationCity = (body.destination_city || body.city || '').trim().toLowerCase();
    const destinationPostalCode = (body.destination_postal_code || body.postal_code || '').trim();
    const destinationAddress = (body.destination_address || body.address || '').trim().toLowerCase();

    // Deteksi apakah tujuan pengiriman berada dalam jangkauan kurir instan Bandung (Kota / Kab Bandung & Kode Pos 40xxx)
    const isBandungArea = 
      destinationCity.includes('bandung') ||
      destinationAddress.includes('bandung') ||
      /^40\d{3}$/.test(destinationPostalCode) ||
      /\b40\d{3}\b/.test(destinationAddress);

    if (isBandungArea) {
      return NextResponse.json({
        success: true,
        coverage: true,
        city: 'Bandung',
        couriers: [
          {
            id: 'biteship_gosend_instant',
            name: 'GoSend Instant (Biteship)',
            service: 'Instant',
            price: 20000,
            eta: '1-2 Jam',
            type: 'instant',
            badge: 'Paling Cepat / Tiba Hari Ini',
            provider: 'biteship'
          },
          {
            id: 'biteship_grab_instant',
            name: 'GrabExpress Instant (Biteship)',
            service: 'Instant',
            price: 22000,
            eta: '1-2 Jam',
            type: 'instant',
            badge: 'Tiba Hari Ini',
            provider: 'biteship'
          }
        ]
      });
    }

    // Jika di luar jangkauan kurir instan Bandung
    return NextResponse.json({
      success: true,
      coverage: false,
      message: 'Kurir instan saat ini tersedia khusus untuk area Bandung & sekitarnya (Kode Pos 40xxx). Silakan pilih kurir reguler.',
      couriers: []
    });
  } catch (error: any) {
    console.error('[API Shipping Rates Instant] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memproses kalkulasi tarif kurir instan.' },
      { status: 500 }
    );
  }
}
