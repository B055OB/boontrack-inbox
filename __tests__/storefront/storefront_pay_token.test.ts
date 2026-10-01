import { getStorefrontPayUrl, generatePaymentToken, STOREFRONT_DOMAIN } from '@/lib/storefront-urls';

describe('Storefront Pay Token & URL Helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_STOREFRONT_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generatePaymentToken', () => {
    it('generates an opaque token with pay_ prefix', () => {
      const token = generatePaymentToken();
      expect(token).toMatch(/^pay_[a-zA-Z0-9]{16}$/);
    });

    it('generates unique tokens on repeated calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(generatePaymentToken());
      }
      expect(tokens.size).toBe(50);
    });
  });

  describe('getStorefrontPayUrl', () => {
    it('generates canonical shop.boontrack.com payment token URL for any dynamic tenant', () => {
      const url = getStorefrontPayUrl('solusi-ads', 'pay_8k4m2n9p7q');
      expect(url).toBe('https://shop.boontrack.com/solusi-ads/pay/pay_8k4m2n9p7q');
    });

    it('encodes special characters in tenant slugs and tokens', () => {
      const url = getStorefrontPayUrl('kopi barista', 'pay_tok/en 123');
      expect(url).toBe('https://shop.boontrack.com/kopi%20barista/pay/pay_tok%2Fen%20123');
    });

    it('defaults to shop slug if tenantSlug is null or empty', () => {
      const url = getStorefrontPayUrl(null, 'pay_xyz789');
      expect(url).toBe('https://shop.boontrack.com/shop/pay/pay_xyz789');
    });

    it('honors NEXT_PUBLIC_STOREFRONT_URL if configured in environment', () => {
      process.env.NEXT_PUBLIC_STOREFRONT_URL = 'https://custom-shop.example.com';
      const url = getStorefrontPayUrl('buatinvideo', 'pay_abc123');
      expect(url).toBe('https://custom-shop.example.com/buatinvideo/pay/pay_abc123');
    });
  });
});
