import { NextRequest, NextResponse } from 'next/server';

export interface LocationArea {
  id: string;
  name: string;
  district: string;
  city: string;
  province: string;
  postal_code: string;
  latitude: number;
  longitude: number;
}

// Helper: Menentukan titik koordinat presisi berdasarkan kota, kecamatan, atau kode pos
export function resolveAreaCoordinates(
  city: string,
  district: string,
  postalCode: string
): { latitude: number; longitude: number } {
  const c = (city || '').toLowerCase();
  const d = (district || '').toLowerCase();
  const p = String(postalCode || '').trim();
  const text = `${c} ${d}`;

  // 1. Bandung & Sekitarnya
  if (text.includes('buahbatu') || text.includes('margacinta') || p === '40286') return { latitude: -6.9538, longitude: 107.6757 };
  if (text.includes('coblong') || text.includes('dago') || p === '40132') return { latitude: -6.8850, longitude: 107.6139 };
  if (text.includes('sumur bandung') || p === '40111') return { latitude: -6.9178, longitude: 107.6150 };
  if (text.includes('sukajadi') || p === '40161') return { latitude: -6.8821, longitude: 107.5954 };
  if (text.includes('rancasari') || p === '40287') return { latitude: -6.9542, longitude: 107.6749 };
  if (text.includes('bojongloa') || p === '40235') return { latitude: -6.9351, longitude: 107.5878 };
  if (text.includes('cimahi') || p.startsWith('405')) return { latitude: -6.8723, longitude: 107.5420 };
  if (c.includes('bandung') || p.startsWith('40')) return { latitude: -6.9175, longitude: 107.6191 };

  // 2. Pekanbaru / Riau
  if (text.includes('marpoyan') || p === '28125') return { latitude: 0.4722, longitude: 101.4397 };
  if (text.includes('bukit raya') || p === '28282') return { latitude: 0.4833, longitude: 101.4667 };
  if (text.includes('rumbai') || p === '28292') return { latitude: 0.5833, longitude: 101.4333 };
  if (text.includes('tampan') || p === '28291') return { latitude: 0.4667, longitude: 101.3833 };
  if (text.includes('pekanbaru kota') || p === '28111') return { latitude: 0.5333, longitude: 101.4500 };
  if (c.includes('pekanbaru') || p.startsWith('28')) return { latitude: 0.5071, longitude: 101.4478 };

  // 3. DKI Jakarta & Bodetabek
  if (text.includes('kebayoran baru') || p === '12110') return { latitude: -6.2444, longitude: 106.7933 };
  if (text.includes('kebayoran lama') || p === '12240') return { latitude: -6.2483, longitude: 106.7761 };
  if (text.includes('mampang') || p === '12730') return { latitude: -6.2522, longitude: 106.8242 };
  if (text.includes('jatinegara') || p === '13310') return { latitude: -6.2294, longitude: 106.8744 };
  if (text.includes('gambir') || p === '10110') return { latitude: -6.1754, longitude: 106.8272 };
  if (c.includes('jakarta') || /^(10|11|12|13|14)/.test(p)) return { latitude: -6.2088, longitude: 106.8456 };

  // 4. Jawa Timur & Bali
  if (text.includes('gubeng') || p === '60281') return { latitude: -7.2750, longitude: 112.7550 };
  if (c.includes('surabaya') || p.startsWith('60')) return { latitude: -7.2575, longitude: 112.7521 };
  if (c.includes('denpasar') || c.includes('bali') || p.startsWith('80')) return { latitude: -8.6705, longitude: 115.2126 };

  // 5. Jawa Tengah & DIY
  if (c.includes('semarang') || p.startsWith('50')) return { latitude: -6.9667, longitude: 110.4167 };
  if (c.includes('solo') || c.includes('surakarta') || p.startsWith('57')) return { latitude: -7.5755, longitude: 110.8243 };
  if (c.includes('yogyakarta') || c.includes('jogja') || p.startsWith('55')) return { latitude: -7.7956, longitude: 110.3695 };
  if (c.includes('pati') || p.startsWith('59')) return { latitude: -6.7558, longitude: 111.0378 };

  // 6. Sumatera, Kalimantan, Sulawesi
  if (c.includes('medan') || p.startsWith('20')) return { latitude: 3.5952, longitude: 98.6722 };
  if (c.includes('palembang') || p.startsWith('30')) return { latitude: -2.9761, longitude: 104.7754 };
  if (c.includes('makassar') || p.startsWith('90')) return { latitude: -5.1477, longitude: 119.4327 };
  if (c.includes('banjarmasin') || p.startsWith('70')) return { latitude: -3.3194, longitude: 114.5908 };

  // Default Indonesia Center
  return { latitude: -6.9175, longitude: 107.6191 };
}

// Fallback data lokal kota & kecamatan populer di Indonesia untuk keandalan maksimal
export const FALLBACK_LOCAL_AREAS: LocationArea[] = [
  // Riau / Pekanbaru
  { id: 'IDNP26IDNC346IDND4038IDZ28125', name: 'Marpoyan Damai, Pekanbaru, Riau. 28125', district: 'Marpoyan Damai', city: 'Pekanbaru', province: 'Riau', postal_code: '28125', latitude: 0.4722, longitude: 101.4397 },
  { id: 'IDNP26IDNC346IDND4040IDZ28111', name: 'Pekanbaru Kota, Pekanbaru, Riau. 28111', district: 'Pekanbaru Kota', city: 'Pekanbaru', province: 'Riau', postal_code: '28111', latitude: 0.5333, longitude: 101.4500 },
  { id: 'IDNP26IDNC346IDND4041IDZ28292', name: 'Rumbai, Pekanbaru, Riau. 28292', district: 'Rumbai', city: 'Pekanbaru', province: 'Riau', postal_code: '28292', latitude: 0.5833, longitude: 101.4333 },
  { id: 'IDNP26IDNC346IDND4042IDZ28291', name: 'Tampan, Pekanbaru, Riau. 28291', district: 'Tampan', city: 'Pekanbaru', province: 'Riau', postal_code: '28291', latitude: 0.4667, longitude: 101.3833 },
  { id: 'IDNP26IDNC346IDND4043IDZ28282', name: 'Bukit Raya, Pekanbaru, Riau. 28282', district: 'Bukit Raya', city: 'Pekanbaru', province: 'Riau', postal_code: '28282', latitude: 0.4833, longitude: 101.4667 },
  { id: 'IDNP26IDNC346IDND4044IDZ28294', name: 'Payung Sekaki, Pekanbaru, Riau. 28294', district: 'Payung Sekaki', city: 'Pekanbaru', province: 'Riau', postal_code: '28294', latitude: 0.5167, longitude: 101.4167 },

  // Jawa Barat / Bandung
  { id: 'IDNP9IDNC22IDND2027IDZ40286', name: 'Buahbatu (Margacinta), Bandung, Jawa Barat. 40286', district: 'Buahbatu', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40286', latitude: -6.9538, longitude: 107.6757 },
  { id: 'IDNP9IDNC22IDND2071IDZ40111', name: 'Sumur Bandung, Bandung, Jawa Barat. 40111', district: 'Sumur Bandung', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40111', latitude: -6.9178, longitude: 107.6150 },
  { id: 'IDNP9IDNC22IDND2072IDZ40132', name: 'Coblong (Dago), Bandung, Jawa Barat. 40132', district: 'Coblong', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40132', latitude: -6.8850, longitude: 107.6139 },
  { id: 'IDNP9IDNC22IDND2073IDZ40161', name: 'Sukajadi, Bandung, Jawa Barat. 40161', district: 'Sukajadi', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40161', latitude: -6.8821, longitude: 107.5954 },
  { id: 'IDNP9IDNC22IDND2074IDZ40235', name: 'Bojongloa Kaler, Bandung, Jawa Barat. 40235', district: 'Bojongloa Kaler', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40235', latitude: -6.9351, longitude: 107.5878 },
  { id: 'IDNP9IDNC22IDND2075IDZ40287', name: 'Rancasari, Bandung, Jawa Barat. 40287', district: 'Rancasari', city: 'Kota Bandung', province: 'Jawa Barat', postal_code: '40287', latitude: -6.9542, longitude: 107.6749 },
  { id: 'IDNP9IDNC23IDND2076IDZ40511', name: 'Cimahi Tengah, Cimahi, Jawa Barat. 40511', district: 'Cimahi Tengah', city: 'Kota Cimahi', province: 'Jawa Barat', postal_code: '40511', latitude: -6.8723, longitude: 107.5420 },

  // DKI Jakarta
  { id: 'IDNP6IDNC148IDND838IDZ12110', name: 'Kebayoran Baru, Jakarta Selatan, DKI Jakarta. 12110', district: 'Kebayoran Baru', city: 'Jakarta Selatan', province: 'DKI Jakarta', postal_code: '12110', latitude: -6.2444, longitude: 106.7933 },
  { id: 'IDNP6IDNC148IDND839IDZ12240', name: 'Kebayoran Lama, Jakarta Selatan, DKI Jakarta. 12240', district: 'Kebayoran Lama', city: 'Jakarta Selatan', province: 'DKI Jakarta', postal_code: '12240', latitude: -6.2483, longitude: 106.7761 },
  { id: 'IDNP6IDNC148IDND840IDZ12730', name: 'Mampang Prapatan, Jakarta Selatan, DKI Jakarta. 12730', district: 'Mampang Prapatan', city: 'Jakarta Selatan', province: 'DKI Jakarta', postal_code: '12730', latitude: -6.2522, longitude: 106.8242 },
  { id: 'IDNP6IDNC149IDND841IDZ13310', name: 'Jatinegara, Jakarta Timur, DKI Jakarta. 13310', district: 'Jatinegara', city: 'Jakarta Timur', province: 'DKI Jakarta', postal_code: '13310', latitude: -6.2294, longitude: 106.8744 },
  { id: 'IDNP6IDNC147IDND842IDZ10110', name: 'Gambir, Jakarta Pusat, DKI Jakarta. 10110', district: 'Gambir', city: 'Jakarta Pusat', province: 'DKI Jakarta', postal_code: '10110', latitude: -6.1754, longitude: 106.8272 },
  { id: 'IDNP6IDNC146IDND843IDZ11110', name: 'Taman Sari, Jakarta Barat, DKI Jakarta. 11110', district: 'Taman Sari', city: 'Jakarta Barat', province: 'DKI Jakarta', postal_code: '11110', latitude: -6.1436, longitude: 106.8153 },

  // Jawa Timur / Surabaya & Malang
  { id: 'IDNP11IDNC434IDND5427IDZ60281', name: 'Gubeng, Surabaya, Jawa Timur. 60281', district: 'Gubeng', city: 'Surabaya', province: 'Jawa Timur', postal_code: '60281', latitude: -7.2750, longitude: 112.7550 },
  { id: 'IDNP11IDNC434IDND5428IDZ60261', name: 'Tegalsari, Surabaya, Jawa Timur. 60261', district: 'Tegalsari', city: 'Surabaya', province: 'Jawa Timur', postal_code: '60261', latitude: -7.2683, longitude: 112.7383 },
  { id: 'IDNP11IDNC434IDND5429IDZ60111', name: 'Wonokromo, Surabaya, Jawa Timur. 60111', district: 'Wonokromo', city: 'Surabaya', province: 'Jawa Timur', postal_code: '60111', latitude: -7.3017, longitude: 112.7350 },
  { id: 'IDNP11IDNC435IDND5430IDZ65111', name: 'Klojen, Malang, Jawa Timur. 65111', district: 'Klojen', city: 'Malang', province: 'Jawa Timur', postal_code: '65111', latitude: -7.9797, longitude: 112.6304 },
  { id: 'IDNP11IDNC436IDND5431IDZ61211', name: 'Sidoarjo, Sidoarjo, Jawa Timur. 61211', district: 'Sidoarjo', city: 'Sidoarjo', province: 'Jawa Timur', postal_code: '61211', latitude: -7.4478, longitude: 112.7183 },

  // Jawa Tengah & DIY
  { id: 'IDNP10IDNC341IDND3955IDZ59111', name: 'Pati, Pati, Jawa Tengah. 59111', district: 'Pati', city: 'Pati', province: 'Jawa Tengah', postal_code: '59111', latitude: -6.7558, longitude: 111.0378 },
  { id: 'IDNP10IDNC342IDND3956IDZ50131', name: 'Semarang Tengah, Semarang, Jawa Tengah. 50131', district: 'Semarang Tengah', city: 'Kota Semarang', province: 'Jawa Tengah', postal_code: '50131', latitude: -6.9667, longitude: 110.4167 },
  { id: 'IDNP10IDNC343IDND3957IDZ57111', name: 'Banjarsari, Surakarta, Jawa Tengah. 57111', district: 'Banjarsari', city: 'Kota Surakarta', province: 'Jawa Tengah', postal_code: '57111', latitude: -7.5755, longitude: 110.8243 },
  { id: 'IDNP10IDNC344IDND3958IDZ55211', name: 'Danurejan, Yogyakarta, DI Yogyakarta. 55211', district: 'Danurejan', city: 'Kota Yogyakarta', province: 'DI Yogyakarta', postal_code: '55211', latitude: -7.7956, longitude: 110.3695 },
  { id: 'IDNP10IDNC345IDND3959IDZ55281', name: 'Depok, Sleman, DI Yogyakarta. 55281', district: 'Depok', city: 'Sleman', province: 'DI Yogyakarta', postal_code: '55281', latitude: -7.7550, longitude: 110.4120 },

  // Sumatera Utara / Medan
  { id: 'IDNP25IDNC347IDND4045IDZ20111', name: 'Medan Kota, Medan, Sumatera Utara. 20111', district: 'Medan Kota', city: 'Kota Medan', province: 'Sumatera Utara', postal_code: '20111', latitude: 3.5952, longitude: 98.6722 },
  { id: 'IDNP25IDNC347IDND4046IDZ20151', name: 'Medan Baru, Medan, Sumatera Utara. 20151', district: 'Medan Baru', city: 'Kota Medan', province: 'Sumatera Utara', postal_code: '20151', latitude: 3.5780, longitude: 98.6650 },
  { id: 'IDNP25IDNC347IDND4047IDZ20141', name: 'Medan Barat, Medan, Sumatera Utara. 20141', district: 'Medan Barat', city: 'Kota Medan', province: 'Sumatera Utara', postal_code: '20141', latitude: 3.6050, longitude: 98.6700 },

  // Bali & Sulawesi
  { id: 'IDNP1IDNC1IDND1IDZ80111', name: 'Denpasar Barat, Denpasar, Bali. 80111', district: 'Denpasar Barat', city: 'Denpasar', province: 'Bali', postal_code: '80111', latitude: -8.6705, longitude: 115.2126 },
  { id: 'IDNP1IDNC1IDND2IDZ80361', name: 'Kuta, Badung, Bali. 80361', district: 'Kuta', city: 'Badung', province: 'Bali', postal_code: '80361', latitude: -8.7250, longitude: 115.1750 },
  { id: 'IDNP28IDNC348IDND4048IDZ90111', name: 'Ujung Pandang, Makassar, Sulawesi Selatan. 90111', district: 'Ujung Pandang', city: 'Makassar', province: 'Sulawesi Selatan', postal_code: '90111', latitude: -5.1350, longitude: 119.4100 },
  { id: 'IDNP28IDNC348IDND4049IDZ90231', name: 'Panakkukang, Makassar, Sulawesi Selatan. 90231', district: 'Panakkukang', city: 'Makassar', province: 'Sulawesi Selatan', postal_code: '90231', latitude: -5.1477, longitude: 119.4327 },

  // Kalimantan
  { id: 'IDNP14IDNC200IDND2500IDZ70111', name: 'Banjarmasin Tengah, Banjarmasin, Kalimantan Selatan. 70111', district: 'Banjarmasin Tengah', city: 'Banjarmasin', province: 'Kalimantan Selatan', postal_code: '70111', latitude: -3.3194, longitude: 114.5908 },
  { id: 'IDNP15IDNC201IDND2501IDZ76111', name: 'Balikpapan Kota, Balikpapan, Kalimantan Timur. 76111', district: 'Balikpapan Kota', city: 'Balikpapan', province: 'Kalimantan Timur', postal_code: '76111', latitude: -1.2379, longitude: 116.8289 },
  { id: 'IDNP12IDNC202IDND2502IDZ78111', name: 'Pontianak Kota, Pontianak, Kalimantan Barat. 78111', district: 'Pontianak Kota', city: 'Pontianak', province: 'Kalimantan Barat', postal_code: '78111', latitude: -0.0263, longitude: 109.3425 },
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const input = (searchParams.get('input') || searchParams.get('q') || searchParams.get('search') || '').trim();

    // Validasi minimal 3 karakter
    if (input.length < 3) {
      return NextResponse.json({
        success: true,
        areas: [],
        message: 'Ketik minimal 3 huruf untuk mencari lokasi.',
      });
    }

    const biteshipKey = process.env.BITESHIP_API_KEY;
    let areasResult: LocationArea[] = [];

    // 1. Coba panggil Biteship Maps/Areas API resmi
    if (biteshipKey) {
      try {
        const biteshipUrl = `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(
          input
        )}&type=single`;

        const res = await fetch(biteshipUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${biteshipKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.areas) && data.areas.length > 0) {
            areasResult = data.areas.map((a: any) => {
              const district = a.administrative_division_level_3_name || '';
              const city = a.administrative_division_level_2_name || '';
              const province = a.administrative_division_level_1_name || '';
              const postalCode = String(a.postal_code || '');
              const coords = resolveAreaCoordinates(city, district, postalCode);

              return {
                id: a.id,
                name: a.name || `${district}, ${city}. ${postalCode}`,
                district,
                city,
                province,
                postal_code: postalCode,
                latitude: a.latitude || a.lat || coords.latitude,
                longitude: a.longitude || a.lng || coords.longitude,
              };
            });
          }
        }
      } catch (err) {
        console.warn('[Locations Search] Biteship API call failed:', err);
      }
    }

    // 2. Fallback pencarian lokal jika Biteship API offline atau tidak menemukan hasil
    if (areasResult.length === 0) {
      const qLower = input.toLowerCase();
      areasResult = FALLBACK_LOCAL_AREAS.filter(
        (a) =>
          a.name.toLowerCase().includes(qLower) ||
          a.city.toLowerCase().includes(qLower) ||
          a.district.toLowerCase().includes(qLower) ||
          a.postal_code.includes(qLower)
      );
    }

    return NextResponse.json(
      {
        success: true,
        areas: areasResult,
        count: areasResult.length,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error: any) {
    console.error('[Locations Search API] Fatal Error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mencari lokasi tujuan.' },
      { status: 500 }
    );
  }
}
