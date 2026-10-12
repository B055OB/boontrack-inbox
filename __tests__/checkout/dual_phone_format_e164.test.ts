import { 
  normalizePhoneToE164, 
  sanitizePhoneInputForPrefix, 
  isValidIndonesianPhone, 
  formatPhoneForDisplay 
} from '@/lib/phone';
import { createOrderAndInvoice } from '@/lib/checkout-service';

// Mock Supabase client
jest.mock('@/lib/supabaseClient', () => {
  const getMockClient = () => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'mock-tenant-uuid-1234',
          slug: 'toko-demo',
          name: 'Toko Demo',
          tier: 'PRO_SCALE',
          metadata: {},
        },
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
  });

  return {
    getSupabase: jest.fn(getMockClient),
    getSupabaseAdmin: jest.fn(getMockClient),
    isValidUuid: jest.fn(() => false),
    safeUuidOrNull: jest.fn(() => null),
  };
});

// Mock entitlements guard
jest.mock('@/lib/entitlements/trial-guard', () => ({
  checkTrialQuota: jest.fn().mockResolvedValue({ allowed: true }),
}));

// Mock dynamic QRIS
jest.mock('@/lib/qris-dynamic', () => ({
  generateDynamicQRIS: jest.fn(() => '00020101021226...MOCK_QRIS'),
}));

// Mock global fetch for tracking/CAPI
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ success: true }),
}) as any;

describe('Dual Phone Format Standard (Consumer UI + Database E.164 628)', () => {
  describe('1. normalizePhoneToE164 (Database & Backend Normalizer)', () => {
    it('normalizes Indonesian number starting with "08" to "628"', () => {
      expect(normalizePhoneToE164('081234567890')).toBe('6281234567890');
      expect(normalizePhoneToE164('085712345678')).toBe('6285712345678');
      expect(normalizePhoneToE164('089611223344')).toBe('6289611223344');
    });

    it('normalizes Indonesian number starting with "8" to "628"', () => {
      expect(normalizePhoneToE164('81234567890')).toBe('6281234567890');
      expect(normalizePhoneToE164('85712345678')).toBe('6285712345678');
    });

    it('handles typo numbers starting with "6208" to "628"', () => {
      expect(normalizePhoneToE164('62081234567890')).toBe('6281234567890');
      expect(normalizePhoneToE164('62085712345678')).toBe('6285712345678');
    });

    it('handles international format "+628..." and keeps "628..."', () => {
      expect(normalizePhoneToE164('+6281234567890')).toBe('6281234567890');
      expect(normalizePhoneToE164('+62 812-3456-7890')).toBe('6281234567890');
    });

    it('handles numbers already in "628..." format', () => {
      expect(normalizePhoneToE164('6281234567890')).toBe('6281234567890');
      expect(normalizePhoneToE164('6285181830080')).toBe('6285181830080');
    });

    it('handles exit code "00628..."', () => {
      expect(normalizePhoneToE164('006281234567890')).toBe('6281234567890');
    });

    it('strips dashes, spaces, and punctuation gracefully', () => {
      expect(normalizePhoneToE164('0812-3456-7890')).toBe('6281234567890');
      expect(normalizePhoneToE164(' 0812 3456 7890 ')).toBe('6281234567890');
      expect(normalizePhoneToE164('+62 (812) 3456-7890')).toBe('6281234567890');
    });

    it('handles falsy or empty inputs gracefully without throwing', () => {
      expect(normalizePhoneToE164('')).toBe('');
      expect(normalizePhoneToE164(null)).toBe('');
      expect(normalizePhoneToE164(undefined)).toBe('');
    });
  });

  describe('2. sanitizePhoneInputForPrefix (Consumer-Friendly UI Prefix Handler)', () => {
    it('automatically slices leading "0" when user types "08"', () => {
      expect(sanitizePhoneInputForPrefix('08')).toBe('8');
      expect(sanitizePhoneInputForPrefix('0812')).toBe('812');
      expect(sanitizePhoneInputForPrefix('081234567890')).toBe('81234567890');
    });

    it('leaves inputs starting with "8" untouched', () => {
      expect(sanitizePhoneInputForPrefix('81234567890')).toBe('81234567890');
      expect(sanitizePhoneInputForPrefix('857')).toBe('857');
    });

    it('strips redundant country code if user pastes "+62..." or "62..."', () => {
      expect(sanitizePhoneInputForPrefix('+6281234567890')).toBe('81234567890');
      expect(sanitizePhoneInputForPrefix('6281234567890')).toBe('81234567890');
      expect(sanitizePhoneInputForPrefix('+62 81234567890')).toBe('81234567890');
      expect(sanitizePhoneInputForPrefix('+62081234567890')).toBe('81234567890');
      expect(sanitizePhoneInputForPrefix('62081234567890')).toBe('81234567890');
    });

    it('handles multiple leading zeroes gracefully', () => {
      expect(sanitizePhoneInputForPrefix('008123456')).toBe('8123456');
    });

    it('handles single "0" as temporary typing state', () => {
      expect(sanitizePhoneInputForPrefix('0')).toBe('0');
    });

    it('handles empty input gracefully', () => {
      expect(sanitizePhoneInputForPrefix('')).toBe('');
    });
  });

  describe('3. isValidIndonesianPhone', () => {
    it('validates genuine Indonesian mobile numbers', () => {
      expect(isValidIndonesianPhone('081234567890')).toBe(true);
      expect(isValidIndonesianPhone('81234567890')).toBe(true);
      expect(isValidIndonesianPhone('6281234567890')).toBe(true);
      expect(isValidIndonesianPhone('+6281234567890')).toBe(true);
      expect(isValidIndonesianPhone('0812-3456-7890')).toBe(true);
    });

    it('rejects numbers that are too short (< 8 digits after 628)', () => {
      expect(isValidIndonesianPhone('0812')).toBe(false);
      expect(isValidIndonesianPhone('081234')).toBe(false);
      expect(isValidIndonesianPhone('')).toBe(false);
      expect(isValidIndonesianPhone(null)).toBe(false);
    });
  });

  describe('4. formatPhoneForDisplay', () => {
    it('formats E.164 Indonesian numbers into local grouped format (08xx-xxxx-xxxx)', () => {
      expect(formatPhoneForDisplay('6281234567890')).toBe('0812-3456-7890');
      expect(formatPhoneForDisplay('081234567890')).toBe('0812-3456-7890');
    });
  });

  describe('5. createOrderAndInvoice Integration (Database Persistence Guard)', () => {
    it('always normalizes customerPhone to E.164 628 in the order payload regardless of input format', async () => {
      const inputsToTest = [
        '081234567890',
        '81234567890',
        '+62 812-3456-7890',
        '62081234567890',
        '0812-3456-7890',
      ];

      for (const inputPhone of inputsToTest) {
        const orderPayload = {
          tenantSlug: 'toko-demo',
          productId: 'prod_test_01',
          productTitle: 'Produk Uji',
          amount: 50000,
          customerName: 'Budi Tester',
          customerPhone: inputPhone,
          paymentMethod: 'qris' as const,
        };

        const result = await createOrderAndInvoice(orderPayload);
        expect(result).toBeDefined();
        expect(result.orderId).toMatch(/^ORD-/);

        // Verify that payload.customerPhone was normalized to 6281234567890
        expect(orderPayload.customerPhone).toBe('6281234567890');
      }
    });
  });
});
