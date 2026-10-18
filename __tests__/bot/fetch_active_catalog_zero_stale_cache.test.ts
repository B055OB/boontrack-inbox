import {
  fetchActiveCatalog,
  fetchActiveCatalogGrounding,
  formatProductCatalogForBotKnowledge,
} from '@/lib/product-catalog';

describe('fetchActiveCatalog & Context Grounding (Zero Stale Cache)', () => {
  const mockTenant = {
    id: 'b8ff9154-d77a-437f-80ee-372717675183',
    slug: 'viora-goods',
    name: 'Viora Goods',
    custom_domain: null,
    metadata: {
      products: [
        {
          id: 'stale-prod-1',
          name: 'Stale Cached Product (Old Price)',
          price: 99000,
          promo_price: 99000,
        },
      ],
    },
  };

  it('fetches directly from SQL products table bypassing stale metadata products', async () => {
    const mockSqlProducts = [
      {
        id: 'real-prod-101',
        tenant_id: 'b8ff9154-d77a-437f-80ee-372717675183',
        slug: 'fertani-essen-ikan',
        title: 'FERTANI Essen Ikan 120X Kapsul',
        price: 65000,
        promo_price: 59000,
        description: 'Formula Ikan Kolam PG',
        category: 'essen',
        is_available: true,
        created_at: new Date().toISOString(),
      },
    ];

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
        then: (resolve: any) => resolve({ data: mockSqlProducts, error: null }),
      }),
    };

    const products = await fetchActiveCatalog(mockTenant, { supabaseClient: mockSupabase });

    expect(products.length).toBeGreaterThanOrEqual(1);
    expect(products[0].name).toBe('FERTANI Essen Ikan 120X Kapsul');
    expect(products[0].promo_price).toBe(59000);
    expect(products[0].price).toBe(65000);
  });

  it('generates real-time grounding text with updated promo price and checkout URL', async () => {
    const freshProducts = [
      {
        id: 'real-prod-101',
        slug: 'fertani-essen-ikan',
        name: 'FERTANI Essen Ikan 120X Kapsul',
        price: 65000,
        promo_price: 59000,
        description: 'Formula Ikan Kolam PG',
        category: 'essen',
        is_available: true,
        stock: 100,
        image: '',
      },
    ];

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null }),
        then: (resolve: any) => resolve({ data: freshProducts, error: null }),
      }),
    };

    const grounding = await fetchActiveCatalogGrounding(mockTenant, { supabaseClient: mockSupabase });

    expect(grounding).toContain('FERTANI Essen Ikan 120X Kapsul');
    expect(grounding).toContain('Rp 59.000 (Promo dari Rp 65.000)');
    expect(grounding).toContain('https://shop.boontrack.com/viora-goods/p/fertani-essen-ikan');
    expect(grounding).not.toContain('Stale Cached Product');
  });

  it('respects tenant custom domain hierarchy in grounding URLs', () => {
    const tenantWithCustomDomain = {
      id: 'custom-tenant-uuid',
      slug: 'toko-kreatif',
      custom_domain: 'katalog.tokokreatif.com',
      metadata: {},
    };

    const liveProducts = [
      {
        id: 'prod-abc',
        slug: 'kursus-ai-mastery',
        name: 'Kursus AI Mastery',
        price: 150000,
        promo_price: 99000,
        description: 'Panduan lengkap AI untuk bisnis.',
        category: 'digital',
        stock: 999,
        image: '',
      },
    ];

    const grounding = formatProductCatalogForBotKnowledge(tenantWithCustomDomain, liveProducts);

    expect(grounding).toContain('https://katalog.tokokreatif.com/p/kursus-ai-mastery');
    expect(grounding).toContain('Rp 99.000 (Promo dari Rp 150.000)');
    expect(grounding).not.toContain('shop.boontrack.com');
  });
});
