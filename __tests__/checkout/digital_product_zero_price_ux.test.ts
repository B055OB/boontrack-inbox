import { isDigitalProduct } from '@/lib/product-catalog';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { trackClientPurchase } from '@/lib/tracking';

// Mock Supabase client
const mockTenantData = {
  id: 'tenant-test-123',
  slug: 'test-store',
  name: 'Test Store',
  tier: 'PRO_SCALE',
  metadata: {
    products: [
      {
        id: 'free-webinar-01',
        slug: 'free-webinar-01',
        name: 'Webinar Strategi Scale-Up Gratis',
        price: 0,
        promo_price: 0,
        product_type: 'DIGITAL',
        metadata: { product_type: 'DIGITAL', is_digital: true },
      },
      {
        id: 'free-event-02',
        slug: 'free-event-02',
        name: 'Meetup Komunitas SoloPreneur',
        price: 0,
        promo_price: 0,
        product_type: 'DIGITAL',
        metadata: { product_type: 'DIGITAL', is_digital: true },
      },
      {
        id: 'paid-masterclass-01',
        slug: 'paid-masterclass-01',
        name: 'Masterclass Bisnis Berbayar',
        price: 150000,
        promo_price: 150000,
        product_type: 'DIGITAL',
        metadata: { product_type: 'DIGITAL', is_digital: true },
      },
      {
        id: 'paid-physical-kaos',
        slug: 'paid-physical-kaos',
        name: 'Kaos Cotton Combed',
        price: 85000,
        promo_price: 85000,
        product_type: 'PHYSICAL',
        requires_shipping: true,
        metadata: { product_type: 'PHYSICAL', is_digital: false },
      },
      {
        id: 'legacy-item-no-meta',
        slug: 'legacy-item-no-meta',
        name: 'Kopi Susu Botol 250ml',
        price: 25000,
        promo_price: 25000,
      },
      {
        id: 'invalid-price-prod',
        slug: 'invalid-price-prod',
        name: 'Produk Tanpa Harga',
        price: null,
        promo_price: null,
        product_type: 'DIGITAL',
      },
    ],
  },
};

jest.mock('@/lib/supabaseClient', () => {
  const mockOrderInsert = jest.fn().mockImplementation((payload) => {
    return Promise.resolve({
      data: Array.isArray(payload) ? payload[0] : payload,
      error: null,
    });
  });

  const mockGenericInsert = jest.fn().mockImplementation((payload) => {
    return Promise.resolve({
      data: Array.isArray(payload) ? payload[0] : payload,
      error: null,
    });
  });

  const chainableQuery: any = {
    eq: jest.fn().mockImplementation(() => chainableQuery),
    gt: jest.fn().mockImplementation(() => chainableQuery),
    gte: jest.fn().mockImplementation(() => chainableQuery),
    lt: jest.fn().mockImplementation(() => chainableQuery),
    lte: jest.fn().mockImplementation(() => chainableQuery),
    or: jest.fn().mockImplementation(() => chainableQuery),
    order: jest.fn().mockImplementation(() => chainableQuery),
    limit: jest.fn().mockImplementation(() => chainableQuery),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  const mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'tenants') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((col: string, val: string) => {
            if (val === 'test-store' || val === 'tenant-test-123') {
              return {
                single: jest.fn().mockResolvedValue({ data: mockTenantData, error: null }),
                maybeSingle: jest.fn().mockResolvedValue({ data: mockTenantData, error: null }),
              };
            }
            return {
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
          or: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockTenantData, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenantData, error: null }),
          }),
        }),
      };
    }

    if (table === 'orders') {
      return {
        insert: mockOrderInsert,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    }

    // Default table fallback (products, order_items, etc.)
    return {
      select: jest.fn().mockReturnValue(chainableQuery),
      insert: mockGenericInsert,
    };
  });

  const mockClient = {
    from: mockFrom,
  };

  return {
    getSupabase: jest.fn().mockReturnValue(mockClient),
    getSupabaseAdmin: jest.fn().mockReturnValue(mockClient),
  };
});

describe('Digital Product & Zero-Price UX Suite (CTO Safety Review)', () => {
  describe('1. isDigitalProduct helper & backward compatibility', () => {
    it('returns true when metadata.product_type is DIGITAL', () => {
      const product = {
        name: 'Workshop AI Masterclass',
        metadata: { product_type: 'DIGITAL' },
      };
      expect(isDigitalProduct(product)).toBe(true);
    });

    it('returns true when metadata.is_digital is true', () => {
      const product = {
        name: 'E-Book Digital Closing',
        metadata: { is_digital: true },
      };
      expect(isDigitalProduct(product)).toBe(true);
    });

    it('returns true when product_type is DIGITAL or DIGITAL_FILE', () => {
      expect(isDigitalProduct({ product_type: 'DIGITAL' })).toBe(true);
      expect(isDigitalProduct({ product_type: 'DIGITAL_FILE' })).toBe(true);
      expect(isDigitalProduct({ type: 'DIGITAL' })).toBe(true);
    });

    it('defaults to false for legacy products without metadata (backward compatibility)', () => {
      const legacyProduct = {
        id: 'legacy-prod-1',
        name: 'Kopi Susu Gula Aren 250ml',
        price: 25000,
        stock: 50,
      };
      expect(isDigitalProduct(legacyProduct)).toBe(false);
    });

    it('returns false for explicitly physical products', () => {
      const physicalProduct = {
        name: 'Kaos Polos Cotton Combed',
        product_type: 'PHYSICAL',
        metadata: { product_type: 'PHYSICAL', is_digital: false },
      };
      expect(isDigitalProduct(physicalProduct)).toBe(false);
    });

    it('returns false when null or undefined is passed', () => {
      expect(isDigitalProduct(null)).toBe(false);
      expect(isDigitalProduct(undefined)).toBe(false);
    });
  });

  describe('2. P0-A: Authoritative Zero-Price Eligibility & Anti-Tampering', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }) as any;
    });

    it('allows legitimate configured Rp0 digital product', async () => {
      const payload = {
        tenantSlug: 'test-store',
        productId: 'free-webinar-01',
        productTitle: 'Webinar Strategi Scale-Up Gratis',
        amount: 0,
        basePrice: 0,
        unitPrice: 0,
        quantity: 1,
        netProductPrice: 0,
        customerName: 'Budi Pembelajar',
        customerPhone: '081299998888',
        customerEmail: 'budi@example.com',
        paymentMethod: 'free' as const,
        fulfillmentMetadata: {
          product_type: 'DIGITAL',
          access_url: 'https://zoom.us/j/123456789',
        },
      };

      const result = await createOrderAndInvoice(payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.isFree).toBe(true);
      expect(result.status).toBe('PAID');
      expect(result.orderId).toBeDefined();
      expect(result.invoiceUrl).toContain(`free=true`);

      // Verify no external payment gateway fetch was called
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('xendit'),
        expect.anything()
      );
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/payments/qris/create'),
        expect.anything()
      );
    });

    it('locks order status = PAID, payment_status = PAID, and order_status = COMPLETED in DB insert for legitimate Rp0 order', async () => {
      const { getSupabase } = require('@/lib/supabaseClient');
      const supabase = getSupabase();

      const payload = {
        tenantSlug: 'test-store',
        productId: 'free-event-02',
        productTitle: 'Meetup Komunitas SoloPreneur',
        amount: 0,
        basePrice: 0,
        unitPrice: 0,
        quantity: 1,
        netProductPrice: 0,
        customerName: 'Siti Rahma',
        customerPhone: '081233334444',
      };

      await createOrderAndInvoice(payload);

      expect(supabase.from).toHaveBeenCalledWith('orders');
      const ordersMock = supabase.from('orders');
      expect(ordersMock.insert).toHaveBeenCalled();

      const insertedRecord = ordersMock.insert.mock.calls[0][0];
      expect(insertedRecord.status).toBe('PAID');
      expect(insertedRecord.payment_status).toBe('PAID');
      expect(insertedRecord.metadata.payment_method).toBe('free');
      expect(insertedRecord.metadata.is_free).toBe(true);
      expect(insertedRecord.gross_amount).toBe(0);
      expect(insertedRecord.metadata.unique_code).toBe(0);
      expect(insertedRecord.metadata.admin_fee).toBe(0);
    });

    it('REJECTS paid product submitted with tampered Rp0 amount', async () => {
      const tamperedPayload = {
        tenantSlug: 'test-store',
        productId: 'paid-masterclass-01', // DB price is Rp 150,000
        productTitle: 'Masterclass Bisnis Berbayar',
        amount: 0, // Attacker manipulated amount to 0
        basePrice: 0,
        unitPrice: 0,
        quantity: 1,
        netProductPrice: 0,
        paymentMethod: 'free' as const,
        customerName: 'Attacker Tamper',
        customerPhone: '081211112222',
        customerEmail: 'attacker@example.com',
      };

      await expect(createOrderAndInvoice(tamperedPayload)).rejects.toThrow(
        /Ketidaksesuaian harga|tidak memenuhi syarat untuk pendaftaran gratis/i
      );
    });

    it('REJECTS free registration claim for non-existent or cross-tenant product', async () => {
      const crossTenantPayload = {
        tenantSlug: 'test-store',
        productId: 'foreign-store-product-999', // Not in test-store catalog
        productTitle: 'Produk Milik Toko Lain',
        amount: 0,
        paymentMethod: 'free' as const,
        customerName: 'Cross Tenant Tester',
        customerPhone: '081233334444',
      };

      await expect(createOrderAndInvoice(crossTenantPayload)).rejects.toThrow(
        /Produk tidak ditemukan dalam katalog resmi tenant/i
      );
    });

    it('REJECTS physical product with positive price when submitted as Rp0', async () => {
      const physicalPayload = {
        tenantSlug: 'test-store',
        productId: 'paid-physical-kaos', // DB price is Rp 85,000
        productTitle: 'Kaos Cotton Combed',
        amount: 0,
        paymentMethod: 'free' as const,
        customerName: 'Pembeli Kaos',
        customerPhone: '081244445555',
      };

      await expect(createOrderAndInvoice(physicalPayload)).rejects.toThrow(
        /Ketidaksesuaian harga|tidak memenuhi syarat untuk pendaftaran gratis/i
      );
    });

    it('locks order quantity to 1 for digital products even if client submitted quantity > 1', async () => {
      const { getSupabase } = require('@/lib/supabaseClient');
      const supabase = getSupabase();

      const payload = {
        tenantSlug: 'test-store',
        productId: 'free-webinar-01',
        productTitle: 'Webinar Strategi Scale-Up Gratis',
        amount: 0,
        quantity: 5, // Client attempts to order quantity 5
        customerName: 'Budi Multi',
        customerPhone: '081299998888',
      };

      await createOrderAndInvoice(payload);

      const ordersMock = supabase.from('orders');
      const insertedRecord = ordersMock.insert.mock.calls[ordersMock.insert.mock.calls.length - 1][0];
      // Server forces quantity = 1 for digital products
      expect(insertedRecord.quantity).toBe(1);
    });

    it('enforces authoritative price when database price and client payload price disagree', async () => {
      const { getSupabase } = require('@/lib/supabaseClient');
      const supabase = getSupabase();

      const disagreementPayload = {
        tenantSlug: 'test-store',
        productId: 'paid-masterclass-01', // DB price is Rp 150,000
        productTitle: 'Masterclass Bisnis Berbayar',
        unitPrice: 50000, // Client claims Rp 50,000
        basePrice: 50000,
        amount: 50000,
        customerName: 'Client Discount Claimer',
        customerPhone: '081266667777',
      };

      await createOrderAndInvoice(disagreementPayload);

      const ordersMock = supabase.from('orders');
      const insertedRecord = ordersMock.insert.mock.calls[ordersMock.insert.mock.calls.length - 1][0];
      // Authoritative DB price (150,000) overrides client claim (50,000)
      expect(insertedRecord.gross_amount).toBe(150000);
      expect(insertedRecord.status).toBe('PENDING');
      expect(insertedRecord.payment_status).toBe('PENDING');
    });

    it('REJECTS free claim when product has missing or invalid price metadata', async () => {
      const invalidPricePayload = {
        tenantSlug: 'test-store',
        productId: 'invalid-price-prod', // price is null
        productTitle: 'Produk Tanpa Harga',
        amount: 0,
        paymentMethod: 'free' as const,
        customerName: 'Tester Invalid Price',
        customerPhone: '081288889999',
      };

      await expect(createOrderAndInvoice(invalidPricePayload)).rejects.toThrow(
        /Ketidaksesuaian harga|tidak memenuhi syarat untuk pendaftaran gratis/i
      );
    });
  });

  describe('3. P0-B: Tracking Safety & Suppression of False Purchase Signals', () => {
    let mockFbq: jest.Mock;
    let mockTtq: jest.Mock;

    beforeEach(() => {
      mockFbq = jest.fn();
      mockTtq = jest.fn();
      (global as any).window = {
        fbq: mockFbq,
        ttq: { track: mockTtq },
        sessionStorage: {
          getItem: jest.fn().mockReturnValue(null),
          setItem: jest.fn(),
        },
        localStorage: {
          getItem: jest.fn().mockReturnValue(null),
          setItem: jest.fn(),
        },
      };
    });

    afterEach(() => {
      delete (global as any).window;
    });

    it('DOES NOT emit Purchase or CompletePayment event when amount <= 0', () => {
      trackClientPurchase('ORD-FREE-123', 0, 'Webinar Scale-Up Gratis');

      // Verify Purchase was NOT called on fbq
      expect(mockFbq).not.toHaveBeenCalledWith(
        'track',
        'Purchase',
        expect.anything(),
        expect.anything()
      );

      // Verify CompletePayment was NOT called on ttq
      expect(mockTtq).not.toHaveBeenCalledWith(
        'CompletePayment',
        expect.anything(),
        expect.anything()
      );

      // Verify CompleteRegistration was called instead
      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'CompleteRegistration',
        expect.objectContaining({
          content_name: 'Webinar Scale-Up Gratis',
          status: true,
        }),
        expect.objectContaining({ eventID: 'REG_ORD-FREE-123' })
      );
      expect(mockTtq).toHaveBeenCalledWith(
        'CompleteRegistration',
        expect.objectContaining({
          content_name: 'Webinar Scale-Up Gratis',
        }),
        expect.objectContaining({ event_id: 'REG_ORD-FREE-123' })
      );
    });

    it('emits Purchase and CompletePayment events normally for paid orders (amount > 0)', () => {
      trackClientPurchase('ORD-PAID-999', 150000, 'Masterclass Bisnis Berbayar');

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'Purchase',
        expect.objectContaining({
          content_name: 'Masterclass Bisnis Berbayar',
          value: 150000,
        }),
        expect.objectContaining({ eventID: 'PURCHASE_ORD-PAID-999' })
      );
      expect(mockTtq).toHaveBeenCalledWith(
        'CompletePayment',
        expect.objectContaining({
          content_name: 'Masterclass Bisnis Berbayar',
          value: 150000,
        }),
        expect.objectContaining({ event_id: 'PURCHASE_ORD-PAID-999' })
      );
    });
  });

  describe('4. P0-D: Tenant and Product Regression', () => {
    it('creates PENDING paid order for legitimate paid digital product', async () => {
      const { getSupabase } = require('@/lib/supabaseClient');
      const supabase = getSupabase();

      const paidDigitalPayload = {
        tenantSlug: 'test-store',
        productId: 'paid-masterclass-01',
        productTitle: 'Masterclass Bisnis Berbayar',
        amount: 150000,
        quantity: 1,
        customerName: 'Pembeli Masterclass',
        customerPhone: '081299990000',
        paymentMethod: 'qris' as const,
      };

      const result = await createOrderAndInvoice(paidDigitalPayload);

      expect(result.success).toBe(true);
      expect(result.status).toBe('PENDING');
      expect(result.isFree).toBeFalsy();

      const ordersMock = supabase.from('orders');
      const insertedRecord = ordersMock.insert.mock.calls[ordersMock.insert.mock.calls.length - 1][0];
      expect(insertedRecord.status).toBe('PENDING');
      expect(insertedRecord.payment_status).toBe('PENDING');
      expect(insertedRecord.gross_amount).toBe(150000);
      expect(insertedRecord.quantity).toBe(1);
    });

    it('creates normal order for legacy product without digital metadata (quantity > 1 preserved)', async () => {
      const { getSupabase } = require('@/lib/supabaseClient');
      const supabase = getSupabase();

      const legacyPayload = {
        tenantSlug: 'test-store',
        productId: 'legacy-item-no-meta',
        productTitle: 'Kopi Susu Botol 250ml',
        amount: 75000,
        quantity: 3, // Legacy non-digital product allows multiple quantity
        customerName: 'Peminum Kopi',
        customerPhone: '081277778888',
        paymentMethod: 'qris' as const,
      };

      const result = await createOrderAndInvoice(legacyPayload);

      expect(result.success).toBe(true);
      expect(result.status).toBe('PENDING');

      const ordersMock = supabase.from('orders');
      const insertedRecord = ordersMock.insert.mock.calls[ordersMock.insert.mock.calls.length - 1][0];
      expect(insertedRecord.gross_amount).toBe(75000);
      expect(insertedRecord.quantity).toBe(3);
    });
  });
});
