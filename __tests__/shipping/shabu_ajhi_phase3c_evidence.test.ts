/**
 * __tests__/shipping/shabu_ajhi_phase3c_evidence.test.ts
 * CTO MANDATE EVIDENCE: SHABU AJHI PHASE 3C STAGING GATE & BOUNDARY VALIDATION
 */

import { computeInstantCourierRates } from '@/lib/shipping/instant-shipping-service';
import {
  checkIsBbqOnly,
  buildCateringWhatsAppUrl,
} from '@/app/[tenant]/components/templates/FnbCateringStorefrontView';

describe('CTO Mandate Phase 3C Evidence: Shabu Ajhi Staging Gate', () => {
  const baseShippingConfig = {
    fnb_settings: {
      max_radius_km: 40,
    },
    internal_courier: {
      is_enabled: true,
      provider: 'INTERNAL_ARMADA',
      label: 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)',
      max_radius_km: 40,
      rates: {
        motor: {
          base_price: 12000,
          per_km_price: 2800,
        },
        car: {
          base_price: 40000,
          per_km_price: 4500,
        },
      },
    },
  };

  // =========================================================================
  // 2. PENGUJIAN BATAS RADIUS (BOUNDARY TESTS)
  // =========================================================================
  describe('2. Boundary Radius & Rejection Tests', () => {
    it('should defensively fallback to 40 KM for 0, negative, invalid string, null, and undefined radius', () => {
      // 0 input
      const res0 = computeInstantCourierRates(35.0, { fnb_settings: { max_radius_km: 0 }, internal_courier: { is_enabled: true } });
      expect(res0.maxRadiusKm).toBe(40);
      expect(res0.isEligible).toBe(true);

      // negative input
      const resNeg = computeInstantCourierRates(35.0, { fnb_settings: { max_radius_km: -10 }, internal_courier: { is_enabled: true } });
      expect(resNeg.maxRadiusKm).toBe(40);
      expect(resNeg.isEligible).toBe(true);

      // invalid string input
      const resInvalid = computeInstantCourierRates(35.0, { fnb_settings: { max_radius_km: 'invalid' as any }, internal_courier: { is_enabled: true } });
      expect(resInvalid.maxRadiusKm).toBe(40);
      expect(resInvalid.isEligible).toBe(true);

      // null input
      const resNull = computeInstantCourierRates(35.0, { fnb_settings: { max_radius_km: null as any }, internal_courier: { is_enabled: true } });
      expect(resNull.maxRadiusKm).toBe(40);
      expect(resNull.isEligible).toBe(true);

      // undefined input
      const resUndef = computeInstantCourierRates(35.0, { fnb_settings: {}, internal_courier: { is_enabled: true } });
      expect(resUndef.maxRadiusKm).toBe(40);
      expect(resUndef.isEligible).toBe(true);
    });

    it('should verify precision real-distance boundaries: 39.9 km (ELIGIBLE), 40.0 km (ELIGIBLE), 40.1 km (REJECTED)', () => {
      // 39.9 km -> ELIGIBLE
      const res399 = computeInstantCourierRates(39.9, baseShippingConfig);
      expect(res399.isEligible).toBe(true);
      expect(res399.rates.length).toBeGreaterThan(0);
      expect(res399.maxRadiusKm).toBe(40);

      // 40.0 km -> ELIGIBLE (Exact boundary)
      const res400 = computeInstantCourierRates(40.0, baseShippingConfig);
      expect(res400.isEligible).toBe(true);
      expect(res400.rates.length).toBeGreaterThan(0);
      expect(res400.maxRadiusKm).toBe(40);

      // 40.1 km -> REJECTED / OUT_OF_COVERAGE
      const res401 = computeInstantCourierRates(40.1, baseShippingConfig);
      expect(res401.isEligible).toBe(false);
      expect(res401.rates).toHaveLength(0);
      expect(res401.maxRadiusKm).toBe(40);
    });

    it('should enforce rejection flag when distance > 40 km even when default radius fallback is active', () => {
      // Config with 0 radius falls back to default 40, distance 40.5 exceeds 40 -> rejected
      const res = computeInstantCourierRates(40.5, { fnb_settings: { max_radius_km: 0 }, internal_courier: { is_enabled: true } });
      expect(res.maxRadiusKm).toBe(40);
      expect(res.isEligible).toBe(false);
      expect(res.rates).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. PENGUJIAN PRODUK BBQ & VARIAN KUAH
  // =========================================================================
  describe('3. BBQ Product & Soup Variant Parsing', () => {
    it('a. "Paket BBQ Grill" (tag: bbq-only) -> isBbqOnly: true (0 varian kuah, badge grill)', () => {
      const item = {
        name: 'Paket BBQ Grill',
        tags: ['bbq-only'],
        is_bbq_only: true,
      };
      expect(checkIsBbqOnly(item)).toBe(true);
    });

    it('b. "Paket Shabu Oishi" -> isBbqOnly: false (varian kuah muncul)', () => {
      const item = {
        name: 'Paket Shabu Oishi',
        tags: ['shabu', 'premium'],
        is_bbq_only: false,
      };
      expect(checkIsBbqOnly(item)).toBe(false);
    });

    it('c. "Paket Combo Shabu + BBQ" / "Paket Mabar A" -> isBbqOnly: false (varian kuah WAJIB muncul)', () => {
      const itemCombo = {
        name: 'Paket Combo Shabu + BBQ',
        tags: ['combo', 'shabu-bbq'],
      };
      expect(checkIsBbqOnly(itemCombo)).toBe(false);

      const itemMabarA = {
        name: 'Paket Mabar A (Shabu & BBQ 10 Pax)',
        tags: ['hemat'],
        is_bbq_only: false,
      };
      expect(checkIsBbqOnly(itemMabarA)).toBe(false);
    });

    it('d. "Paket Suki & Grill" -> isBbqOnly: false (varian kuah WAJIB muncul)', () => {
      const itemSukiGrill = {
        name: 'Paket Suki & Grill',
        tags: ['suki', 'grill'],
      };
      expect(checkIsBbqOnly(itemSukiGrill)).toBe(false);
    });
  });

  // =========================================================================
  // 4. VERIFIKASI LABEL ARMADA & PAYLOAD WHATSAPP CS
  // =========================================================================
  describe('4. Armada Label & WhatsApp CS Payload Verification', () => {
    it('should confirm rates produce exact official label without third-party names', () => {
      const result = computeInstantCourierRates(5.0, baseShippingConfig);
      expect(result.isEligible).toBe(true);

      const officialLabel = 'Kurir Internal / Armada Toko (Termasuk Antar & Jemput Alat Masak Kotor)';
      for (const rate of result.rates) {
        expect(rate.courier_name).toBe(officialLabel);
        expect(rate.courier_name.toLowerCase()).not.toContain('lalamove');
        expect(rate.courier_name.toLowerCase()).not.toContain('biteship');
        expect(rate.courier_name.toLowerCase()).not.toContain('borzo');
        expect(rate.etd).toContain('Antar + Jemput Alat Masak Kotor');
      }
    });

    it('should build clean WhatsApp CS URL targeting 6285861091103 with non-corrupted parameters', () => {
      const payload = buildCateringWhatsAppUrl({
        storeName: 'Shabu Ajhi',
        waNumber: '6285861091103',
        deliveryDate: '2026-10-31',
        formattedDeliveryDate: 'Sabtu, 31 Oktober 2026',
        selectedTimeSlot: '12:00 - 13:00 WIB',
        locationType: 'Villa / Glamping',
        locationDetails: 'Villa Cisarua Blok B-4, Lembang',
        cartItems: [
          {
            name: 'Paket Oishi (Shabu & BBQ)',
            qty: 2,
            price: 185000,
            soupVariant: 'Kuah Tomyum (Segar)',
          },
          {
            name: 'Paket Sakura (BBQ Only)',
            qty: 1,
            price: 155000,
          },
        ],
        totalPrice: 525000,
      });

      expect(payload.cleanWa).toBe('6285861091103');
      expect(payload.waUrl).toContain('https://wa.me/6285861091103?text=');

      // Verify uncorrupted decoded message elements
      expect(payload.message).toContain('Sabtu, 31 Oktober 2026 (2026-10-31)');
      expect(payload.message).toContain('12:00 - 13:00 WIB');
      expect(payload.message).toContain('Villa / Glamping (Villa Cisarua Blok B-4, Lembang)');
      expect(payload.message).toContain('Paket Oishi (Shabu & BBQ) x2 (Varian: Kuah Tomyum (Segar))');
      expect(payload.message).toContain('Paket Sakura (BBQ Only) x1');
      expect(payload.message).toContain('Rp 525.000');
      expect(payload.message).toContain('100% Alat Dipinjamkan Bebas Cuci (Diambil Kotor)');

      // Verify URI encoding does not have broken double encoding (e.g. %2525)
      expect(payload.waUrl).not.toContain('%2525');
      const decodedUrlText = decodeURIComponent(payload.waUrl.replace('https://wa.me/6285861091103?text=', ''));
      expect(decodedUrlText).toBe(payload.message);
    });
  });
});
