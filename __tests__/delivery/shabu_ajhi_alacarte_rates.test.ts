/**
 * __tests__/delivery/shabu_ajhi_alacarte_rates.test.ts
 *
 * Test suite for Shabu Ajhi Alacarte 1-Way Delivery & Equipment Isolation.
 * Verifies:
 * 1. Distinction between catering cookware packages (PP 13-tier) vs alacarte/non-equipment (1-way motor delivery).
 * 2. 1-way motorcycle delivery rate formula: Rp 12.000 for <= 4 km, +Rp 2.800/km beyond 4 km (rounded to nearest 500).
 * 3. requires_pickup flag is false for pure alacarte orders, true when any equipment package is in the cart.
 * 4. WhatsApp message generation for alacarte orders omits dirty cookware pickup notes.
 */

import {
  isCateringPackage,
  hasEquipmentItems,
  calculateShabuAjhiOneWayRate,
  calculateDeliveryFee,
  CateringItem,
  parseCoordinatesFromInput,
} from '@/lib/shipping/deliveryCalculator';
import { calculateShabuAjhiRate } from '@/lib/delivery/shabuAjhiRates';
import { buildCateringWhatsAppUrl } from '@/app/[tenant]/components/templates/FnbCateringStorefrontView';

describe('Shabu Ajhi Alacarte 1-Way Shipping Engine', () => {
  describe('isCateringPackage classification', () => {
    it('should classify pure alacarte items as false', () => {
      const beefSlice: CateringItem = {
        name: 'Beef Slice Fat 250gr',
        qty: 2,
        price: 35000,
        category: 'Alacarte (Additional)',
        requires_equipment: false,
      };
      expect(isCateringPackage(beefSlice)).toBe(false);

      const tomyumSoup: CateringItem = {
        name: 'Kuah Tomyum 1 Liter',
        qty: 1,
        price: 25000,
        category: 'Alacarte (Additional)',
      };
      expect(isCateringPackage(tomyumSoup)).toBe(false);

      const yakinikuSauce: CateringItem = {
        name: 'Saus Yakiniku Gurih',
        qty: 1,
        price: 15000,
        isAddon: true,
      };
      expect(isCateringPackage(yakinikuSauce)).toBe(false);

      const bentoBox: CateringItem = {
        name: 'Bento Beef Teriyaki',
        qty: 1,
        price: 30000,
        category: 'Bento Box Spesial',
      };
      expect(isCateringPackage(bentoBox)).toBe(false);

      const lemonTea: CateringItem = {
        name: 'Lemon Tea 500ml',
        qty: 2,
        price: 10000,
        category: 'Minuman',
      };
      expect(isCateringPackage(lemonTea)).toBe(false);

      const paketTanpaAlat: CateringItem = {
        name: 'Paket Shabu Tanpa Alat (2-3 Porsi)',
        qty: 1,
        price: 85000,
        category: 'Paket Tanpa Alat',
      };
      expect(isCateringPackage(paketTanpaAlat)).toBe(false);
    });

    it('should classify catering equipment packages as true', () => {
      const paketOishi: CateringItem = {
        name: 'Paket Oishi Shabu (4-6 Porsi)',
        qty: 1,
        price: 250000,
        category: 'Paket Alat Hemat',
        requires_equipment: true,
      };
      expect(isCateringPackage(paketOishi)).toBe(true);

      const paketMabar: CateringItem = {
        name: 'Paket Mabar A (8-10 Porsi)',
        qty: 1,
        price: 450000,
        category: 'Paket Alat Premium',
      };
      expect(isCateringPackage(paketMabar)).toBe(true);

      const sewaAlat: CateringItem = {
        name: 'Sewa Alat Kompor + Grill Portabel',
        qty: 1,
        price: 50000,
        category: 'Sewa Alat',
        requires_equipment: true,
      };
      expect(isCateringPackage(sewaAlat)).toBe(true);
    });
  });

  describe('calculateShabuAjhiOneWayRate formula', () => {
    it('should calculate base fee Rp 12.000 for distance <= 4 km', () => {
      expect(calculateShabuAjhiOneWayRate(1.5)).toBe(12000);
      expect(calculateShabuAjhiOneWayRate(3.0)).toBe(12000);
      expect(calculateShabuAjhiOneWayRate(4.0)).toBe(12000);
    });

    it('should add Rp 2.800/km beyond 4 km rounded to nearest 500', () => {
      // 5.0 km: 12000 + 1 * 2800 = 14800 -> rounded to 500 = 15000
      expect(calculateShabuAjhiOneWayRate(5.0)).toBe(15000);

      // 10.0 km: 12000 + 6 * 2800 = 28800 -> rounded to 500 = 29000
      expect(calculateShabuAjhiOneWayRate(10.0)).toBe(29000);

      // 27.8 km (Villa Istana Bunga): 12000 + 23.8 * 2800 = 78640 -> rounded to 500 = 78500
      expect(calculateShabuAjhiOneWayRate(27.8)).toBe(78500);
    });
  });

  describe('calculateShabuAjhiRate for alacarte orders', () => {
    const alacarteCart: CateringItem[] = [
      { name: 'Beef Slice Fat 250gr', qty: 2, price: 35000, category: 'Alacarte (Additional)' },
      { name: 'Kuah Kaldu Ayam Gurih 1L', qty: 1, price: 20000, category: 'Alacarte (Additional)' },
    ];

    it('should return 1-way rate and requiresPickup = false for alacarte orders within 4 km', () => {
      const result = calculateShabuAjhiRate(3.5, { items: alacarteCart });
      expect(result.totalFee).toBe(12000);
      expect(result.requiresPickup).toBe(false);
      expect(result.requires_pickup).toBe(false);
      expect(result.isDeliverable).toBe(true);
      expect(result.fleetDescription).toContain('Kurir Instan 1 Arah');
    });

    it('should return 1-way rate and requiresPickup = false for extreme distance alacarte orders', () => {
      const result = calculateShabuAjhiRate(27.8, { items: alacarteCart });
      expect(result.totalFee).toBe(78500);
      expect(result.requiresPickup).toBe(false);
      expect(result.requires_pickup).toBe(false);
      expect(result.isDeliverable).toBe(true);
      expect(result.fleetDescription).toContain('Kurir Instan 1 Arah');
    });

    it('should switch to 13-tier PP rate when at least 1 equipment package is included', () => {
      const mixedCart: CateringItem[] = [
        ...alacarteCart,
        { name: 'Paket Oishi Shabu (4-6 Porsi)', qty: 1, price: 250000, category: 'Paket Alat Hemat' },
      ];
      const result = calculateShabuAjhiRate(27.8, { items: mixedCart, hasInternalDriver: true });
      expect(result.totalFee).toBe(129000); // 115.000 + 2 * 7000
      expect(result.requiresPickup).toBe(true);
      expect(result.requires_pickup).toBe(true);
      expect(result.surchargeFee).toBe(14000);
    });
  });

  describe('buildCateringWhatsAppUrl for alacarte orders', () => {
    it('should omit cookware pickup schedule and cleaning guarantee for alacarte orders', () => {
      const { message } = buildCateringWhatsAppUrl({
        storeName: 'Shabu Ajhi',
        waNumber: '6285861091103',
        deliveryDate: '2026-11-10',
        formattedDeliveryDate: 'Selasa, 10 November 2026',
        selectedTimeSlot: '12:00 - 14:00',
        locationType: 'Rumah',
        locationDetails: 'Jl. Bojongsoang No. 12',
        cartItems: [{ name: 'Beef Slice Fat 250gr', qty: 2, price: 35000 }],
        totalPrice: 70000,
        hasEquipment: false,
      });

      expect(message).not.toContain('Penjemputan Alat');
      expect(message).not.toContain('100% Alat Dipinjamkan Bebas Cuci');
      expect(message).toContain('Pengantaran Menu Makanan Langsung (Tanpa Pinjam Alat)');
    });

    it('should retain cookware pickup schedule and cleaning guarantee for catering equipment orders', () => {
      const { message } = buildCateringWhatsAppUrl({
        storeName: 'Shabu Ajhi',
        waNumber: '6285861091103',
        deliveryDate: '2026-11-10',
        formattedDeliveryDate: 'Selasa, 10 November 2026',
        selectedTimeSlot: '18:00 - 20:00',
        pickupWindow: 'NEXT_DAY_MORNING',
        locationType: 'Villa',
        locationDetails: 'Villa Istana Bunga',
        cartItems: [{ name: 'Paket Oishi Shabu', qty: 1, price: 250000 }],
        totalPrice: 250000,
        hasEquipment: true,
        destinationLatitude: -6.7967,
        destinationLongitude: 107.5817,
      });

      expect(message).toContain('Penjemputan Alat: Besok Pagi (H+1)');
      expect(message).toContain('100% Alat Dipinjamkan Bebas Cuci (Diambil Kotor)');
      expect(message).toContain('• 📍 Titik Lokasi (Google Maps): https://www.google.com/maps?q=-6.7967,107.5817');
    });
  });

  describe('Radius <= 3.0 KM & Category Stall Logistics Policy', () => {
    it('should set totalFee = 0 for Live Cooking Stall packages (All-in)', () => {
      const stallCart: CateringItem[] = [
        { name: 'Live Cooking Stall Shabu & Grill (50 Porsi)', qty: 1, price: 4500000, category: 'Live Cooking Stall' },
      ];
      const result = calculateShabuAjhiRate(15.0, { items: stallCart, hasInternalDriver: true });
      expect(result.totalFee).toBe(0);
      expect(result.isDeliverable).toBe(true);
      expect(result.requiresPickup).toBe(true);
      expect(result.fleetDescription).toContain('Live Cooking Stall');
    });

    it('should set totalFee = 0 (Free Ongkir Khusus Paket) for catering packages within <= 3.0 KM', () => {
      const packageCart: CateringItem[] = [
        { name: 'Paket Oishi Shabu (4-6 Porsi)', qty: 1, price: 250000, category: 'Paket Alat Hemat', requires_equipment: true },
      ];
      const result = calculateShabuAjhiRate(2.5, { items: packageCart, hasInternalDriver: true });
      expect(result.totalFee).toBe(0);
      expect(result.requiresPickup).toBe(true);
      expect(result.isDeliverable).toBe(true);
      expect(result.fleetDescription).toContain('Gratis Ongkir Khusus Paket <= 3 km');
    });

    it('should charge standard 1-way fee Rp 12.000 for pure alacarte within <= 3.0 KM', () => {
      const alacarteCart: CateringItem[] = [
        { name: 'Beef Slice Fat 250gr', qty: 2, price: 35000, category: 'Alacarte' },
      ];
      const result = calculateShabuAjhiRate(2.5, { items: alacarteCart });
      expect(result.totalFee).toBe(12000);
      expect(result.requiresPickup).toBe(false);
      expect(result.isDeliverable).toBe(true);
      expect(result.fleetDescription).toContain('Kurir Instan 1 Arah');
    });

    it('should charge 13-tier PP rate for catering package beyond 3.0 KM', () => {
      const packageCart: CateringItem[] = [
        { name: 'Paket Oishi Shabu (4-6 Porsi)', qty: 1, price: 250000, category: 'Paket Alat Hemat', requires_equipment: true },
      ];
      // 3.5 km is Tier 2 (3-5 km) -> Rp 30.000
      const result = calculateShabuAjhiRate(3.5, { items: packageCart, hasInternalDriver: true });
      expect(result.totalFee).toBe(30000);
      expect(result.requiresPickup).toBe(true);
    });
  });

  describe('parseCoordinatesFromInput utility', () => {
    it('should parse raw "latitude, longitude" format', () => {
      const coords = parseCoordinatesFromInput('-6.7967, 107.5817');
      expect(coords).not.toBeNull();
      expect(coords?.latitude).toBeCloseTo(-6.7967, 4);
      expect(coords?.longitude).toBeCloseTo(107.5817, 4);
    });

    it('should parse Google Maps query url (?q=lat,lng)', () => {
      const coords = parseCoordinatesFromInput('https://maps.google.com/?q=-6.7967,107.5817');
      expect(coords).not.toBeNull();
      expect(coords?.latitude).toBeCloseTo(-6.7967, 4);
      expect(coords?.longitude).toBeCloseTo(107.5817, 4);
    });

    it('should parse Google Maps place path (/@lat,lng,...)', () => {
      const coords = parseCoordinatesFromInput('https://www.google.com/maps/place/Villa+Istana+Bunga/@-6.7967,107.5817,17z/data=...');
      expect(coords).not.toBeNull();
      expect(coords?.latitude).toBeCloseTo(-6.7967, 4);
      expect(coords?.longitude).toBeCloseTo(107.5817, 4);
    });

    it('should return null for non-coordinate string without pattern', () => {
      expect(parseCoordinatesFromInput('Jl. Bojongsoang No. 12')).toBeNull();
      expect(parseCoordinatesFromInput('')).toBeNull();
    });
  });
});

