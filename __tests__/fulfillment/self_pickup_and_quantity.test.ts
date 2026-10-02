/**
 * @file __tests__/fulfillment/self_pickup_and_quantity.test.ts
 * @description Unit tests for Universal Self-Pickup Fulfillment and Quantity Stepper Calculation
 */

import { formatOrderFulfillmentMessage } from '@/lib/whatsapp';
import { getStoreShippingConfig, saveStoreShippingConfig } from '@/lib/shipping/self-pickup';
import { sanitizeOrderPayload, VALID_ORDER_COLUMNS } from '@/lib/order-sanitizer';

describe('Universal Self-Pickup & Quantity Fulfillment Suite', () => {
  describe('Order Sanitizer & Schema Whitelist', () => {
    it('should include quantity, unit_price, and fulfillment_type in whitelist', () => {
      expect(VALID_ORDER_COLUMNS.has('quantity')).toBe(true);
      expect(VALID_ORDER_COLUMNS.has('unit_price')).toBe(true);
      expect(VALID_ORDER_COLUMNS.has('fulfillment_type')).toBe(true);
    });

    it('should sanitize order payload correctly without dropping quantity, unit_price, or fulfillment_type', () => {
      const rawPayload = {
        tenant_slug: 'donat-madu',
        customer_name: 'Budi Santoso',
        quantity: 5,
        unit_price: 35000,
        fulfillment_type: 'PICKUP',
        gross_amount: 175000,
        unauthorized_injected_column: 'DROP TABLE',
      };

      const sanitized = sanitizeOrderPayload(rawPayload);
      expect(sanitized.quantity).toBe(5);
      expect(sanitized.unit_price).toBe(35000);
      expect(sanitized.fulfillment_type).toBe('PICKUP');
      expect(sanitized.gross_amount).toBe(175000);
      expect((sanitized as any).unauthorized_injected_column).toBeUndefined();
    });
  });

  describe('WhatsApp Notification Formatting for Fulfillment', () => {
    it('should format Self-Pickup message with store location, maps URL, and operational hours', () => {
      const result = formatOrderFulfillmentMessage({
        phone: '081234567890',
        customerName: 'Ahmad Fauzi',
        orderId: 'ORD-PICKUP-1234',
        itemsSummary: 'Donat Coklat Keju (Box of 6)',
        totalAmount: 70000,
        productType: 'FOOD',
        fulfillmentType: 'PICKUP',
        pickupInfo: {
          storeName: 'Donat Madu Cihanjuang',
          address: 'Jl. Cihanjuang No. 45, Cimahi',
          mapsUrl: 'https://maps.app.goo.gl/example',
          instructions: 'Buka setiap hari 08.00 - 21.00 WIB. Tunjukkan pesan ini ke kasir.',
        },
      });

      expect(result.normalizedTo).toBe('6281234567890');
      expect(result.messageText).toContain('Ambil Sendiri di Toko');
      expect(result.messageText).toContain('Jl. Cihanjuang No. 45, Cimahi');
      expect(result.messageText).toContain('https://maps.app.goo.gl/example');
      expect(result.messageText).toContain('Buka setiap hari 08.00 - 21.00 WIB');
      expect(result.messageText).toContain('Sedang disiapkan oleh tim Donat Madu Cihanjuang');
      expect(result.messageText).not.toContain('No. Resi');
    });

    it('should format Physical delivery message with shipping and courier context', () => {
      const result = formatOrderFulfillmentMessage({
        phone: '081234567890',
        customerName: 'Siti Aminah',
        orderId: 'ORD-DELIVERY-5678',
        itemsSummary: 'Gamis Modern Silk',
        totalAmount: 250000,
        productType: 'PHYSICAL',
        fulfillmentType: 'DELIVERY',
      });

      expect(result.normalizedTo).toBe('6281234567890');
      expect(result.messageText).toContain('📦');
      expect(result.messageText).toContain('Sedang disiapkan & dikemas');
      expect(result.messageText).toContain('kurir ekspedisi');
      expect(result.messageText).not.toContain('Ambil Sendiri di Toko');
    });
  });

  describe('Universal Store Shipping Config Resolution', () => {
    it('should load config directly from store_shipping_configs table when present', async () => {
      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'store_shipping_configs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  tenant_slug: 'toko-roti',
                  is_self_pickup_enabled: true,
                  pickup_address: 'Jl. Roti Enak No. 10',
                  pickup_maps_url: 'https://maps.google.com/?q=roti',
                  pickup_instructions: 'Ambil di counter kasir',
                },
                error: null,
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      const config = await getStoreShippingConfig('toko-roti', mockSupabase);
      expect(config.is_self_pickup_enabled).toBe(true);
      expect(config.pickup_address).toBe('Jl. Roti Enak No. 10');
      expect(config.pickup_maps_url).toBe('https://maps.google.com/?q=roti');
      expect(config.pickup_instructions).toBe('Ambil di counter kasir');
    });

    it('should fallback to tenant_settings.biteship_config when store_shipping_configs is empty', async () => {
      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'store_shipping_configs') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === 'tenant_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  biteship_config: {
                    is_self_pickup_enabled: true,
                    pickup_address: 'Gudang Cabang Barat',
                    pickup_maps_url: 'https://maps.google.com/?q=cabang-barat',
                    pickup_instructions: 'Buka jam 10.00-17.00',
                  },
                },
                error: null,
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      const config = await getStoreShippingConfig('cabang-barat', mockSupabase);
      expect(config.is_self_pickup_enabled).toBe(true);
      expect(config.pickup_address).toBe('Gudang Cabang Barat');
      expect(config.pickup_maps_url).toBe('https://maps.google.com/?q=cabang-barat');
      expect(config.pickup_instructions).toBe('Buka jam 10.00-17.00');
    });

    it('should fallback to tenants.metadata.shipping_config when earlier sources are empty', async () => {
      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'store_shipping_configs' || table === 'tenant_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'tenant-uuid-1',
                  metadata: {
                    shipping_config: {
                      self_pickup: {
                        is_enabled: true,
                        address: 'Jl. Sentral Toko No. 99',
                        maps_url: 'https://maps.google.com/?q=sentral',
                        instructions: 'Lantai 2 Counter CS',
                      },
                    },
                  },
                },
                error: null,
              }),
            };
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      const config = await getStoreShippingConfig('toko-sentral', mockSupabase);
      expect(config.is_self_pickup_enabled).toBe(true);
      expect(config.pickup_address).toBe('Jl. Sentral Toko No. 99');
      expect(config.pickup_maps_url).toBe('https://maps.google.com/?q=sentral');
      expect(config.pickup_instructions).toBe('Lantai 2 Counter CS');
    });

    it('should return default config if tenant is not found anywhere without hardcoded mockups', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const config = await getStoreShippingConfig('random-unknown-tenant', mockSupabase);
      expect(config.is_self_pickup_enabled).toBe(false);
      expect(config.pickup_address).toBeNull();
      expect(config.pickup_maps_url).toBeNull();
    });
  });
});
