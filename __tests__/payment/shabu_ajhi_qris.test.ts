/**
 * @jest-environment node
 *
 * Unit & Integration Tests — Shabu Ajhi Dynamic QRIS Verification
 *
 * Verifies that:
 * 1. Base static EMVCo string of Shabu Ajhi is properly transformed into dynamic QRIS with Tag 54 nominal injection.
 * 2. Recalculated CRC16 checksum conforms to ASPI / Bank Indonesia / EMVCo TLV specifications.
 * 3. The generated QR string strictly preserves merchant name "Shabu Ajhi", city "BANDUNG", NMID "ID1025461980514", and BCA acquirer.
 * 4. createOrderAndInvoice prioritizes tenant qris_payload and returns dynamic QR string without static image fallback.
 * 5. Frontend candidateQris resolution contract correctly uses dynamic QRIS over static poster image.
 */

import { generateDynamicQRIS, crc16ccitt, validateEmvcoTlv } from '@/lib/qris-dynamic';

const SHABU_AJHI_STATIC_QRIS =
  '00020101021126650013ID.CO.BCA.WWW011893600014000427700202150008850042770020303UKE51440014ID.CO.QRIS.WWW0215ID10254619805140303UKE5204581453033605802ID5910Shabu Ajhi6007BANDUNG61054028862070703A016304BCA7';

// ---------------------------------------------------------------------------
// Mocks for Checkout & Supabase
// ---------------------------------------------------------------------------

const mockOrdersDb: Record<string, any> = {};

const mockTenantShabu = {
  id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
  slug: 'shabu-ajhi',
  name: 'Shabu Ajhi',
  category: 'FOOD',
  metadata: {
    qris_payload: SHABU_AJHI_STATIC_QRIS,
    qris_static_string: SHABU_AJHI_STATIC_QRIS,
    qris_raw: SHABU_AJHI_STATIC_QRIS,
    static_qris_payload: SHABU_AJHI_STATIC_QRIS,
    qris_image_url: 'https://assets.boontrack.com/qris/1791968187158_WhatsApp_Image_2026-10-14_at_3.39.36_PM.webp',
    payment_settings: {
      provider: 'SELLER_NATIVE_QRIS',
      mode: 'SELLER_NATIVE_QRIS',
      qris_raw: SHABU_AJHI_STATIC_QRIS,
      raw_qris_string: SHABU_AJHI_STATIC_QRIS,
      is_qris_active: true,
      qris: 'https://assets.boontrack.com/qris/1791968187158_WhatsApp_Image_2026-10-14_at_3.39.36_PM.webp',
    },
    payment_config: {
      provider: 'SELLER_NATIVE_QRIS',
      mode: 'SELLER_NATIVE_QRIS',
      enable_qris: true,
      qris_payload: SHABU_AJHI_STATIC_QRIS,
      raw_qris_string: SHABU_AJHI_STATIC_QRIS,
      static_qris_payload: SHABU_AJHI_STATIC_QRIS,
    },
    products: [
      {
        id: 'paket-oishi',
        name: 'Paket Oishi (Shabu & BBQ)',
        slug: 'paket-oishi',
        price: 310000,
        product_type: 'FOOD',
      },
    ],
  },
};

const mockSupabaseAdmin = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'orders') {
      const builder: any = {
        _filters: [] as ((order: any) => boolean)[],
        select: jest.fn(() => builder),
        eq(col: string, val: any) {
          builder._filters.push((o: any) => o[col] === val || (col === 'id' && (o.id === val || o.order_id === val)));
          return builder;
        },
        async maybeSingle() {
          const list = Object.values(mockOrdersDb);
          const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
          return { data: matched || null, error: null };
        },
        async single() {
          const list = Object.values(mockOrdersDb);
          const matched = list.find((o) => builder._filters.every((f: any) => f(o)));
          return { data: matched || null, error: null };
        },
      };

      return {
        select: jest.fn(() => builder),
        insert: jest.fn(async (payload: any) => {
          const item = Array.isArray(payload) ? payload[0] : payload;
          mockOrdersDb[item.id] = { ...item };
          return { data: item, error: null };
        }),
        update: jest.fn((updateData: any) => ({
          eq: jest.fn((col: string, val: any) => {
            if (mockOrdersDb[val]) {
              mockOrdersDb[val] = { ...mockOrdersDb[val], ...updateData };
            }
            return {
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: mockOrdersDb[val],
                  error: null,
                })),
              })),
              data: mockOrdersDb[val],
              error: null,
            };
          }),
        })),
      };
    }

    if (tableName === 'order_items') {
      return {
        insert: jest.fn(async () => ({ data: [], error: null })),
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }

    if (tableName === 'tenants') {
      const builder: any = {
        _col: '',
        _val: null as any,
        select: jest.fn(() => builder),
        eq(col: string, val: any) {
          builder._col = col;
          builder._val = val;
          return builder;
        },
        async maybeSingle() {
          if (builder._val === 'shabu-ajhi' || builder._val === mockTenantShabu.id) {
            return { data: mockTenantShabu, error: null };
          }
          return { data: null, error: null };
        },
        async single() {
          if (builder._val === 'shabu-ajhi' || builder._val === mockTenantShabu.id) {
            return { data: mockTenantShabu, error: null };
          }
          return { data: null, error: new Error('Tenant not found') };
        },
      };
      return builder;
    }

    if (tableName === 'products') {
      const builder: any = {
        _val: null as any,
        select: jest.fn(() => builder),
        eq(col: string, val: any) {
          builder._val = val;
          return builder;
        },
        or: jest.fn(() => builder),
        async maybeSingle() {
          return {
            data: {
              id: 'paket-oishi',
              tenant_id: mockTenantShabu.id,
              title: 'Paket Oishi (Shabu & BBQ)',
              price: 310000,
              product_type: 'FOOD',
            },
            error: null,
          };
        },
      };
      return builder;
    }

    // Default table mock
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          single: jest.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: jest.fn(async () => ({ data: null, error: null })),
      update: jest.fn(async () => ({ eq: jest.fn(async () => ({ data: null, error: null })) })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseAdmin),
  getSupabase: jest.fn(() => mockSupabaseAdmin),
  isValidUuid: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: mockSupabaseAdmin,
  getSupabaseAdmin: () => mockSupabaseAdmin,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseAdmin),
}));

jest.mock('@/lib/entitlements/trial-guard', () => ({
  checkTrialQuota: jest.fn(async () => ({ allowed: true, limit: 100, currentUsage: 5 })),
}));

jest.mock('@/lib/attribution/reseller-attribution-service', () => ({
  resolveOrderAttribution: jest.fn(async () => ({
    resellerUserId: null,
    resellerCodeSnapshot: null,
    resellerCommissionAmount: 0,
    attributionType: 'NONE',
  })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Shabu Ajhi Dynamic QRIS Generation Suite', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockOrdersDb)) {
      delete mockOrdersDb[key];
    }
    jest.clearAllMocks();
  });

  describe('1. Static EMVCo Payload & Dynamic Generator', () => {
    test('validates that static QRIS has valid EMVCo structure', () => {
      const result = validateEmvcoTlv(SHABU_AJHI_STATIC_QRIS);
      expect(result.valid).toBe(true);
      expect(SHABU_AJHI_STATIC_QRIS.startsWith('000201010211')).toBe(true);
      expect(SHABU_AJHI_STATIC_QRIS).toContain('Shabu Ajhi');
      expect(SHABU_AJHI_STATIC_QRIS).toContain('BANDUNG');
      expect(SHABU_AJHI_STATIC_QRIS).toContain('ID1025461980514');
    });

    test('generates dynamic QRIS with Tag 54 for exact order amount (Rp 342.000)', () => {
      const orderAmount = 342000; // e.g. Paket Oishi (310k) + Delivery 15km (32k)
      const dynamicQris = generateDynamicQRIS(SHABU_AJHI_STATIC_QRIS, orderAmount);

      expect(dynamicQris).toBeTruthy();
      expect(dynamicQris.startsWith('000201010212')).toBe(true);
      expect(dynamicQris).toContain('5406342000');
      expect(dynamicQris).toContain('Shabu Ajhi');
      expect(dynamicQris).toContain('BANDUNG');
      expect(dynamicQris).toContain('40288');

      // Verify CRC recalculation
      const payloadWithoutCrc = dynamicQris.substring(0, dynamicQris.length - 4);
      const embeddedCrc = dynamicQris.substring(dynamicQris.length - 4);
      const computedCrc = crc16ccitt(payloadWithoutCrc);

      expect(embeddedCrc).toBe(computedCrc);
      expect(embeddedCrc).toMatch(/^[0-9A-F]{4}$/);

      // Verify EMVCo TLV integrity
      const tlvValidation = validateEmvcoTlv(dynamicQris);
      expect(tlvValidation.valid).toBe(true);
    });

    test('replaces any existing Tag 54 idempotently if amount changes', () => {
      const dynamicQris1 = generateDynamicQRIS(SHABU_AJHI_STATIC_QRIS, 185000);
      expect(dynamicQris1).toContain('5406185000');

      // Re-run on the already dynamic string with updated amount
      const dynamicQris2 = generateDynamicQRIS(dynamicQris1, 250000);
      expect(dynamicQris2).toContain('5406250000');
      expect(dynamicQris2).not.toContain('5406185000');
      expect(validateEmvcoTlv(dynamicQris2).valid).toBe(true);
    });
  });

  describe('2. Checkout Service (createOrderAndInvoice) Integration', () => {
    let createOrderAndInvoice: any;

    beforeAll(async () => {
      const module = await import('@/lib/checkout-service');
      createOrderAndInvoice = module.createOrderAndInvoice;
    });

    test('generates dynamic QRIS from Shabu Ajhi tenant metadata without fallback to static image', async () => {
      const grossTotal = 342000; // 310,000 + 32,000 delivery
      const result = await createOrderAndInvoice({
        tenantSlug: 'shabu-ajhi',
        productId: 'paket-oishi',
        productTitle: 'Paket Oishi (Shabu & BBQ)',
        amount: grossTotal,
        basePrice: 310000,
        unitPrice: 310000,
        quantity: 1,
        shippingCost: 32000,
        netShippingCost: 32000,
        paymentMethod: 'qris',
        customerName: 'Ibu Ratna Bandung',
        customerPhone: '081223344556',
        customerEmail: 'ratna@example.com',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.orderId).toBeTruthy();

      // Ensure qr_string is the dynamic EMVCo string
      expect(result.qr_string).toBeTruthy();
      expect(result.qr_string.startsWith('000201010212')).toBe(true);
      expect(result.qr_string).toContain('5406342000');
      expect(result.qr_string).toContain('Shabu Ajhi');
      expect(result.qr_string).not.toBe(mockTenantShabu.metadata.qris_image_url);

      // Ensure qrCodeUrl points to QuickChart render
      expect(result.qrCodeUrl).toContain('quickchart.io/qr?text=');
      expect(result.qrCodeUrl).toContain('5406342000');

      // Check the created order in mock DB
      const savedOrder = mockOrdersDb[result.orderId];
      expect(savedOrder).toBeDefined();
      expect(savedOrder.qr_code_url).toContain('quickchart.io/qr?text=');
    });
  });

  describe('3. Frontend Candidate QRIS Logic Contract', () => {
    test('extractRawQrString & candidateQris prefers dynamic EMVCo over poster image', () => {
      // Simulating CheckoutModal logic
      function extractRawQrString(strOrUrl?: string): string {
        if (!strOrUrl) return '';
        const trimmed = strOrUrl.trim();
        if (trimmed.startsWith('000201')) return trimmed;
        if (trimmed.includes('text=000201') || trimmed.includes('text=')) {
          try {
            const match = trimmed.match(/[?&]text=([^&]+)/);
            if (match && match[1]) {
              const decoded = decodeURIComponent(match[1]);
              if (decoded.startsWith('000201')) return decoded;
            }
          } catch {}
        }
        return '';
      }

      const returnedDynamicQr = generateDynamicQRIS(SHABU_AJHI_STATIC_QRIS, 342000);
      const quickChartUrl = `https://quickchart.io/qr?text=${encodeURIComponent(returnedDynamicQr)}&size=300&ecLevel=H`;
      const staticPosterUrl = mockTenantShabu.metadata.qris_image_url;

      const paymentData = {
        qr_string: returnedDynamicQr,
        qrCodeUrl: quickChartUrl,
      };

      const rawExtracted = extractRawQrString(paymentData.qr_string || paymentData.qrCodeUrl);
      const returnedQrString = rawExtracted || paymentData.qr_string || '';
      const tenantStaticQris = mockTenantShabu.metadata.qris_payload;

      const candidateQris = (returnedQrString && returnedQrString.startsWith('000201'))
        ? returnedQrString
        : ((tenantStaticQris && tenantStaticQris.startsWith('000201')) ? tenantStaticQris : returnedQrString);

      const candidateQrImage = paymentData.qrCodeUrl || staticPosterUrl;

      // candidateQris MUST be truthy and equal to the dynamic QRIS
      expect(candidateQris).toBe(returnedDynamicQr);
      expect(candidateQris.startsWith('000201010212')).toBe(true);
      expect(candidateQris).toContain('5406342000');

      // Therefore, the frontend will render <QRCodeSVG value={candidateQris} /> and NOT the fallback <img>
      const willRenderSvgQr = Boolean(candidateQris);
      const willRenderStaticImageFallback = !candidateQris && Boolean(candidateQrImage);

      expect(willRenderSvgQr).toBe(true);
      expect(willRenderStaticImageFallback).toBe(false);
    });
  });
});
