import { getStorefrontUrl, getProductPageUrl } from '@/lib/utils/storefrontUrl';

describe('Dashboard Storefront & Product Salespage Links with Custom Domain', () => {
  const tenantSlug = 'tumbuh-kembang-anak';
  const customDomain = 'konsul.littlebitefeeding.com';
  const productSlug = 'konsultasi-mpasi-1-on-1';

  it('1. resolves storefront URL to custom domain when customDomain is provided', () => {
    const url = getStorefrontUrl(tenantSlug, customDomain);
    expect(url).toBe('https://konsul.littlebitefeeding.com');
  });

  it('2. resolves product salespage URL to custom domain when customDomain is provided', () => {
    const url = getProductPageUrl(tenantSlug, productSlug, customDomain);
    expect(url).toBe('https://konsul.littlebitefeeding.com/p/konsultasi-mpasi-1-on-1');
  });

  it('3. handles custom domains with https:// prefix and trailing slashes correctly', () => {
    const dirtyDomain = '  https://konsul.littlebitefeeding.com/  ';
    const storeUrl = getStorefrontUrl(tenantSlug, dirtyDomain);
    const prodUrl = getProductPageUrl(tenantSlug, productSlug, dirtyDomain);

    expect(storeUrl).toBe('https://konsul.littlebitefeeding.com');
    expect(prodUrl).toBe('https://konsul.littlebitefeeding.com/p/konsultasi-mpasi-1-on-1');
  });

  it('4. falls back to shop.boontrack.com when tenant has no custom domain', () => {
    const defaultStoreUrl = getStorefrontUrl(tenantSlug, null);
    const defaultProdUrl = getProductPageUrl(tenantSlug, productSlug, null);

    expect(defaultStoreUrl).toBe('https://shop.boontrack.com/tumbuh-kembang-anak');
    expect(defaultProdUrl).toBe('https://shop.boontrack.com/tumbuh-kembang-anak/p/konsultasi-mpasi-1-on-1');
  });

  it('5. formats display preview string correctly without protocol prefix', () => {
    const prodUrl = getProductPageUrl(tenantSlug, productSlug, customDomain);
    const previewString = prodUrl.replace(/^https?:\/\//i, '');

    expect(previewString).toBe('konsul.littlebitefeeding.com/p/konsultasi-mpasi-1-on-1');
  });
});
