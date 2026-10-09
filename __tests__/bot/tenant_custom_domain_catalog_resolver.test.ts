import { getProductPageUrl, getStorefrontUrl } from '@/lib/storefront-urls';
import { resolveTenantProductUrl, formatProductCatalogForBotKnowledge } from '@/lib/product-catalog';

describe('Tenant Custom Domain Hierarchy Resolution (§21.1, §25.3 & Rule 2)', () => {
  const tumbuhKembangTenant = {
    id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
    slug: 'tumbuh-kembang-anak',
    name: 'Tumbuh Kembang Anak',
    custom_domain: 'konsul.littlebitefeeding.com',
    metadata: {
      custom_domain: 'konsul.littlebitefeeding.com',
      products: [
        {
          id: 1791347598115,
          name: 'Konsultasi Chat GTM Anak (dr. Harys)',
          slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
          price: 150000,
          promo_price: 150000,
          description: 'Sesi konsultasi evaluasi GTM & berat badan anak.',
        },
        {
          id: 'course-mpasi',
          name: 'Course MPASI Anti GTM',
          slug: 'happyeating',
          price: 199000,
          promo_price: 199000,
          description: 'E-Course panduan MPASI terstruktur.',
        },
      ],
    },
  };

  const defaultPlatformTenant = {
    id: 'buzzer-uuid-123',
    slug: 'buzzerukm',
    name: 'Buzzer UKM',
    custom_domain: null,
    metadata: {
      products: [
        {
          id: 'prod-1',
          name: 'Jasa Buzzer Trending',
          slug: 'jasa-buzzer-trending',
          price: 500000,
        },
      ],
    },
  };

  it('resolves product URLs to custom domain for tumbuh-kembang-anak', () => {
    const gtmUrl = getProductPageUrl(
      tumbuhKembangTenant.slug,
      'eat-and-grow-konsultasi-chat-gtm-anak',
      tumbuhKembangTenant.custom_domain
    );
    expect(gtmUrl).toBe('https://konsul.littlebitefeeding.com/p/eat-and-grow-konsultasi-chat-gtm-anak');

    const happyEatingUrl = getProductPageUrl(
      tumbuhKembangTenant.slug,
      'happyeating',
      tumbuhKembangTenant.custom_domain
    );
    expect(happyEatingUrl).toBe('https://konsul.littlebitefeeding.com/p/happyeating');
  });

  it('resolves product URLs using resolveTenantProductUrl helper', () => {
    const gtmUrl = resolveTenantProductUrl(tumbuhKembangTenant, {
      slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
    });
    expect(gtmUrl).toBe('https://konsul.littlebitefeeding.com/p/eat-and-grow-konsultasi-chat-gtm-anak');

    const happyEatingUrl = resolveTenantProductUrl(tumbuhKembangTenant, {
      slug: 'happyeating',
    });
    expect(happyEatingUrl).toBe('https://konsul.littlebitefeeding.com/p/happyeating');
  });

  it('falls back to shop.boontrack.com when tenant has no custom domain', () => {
    const fallbackUrl = resolveTenantProductUrl(defaultPlatformTenant, {
      slug: 'jasa-buzzer-trending',
    });
    expect(fallbackUrl).toBe('https://shop.boontrack.com/buzzerukm/p/jasa-buzzer-trending');
  });

  it('formats structured catalog for bot knowledge with dynamic custom domain URLs', () => {
    const catalogGrounding = formatProductCatalogForBotKnowledge(
      tumbuhKembangTenant,
      tumbuhKembangTenant.metadata.products
    );

    expect(catalogGrounding).toContain('https://konsul.littlebitefeeding.com/p/eat-and-grow-konsultasi-chat-gtm-anak');
    expect(catalogGrounding).toContain('https://konsul.littlebitefeeding.com/p/happyeating');
    expect(catalogGrounding).not.toContain('https://shop.boontrack.com/tumbuh-kembang-anak/p/');
  });
});
