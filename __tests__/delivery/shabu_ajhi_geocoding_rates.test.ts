/**
 * __tests__/delivery/shabu_ajhi_geocoding_rates.test.ts
 *
 * Dedicated Test Suite: Shabu Ajhi Geocoding Ongkir & Catering Rates Integration
 *
 * Verifies:
 * 1. Geocoding resolution for Villa Istana Bunga, Parongpong, Lembang, Cisarua, and Bojongsoang.
 * 2. Road distance calculation from Bojongsoang kitchen base to Villa Istana Bunga (>26 km).
 * 3. Rates API (/api/v1/shipping/rates and /instant) integration with 13-tier catering rates + extreme distance surcharge.
 * 4. Combination fleet multiplier (Oishi + Mabar A -> 2.0x fleet multiplier).
 * 5. Elimination of blind flat rate fallback (Rp 20.000 / Rp 21.000).
 */

import { NextRequest } from 'next/server';
import { POST as calculateShippingRates } from '@/app/api/v1/shipping/rates/route';
import { POST as calculateInstantRates, calculateDistanceKm, calculateRoadDistanceKm } from '@/app/api/v1/shipping/rates/instant/route';
import { resolveAreaCoordinates, geocodeDestinationAddress } from '@/app/api/v1/shipping/locations/search/route';
import { calculateShabuAjhiRate } from '@/lib/delivery/shabuAjhiRates';

// Mock Supabase to return Shabu Ajhi tenant configuration with Bojongsoang origin & catering mode
jest.mock('@/lib/supabaseClient', () => {
  const mockTenant = {
    id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slug: 'shabu-ajhi',
    name: 'Shabu Ajhi',
    metadata: {
      shipping_config: {
        tier_mode: 'CATERING_13_TIER',
        origin: {
          city: 'Bandung',
          district: 'Bojongsoang',
          address: 'Komplek Dadali Campernik 1 No 3, Cikoneng, Bojongsoang, Kab. Bandung',
          latitude: -6.9813378,
          longitude: 107.6357281,
          postal_code: '40287',
        },
        internal_courier: {
          label: 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)',
          is_enabled: true,
          max_radius_km: 40,
        },
        fnb_settings: {
          latitude: -6.9813378,
          longitude: 107.6357281,
          max_radius_km: 40,
        },
      },
      fnb_catering: {
        is_enabled: true,
        is_fnb_home_service: true,
      },
    },
  };

  return {
    getSupabase: jest.fn(() => ({
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => {
              if (table === 'tenants') return { data: mockTenant, error: null };
              return { data: null, error: null };
            }),
            single: jest.fn(async () => {
              if (table === 'tenants') return { data: mockTenant, error: null };
              return { data: null, error: null };
            }),
          })),
        })),
      })),
    })),
  };
});

describe('Shabu Ajhi Geocoding & Catering Ongkir Verification', () => {
  const BOJONGSOANG_LAT = -6.9813378;
  const BOJONGSOANG_LON = 107.6357281;

  describe('1. Geocoding & Location Resolution', () => {
    it('resolves Villa Istana Bunga coordinates accurately from address string', () => {
      const coord = resolveAreaCoordinates(
        'Kabupaten Bandung Barat',
        'Parongpong',
        '40559',
        'villa istana bunga, Jl. Anggrek VII, Cihanjuang Rahayu, Kec. Parongpong'
      );
      expect(coord.latitude).toBeCloseTo(-6.7967, 3);
      expect(coord.longitude).toBeCloseTo(107.5817, 3);
    });

    it('resolves Lembang coordinates accurately', () => {
      const coord = resolveAreaCoordinates('Bandung Barat', 'Lembang', '40391');
      expect(coord.latitude).toBeCloseTo(-6.8168, 3);
      expect(coord.longitude).toBeCloseTo(107.6178, 3);
    });

    it('resolves Bojongsoang base kitchen coordinates accurately', () => {
      const coord = resolveAreaCoordinates('Bandung', 'Bojongsoang', '40287');
      expect(coord.latitude).toBeCloseTo(-6.9813, 3);
      expect(coord.longitude).toBeCloseTo(107.6357, 3);
    });

    it('geocodeDestinationAddress returns high-precision local coordinates immediately', async () => {
      const coord = await geocodeDestinationAddress(
        'Villa Istana Bunga Blok A',
        'Kabupaten Bandung Barat',
        'Parongpong',
        '40559'
      );
      expect(coord.latitude).toBeCloseTo(-6.7967, 3);
      expect(coord.longitude).toBeCloseTo(107.5817, 3);
    });
  });

  describe('2. Distance & Road Curvature Calculation', () => {
    it('calculates road distance from Bojongsoang to Villa Istana Bunga as > 26 km', () => {
      const VILLA_LAT = -6.7967;
      const VILLA_LON = 107.5817;

      const straightDistance = calculateDistanceKm(BOJONGSOANG_LAT, BOJONGSOANG_LON, VILLA_LAT, VILLA_LON);
      expect(straightDistance).toBeGreaterThan(20); // ~21.4 km straight-line

      const roadDistance = calculateRoadDistanceKm(BOJONGSOANG_LAT, BOJONGSOANG_LON, VILLA_LAT, VILLA_LON);
      expect(roadDistance).toBeGreaterThanOrEqual(26.0); // Road curvature 1.30x -> ~27.8 km
    });
  });

  describe('3. Dynamic Catering Rates API (/api/v1/shipping/rates)', () => {
    it('computes round-trip catering rate with extreme distance surcharge (>26km) and fleet multiplier (2.0x for Oishi + Mabar A)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'shabu-ajhi',
          destination_city: 'Kabupaten Bandung Barat',
          destination_address: 'villa istana bunga, Jl. Anggrek VII, Cihanjuang Rahayu, Kec. Parongpong',
          destination_postal_code: '40559',
          is_fnb: true,
          items: [
            { name: 'Paket Oishi (Shabu & BBQ)', quantity: 1, unitPrice: 185000 },
            { name: 'Paket Mabar A (Shabu & BBQ)', quantity: 1, unitPrice: 250000 },
            { name: 'Kuah Tomyum (1 Liter)', quantity: 1, unitPrice: 20000, isAddon: true },
          ],
        }),
      });

      const res = await calculateShippingRates(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.rates)).toBe(true);

      const cateringRate = json.rates.find((r: any) => r.id === 'catering_armada_internal');
      expect(cateringRate).toBeDefined();
      expect(cateringRate.type).toBe('instant');
      expect(cateringRate.is_fnb_safe).toBe(true);

      // Verify that rate is NOT flat Rp 20.000 or Rp 21.000!
      expect(cateringRate.price).not.toBe(20000);
      expect(cateringRate.price).not.toBe(21000);

      // Distance ~27.8 km (>26 km) -> excessKm = 2
      // baseTier13 (115.000) + 2 * 7.000 (14.000) = 129.000
      // Multiplier Oishi + Mabar A = 2.0x -> 129.000 * 2 = 258.000
      expect(cateringRate.price).toBe(258000);
      expect(cateringRate.service).toContain('2 Motor / 2 Boks Terpisah');
      expect(cateringRate.badge).toBe('Surcharge Jarak Ekstrem');
      expect(cateringRate.warning).toContain('surcharge jarak ekstrem Rp 7.000/km');
    });

    it('computes 1.0x standard multiplier for single package within regular distance', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'shabu-ajhi',
          destination_city: 'Kota Bandung',
          destination_district: 'Buahbatu',
          destination_postal_code: '40286',
          destination_address: 'Jl. Margacinta No 10',
          is_fnb: true,
          items: [
            { name: 'Paket Oishi (Shabu & BBQ)', quantity: 1, unitPrice: 185000 },
          ],
        }),
      });

      const res = await calculateShippingRates(req);
      const json = await res.json();
      const cateringRate = json.rates.find((r: any) => r.id === 'catering_armada_internal');

      expect(cateringRate).toBeDefined();
      // Distance from Bojongsoang to Buahbatu with 1.30 road curvature is ~6.2 km (Tier 4: 6.1 - 8.0 km -> Rp 45.000)
      expect(cateringRate.price).toBe(45000);
      expect(cateringRate.price).not.toBe(20000);
    });
  });

  describe('4. Instant Rates API (/api/v1/shipping/rates/instant)', () => {
    it('returns internal catering rate through instant endpoint for Villa Istana Bunga', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'shabu-ajhi',
          destination_city: 'Kabupaten Bandung Barat',
          destination_address: 'villa istana bunga, Parongpong',
          destination_postal_code: '40559',
          items: [
            { name: 'Paket Oishi (Shabu & BBQ)', quantity: 1, unitPrice: 185000 },
            { name: 'Paket Mabar A (Shabu & BBQ)', quantity: 1, unitPrice: 250000 },
          ],
        }),
      });

      const res = await calculateInstantRates(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.is_instant_eligible).toBe(true);
      expect(json.distance_km).toBeGreaterThanOrEqual(26.0);

      const cateringRate = json.rates.find((r: any) => r.id === 'catering_armada_internal');
      expect(cateringRate).toBeDefined();
      expect(cateringRate.price).toBe(258000);
      expect(cateringRate.requires_pickup).toBe(true);
    });
  });
});
