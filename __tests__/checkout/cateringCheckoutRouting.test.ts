/**
 * __tests__/checkout/cateringCheckoutRouting.test.ts
 *
 * Unit Test Suite for Catering Cart Validation, Checkout Routing Engine,
 * Flexible Cookware Pickup Windows ('SAME_DAY' | 'NEXT_DAY_MORNING'),
 * and Rental Schedule Payload Builder.
 */

import {
  validateCateringCart,
  buildCateringOrderPayload,
  aggregateSelectedSoups,
  resolveDefaultPickupWindow,
  calculatePickupDate,
  PICKUP_WINDOW_LABELS,
  PICKUP_MICROCOPY,
} from '@/lib/checkout/cateringCheckoutRouting';
import {
  LARGE_ORDER_WARNING_MESSAGE,
  OUT_OF_RANGE_ERROR_MESSAGE,
  SHABU_AJHI_HANDOVER_PHONE,
} from '@/lib/shipping/deliveryCalculator';
// Also verify import from src/modules alias
import {
  validateCateringCart as validateCateringCartFromSrc,
  buildCateringOrderPayload as buildCateringOrderPayloadFromSrc,
  resolveDefaultPickupWindow as resolveDefaultPickupWindowFromSrc,
  calculatePickupDate as calculatePickupDateFromSrc,
} from '@/src/modules/checkout';

describe('Catering Checkout Routing & Payload Engine', () => {
  // =========================================================================
  // 1. CART VALIDATION & CAPACITY GATES
  // =========================================================================
  describe('1. Cart Capacity Validation', () => {
    it('should allow online checkout for small orders (3 packages <= 4, within 10 km)', () => {
      const items = [
        { name: 'Paket Oishi (Shabu & BBQ)', qty: 2, price: 185000 },
        { name: 'Paket Ichiban Premium', qty: 1, price: 215000 },
      ];

      const validation = validateCateringCart({
        cartItems: items,
        distanceKm: 9.0, // Tier 5: 53.000
      });

      expect(validation.totalPackages).toBe(3);
      expect(validation.requiresManualCoordination).toBe(false);
      expect(validation.canCheckoutOnline).toBe(true);
      expect(validation.warningBanner).toBeNull();
      expect(validation.deliveryResult.multiplier).toBe(2.0);
      expect(validation.deliveryResult.totalFee).toBe(106000); // 53.000 * 2.0
      expect(validation.ctaButtonText).toBe('WhatsApp Kasir / CS');
    });

    it('should disable online checkout and activate warning banner for >= 5 packages', () => {
      const items = [
        {
          name: 'Paket Mabar A (Shabu & BBQ)',
          qty: 3,
          price: 250000,
          selectedSoups: { Tomyum: 2, 'Kaldu Ayam': 1 },
        },
        {
          name: 'Paket Oishi',
          qty: 2,
          price: 185000,
          selectedSoups: { Sukiyaki: 2 },
        },
      ];

      const validation = validateCateringCart({
        cartItems: items,
        distanceKm: 8.0,
        formattedDeliveryDate: 'Sabtu, 14 November 2026',
        selectedTimeSlot: '12:00 - 13:00 WIB',
        locationAddress: 'Villa Cikole Asri Blok D-5',
      });

      expect(validation.totalPackages).toBe(5);
      expect(validation.requiresManualCoordination).toBe(true);
      expect(validation.canCheckoutOnline).toBe(false);
      expect(validation.warningBanner).toBe(LARGE_ORDER_WARNING_MESSAGE);
      expect(validation.ctaButtonText).toBe('Hubungi Admin CS Shabu Ajhi');
      expect(validation.whatsappHandoffUrl).toContain(`https://wa.me/${SHABU_AJHI_HANDOVER_PHONE}?text=`);

      const message = validation.whatsappMessage;
      expect(message).toContain('Shabu Ajhi');
      expect(message).toContain('5 paket');
      expect(message).toContain('requires_pickup: true');
      expect(message).toContain('Paket Mabar A (Shabu & BBQ) x3 (Kuah: Tomyum: 2, Kaldu Ayam: 1)');
      expect(message).toContain('Paket Oishi x2 (Kuah: Sukiyaki: 2)');
    });

    it('should disable online checkout and show out-of-range banner when distance > 26 km', () => {
      const items = [{ name: 'Paket Oishi', qty: 1, price: 185000 }];

      const validation = validateCateringCart({
        cartItems: items,
        distanceKm: 28.5,
      });

      expect(validation.requiresManualCoordination).toBe(true);
      expect(validation.canCheckoutOnline).toBe(false);
      expect(validation.warningBanner).toBe(OUT_OF_RANGE_ERROR_MESSAGE);
    });
  });

  // =========================================================================
  // 2. SOUP AGGREGATION
  // =========================================================================
  describe('2. Soup Aggregation', () => {
    it('should aggregate all chosen soup variants into a single dictionary', () => {
      const items = [
        {
          name: 'Paket Mabar A',
          qty: 2,
          selectedSoups: { Tomyum: 2, 'Kaldu Ayam': 1 },
        },
        {
          name: 'Paket Oishi',
          qty: 1,
          selectedSoups: { Tomyum: 1, Sukiyaki: 1 },
        },
        {
          name: 'Paket Sakura BBQ',
          qty: 1,
          isAddon: false,
        },
      ];

      const soupSummary = aggregateSelectedSoups(items);
      expect(soupSummary).toEqual({
        Tomyum: 3,
        'Kaldu Ayam': 1,
        Sukiyaki: 1,
      });
    });
  });

  // =========================================================================
  // 3. COOKWARE PICKUP RESOLUTION & H+1 CALCULATOR
  // =========================================================================
  describe('3. Cookware Pickup Options & 16.00 WIB Auto-Default', () => {
    it('should verify exact microcopy and option labels', () => {
      expect(PICKUP_MICROCOPY).toBe(
        'Peralatan tidak perlu dicuci. Penjemputan fleksibel, bisa dijemput hari yang sama atau besok paginya.'
      );
      expect(PICKUP_WINDOW_LABELS.SAME_DAY).toBe('Hari yang Sama (Setelah Acara)');
      expect(PICKUP_WINDOW_LABELS.NEXT_DAY_MORNING).toBe('Besok Pagi (H+1)');
    });

    it('should default to SAME_DAY for delivery slots before 16.00 WIB', () => {
      expect(resolveDefaultPickupWindow('10:00 - 11:00 WIB (Pagi)')).toBe('SAME_DAY');
      expect(resolveDefaultPickupWindow('12:00 - 13:00 WIB (Siang)')).toBe('SAME_DAY');
      expect(resolveDefaultPickupWindow('14:30 - 15:30 WIB')).toBe('SAME_DAY');
      expect(resolveDefaultPickupWindow('15:00 - 16:00 WIB (Sore)')).toBe('SAME_DAY');
      expect(resolveDefaultPickupWindow(undefined)).toBe('SAME_DAY');
      expect(resolveDefaultPickupWindow('')).toBe('SAME_DAY');
    });

    it('should auto-default to NEXT_DAY_MORNING (H+1) for delivery slots at or after 16.00 WIB', () => {
      expect(resolveDefaultPickupWindow('16:00 - 17:00 WIB (Sore)')).toBe('NEXT_DAY_MORNING');
      expect(resolveDefaultPickupWindow('17:00 - 18:00 WIB (Malam)')).toBe('NEXT_DAY_MORNING');
      expect(resolveDefaultPickupWindow('18:00 - 19:00 WIB (Malam)')).toBe('NEXT_DAY_MORNING');
      expect(resolveDefaultPickupWindow('19:30 - 20:30 WIB')).toBe('NEXT_DAY_MORNING');
    });

    it('should calculate correct pickup date: same day vs next day morning (H+1)', () => {
      // Same day
      expect(calculatePickupDate('2026-11-20', 'SAME_DAY')).toBe('2026-11-20');

      // Next day morning (+1 calendar day)
      expect(calculatePickupDate('2026-11-20', 'NEXT_DAY_MORNING')).toBe('2026-11-21');

      // Month rollover (+1 day across month boundary)
      expect(calculatePickupDate('2026-11-30', 'NEXT_DAY_MORNING')).toBe('2026-12-01');

      // Year rollover
      expect(calculatePickupDate('2026-12-31', 'NEXT_DAY_MORNING')).toBe('2027-01-01');
    });
  });

  // =========================================================================
  // 4. STRUCTURED ORDER PAYLOAD BUILDER WITH RENTAL SCHEDULE
  // =========================================================================
  describe('4. Order Booking Payload Builder with Rental Schedule', () => {
    it('should build structured payload with pickup_date and pickup_window (SAME_DAY)', () => {
      const items = [
        {
          name: 'Paket Oishi',
          qty: 2,
          price: 185000,
          selectedSoups: { Sukiyaki: 2 },
        },
      ];

      const payload = buildCateringOrderPayload({
        merchantSlug: 'shabu-ajhi',
        cartItems: items,
        distanceKm: 4.5, // Tier 3: 38.000 * 1.0 = 38.000
        deliveryDate: '2026-11-20',
        timeSlot: '12:00 - 13:00 WIB',
        pickupWindow: 'SAME_DAY',
        pickupDate: '2026-11-20',
        formattedDeliveryDate: 'Jumat, 20 November 2026',
        notes: 'Titip di pos security jika belum tiba',
      });

      expect(payload.merchant_slug).toBe('shabu-ajhi');
      expect(payload.total_packages).toBe(2);
      expect(payload.requires_pickup).toBe(true);
      expect(payload.distance_km).toBe(4.5);
      expect(payload.delivery_fee).toBe(38000);
      expect(payload.total_price).toBe(185000 * 2 + 38000);
      expect(payload.selected_soups).toEqual({ Sukiyaki: 2 });
      expect(payload.rental_schedule).toEqual({
        delivery_date: '2026-11-20',
        time_slot: '12:00 - 13:00 WIB',
        pickup_date: '2026-11-20',
        pickup_window: 'SAME_DAY',
        pickup_preference: 'Hari yang Sama (Setelah Acara)',
        formatted_delivery_date: 'Jumat, 20 November 2026',
        formatted_pickup_date: undefined,
      });
      expect(payload.is_large_party_order).toBe(false);
    });

    it('should build payload with NEXT_DAY_MORNING (H+1) and automatic date resolution for slots >= 16:00', () => {
      const items = [{ name: 'Paket Oishi', qty: 1, price: 185000 }];

      // Slot at 17:00 WIB without explicit pickupWindow passed -> defaults to NEXT_DAY_MORNING
      const payload = buildCateringOrderPayload({
        merchantSlug: 'shabu-ajhi',
        cartItems: items,
        distanceKm: 5.0,
        deliveryDate: '2026-11-25',
        timeSlot: '17:00 - 18:00 WIB (Malam)',
      });

      expect(payload.rental_schedule.pickup_window).toBe('NEXT_DAY_MORNING');
      expect(payload.rental_schedule.pickup_date).toBe('2026-11-26'); // Automatically H+1
      expect(payload.rental_schedule.pickup_preference).toBe('Besok Pagi (H+1)');
      expect(payload.requires_pickup).toBe(true);
    });

    it('should verify src/modules/checkout alias re-exports work identically', () => {
      expect(resolveDefaultPickupWindowFromSrc('17:00 - 18:00 WIB')).toBe('NEXT_DAY_MORNING');
      expect(calculatePickupDateFromSrc('2026-11-20', 'NEXT_DAY_MORNING')).toBe('2026-11-21');

      const direct = buildCateringOrderPayload({
        cartItems: [{ name: 'Paket Oishi', qty: 2 }],
        distanceKm: 5.0,
        deliveryDate: '2026-11-20',
        timeSlot: '12:00 - 13:00 WIB',
        pickupWindow: 'SAME_DAY',
      });
      const alias = buildCateringOrderPayloadFromSrc({
        cartItems: [{ name: 'Paket Oishi', qty: 2 }],
        distanceKm: 5.0,
        deliveryDate: '2026-11-20',
        timeSlot: '12:00 - 13:00 WIB',
        pickupWindow: 'SAME_DAY',
      });
      expect(alias).toEqual(direct);
    });
  });
});
