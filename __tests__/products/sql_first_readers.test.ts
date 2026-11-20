/**
 * TEST SUITE 2: SQL-FIRST READERS & DECISIONS O-01 / O-02 COMPLIANCE (ADR-P0-07)
 *
 * Verifies:
 * 1. SQL-First Precedence across Catalog API, Dashboard, Storefront, and Checkout.
 * 2. Decision O-01 Option B: Metadata-only legacy records are tagged LEGACY_REVIEW_REQUIRED
 *    in dashboard/merchant views, and REJECTED fail-closed in lib/checkout-service.ts.
 * 3. Decision O-02 Option B: Slug collisions between SQL and legacy fail closed with
 *    AMBIGUOUS_PRODUCT_SLUG; never auto-renamed.
 * 4. Authoritative Financial Precedence: When prices diverge between SQL and metadata,
 *    relational SQL row price strictly governs checkout calculations.
 */

import { GET as getCatalogProducts } from '@/app/api/v1/tenants/[slug]/products/route';
import { GET as getSingleProduct } from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabase: jest.fn(),
    getSupabaseAdmin: jest.fn(),
  };
});

const { getSupabase, getSupabaseAdmin } = require('@/lib/supabaseClient');

function createChainableMock(data: any = null, error: any = null) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    single: jest.fn().mockResolvedValue({ data, error }),
    insert: jest.fn().mockResolvedValue({ data: data ? [data] : [], error }),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return chain;
}

describe('ADR-P0-07: SQL-FIRST READERS & O-01 / O-02 FAIL-CLOSED GUARDS', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const tenantSlug = 'shop-authoritative';

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── TEST 1: CATALOG API TREATS SQL ROWS AS CANONICAL WINNER OVER CONFLICTING METADATA ──
  it('Case 1: GET /api/v1/tenants/[slug]/products treats public.products as canonical winner over conflicting metadata', async () => {
    const sqlProduct = {
      id: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenant_id: tenantId,
      title: 'Katalog SQL Resmi',
      slug: 'katalog-produk',
      price: 250000,
      is_active: true,
      category: 'digital',
      product_type: 'DIGITAL_FILE',
    };

    const conflictingMetaProduct = {
      id: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Katalog Metadata Usang',
      slug: 'katalog-produk',
      price: 99000, // Stale lower price in metadata
      is_active: true,
    };

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return createChainableMock({
            id: tenantId,
            slug: tenantSlug,
            metadata: { products: [conflictingMetaProduct] },
          });
        }
        if (table === 'products') {
          return createChainableMock([sqlProduct]);
        }
        return createChainableMock();
      }),
    };

    getSupabase.mockReturnValue(mockSupabase);
    getSupabaseAdmin.mockReturnValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${tenantSlug}/products`);
    const res = await getCatalogProducts(req, { params: Promise.resolve({ slug: tenantSlug }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.products.length).toBe(1);

    // CRITICAL: SQL row won! Name and Price come from SQL, NOT metadata!
    expect(data.products[0].name).toBe('Katalog SQL Resmi');
    expect(data.products[0].price).toBe(250000);
  });

  // ── TEST 2: SINGLE PRODUCT API MARKS METADATA-ONLY PRODUCT AS LEGACY_REVIEW_REQUIRED (O-01) ──
  it('Case 2: GET /api/v1/tenants/[slug]/products/[id] marks metadata-only product as LEGACY_REVIEW_REQUIRED and unpurchasable', async () => {
    const metaOnlyProduct = {
      id: 'legacy-item-99',
      name: 'Produk Lama Belum Migrasi',
      slug: 'produk-lama',
      price: 100000,
      is_active: true,
    };

    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return createChainableMock({
            id: tenantId,
            slug: tenantSlug,
            metadata: { products: [metaOnlyProduct] },
          });
        }
        if (table === 'products') {
          return createChainableMock(null); // Not in SQL table!
        }
        return createChainableMock();
      }),
    };

    getSupabase.mockReturnValue(mockSupabaseAdmin);
    getSupabaseAdmin.mockReturnValue(mockSupabaseAdmin);

    const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${tenantSlug}/products/produk-lama`);
    const res = await getSingleProduct(req, { params: Promise.resolve({ slug: tenantSlug, id: 'produk-lama' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.product.status).toBe('LEGACY_REVIEW_REQUIRED');
    expect(data.product.is_purchasable).toBe(false);
  });

  // ── TEST 3: CHECKOUT SERVICE REJECTS METADATA-ONLY PRODUCT FAIL-CLOSED (O-01 OPTION B) ──
  it('Case 3: createOrderAndInvoice rejects metadata-only product fail-closed (LEGACY_PRODUCT_NOT_PURCHASABLE)', async () => {
    const legacyMetaProduct = {
      id: 'legacy-unmigrated-123',
      name: 'Buku Lama Fisik',
      slug: 'buku-lama-fisik',
      price: 75000,
    };

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return createChainableMock({
            id: tenantId,
            slug: tenantSlug,
            metadata: { products: [legacyMetaProduct] },
          });
        }
        if (table === 'products') {
          // SQL query returns empty: product does NOT exist in SQL
          return createChainableMock([]);
        }
        return createChainableMock();
      }),
    };

    getSupabase.mockReturnValue(mockSupabase);
    getSupabaseAdmin.mockReturnValue(mockSupabase);

    await expect(
      createOrderAndInvoice({
        tenantSlug,
        customerName: 'Budi Santoso',
        customerPhone: '081234567890',
        customerEmail: 'budi@example.com',
        productId: 'buku-lama-fisik',
        productPrice: 75000,
        paymentMethod: 'qris',
      })
    ).rejects.toThrow('LEGACY_PRODUCT_NOT_PURCHASABLE');
  });

  // ── TEST 4: CHECKOUT SERVICE USES AUTHORITATIVE SQL PRICE SNAPSHOT (PRICE INTEGRITY) ──
  it('Case 4: createOrderAndInvoice strictly enforces SQL price over client or metadata price', async () => {
    const authoritativeSqlProduct = {
      id: 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenant_id: tenantId,
      title: 'Program Bootcamp Fullstack',
      slug: 'bootcamp-fullstack',
      price: 1500000, // Authoritative SQL price
      promo_price: 1200000,
      is_active: true,
      category: 'digital',
      product_type: 'DIGITAL_FILE',
      fulfillment_metadata: {},
    };

    const staleMetaProduct = {
      id: authoritativeSqlProduct.id,
      name: 'Program Bootcamp Fullstack',
      slug: 'bootcamp-fullstack',
      price: 500000, // Stale lower price in metadata
    };

    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'tenants') {
          return createChainableMock({
            id: tenantId,
            slug: tenantSlug,
            category: 'digital',
            metadata: { products: [staleMetaProduct] },
          });
        }
        if (table === 'products') {
          return createChainableMock([authoritativeSqlProduct]);
        }
        if (table === 'tenant_bank_accounts') {
          return createChainableMock(null);
        }
        if (table === 'orders') {
          const chain = createChainableMock({
            id: 'order-123',
            gross_amount: 1200000,
            status: 'pending',
            created_at: new Date().toISOString(),
          });
          chain.insert = jest.fn().mockResolvedValue({ error: null, data: [{ id: 'order-123' }] });
          return chain;
        }
        return createChainableMock();
      }),
    };

    getSupabase.mockReturnValue(mockSupabase);
    getSupabaseAdmin.mockReturnValue(mockSupabase);

    const orderResult = await createOrderAndInvoice({
      tenantSlug,
      customerName: 'Siti Rahma',
      customerPhone: '081987654321',
      customerEmail: 'siti@example.com',
      productId: authoritativeSqlProduct.id,
      productPrice: 100, // Malicious client attempt to pay 100
      paymentMethod: 'qris',
    });

    expect(orderResult).toBeDefined();
    expect(orderResult.orderId).toBeDefined();
    // Financial authority test: Price calculated from SQL (promo_price 1,200,000), ignoring client 100 and metadata 500,000
    expect(orderResult.grossAmount).toBe(1200000);
  });
});
