import {
  calculateHaversineDistanceKm,
  computeInstantCourierRates,
  extractOutletCoordinates,
  isInstantCourierTenantCategory,
  formatInstantCourierRecommendationReply,
} from '@/lib/shipping/instant-shipping-service';
import { parseMetaWebhookPayload } from '@/lib/whatsapp/meta-webhook-normalizer';

describe('WhatsApp Native LocationMessage Parser & Instant Courier Engine', () => {
  describe('Geospatial Haversine Distance Calculation', () => {
    it('should calculate distance accurately between two GPS points', () => {
      // Dapur Bandung (-6.9175, 107.6191) to Dago Atas (-6.8722, 107.6231) ~ 5.0 km
      const distance = calculateHaversineDistanceKm(-6.9175, 107.6191, -6.8722, 107.6231);
      expect(distance).toBeGreaterThan(4.5);
      expect(distance).toBeLessThan(5.5);
    });

    it('should return 0 when coordinates are identical or invalid', () => {
      expect(calculateHaversineDistanceKm(-6.9175, 107.6191, -6.9175, 107.6191)).toBe(0);
      expect(calculateHaversineDistanceKm(NaN, 107.6191, -6.9175, 107.6191)).toBe(0);
    });
  });

  describe('Instant Courier Rates Calculation (GoSend & GrabExpress)', () => {
    it('should provide GoSend & GrabExpress rates when within 30 km radius', () => {
      const result = computeInstantCourierRates(5.5);
      expect(result.isEligible).toBe(true);
      expect(result.rates.length).toBeGreaterThanOrEqual(2);

      const gosend = result.rates.find((r) => r.id === 'gosend_instant');
      const grab = result.rates.find((r) => r.id === 'grab_instant');

      expect(gosend).toBeDefined();
      expect(gosend?.price).toBeGreaterThanOrEqual(20000);
      expect(grab).toBeDefined();
      expect(grab?.price).toBeGreaterThanOrEqual(18000);
    });

    it('should include SameDay service when distance is <= 15 km', () => {
      const result = computeInstantCourierRates(8.0);
      expect(result.isEligible).toBe(true);
      const sameDay = result.rates.find((r) => r.id === 'gosend_sameday');
      expect(sameDay).toBeDefined();
    });

    it('should report ineligible when distance exceeds 30 km max radius', () => {
      const result = computeInstantCourierRates(35.2);
      expect(result.isEligible).toBe(false);
      expect(result.rates).toHaveLength(0);
    });
  });

  describe('Merchant Outlet Coordinates Resolution', () => {
    it('should extract from tenants.metadata.outlet_coordinates', () => {
      const meta = {
        outlet_coordinates: {
          latitude: -6.9175,
          longitude: 107.6191,
          name: 'Dapur Pusat Riau',
          address: 'Jl. LLRE Martadinata 56',
        },
      };
      const outlet = extractOutletCoordinates(meta, 'Toko Enak');
      expect(outlet).not.toBeNull();
      expect(outlet?.latitude).toBe(-6.9175);
      expect(outlet?.longitude).toBe(107.6191);
      expect(outlet?.name).toBe('Dapur Pusat Riau');
    });

    it('should extract from shipping_config.fnb_settings', () => {
      const meta = {
        shipping_config: {
          fnb_settings: {
            latitude: -7.1171,
            longitude: 112.5938,
            kitchen_address: 'Jl. Manyar Gresik',
          },
        },
      };
      const outlet = extractOutletCoordinates(meta, 'Tanev Food');
      expect(outlet).not.toBeNull();
      expect(outlet?.latitude).toBe(-7.1171);
      expect(outlet?.longitude).toBe(112.5938);
    });

    it('should extract from shipping_config.origin', () => {
      const meta = {
        shipping_config: {
          origin: {
            latitude: -6.2,
            longitude: 106.8,
            sender_name: 'Gudang Jakarta',
          },
        },
      };
      const outlet = extractOutletCoordinates(meta);
      expect(outlet).not.toBeNull();
      expect(outlet?.latitude).toBe(-6.2);
      expect(outlet?.longitude).toBe(106.8);
      expect(outlet?.name).toBe('Gudang Jakarta');
    });
  });

  describe('Tenant Category Eligibility', () => {
    it('should identify FOOD, CULINARY, and PHYSICAL categories as eligible', () => {
      expect(isInstantCourierTenantCategory({ category: 'FOOD' })).toBe(true);
      expect(isInstantCourierTenantCategory({ business_category: 'FNB' })).toBe(true);
      expect(isInstantCourierTenantCategory({ vertical_type: 'PHYSICAL' })).toBe(true);
      expect(isInstantCourierTenantCategory({ business_category: 'PHYSICAL' })).toBe(true);
      expect(isInstantCourierTenantCategory({ outlet_coordinates: { latitude: -6.9, longitude: 107.6 } })).toBe(true);
    });

    it('should identify non-shipping categories without outlet coordinates as ineligible', () => {
      expect(isInstantCourierTenantCategory({ category: 'DIGITAL', vertical_type: 'DIGITAL' })).toBe(false);
      expect(isInstantCourierTenantCategory({ category: 'COMMUNITY_DAKWAH' })).toBe(false);
    });
  });

  describe('Meta WABA Webhook Location Message Parser', () => {
    it('should parse native location message payload from Meta Cloud API', () => {
      const metaPayload = {
        entry: [
          {
            id: '1098239012',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '6281215567168',
                    phone_number_id: '1002938102',
                  },
                  contacts: [
                    {
                      profile: { name: 'Budi Santoso' },
                      wa_id: '6281234567890',
                    },
                  ],
                  messages: [
                    {
                      from: '6281234567890',
                      id: 'wamid.HBgLMjA2Mjg...',
                      timestamp: '1727784000',
                      type: 'location',
                      location: {
                        latitude: -6.9175,
                        longitude: 107.6191,
                        name: 'Rumah Makan Padang',
                        address: 'Jl. Riau No. 12, Bandung',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const normalized = parseMetaWebhookPayload(metaPayload);
      expect(normalized.messages).toHaveLength(1);

      const msg = normalized.messages[0];
      expect(msg.type).toBe('location');
      expect(msg.location).toBeDefined();
      expect(msg.location?.latitude).toBe(-6.9175);
      expect(msg.location?.longitude).toBe(107.6191);
      expect(msg.location?.name).toBe('Rumah Makan Padang');
      expect(msg.text).toContain('Rumah Makan Padang');
    });
  });

  describe('Recommendation WhatsApp Reply Formatting', () => {
    it('should format clean WhatsApp reply with distance and instant courier breakdown', () => {
      const rates = [
        {
          id: 'gosend_instant',
          courier_name: 'GoSend Instant',
          service: 'Instant',
          price: 22500,
          etd: '1 - 2 Jam Tiba',
          distance_km: 5.0,
        },
        {
          id: 'grab_instant',
          courier_name: 'GrabExpress Instant',
          service: 'Instant',
          price: 20500,
          etd: '1 - 2 Jam Tiba',
          distance_km: 5.0,
        },
      ];

      const reply = formatInstantCourierRecommendationReply({
        storeName: 'Tanev Food',
        outletName: 'Dapur Pusat Gresik',
        customerAddress: 'Perumahan GKB Blok A-12',
        customerName: 'Kak Agus',
        distanceKm: 5.0,
        rates,
        isEligible: true,
        maxRadiusKm: 30,
      });

      expect(reply).toContain('REKOMENDASI ONGKIR KURIR INSTAN');
      expect(reply).toContain('Kak Agus');
      expect(reply).toContain('5 km');
      expect(reply).toContain('GoSend Instant');
      expect(reply).toContain('22.500');
      expect(reply).toContain('GrabExpress Instant');
      expect(reply).toContain('20.500');
    });

    it('should format friendly out-of-radius message when exceeding 30 km', () => {
      const reply = formatInstantCourierRecommendationReply({
        storeName: 'Tanev Food',
        outletName: 'Dapur Pusat Gresik',
        customerAddress: 'Malang Kota',
        customerName: 'Siti',
        distanceKm: 75.0,
        rates: [],
        isEligible: false,
        maxRadiusKm: 30,
      });

      expect(reply).toContain('di luar batas radius kurir motor instan (maksimal 30 km)');
      expect(reply).toContain('Kurir Reguler (JNE / SiCepat / J&T)');
    });
  });
});
