import { detectIndonesianZone, parseMaxEtdDays, POST as calculateShippingRates } from '@/app/api/v1/shipping/rates/route';
import { GET as searchLocations, resolveAreaCoordinates } from '@/app/api/v1/shipping/locations/search/route';
import { POST as calculateInstantRates, calculateDistanceKm, MAX_INSTANT_RADIUS_KM } from '@/app/api/v1/shipping/rates/instant/route';
import { NextRequest } from 'next/server';

describe('Logistics & Shipping Rates Engine', () => {
  describe('Anti Flat Fallback & Indonesian Regional Zone Engine', () => {
    it('should NOT use blind flat Rp 20.000 for Pekanbaru (Sumatera)', () => {
      const zone = detectIndonesianZone('Pekanbaru', 'Marpoyan Damai', '28282');
      expect(zone.name).toBe('Sumatera Tengah & Utara');
      expect(zone.baseReg).toBeGreaterThanOrEqual(40000); // Pekanbaru JNE/J&T is ~45.000, NOT 20.000!
      expect(zone.baseReg).not.toBe(20000);
      expect(zone.baseExp).toBeGreaterThanOrEqual(60000);
    });

    it('should calculate realistic rates for other outer islands (Papua, Sulawesi, Kalimantan)', () => {
      const papua = detectIndonesianZone('Jayapura', 'Jayapura Utara', '99111');
      expect(papua.name).toBe('Papua & Maluku');
      expect(papua.baseReg).toBeGreaterThanOrEqual(90000);

      const sulawesi = detectIndonesianZone('Makassar', 'Panakkukang', '90231');
      expect(sulawesi.name).toBe('Sulawesi & Nusa Tenggara');
      expect(sulawesi.baseReg).toBeGreaterThanOrEqual(45000);

      const kalimantan = detectIndonesianZone('Banjarmasin', 'Banjarmasin Tengah', '70111');
      expect(kalimantan.name).toBe('Kalimantan');
      expect(kalimantan.baseReg).toBeGreaterThanOrEqual(40000);
    });

    it('should calculate accurate rates for Java & Bali', () => {
      const surabaya = detectIndonesianZone('Surabaya', 'Gubeng', '60281');
      expect(surabaya.name).toBe('Jawa Timur & Bali');
      expect(surabaya.baseReg).toBe(22000);

      const semarang = detectIndonesianZone('Semarang', 'Semarang Tengah', '50131');
      expect(semarang.name).toBe('Jawa Tengah & DIY');
      expect(semarang.baseReg).toBe(18000);

      const jakarta = detectIndonesianZone('Jakarta Selatan', 'Kebayoran Baru', '12110');
      expect(jakarta.name).toBe('Jabodetabek & Banten');
      expect(jakarta.baseReg).toBe(12000);
    });
  });

  describe('ETD Duration Parser for FnB Freshness Validation', () => {
    it('should recognize instant and same day as <= 2 days safe', () => {
      expect(parseMaxEtdDays('1-2 Jam', 'instant')).toBeLessThanOrEqual(2);
      expect(parseMaxEtdDays('1-3 Jam', 'same_day')).toBeLessThanOrEqual(2);
      expect(parseMaxEtdDays('Hari ini', 'instant')).toBeLessThanOrEqual(2);
    });

    it('should recognize 1-2 days regular and express as safe', () => {
      expect(parseMaxEtdDays('1 - 2 Hari', 'regular')).toBe(2);
      expect(parseMaxEtdDays('1 Hari', 'regular')).toBe(1);
      expect(parseMaxEtdDays('Next Day', 'regular')).toBe(1);
      expect(parseMaxEtdDays('YES', 'regular')).toBe(1);
    });

    it('should flag duration > 2 days as UNSAFE for perishable FnB', () => {
      expect(parseMaxEtdDays('2-3 Hari', 'regular')).toBeGreaterThan(2);
      expect(parseMaxEtdDays('3 - 4 Hari', 'regular')).toBeGreaterThan(2);
      expect(parseMaxEtdDays('4-6 Hari', 'regular')).toBeGreaterThan(2);
      expect(parseMaxEtdDays('Kargo 5-7 Hari', 'cargo')).toBeGreaterThan(2);
    });
  });

  describe('Location Autocomplete Search (Biteship & District DB)', () => {
    it('should reject search with less than 3 characters', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/locations/search?input=Pe');
      const res = await searchLocations(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.areas).toEqual([]);
    });

    it('should return location areas with postal_code and destination_area_id for valid query', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/locations/search?input=Pekanbaru');
      const res = await searchLocations(req);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.areas.length).toBeGreaterThan(0);

      const first = data.areas[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('city');
      expect(first).toHaveProperty('district');
      expect(first).toHaveProperty('postal_code');
      expect(first).toHaveProperty('latitude');
      expect(first).toHaveProperty('longitude');
      expect(first.id).toMatch(/^IDN/); // Official Biteship Area ID format
    });
  });

  describe('Geospatial Haversine & 30 KM Instant Courier Radius', () => {
    it('should correctly calculate intra-city distance <= 30 km', () => {
      // Origin: Buahbatu Bandung (-6.9538, 107.6757)
      // Dest: Coblong / Dago Bandung (-6.8850, 107.6139)
      const distDago = calculateDistanceKm(-6.9538, 107.6757, -6.8850, 107.6139);
      expect(distDago).toBeLessThanOrEqual(MAX_INSTANT_RADIUS_KM);
      expect(distDago).toBeGreaterThan(5); // ~10.3 km

      // Dest: Cimahi (-6.8723, 107.5420)
      const distCimahi = calculateDistanceKm(-6.9538, 107.6757, -6.8723, 107.5420);
      expect(distCimahi).toBeLessThanOrEqual(MAX_INSTANT_RADIUS_KM);
      expect(distCimahi).toBeGreaterThan(12); // ~17.3 km
    });

    it('should detect outer city and outer island distance > 30 km', () => {
      // Origin: Buahbatu Bandung (-6.9538, 107.6757)
      // Dest: Kebayoran Baru Jakarta (-6.2444, 106.7933)
      const distJakarta = calculateDistanceKm(-6.9538, 107.6757, -6.2444, 106.7933);
      expect(distJakarta).toBeGreaterThan(MAX_INSTANT_RADIUS_KM);
      expect(distJakarta).toBeGreaterThan(100); // ~123 km

      // Dest: Marpoyan Damai Pekanbaru (0.4722, 101.4397)
      const distPekanbaru = calculateDistanceKm(-6.9538, 107.6757, 0.4722, 101.4397);
      expect(distPekanbaru).toBeGreaterThan(MAX_INSTANT_RADIUS_KM);
      expect(distPekanbaru).toBeGreaterThan(1000); // ~1079 km
    });
  });

  describe('Endpoint /api/v1/shipping/rates/instant', () => {
    it('should reject request without coordinates or valid postal code', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates/instant', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await calculateInstantRates(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('destination_latitude');
    });

    it('should provide GoSend & Grab rates within 30 km radius', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates/instant', {
        method: 'POST',
        body: JSON.stringify({
          origin_latitude: -6.9538,
          origin_longitude: 107.6757,
          origin_postal_code: '40286',
          destination_latitude: -6.8850,
          destination_longitude: 107.6139,
          destination_postal_code: '40132',
          destination_city: 'Kota Bandung',
          destination_district: 'Coblong',
        }),
      });
      const res = await calculateInstantRates(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.coverage).toBe(true);
      expect(data.is_instant_eligible).toBe(true);
      expect(data.distance_km).toBeLessThanOrEqual(30);
      expect(data.rates.length).toBeGreaterThan(0);
      expect(data.rates.every((r: any) => r.type === 'instant')).toBe(true);
    });

    it('should hide GoSend & Grab rates and report coverage: false when distance > 30 km', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates/instant', {
        method: 'POST',
        body: JSON.stringify({
          origin_latitude: -6.9538,
          origin_longitude: 107.6757,
          origin_postal_code: '40286',
          destination_latitude: 0.4722,
          destination_longitude: 101.4397,
          destination_postal_code: '28125',
          destination_city: 'Pekanbaru',
          destination_district: 'Marpoyan Damai',
        }),
      });
      const res = await calculateInstantRates(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.coverage).toBe(false);
      expect(data.is_instant_eligible).toBe(false);
      expect(data.distance_km).toBeGreaterThan(30);
      expect(data.rates).toEqual([]);
      expect(data.message).toContain('di luar radius kurir instan');
    });
  });

  describe('Full Courier Selection & Radius Enforcement in /api/v1/shipping/rates', () => {
    it('should strictly exclude instant couriers and display regular/cargo when destination is Pekanbaru (> 30 km)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates', {
        method: 'POST',
        body: JSON.stringify({
          destination_city: 'Pekanbaru',
          destination_district: 'Marpoyan Damai',
          destination_postal_code: '28125',
          destination_latitude: 0.4722,
          destination_longitude: 101.4397,
        }),
      });
      const res = await calculateShippingRates(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.instant_eligible).toBe(false);
      expect(data.distance_km).toBeGreaterThan(30);

      // Pastikan GoSend & Grab TIDAK ADA dalam daftar tarif
      const instantOptions = data.rates.filter((r: any) => r.type === 'instant');
      expect(instantOptions).toEqual([]);

      // Pastikan opsi kurir reguler / kargo tetap tampil dengan tarif non-flat
      const regularOptions = data.rates.filter((r: any) => r.type === 'regular' || r.type === 'cargo');
      expect(regularOptions.length).toBeGreaterThan(0);
      expect(regularOptions[0].price).toBeGreaterThanOrEqual(40000);
    });

    it('should include instant couriers when destination is within 30 km radius (Bandung local)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates', {
        method: 'POST',
        body: JSON.stringify({
          destination_city: 'Kota Bandung',
          destination_district: 'Coblong',
          destination_postal_code: '40132',
          destination_latitude: -6.8850,
          destination_longitude: 107.6139,
        }),
      });
      const res = await calculateShippingRates(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.instant_eligible).toBe(true);
      expect(data.distance_km).toBeLessThanOrEqual(30);

      const instantOptions = data.rates.filter((r: any) => r.type === 'instant');
      expect(instantOptions.length).toBeGreaterThan(0);
    });
  });
});
