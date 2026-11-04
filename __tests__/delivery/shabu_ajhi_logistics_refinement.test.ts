/**
 * __tests__/delivery/shabu_ajhi_logistics_refinement.test.ts
 *
 * Test Suite: Shabu Ajhi Logistics & Catering Policy Refinement
 *
 * Verifies:
 * 1. Extreme Distance Delivery Fee (> 26 km Surcharge Rp 7.000/km with internal driver).
 * 2. Large Party Order Interception (>= 5 packages / 50 porsi -> Live Cooking & Event Catering).
 * 3. Package Combination & Fleet Multiplier Matrix (Oishi + Mabar A -> 2.0x, other combos -> 1.0x).
 * 4. Flexible Cookware Return Schedule (Same Day Malam vs Next Day Morning H+1 Pagi, auto-default >= 16:00).
 */

import {
  calculateShabuAjhiRate,
  BASE_TIER_13_FEE,
  EXTREME_DISTANCE_SURCHARGE_PER_KM,
} from '@/lib/delivery/shabuAjhiRates';
import {
  evaluateFleetRules,
  analyzePackageCombinations,
} from '@/lib/cart/fleetRules';
import {
  EquipmentReturnPicker,
  resolveDefaultEquipmentReturnWindow,
  buildEquipmentReturnMetadata,
  EQUIPMENT_RETURN_LABELS,
  EQUIPMENT_RETURN_GUARANTEE,
} from '@/components/shabu-ajhi/EquipmentReturnPicker';
import {
  calculateDeliveryFee,
  SHABU_AJHI_RATE_TIERS,
} from '@/lib/shipping/deliveryCalculator';
import {
  validateCateringCart,
  buildCateringOrderPayload,
  LIVE_COOKING_INTERCEPT_BANNER,
  LIVE_COOKING_CTA_TEXT,
} from '@/lib/checkout/cateringCheckoutRouting';
import { buildLiveCookingWhatsAppUrl } from '@/app/[tenant]/components/templates/FnbCateringStorefrontView';

describe('Shabu Ajhi Logistics & Catering Policy Refinement Suite', () => {
  // =========================================================================
  // 1. ONGKIR JARAK EKSTREM (> 26 KM SURCHARGE RP 7.000/KM)
  // =========================================================================
  describe('1. Extreme Distance Surcharge (> 26 km Rp 7.000/km)', () => {
    it('uses standard 13-tier rates for distance <= 26 km with internal driver', () => {
      // 2.0 km -> Tier 1 (Rp 25.000)
      const res2 = calculateShabuAjhiRate(2.0, { hasInternalDriver: true });
      expect(res2.isDeliverable).toBe(true);
      expect(res2.outOfRange).toBe(false);
      expect(res2.baseFee).toBe(25000);
      expect(res2.surchargeFee).toBe(0);
      expect(res2.totalFee).toBe(25000);
      expect(res2.provider).toBe('INTERNAL_DRIVER');
      expect(res2.requiresPickup).toBe(true);

      // 10.0 km -> Tier 5 (Rp 53.000)
      const res10 = calculateShabuAjhiRate(10.0, { hasInternalDriver: true });
      expect(res10.baseFee).toBe(53000);
      expect(res10.totalFee).toBe(53000);

      // 26.0 km -> Tier 13 (Rp 115.000)
      const res26 = calculateShabuAjhiRate(26.0, { hasInternalDriver: true });
      expect(res26.baseFee).toBe(115000);
      expect(res26.surchargeFee).toBe(0);
      expect(res26.totalFee).toBe(115000);
      expect(res26.provider).toBe('INTERNAL_DRIVER');
    });

    it('calculates extreme distance surcharge when distance > 26 km and armada internal is available', () => {
      // 27.0 km: excessKm = Math.ceil(27 - 26) = 1 -> surcharge = 1 * 7.000 = 7.000
      // total = 115.000 + 7.000 = 122.000
      const res27 = calculateShabuAjhiRate(27.0, { hasInternalDriver: true });
      expect(res27.isDeliverable).toBe(true);
      expect(res27.outOfRange).toBe(false);
      expect(res27.provider).toBe('INTERNAL_DRIVER');
      expect(res27.requiresPickup).toBe(true);
      expect(res27.excessKm).toBe(1);
      expect(res27.surchargeFee).toBe(7000);
      expect(res27.totalFee).toBe(122000);
      expect(res27.notes).toContain('surcharge jarak ekstrem Rp 7.000/km');
      expect(res27.surchargeBreakdown).toEqual({
        baseTier13Fee: 115000,
        excessKm: 1,
        ratePerKm: 7000,
        surchargeFee: 7000,
      });

      // 30.0 km: excessKm = Math.ceil(30 - 26) = 4 -> surcharge = 4 * 7.000 = 28.000
      // total = 115.000 + 28.000 = 143.000
      const res30 = calculateShabuAjhiRate(30.0, { hasInternalDriver: true });
      expect(res30.excessKm).toBe(4);
      expect(res30.surchargeFee).toBe(28000);
      expect(res30.totalFee).toBe(143000);
      expect(res30.provider).toBe('INTERNAL_DRIVER');

      // 32.4 km: excessKm = Math.ceil(32.4 - 26) = 7 -> surcharge = 7 * 7.000 = 49.000
      // total = 115.000 + 49.000 = 164.000
      const res324 = calculateShabuAjhiRate(32.4, { hasInternalDriver: true });
      expect(res324.excessKm).toBe(7);
      expect(res324.surchargeFee).toBe(49000);
      expect(res324.totalFee).toBe(164000);

      // 40.0 km: excessKm = 14 -> surcharge = 14 * 7.000 = 98.000
      // total = 115.000 + 98.000 = 213.000
      const res40 = calculateShabuAjhiRate(40.0, { hasInternalDriver: true });
      expect(res40.excessKm).toBe(14);
      expect(res40.surchargeFee).toBe(98000);
      expect(res40.totalFee).toBe(213000);
    });

    it('redirects to Lalamove manual ONLY when internal driver is explicitly unavailable (hasInternalDriver === false)', () => {
      const resLalamove = calculateShabuAjhiRate(28.5, { hasInternalDriver: false });
      expect(resLalamove.isDeliverable).toBe(false);
      expect(resLalamove.outOfRange).toBe(true);
      expect(resLalamove.provider).toBe('LALAMOVE_MANUAL');
      expect(resLalamove.notes).toContain('Armada internal tidak tersedia');
      expect(resLalamove.notes).toContain('Pengalihan ke Lalamove manual');
    });

    it('supports hasInternalDriver flag through calculateDeliveryFee wrapper', () => {
      const resFee = calculateDeliveryFee({
        distanceKm: 28.0,
        hasInternalDriver: true,
      });
      expect(resFee.isDeliverable).toBe(true);
      expect(resFee.outOfRange).toBe(false);
      expect(resFee.provider).toBe('INTERNAL_DRIVER');
      expect(resFee.baseFee).toBe(115000);
      expect(resFee.excessKm).toBe(2);
      expect(resFee.surchargeFee).toBe(14000);
      expect(resFee.totalFee).toBe(129000); // 115.000 + 14.000
    });
  });

  // =========================================================================
  // 2. INTERSEPSI PESANAN PARTAI BESAR (>= 5 PAKET / 50 PORSI -> LIVE COOKING)
  // =========================================================================
  describe('2. Large Party Order Interception (>= 5 Packages -> Live Cooking)', () => {
    it('allows regular checkout for orders with < 5 packages', () => {
      const smallCart = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 2, price: 185000 },
        { name: 'Paket Sakura (BBQ Only)', qty: 1, price: 155000 },
      ];

      const validation = validateCateringCart({
        cartItems: smallCart,
        distanceKm: 5.0,
      });

      expect(validation.totalPackages).toBe(3);
      expect(validation.canCheckoutOnline).toBe(true);
      expect(validation.liveCookingIntercept).toBe(false);
      expect(validation.liveCookingBanner).toBeNull();
    });

    it('intercepts orders with >= 5 packages, locks online checkout, and shows Live Cooking banner', () => {
      const largeCart = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 3, price: 185000 },
        { name: 'Paket Mabar A (Shabu & BBQ)', qty: 2, price: 250000 },
      ];

      const validation = validateCateringCart({
        cartItems: largeCart,
        distanceKm: 10.0,
        useLiveCookingCta: true,
      });

      expect(validation.totalPackages).toBe(5);
      expect(validation.canCheckoutOnline).toBe(false);
      expect(validation.requiresManualCoordination).toBe(true);
      expect(validation.liveCookingIntercept).toBe(true);
      expect(validation.liveCookingBanner).toBe(LIVE_COOKING_INTERCEPT_BANNER);
      expect(validation.liveCookingBanner).toContain('5 paket atau lebih (~50+ porsi)');
      expect(validation.liveCookingBanner).toContain('Live Cooking & Event Catering');
      expect(validation.ctaButtonText).toBe(LIVE_COOKING_CTA_TEXT);
    });

    it('builds pre-filled WhatsApp message targeting +62 896-1779-9878 with event and package details', () => {
      const payload = buildLiveCookingWhatsAppUrl({
        storeName: 'Shabu Ajhi',
        waNumber: '6289617799878',
        deliveryDate: '2026-11-20',
        formattedDeliveryDate: 'Jumat, 20 November 2026',
        selectedTimeSlot: '13:00 - 14:00 WIB',
        locationAddress: 'Villa Lembang Blok Nusantara 9',
        cartItems: [
          { name: 'Paket Mabar A (Shabu & BBQ)', qty: 3, price: 250000, soupVariant: 'Kuah Tomyum' },
          { name: 'Paket Oishi', qty: 2, price: 185000, soupVariant: 'Kuah Sukiyaki' },
        ],
        totalPackages: 5,
        totalPrice: 1120000,
      });

      expect(payload.targetPhone).toBe('6289617799878');
      expect(payload.waUrl).toContain('https://wa.me/6289617799878?text=');

      const message = payload.message;
      expect(message).toContain('Shabu Ajhi');
      expect(message).toContain('Live Cooking & Event Catering khusus');
      expect(message).toContain('5 paket (~50+ porsi)');
      expect(message).toContain('Jumat, 20 November 2026');
      expect(message).toContain('13:00 - 14:00 WIB');
      expect(message).toContain('Villa Lembang Blok Nusantara 9');
      expect(message).toContain('Paket Mabar A (Shabu & BBQ) x3 (Varian: Kuah Tomyum)');
      expect(message).toContain('Paket Oishi x2 (Varian: Kuah Sukiyaki)');
      expect(message).toContain('Rp 1.120.000');
    });
  });

  // =========================================================================
  // 3. MATRIKS KOMBINASI PAKET & FLEET MULTIPLIER
  // =========================================================================
  describe('3. Package Combination & Fleet Multiplier Matrix', () => {
    it('Oishi + Mabar A combination triggers Multiplier 2.0x (2 motor / 2 boks terpisah)', () => {
      const comboItems = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 1 },
        { name: 'Paket Mabar A (Shabu & BBQ)', qty: 1 },
      ];

      const analysis = analyzePackageCombinations(comboItems);
      expect(analysis.hasOishi).toBe(true);
      expect(analysis.hasMabarA).toBe(true);
      expect(analysis.isOishiAndMabarA).toBe(true);

      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(2.0);
      expect(fleet.fleetType).toBe('motor');
      expect(fleet.fleetDescription).toContain('2 Motor / 2 Boks Terpisah (Kombinasi Oishi + Mabar A)');
      expect(fleet.requiresManualCoordination).toBe(false);
    });

    it('Oishi + Kimochi combination remains Multiplier 1.0x (Normal)', () => {
      const comboItems = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 1 },
        { name: 'Paket Kimochi', qty: 1 },
      ];
      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(1.0);
      expect(fleet.fleetType).toBe('motor');
      expect(fleet.fleetDescription).toBe('1 Motor Armada Reguler');
    });

    it('Oishi + Ichiban combination remains Multiplier 1.0x (Normal)', () => {
      const comboItems = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 1 },
        { name: 'Paket Ichiban Premium', qty: 1 },
      ];
      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(1.0);
      expect(fleet.fleetType).toBe('motor');
    });

    it('Oishi + Sakura combination remains Multiplier 1.0x (Normal)', () => {
      const comboItems = [
        { name: 'Paket Oishi', qty: 1 },
        { name: 'Paket Sakura (BBQ Only)', qty: 1 },
      ];
      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(1.0);
      expect(fleet.fleetType).toBe('motor');
    });

    it('Oishi + Mabar B combination remains Multiplier 1.0x (Normal)', () => {
      const comboItems = [
        { name: 'Paket Oishi', qty: 1 },
        { name: 'Paket Mabar B', qty: 1 },
      ];
      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(1.0);
      expect(fleet.fleetType).toBe('motor');
    });

    it('Oishi + Mabar C combination remains Multiplier 1.0x (Normal)', () => {
      const comboItems = [
        { name: 'Paket Oishi', qty: 1 },
        { name: 'Paket Mabar C', qty: 1 },
      ];
      const fleet = evaluateFleetRules(2, comboItems);
      expect(fleet.multiplier).toBe(1.0);
      expect(fleet.fleetType).toBe('motor');
    });

    it('confirms delivery fee calculator integrates Oishi + Mabar A multiplier correctly', () => {
      const comboItems = [
        { name: 'Paket Oishi', qty: 1, price: 185000 },
        { name: 'Paket Mabar A', qty: 1, price: 250000 },
      ];

      // Distance 5.0 km -> Tier 3 base fee Rp 38.000
      // Multiplier 2.0x -> total fee = 38.000 * 2.0 = 76.000
      const res = calculateDeliveryFee({
        distanceKm: 5.0,
        items: comboItems,
      });

      expect(res.multiplier).toBe(2.0);
      expect(res.baseFee).toBe(38000);
      expect(res.totalFee).toBe(76000);
      expect(res.fleetDescription).toContain('Kombinasi Oishi + Mabar A');
    });
  });

  // =========================================================================
  // 4. FLEKSIBILITAS PENGAMBILAN ALAT (DEFAULT H+1 PAGI)
  // =========================================================================
  describe('4. Flexible Cookware Return Schedule (Default H+1 Pagi)', () => {
    it('verifies exact radio option labels and cleaning guarantee microcopy', () => {
      expect(EQUIPMENT_RETURN_LABELS.SAME_DAY).toBe('Same Day (Malam)');
      expect(EQUIPMENT_RETURN_LABELS.NEXT_DAY_MORNING).toBe('Next Day Morning (H+1 Pagi)');
      expect(EQUIPMENT_RETURN_GUARANTEE).toBe(
        'Peralatan tidak perlu dicuci. Tim Shabu Ajhi yang akan membersihkan seluruh perlengkapan saat penjemputan.'
      );
    });

    it('auto-defaults to Next Day Morning (H+1 Pagi) if delivery starts at or after 16:00 WIB', () => {
      // 16:00 WIB -> NEXT_DAY_MORNING
      expect(resolveDefaultEquipmentReturnWindow('16:00 - 17:00 WIB')).toBe('NEXT_DAY_MORNING');
      // 17:30 WIB -> NEXT_DAY_MORNING
      expect(resolveDefaultEquipmentReturnWindow('17:30 WIB')).toBe('NEXT_DAY_MORNING');
      // 19.00 WIB -> NEXT_DAY_MORNING
      expect(resolveDefaultEquipmentReturnWindow('19.00 - 20.00 WIB')).toBe('NEXT_DAY_MORNING');
      // 20:00 WIB -> NEXT_DAY_MORNING
      expect(resolveDefaultEquipmentReturnWindow('20:00 WIB')).toBe('NEXT_DAY_MORNING');
    });

    it('defaults to Same Day (Malam) for deliveries before 16:00 WIB', () => {
      // 11:00 WIB -> SAME_DAY
      expect(resolveDefaultEquipmentReturnWindow('11:00 - 12:00 WIB')).toBe('SAME_DAY');
      // 12:30 WIB -> SAME_DAY
      expect(resolveDefaultEquipmentReturnWindow('12:30 WIB')).toBe('SAME_DAY');
      // 14:00 WIB -> SAME_DAY
      expect(resolveDefaultEquipmentReturnWindow('14:00 - 15:00 WIB')).toBe('SAME_DAY');
      // 15:59 WIB -> SAME_DAY
      expect(resolveDefaultEquipmentReturnWindow('15:59 WIB')).toBe('SAME_DAY');
      // Undefined -> SAME_DAY
      expect(resolveDefaultEquipmentReturnWindow(undefined)).toBe('SAME_DAY');
    });

    it('builds equipment_return metadata with exact window, cleaning guarantee, and time slot', () => {
      const sameDayMeta = buildEquipmentReturnMetadata('SAME_DAY', '2026-11-20', '12:00 WIB');
      expect(sameDayMeta.preference).toBe('SAME_DAY');
      expect(sameDayMeta.label).toBe('Same Day (Malam)');
      expect(sameDayMeta.pickup_date).toBe('2026-11-20');
      expect(sameDayMeta.time_slot).toBe('Malam (Setelah Acara)');
      expect(sameDayMeta.cleaning_guarantee).toBe(EQUIPMENT_RETURN_GUARANTEE);

      const nextDayMeta = buildEquipmentReturnMetadata('NEXT_DAY_MORNING', '2026-11-20', '17:00 WIB');
      expect(nextDayMeta.preference).toBe('NEXT_DAY_MORNING');
      expect(nextDayMeta.label).toBe('Next Day Morning (H+1 Pagi)');
      expect(nextDayMeta.pickup_date).toBe('2026-11-21'); // +1 day
      expect(nextDayMeta.time_slot).toBe('08.00 – 11.00 WIB');
      expect(nextDayMeta.cleaning_guarantee).toBe(EQUIPMENT_RETURN_GUARANTEE);
    });

    it('persists equipment_return into catering order payload', () => {
      const payload = buildCateringOrderPayload({
        cartItems: [{ name: 'Paket Oishi', qty: 2, price: 185000 }],
        distanceKm: 5.0,
        deliveryDate: '2026-11-20',
        timeSlot: '17:00 - 18:00 WIB',
      });

      expect(payload.equipment_return).toBeDefined();
      expect(payload.equipment_return?.preference).toBe('NEXT_DAY_MORNING');
      expect(payload.equipment_return?.label).toBe('Next Day Morning (H+1 Pagi)');
      expect(payload.equipment_return?.pickup_date).toBe('2026-11-21');
      expect(payload.equipment_return?.time_slot).toBe('08.00 – 11.00 WIB');
      expect(payload.equipment_return?.cleaning_guarantee).toBe(EQUIPMENT_RETURN_GUARANTEE);
    });
  });
});
