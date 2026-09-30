import { getStorefrontInvoiceUrl, getStorefrontShopUrl, STOREFRONT_DOMAIN } from '@/lib/storefront-urls';

describe('Storefront Invoice & Shop URL Helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_STOREFRONT_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getStorefrontInvoiceUrl', () => {
    it('generates canonical shop.boontrack.com URL for any dynamic tenant and order ID', () => {
      const url = getStorefrontInvoiceUrl('tanev-food', 'ORD-12345');
      expect(url).toBe('https://shop.boontrack.com/tanev-food/invoice/ORD-12345');
    });

    it('strips leading # hash from order ID', () => {
      const url = getStorefrontInvoiceUrl('solusi-ads', '#INV-2026-99');
      expect(url).toBe('https://shop.boontrack.com/solusi-ads/invoice/INV-2026-99');
    });

    it('encodes special characters in slugs and order IDs', () => {
      const url = getStorefrontInvoiceUrl('kopi kenangan', 'ORDER/ABC 123');
      expect(url).toBe('https://shop.boontrack.com/kopi%20kenangan/invoice/ORDER%2FABC%20123');
    });

    it('defaults to shop slug if tenantSlug is null or empty', () => {
      const url = getStorefrontInvoiceUrl(null, 'ORD-1');
      expect(url).toBe('https://shop.boontrack.com/shop/invoice/ORD-1');
    });

    it('honors NEXT_PUBLIC_STOREFRONT_URL if configured in environment', () => {
      process.env.NEXT_PUBLIC_STOREFRONT_URL = 'https://custom-shop.example.com';
      const url = getStorefrontInvoiceUrl('nyka', 'ORD-NYKA-01');
      expect(url).toBe('https://custom-shop.example.com/nyka/invoice/ORD-NYKA-01');
    });
  });

  describe('getStorefrontShopUrl', () => {
    it('generates canonical storefront homepage URL for any dynamic tenant', () => {
      const url = getStorefrontShopUrl('tanev-food');
      expect(url).toBe('https://shop.boontrack.com/tanev-food');
    });

    it('defaults to STOREFRONT_DOMAIN if slug is empty', () => {
      const url = getStorefrontShopUrl(null);
      expect(url).toBe(STOREFRONT_DOMAIN);
    });

    it('honors NEXT_PUBLIC_STOREFRONT_URL if configured', () => {
      process.env.NEXT_PUBLIC_STOREFRONT_URL = 'https://custom-shop.example.com';
      const url = getStorefrontShopUrl('suhu-ads');
      expect(url).toBe('https://custom-shop.example.com/suhu-ads');
    });
  });
});
