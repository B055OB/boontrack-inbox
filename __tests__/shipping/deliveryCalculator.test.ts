/**
 * __tests__/shipping/deliveryCalculator.test.ts
 *
 * Unit Test Suite for Shabu Ajhi Round-Trip (PP) Delivery Engine,
 * 13-Tier Base Rates, Fleet Multipliers, Capacity Boundaries, and Large Order Handover.
 */

import {
  calculateDeliveryFee,
  getBaseRate,
  countCateringPackages,
  getFleetMultiplier,
  buildLargeOrderWhatsAppUrl,
  SHABU_AJHI_RATE_TIERS,
  MAX_REGULAR_DISTANCE_KM,
  OUT_OF_RANGE_ERROR_MESSAGE,
  LARGE_ORDER_WARNING_MESSAGE,
  SHABU_AJHI_HANDOVER_PHONE,
} from '@/lib/shipping/deliveryCalculator';
// Also verify import from src/utils alias
import { calculateDeliveryFee as calculateDeliveryFeeFromSrc } from '@/src/utils/deliveryCalculator';

describe('Shabu Ajhi Delivery Calculator & Multiplier Engine', () => {
  // =========================================================================
  // 1. 13 BASE RATE TIERS (PP 1 - 26 KM)
  // =========================================================================
  describe('1. 13-Tier Base Rate Verification (0.0 - 26.0 KM)', () => {
    const expectedTiers = [
      { name: 'Tier 1 (0.0 - 2.0 km)', min: 0.0, sample: 1.5, max: 2.0, expected: 25000 },
      { name: 'Tier 2 (2.1 - 4.0 km)', min: 2.1, sample: 3.0, max: 4.0, expected: 30000 },
      { name: 'Tier 3 (4.1 - 6.0 km)', min: 4.1, sample: 5.0, max: 6.0, expected: 38000 },
      { name: 'Tier 4 (6.1 - 8.0 km)', min: 6.1, sample: 7.0, max: 8.0, expected: 45000 },
      { name: 'Tier 5 (8.1 - 10.0 km)', min: 8.1, sample: 9.0, max: 10.0, expected: 53000 },
      { name: 'Tier 6 (10.1 - 12.0 km)', min: 10.1, sample: 11.0, max: 12.0, expected: 60000 },
      { name: 'Tier 7 (12.1 - 14.0 km)', min: 12.1, sample: 13.0, max: 14.0, expected: 68000 },
      { name: 'Tier 8 (14.1 - 16.0 km)', min: 14.1, sample: 15.0, max: 16.0, expected: 75000 },
      { name: 'Tier 9 (16.1 - 18.0 km)', min: 16.1, sample: 17.0, max: 18.0, expected: 83000 },
      { name: 'Tier 10 (18.1 - 20.0 km)', min: 18.1, sample: 19.0, max: 20.0, expected: 90000 },
      { name: 'Tier 11 (20.1 - 22.0 km)', min: 20.1, sample: 21.0, max: 22.0, expected: 98000 },
      { name: 'Tier 12 (22.1 - 24.0 km)', min: 22.1, sample: 23.0, max: 24.0, expected: 105000 },
      { name: 'Tier 13 (24.1 - 26.0 km)', min: 24.1, sample: 25.0, max: 26.0, expected: 115000 },
    ];

    it('should have exactly 13 defined tiers in SHABU_AJHI_RATE_TIERS', () => {
      expect(SHABU_AJHI_RATE_TIERS).toHaveLength(13);
      expect(MAX_REGULAR_DISTANCE_KM).toBe(26.0);
    });

    expectedTiers.forEach((t, index) => {
      it(`should return exact rate for ${t.name}: Rp ${t.expected.toLocaleString('id-ID')}`, () => {
        expect(getBaseRate(t.min)).toBe(t.expected);
        expect(getBaseRate(t.sample)).toBe(t.expected);
        expect(getBaseRate(t.max)).toBe(t.expected);

        // Also test through calculateDeliveryFee with 1 package (1.0x multiplier)
        const res = calculateDeliveryFee(t.sample, 1);
        expect(res.isDeliverable).toBe(true);
        expect(res.outOfRange).toBe(false);
        expect(res.baseFee).toBe(t.expected);
        expect(res.totalFee).toBe(t.expected);
        expect(res.multiplier).toBe(1.0);
        expect(res.requires_pickup).toBe(true);
      });
    });

    it('should confirm calculateDeliveryFeeFromSrc alias matches calculateDeliveryFee identically', () => {
      const direct = calculateDeliveryFee(10.0, 2);
      const aliased = calculateDeliveryFeeFromSrc(10.0, 2);
      expect(aliased).toEqual(direct);
    });
  });

  // =========================================================================
  // 2. BOUNDARY LIMITS & OUT-OF-RANGE REJECTION (> 26.0 KM)
  // =========================================================================
  describe('2. Boundary Limits & Fallback (Distance > 26.0 KM)', () => {
    it('should accept 26.0 km as the exact upper regular limit (Tier 13 = Rp 115.000)', () => {
      const res26 = calculateDeliveryFee(26.0, 2);
      expect(res26.isDeliverable).toBe(true);
      expect(res26.outOfRange).toBe(false);
      expect(res26.baseFee).toBe(115000);
      expect(res26.totalFee).toBe(115000);
      expect(res26.requires_pickup).toBe(true);
      expect(res26.error).toBeUndefined();
    });

    it('should reject 26.1 km with outOfRange: true, isDeliverable: false and exact error message', () => {
      const res261 = calculateDeliveryFee(26.1, 2);
      expect(res261.isDeliverable).toBe(false);
      expect(res261.outOfRange).toBe(true);
      expect(res261.baseFee).toBe(0);
      expect(res261.totalFee).toBe(0);
      expect(res261.multiplier).toBe(0);
      expect(res261.requires_pickup).toBe(true);
      expect(res261.requiresManualCoordination).toBe(true);
      expect(res261.error).toBe(OUT_OF_RANGE_ERROR_MESSAGE);
      expect(res261.handoverContact).toBe(SHABU_AJHI_HANDOVER_PHONE);
    });

    it('should reject large distances (30 km, 45 km, 100 km) without unhandled exceptions', () => {
      for (const dist of [30, 45, 100]) {
        const res = calculateDeliveryFee(dist, 1);
        expect(res.isDeliverable).toBe(false);
        expect(res.outOfRange).toBe(true);
        expect(res.error).toBe(OUT_OF_RANGE_ERROR_MESSAGE);
        expect(res.requires_pickup).toBe(true);
      }
    });

    it('should defensively handle negative, NaN, or invalid distance inputs without throwing', () => {
      const resNeg = calculateDeliveryFee(-5, 1);
      expect(resNeg.isDeliverable).toBe(false);
      expect(resNeg.requires_pickup).toBe(true);
      expect(resNeg.error).toContain('tidak valid');

      const resNaN = calculateDeliveryFee(NaN, 1);
      expect(resNaN.isDeliverable).toBe(false);
      expect(resNaN.requires_pickup).toBe(true);

      expect(getBaseRate(-1)).toBeNull();
      expect(getBaseRate(NaN)).toBeNull();
    });
  });

  // =========================================================================
  // 3. FLEET MULTIPLIERS (PACKAGE QUANTITY CAPACITY)
  // =========================================================================
  describe('3. Fleet Multipliers based on Package Quantity', () => {
    const testDistanceKm = 5.0; // Tier 3: Base fee Rp 38.000
    const expectedBaseFee = 38000;

    it('totalPackages <= 2: Multiplier 1.0 (1 motor armada reguler)', () => {
      // 1 package
      const res1 = calculateDeliveryFee(testDistanceKm, 1);
      expect(res1.multiplier).toBe(1.0);
      expect(res1.baseFee).toBe(expectedBaseFee);
      expect(res1.totalFee).toBe(expectedBaseFee * 1.0); // 38.000
      expect(res1.fleetType).toBe('motor');
      expect(res1.requiresManualCoordination).toBe(false);

      // 2 packages
      const res2 = calculateDeliveryFee(testDistanceKm, 2);
      expect(res2.multiplier).toBe(1.0);
      expect(res2.baseFee).toBe(expectedBaseFee);
      expect(res2.totalFee).toBe(expectedBaseFee * 1.0); // 38.000
      expect(res2.fleetType).toBe('motor');
      expect(res2.requiresManualCoordination).toBe(false);
    });

    it('totalPackages === 3: Multiplier 2.0 (2 motor armada reguler)', () => {
      const res3 = calculateDeliveryFee(testDistanceKm, 3);
      expect(res3.multiplier).toBe(2.0);
      expect(res3.baseFee).toBe(expectedBaseFee);
      expect(res3.totalFee).toBe(expectedBaseFee * 2.0); // 76.000
      expect(res3.fleetType).toBe('motor');
      expect(res3.requiresManualCoordination).toBe(false);
    });

    it('totalPackages === 4: Multiplier 2.5 (armada mobil / trip ganda)', () => {
      const res4 = calculateDeliveryFee(testDistanceKm, 4);
      expect(res4.multiplier).toBe(2.5);
      expect(res4.baseFee).toBe(expectedBaseFee);
      expect(res4.totalFee).toBe(expectedBaseFee * 2.5); // 95.000
      expect(res4.fleetType).toBe('car');
      expect(res4.requiresManualCoordination).toBe(false);
    });

    it('totalPackages >= 5: requiresManualCoordination: true (disable automatic delivery fee)', () => {
      // 5 packages
      const res5 = calculateDeliveryFee(testDistanceKm, 5);
      expect(res5.requiresManualCoordination).toBe(true);
      expect(res5.totalFee).toBe(0);
      expect(res5.multiplier).toBe(0);
      expect(res5.fleetType).toBe('custom');
      expect(res5.error).toBe(LARGE_ORDER_WARNING_MESSAGE);
      expect(res5.handoverContact).toBe(SHABU_AJHI_HANDOVER_PHONE);

      // 10 packages
      const res10 = calculateDeliveryFee(testDistanceKm, 10);
      expect(res10.requiresManualCoordination).toBe(true);
      expect(res10.totalFee).toBe(0);
    });

    it('should always maintain requires_pickup: true across all calculations', () => {
      expect(calculateDeliveryFee(2.0, 1).requires_pickup).toBe(true);
      expect(calculateDeliveryFee(10.0, 3).requires_pickup).toBe(true);
      expect(calculateDeliveryFee(15.0, 4).requires_pickup).toBe(true);
      expect(calculateDeliveryFee(20.0, 5).requires_pickup).toBe(true);
      expect(calculateDeliveryFee(28.0, 1).requires_pickup).toBe(true);
    });
  });

  // =========================================================================
  // 4. ITEM PARSING & PACKAGE COUNTING
  // =========================================================================
  describe('4. Item Parsing & Catering Package Detection', () => {
    it('should accurately count main catering packages (Oishii, Ichiban, Mabar A, Mabar B)', () => {
      const items = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 2 },
        { name: 'Paket Mabar A (10 Pax)', qty: 1 },
      ];
      expect(countCateringPackages(items)).toBe(3);
    });

    it('should exclude add-ons (extra beef, vegetables) from catering package count', () => {
      const items = [
        { name: 'Paket Ichiban Premium', qty: 2 },
        { name: 'Ekstra Daging Slice 200g', qty: 3, isAddon: true },
        { name: 'Sayur Campur Segar', qty: 2, is_addon: true },
        { name: 'Extra Kuah Tomyum', qty: 1 },
      ];
      // Only 2 Paket Ichiban count as packages
      expect(countCateringPackages(items)).toBe(2);

      const feeResult = calculateDeliveryFee({ distanceKm: 5.0, items });
      expect(feeResult.totalPackages).toBe(2);
      expect(feeResult.multiplier).toBe(1.0);
      expect(feeResult.totalFee).toBe(38000);
    });
  });

  // =========================================================================
  // 5. LARGE ORDER WHATSAPP HANDOFF ROUTING (+62 896-1779-9878)
  // =========================================================================
  describe('5. Large Order WhatsApp Handover Routing (+62 896-1779-9878)', () => {
    it('should generate WhatsApp URL targeting 6289617799878 with full cart summary', () => {
      const { waUrl, message, targetPhone } = buildLargeOrderWhatsAppUrl({
        storeName: 'Shabu Ajhi',
        distanceKm: 12.5,
        deliveryDate: '2026-11-10',
        formattedDeliveryDate: 'Selasa, 10 November 2026',
        selectedTimeSlot: '12:00 - 13:00 WIB',
        locationAddress: 'Villa Lembang Asri Blok C-2',
        totalPackages: 5,
        totalPrice: 1250000,
        cartItems: [
          {
            name: 'Paket Mabar A (Shabu & BBQ)',
            qty: 3,
            price: 250000,
            selectedSoups: { Tomyum: 2, 'Kaldu Ayam': 1 },
          },
          {
            name: 'Paket Oishi',
            qty: 2,
            price: 250000,
            selectedSoups: { Sukiyaki: 2 },
          },
        ],
      });

      expect(targetPhone).toBe('6289617799878');
      expect(waUrl).toContain('https://wa.me/6289617799878?text=');

      // Check contents of decoded message
      expect(message).toContain('Shabu Ajhi');
      expect(message).toContain('5 paket');
      expect(message).toContain('Selasa, 10 November 2026');
      expect(message).toContain('12:00 - 13:00 WIB');
      expect(message).toContain('12.5 km');
      expect(message).toContain('Villa Lembang Asri Blok C-2');
      expect(message).toContain('requires_pickup: true');
      expect(message).toContain('Paket Mabar A (Shabu & BBQ) x3 (Kuah: Tomyum: 2, Kaldu Ayam: 1)');
      expect(message).toContain('Paket Oishi x2 (Kuah: Sukiyaki: 2)');
      expect(message).toContain('Rp 1.250.000');

      // Verify clean URL encoding without corruption
      const decoded = decodeURIComponent(waUrl.replace('https://wa.me/6289617799878?text=', ''));
      expect(decoded).toBe(message);
    });
  });
});

