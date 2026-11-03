/**
 * __tests__/checkout/cateringCheckoutRouting.test.ts
 *
 * Unit Test Suite for Catering Cart Validation & Checkout Routing Engine.
 */

import {
  validateCateringCart,
  buildCateringOrderPayload,
  aggregateSelectedSoups,
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
  // 3. STRUCTURED ORDER PAYLOAD BUILDER
  // =========================================================================
  describe('3. Order Booking Payload Builder', () => {
    it('should build structured payload with requires_pickup: true, rental schedule, and distance', () => {
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
        timeSlot: '17:00 - 18:00 WIB',
        pickupDate: '2026-11-21',
        formattedDeliveryDate: 'Jumat, 20 November 2026',
        notes: 'Titip di pos security jika belum tiba',
      });

      expect(payload.merchant_slug).toBe('shabu-ajhi');
      expect(payload.total_packages).toBe(2);
      expect(payload.requires_pickup).toBe(true); // Mandatory
      expect(payload.distance_km).toBe(4.5);
      expect(payload.delivery_fee).toBe(38000);
      expect(payload.total_price).toBe(185000 * 2 + 38000);
      expect(payload.selected_soups).toEqual({ Sukiyaki: 2 });
      expect(payload.rental_schedule).toEqual({
        delivery_date: '2026-11-20',
        time_slot: '17:00 - 18:00 WIB',
        pickup_date: '2026-11-21',
        formatted_delivery_date: 'Jumat, 20 November 2026',
      });
      expect(payload.is_large_party_order).toBe(false);
    });

    it('should set is_large_party_order: true when packages >= 5', () => {
      const items = [
        { name: 'Paket Mabar A', qty: 5, price: 250000 },
      ];

      const payload = buildCateringOrderPayload({
        merchantSlug: 'shabu-ajhi',
        cartItems: items,
        distanceKm: 10.0,
        deliveryDate: '2026-11-22',
        timeSlot: '12:00 - 13:00 WIB',
      });

      expect(payload.total_packages).toBe(5);
      expect(payload.is_large_party_order).toBe(true);
      expect(payload.requires_pickup).toBe(true);
      expect(payload.delivery_fee).toBe(0); // Manual coordination
    });

    it('should verify src/modules/checkout alias works identically', () => {
      const direct = validateCateringCart({
        cartItems: [{ name: 'Paket Oishi', qty: 2 }],
        distanceKm: 5.0,
      });
      const alias = validateCateringCartFromSrc({
        cartItems: [{ name: 'Paket Oishi', qty: 2 }],
        distanceKm: 5.0,
      });
      expect(alias).toEqual(direct);
    });
  });
});

