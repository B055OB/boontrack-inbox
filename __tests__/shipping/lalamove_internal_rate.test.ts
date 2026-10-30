import { computeInstantCourierRates } from '@/lib/shipping/instant-shipping-service';

describe('Shabu Ajhi - Armada Toko / Kurir Internal Rate Formula (Expanded 40 KM Radius)', () => {
  const armadaShippingConfig = {
    fnb_settings: {
      max_radius_km: 40,
    },
    internal_courier: {
      is_enabled: true,
      provider: 'INTERNAL_ARMADA',
      label: 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)',
      max_radius_km: 40,
      outlet_coordinates: {
        latitude: -6.9813378,
        longitude: 107.6357281,
      },
      rates: {
        motor: {
          name: 'Paket 2–4 Pax (Motor / Kurir Ringan)',
          label: 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)',
          base_distance_km: 4,
          base_price: 12000,
          per_km_price: 2800,
        },
        car: {
          name: 'Paket 10 Pax / Rombongan / Multi-Kompor (Mobil / MPV)',
          label: 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)',
          base_distance_km: 4,
          base_price: 40000,
          per_km_price: 4500,
        },
      },
    },
  };

  it('should calculate base rate for distance <= 4 km and display official label without third-party names', () => {
    const result = computeInstantCourierRates(3.5, armadaShippingConfig);
    expect(result.isEligible).toBe(true);
    expect(result.rates).toHaveLength(2);

    const motorRate = result.rates.find((r) => r.id === 'armada_motor');
    const carRate = result.rates.find((r) => r.id === 'armada_car');

    expect(motorRate).toBeDefined();
    expect(motorRate?.price).toBe(12000);
    expect(motorRate?.courier_name).toBe('Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)');
    expect(motorRate?.service).toBe('Paket 2–4 Pax (Motor / Kurir Ringan)');

    expect(carRate).toBeDefined();
    expect(carRate?.price).toBe(40000);
    expect(carRate?.courier_name).toBe('Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)');
    expect(carRate?.service).toBe('Paket 10 Pax / Rombongan / Multi-Kompor (Mobil / MPV)');
  });

  it('should calculate incremental rate for distance > 4 km (e.g. 6.0 km -> +2 km)', () => {
    // 6.0 km:
    // Motor: 12.000 + (2 * 2.800) = 17.600 -> rounded to nearest 500 = 17.500
    // Car: 40.000 + (2 * 4.500) = 49.000 -> 49.000
    const result = computeInstantCourierRates(6.0, armadaShippingConfig);
    expect(result.isEligible).toBe(true);

    const motorRate = result.rates.find((r) => r.id === 'armada_motor');
    const carRate = result.rates.find((r) => r.id === 'armada_car');

    expect(motorRate?.price).toBe(17500);
    expect(carRate?.price).toBe(49000);
  });

  it('should allow deliveries up to 40 km (e.g. 38.0 km Ciwidey / Pangalengan)', () => {
    const result = computeInstantCourierRates(38.0, armadaShippingConfig);
    expect(result.isEligible).toBe(true);
    expect(result.maxRadiusKm).toBe(40);
    expect(result.rates).toHaveLength(2);

    // 38 km:
    // Motor: 12.000 + (34 * 2.800) = 12.000 + 95.200 = 107.200 -> rounded = 107.000
    // Car: 40.000 + (34 * 4.500) = 40.000 + 153.000 = 193.000 -> 193.000
    const motorRate = result.rates.find((r) => r.id === 'armada_motor');
    const carRate = result.rates.find((r) => r.id === 'armada_car');

    expect(motorRate?.price).toBe(107000);
    expect(carRate?.price).toBe(193000);
  });

  it('should report ineligible when distance exceeds 40 km', () => {
    const result = computeInstantCourierRates(42.5, armadaShippingConfig);
    expect(result.isEligible).toBe(false);
    expect(result.rates).toHaveLength(0);
    expect(result.maxRadiusKm).toBe(40);
  });

  it('should defensively parse max_radius_km when 0, negative, string, or null/undefined (fallback to 40 KM)', () => {
    // 0 -> fallback to 40
    const zeroResult = computeInstantCourierRates(35, { fnb_settings: { max_radius_km: 0 }, internal_courier: { is_enabled: true } });
    expect(zeroResult.isEligible).toBe(true);
    expect(zeroResult.maxRadiusKm).toBe(40);

    // negative -> fallback to 40
    const negResult = computeInstantCourierRates(35, { fnb_settings: { max_radius_km: -15 }, internal_courier: { is_enabled: true } });
    expect(negResult.isEligible).toBe(true);
    expect(negResult.maxRadiusKm).toBe(40);

    // string '40' -> parses to 40
    const strResult = computeInstantCourierRates(35, { fnb_settings: { max_radius_km: '40' }, internal_courier: { is_enabled: true } });
    expect(strResult.isEligible).toBe(true);
    expect(strResult.maxRadiusKm).toBe(40);

    // null / undefined -> fallback to 40
    const nullResult = computeInstantCourierRates(35, { fnb_settings: { max_radius_km: null }, internal_courier: { is_enabled: true } });
    expect(nullResult.isEligible).toBe(true);
    expect(nullResult.maxRadiusKm).toBe(40);

    const emptyResult = computeInstantCourierRates(35, { fnb_settings: {}, internal_courier: { is_enabled: true } });
    expect(emptyResult.isEligible).toBe(true);
    expect(emptyResult.maxRadiusKm).toBe(40);
  });

  it('should never expose third-party API provider names in courier_name or service', () => {
    const result = computeInstantCourierRates(5.0, armadaShippingConfig);
    for (const rate of result.rates) {
      expect(rate.courier_name.toLowerCase()).not.toContain('lalamove');
      expect(rate.courier_name.toLowerCase()).not.toContain('biteship');
      expect(rate.courier_name.toLowerCase()).not.toContain('borzo');
      expect(rate.service.toLowerCase()).not.toContain('lalamove');
      expect(rate.service.toLowerCase()).not.toContain('biteship');
      expect(rate.courier_name).toBe('Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)');
    }
  });

  it('should fall back to standard GoSend/GrabExpress (30 km limit) when shippingConfig has no internal courier', () => {
    const result = computeInstantCourierRates(5.5);
    expect(result.isEligible).toBe(true);
    expect(result.maxRadiusKm).toBe(30);
    expect(result.rates.some((r) => r.id === 'gosend_instant')).toBe(true);
    expect(result.rates.some((r) => r.id === 'grab_instant')).toBe(true);
  });
});
