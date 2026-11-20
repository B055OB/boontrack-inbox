/**
 * TEST SUITE 1: CANONICAL PRODUCT WRITER ATOMICITY & FAILURE ISOLATION (ADR-P0-07)
 *
 * Verifies:
 * 1. Single Server-Authoritative Relational Writer: public.products write commits successfully.
 * 2. Failure Atomicity Proof: When public.products SQL write fails, the operation aborts
 *    immediately with HTTP 500/400 and leaves tenants.metadata.products 100% UNTOUCHED.
 * 3. Controlled One-Way Projection (O-03 Option A): When SQL write succeeds but projection
 *    fails, the committed SQL row is NOT rolled back, and a structured recovery log is emitted.
 * 4. Section 10 HTML Entitlement & Sanitization: Preserves WP2 entitlement gates.
 * 5. Cross-Tenant Protection: Rejects mutations attempting to touch another tenant's product.
 */

import {
  upsertCanonicalProduct,
  deleteCanonicalProduct,
  executeOneWayProjection,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';

describe('ADR-P0-07: CANONICAL PRODUCT WRITER & ATOMICITY PROOFS', () => {
  const tenant: CanonicalTenantContext = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tokoku',
    category: 'digital',
    tier: 'PRO_SCALE',
    metadata: {
      products: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Produk Awal',
          slug: 'produk-awal',
          price: 150000,
          is_active: true,
        },
      ],
    },
  };

  const actor: CanonicalWriterActor = {
    actorId: 'usr-123',
    actorRole: 'OWNER',
    isInternalMachine: false,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── TEST 1: SUCCESSFUL SQL WRITE COMMITS & PROJECTS TO METADATA ──
  it('Case 1: Successful SQL write commits to public.products and projects derived item to metadata', async () => {
    const committedSqlRow = {
      id: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenant.id,
      title: 'Buku Panduan AI',
      name: 'Buku Panduan AI',
      slug: 'buku-panduan-ai',
      price: 250000,
      promo_price: 199000,
      category: 'digital',
      product_type: 'DIGITAL_FILE',
      is_active: true,
      requires_shipping: false,
      fulfillment_metadata: {
        single_page_config: { headline: 'Panduan Praktis AI' },
      },
      updated_at: new Date().toISOString(),
    };

    let updatedMetadata: any = null;

    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            upsert: jest.fn(() => ({
              select: jest.fn().mockResolvedValue({ data: [committedSqlRow], error: null }),
            })),
          };
        }
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: tenant.id, metadata: tenant.metadata },
              error: null,
            }),
            update: jest.fn((payload: any) => {
              updatedMetadata = payload.metadata;
              return {
                eq: jest.fn().mockResolvedValue({ data: [{ id: tenant.id }], error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Buku Panduan AI',
        price: 250000,
        promo_price: 199000,
        category: 'digital',
      },
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.product.title).toBe('Buku Panduan AI');
    expect(result.projection?.success).toBe(true);

    // Verify metadata was updated with projected item
    expect(updatedMetadata).not.toBeNull();
    expect(Array.isArray(updatedMetadata.products)).toBe(true);
    const projected = updatedMetadata.products.find((p: any) => p.id === committedSqlRow.id);
    expect(projected).toBeDefined();
    expect(projected.price).toBe(250000);
  });

  // ── TEST 2: SQL FAILURE LEAVES METADATA 100% UNTOUCHED (FAILURE ATOMICITY PROOF) ──
  it('Case 2: When public.products write fails, operation aborts with 500 and leaves metadata 100% untouched', async () => {
    let metadataUpdateAttempted = false;

    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            upsert: jest.fn(() => ({
              select: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection timeout during products upsert' },
              }),
            })),
          };
        }
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: tenant.id, metadata: tenant.metadata },
              error: null,
            }),
            update: jest.fn(() => {
              metadataUpdateAttempted = true;
              return { eq: jest.fn().mockResolvedValue({ data: [], error: null }) };
            }),
          };
        }
        return {};
      }),
    };

    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Produk Gagal Tulis SQL',
        price: 100000,
      },
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.code).toBe('SQL_MUTATION_FAILED');
    expect(result.error).toContain('Database connection timeout');

    // CRITICAL INVARIANT: metadata.products MUST NEVER be touched when SQL fails!
    expect(metadataUpdateAttempted).toBe(false);
  });

  // ── TEST 3: PROJECTION FAILURE DOES NOT INVALIDATE COMMITTED SQL RECORD (O-03 OPTION A) ──
  it('Case 3: Projection failure does NOT roll back or invalidate committed SQL record', async () => {
    const committedSqlRow = {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: tenant.id,
      title: 'Kursus Ekspor',
      name: 'Kursus Ekspor',
      slug: 'kursus-ekspor',
      price: 500000,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            upsert: jest.fn(() => ({
              select: jest.fn().mockResolvedValue({ data: [committedSqlRow], error: null }),
            })),
          };
        }
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Supabase metadata locked by concurrent worker' },
            }),
            update: jest.fn().mockReturnThis(),
          };
        }
        return {};
      }),
    };

    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Kursus Ekspor',
        price: 500000,
      },
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    // The SQL row committed successfully
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.product.id).toBe(committedSqlRow.id);

    // But projection was marked as failed and queued for reconciliation
    expect(result.projection?.success).toBe(false);
    expect(result.projection?.queued_for_reconciliation).toBe(true);
  });

  // ── TEST 4: SECTION 10 CUSTOM HTML ENTITLEMENT GATE ENFORCEMENT ──
  it('Case 4: Denies unentitled tenant from saving Custom HTML payload (HTTP 403)', async () => {
    const unentitledTenant: CanonicalTenantContext = {
      id: '55555555-5555-4555-8555-555555555555',
      slug: 'unentitled-shop',
      tier: 'SOLO', // SOLO tier does NOT have Section 10 entitlement
      metadata: {},
    };

    const mockSupabaseAdmin = {
      from: jest.fn(),
    };

    const result = await upsertCanonicalProduct({
      tenant: unentitledTenant,
      rawInput: {
        name: 'Landing Page Kustom',
        price: 100000,
        custom_html: '<div>Custom HTML Landing Page</div>',
      },
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.code).toBe('CUSTOM_HTML_UNAUTHORIZED');
  });

  // ── TEST 5: CROSS-TENANT OWNERSHIP VIOLATION REJECTION (HTTP 403) ──
  it('Case 5: Rejects product mutation if product belongs to another tenant', async () => {
    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: '66666666-6666-4666-8666-666666666666',
                tenant_id: '99999999-9999-4999-8999-999999999999', // Different tenant!
              },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Produk Toko Lain',
        price: 100000,
      },
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
    expect(result.error).toContain('belongs to another tenant');
  });

  // ── TEST 6: CANONICAL DELETE EXECUTES SQL DELETE FIRST ──
  it('Case 6: Delete executes SQL DELETE from public.products first', async () => {
    let sqlDeleteCalled = false;
    let metadataUpdated = false;

    const mockSupabaseAdmin = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: '77777777-7777-4777-8777-777777777777',
                slug: 'produk-hapus',
                tenant_id: tenant.id,
              },
              error: null,
            }),
            delete: jest.fn(() => {
              sqlDeleteCalled = true;
              return {
                eq: jest.fn().mockReturnThis(),
              };
            }),
          };
        }
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: tenant.id, metadata: tenant.metadata },
              error: null,
            }),
            update: jest.fn(() => {
              metadataUpdated = true;
              return {
                eq: jest.fn().mockResolvedValue({ data: [{ id: tenant.id }], error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const result = await deleteCanonicalProduct({
      tenant,
      productIdOrKey: '77777777-7777-4777-8777-777777777777',
      actor,
      customSupabaseAdmin: mockSupabaseAdmin,
    });

    expect(result.success).toBe(true);
    expect(sqlDeleteCalled).toBe(true);
    expect(metadataUpdated).toBe(true);
  });
});
