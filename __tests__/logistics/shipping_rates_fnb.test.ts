import { detectIndonesianZone, parseMaxEtdDays } from '@/app/api/v1/shipping/rates/route';
import { GET as searchLocations } from '@/app/api/v1/shipping/locations/search/route';
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
      expect(first.id).toMatch(/^IDN/); // Official Biteship Area ID format
    });
  });
});
