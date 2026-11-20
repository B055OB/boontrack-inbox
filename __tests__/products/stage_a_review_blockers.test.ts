/**
 * STAGE A REMEDIATION TEST SUITE (5 REVIEW BLOCKERS + 2 REGRESSION ITEMS)
 * Verifies all CTO review requirements for ADR-P0-07 Single-Writer Architecture.
 */

import {
  upsertCanonicalProduct,
  deleteCanonicalProduct,
  executeOneWayProjection,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';
import { POST as bulkUploadPost } from '@/app/api/v1/products/bulk-upload/route';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { NextRequest } from 'next/server';

describe('CTO STAGE A REVIEW BLOCKERS & REGRESSION TEST SUITE', () => {
  const tenant: CanonicalTenantContext = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tokoku',
    category: 'digital',
    tier: 'PRO_SCALE',
    metadata: {
      shipping_config: { jne: true, jnt: false, flat_rate: 15000 },
      payment_settings: { qris_active: true, provider: 'xendit' },
      qris_payload: '000201010212265...tokoku',
      telegram_chat_id: '99887766',
      products: [
        {
          id: 'legacy-prod-01',
          slug: 'kursus-seo-legacy',
          name: 'Kursus SEO Legacy',
          price: 99000,
        },
      ],
    },
  };

  const actor: CanonicalWriterActor = {
    actorId: 'usr-owner-1',
    actorRole: 'OWNER',
    isInternalMachine: false,
  };

  beforeAll(() => {
    process.env.ADMIN_INTERNAL_SECRET = 'super-secret-admin-token-123456';
  });

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 1: P0 Security — Fail-Closed Ownership & Cross-Tenant Lookup
  // ══════════════════════════════════════════════════════════════════════
  describe('BLOCKER-1: Fail-Closed Ownership & Cross-Tenant Lookup', () => {
    it('stops immediately with 503 OWNERSHIP_LOOKUP_FAILED if ownershipQuery returns DB error (upsert never called)', async () => {
      let upsertCalled = false;
      let insertCalled = false;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Connection pool exhausted' },
              }),
              upsert: jest.fn(() => {
                upsertCalled = true;
                return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
              }),
              insert: jest.fn(() => {
                insertCalled = true;
                return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Produk Baru',
          price: 50000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe('OWNERSHIP_LOOKUP_FAILED');
      expect(upsertCalled).toBe(false);
      expect(insertCalled).toBe(false);
    });

    it('stops immediately with 503 OWNERSHIP_LOOKUP_FAILED if cross-tenant lookup returns DB error', async () => {
      let upsertCalled = false;
      let lookupCount = 0;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockImplementation(() => {
                lookupCount++;
                if (lookupCount === 1) {
                  // First lookup: ownership query in current tenant -> not found
                  return Promise.resolve({ data: null, error: null });
                }
                // Second lookup: cross-tenant check -> DB error
                return Promise.resolve({ data: null, error: { message: 'Read replica timeout' } });
              }),
              upsert: jest.fn(() => {
                upsertCalled = true;
                return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Produk Target',
          price: 150000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe('OWNERSHIP_LOOKUP_FAILED');
      expect(upsertCalled).toBe(false);
    });

    it('returns 403 CROSS_TENANT_PRODUCT_FORBIDDEN when target UUID belongs to another tenant', async () => {
      let upsertCalled = false;
      let lookupCount = 0;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockImplementation(() => {
                lookupCount++;
                if (lookupCount === 1) {
                  return Promise.resolve({ data: null, error: null });
                }
                // Target UUID exists under another tenant
                return Promise.resolve({
                  data: {
                    id: '44444444-4444-4444-8444-444444444444',
                    tenant_id: '99999999-9999-4999-8999-999999999999',
                  },
                  error: null,
                });
              }),
              upsert: jest.fn(() => {
                upsertCalled = true;
                return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Produk Bajakan',
          price: 100000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('CROSS_TENANT_PRODUCT_FORBIDDEN');
      expect(upsertCalled).toBe(false);
    });

    it('in deleteCanonicalProduct, DB error on ownership lookup fails closed with 503 without calling SQL delete', async () => {
      let deleteCalled = false;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Fatal DB I/O error' },
              }),
              delete: jest.fn(() => {
                deleteCalled = true;
                return { eq: jest.fn().mockReturnThis() };
              }),
            };
          }
          return {};
        }),
      };

      const result = await deleteCanonicalProduct({
        tenant,
        productIdOrKey: '55555555-5555-4555-8555-555555555555',
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe('OWNERSHIP_LOOKUP_FAILED');
      expect(deleteCalled).toBe(false);
    });

    it('in deleteCanonicalProduct, cross-tenant target returns 403 CROSS_TENANT_PRODUCT_FORBIDDEN without calling SQL delete', async () => {
      let deleteCalled = false;
      let lookupCount = 0;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockImplementation(() => {
                lookupCount++;
                if (lookupCount === 1) {
                  return Promise.resolve({ data: null, error: null });
                }
                return Promise.resolve({
                  data: {
                    id: '66666666-6666-4666-8666-666666666666',
                    tenant_id: '99999999-9999-4999-8999-999999999999',
                  },
                  error: null,
                });
              }),
              delete: jest.fn(() => {
                deleteCalled = true;
                return { eq: jest.fn().mockReturnThis() };
              }),
            };
          }
          return {};
        }),
      };

      const result = await deleteCanonicalProduct({
        tenant,
        productIdOrKey: '66666666-6666-4666-8666-666666666666',
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('CROSS_TENANT_PRODUCT_FORBIDDEN');
      expect(deleteCalled).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 2: P1 Data Integrity — Strict PATCH vs PUT Semantics
  // ══════════════════════════════════════════════════════════════════════
  describe('BLOCKER-2: Strict PATCH Partial Update vs PUT Semantics', () => {
    it('PATCH updating only name preserves existing description, promo_price, image_url, stock, sku, requires_shipping, variants, and fulfillment_metadata', async () => {
      const existingProduct = {
        id: '77777777-7777-4777-8777-777777777777',
        tenant_id: tenant.id,
        title: 'Original Title',
        name: 'Original Title',
        slug: 'original-title',
        description: 'Crucial detailed description',
        price: 200000,
        promo_price: 150000,
        image_url: 'https://example.com/original.png',
        stock: 42,
        is_unlimited_stock: false,
        sku: 'ORIG-SKU-99',
        requires_shipping: true,
        variants: [{ id: 'var-1', name: 'Size XL', price: 210000 }],
        fulfillment_metadata: { courier: 'internal_fleet', weight_grams: 500 },
        category: 'physical',
        product_type: 'PHYSICAL',
        is_active: true,
      };

      let capturedSqlPayload: any = null;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: existingProduct, error: null }),
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              update: jest.fn((payload: any) => {
                capturedSqlPayload = payload;
                return {
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      select: jest.fn().mockResolvedValue({
                        data: [{ ...existingProduct, ...payload }],
                        error: null,
                      }),
                    }),
                  }),
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
              update: jest.fn(() => ({
                eq: jest.fn().mockResolvedValue({ data: [{ id: tenant.id }], error: null }),
              })),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: existingProduct.id,
          name: 'Updated Title Only',
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
        mode: 'PATCH',
      });

      expect(result.success).toBe(true);
      expect(capturedSqlPayload).toBeDefined();
      expect(capturedSqlPayload.title).toBe('Updated Title Only');
      expect(capturedSqlPayload.name).toBe('Updated Title Only');

      // Omitted fields MUST NOT be present in SQL update payload (never overwritten with null/defaults)
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'description')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'promo_price')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'image_url')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'stock')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'sku')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'requires_shipping')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'variants')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(capturedSqlPayload, 'fulfillment_metadata')).toBe(false);
    });

    it('PATCH on non-existent product fails with 404 PRODUCT_NOT_FOUND', async () => {
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: '88888888-8888-4888-8888-888888888888',
          name: 'Phantom Product',
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
        mode: 'PATCH',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('PUT rejects missing name/title with 400 VALIDATION_ERROR', async () => {
      const mockSupabaseAdmin = {
        from: jest.fn(),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          price: 150000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
        mode: 'PUT',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('Nama produk wajib diisi');
    });

    it('PUT rejects missing price with 400 VALIDATION_ERROR', async () => {
      const mockSupabaseAdmin = {
        from: jest.fn(),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          name: 'Produk Tanpa Harga',
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
        mode: 'PUT',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('Harga produk wajib diisi');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 3: P1 Concurrency & Truthful Projection Status
  // ══════════════════════════════════════════════════════════════════════
  describe('BLOCKER-3: Optimistic Concurrency Control & Truthful Projection Status', () => {
    it('preserves unrelated tenant settings (shipping_config, payment_settings, qris_payload) during projection', async () => {
      let projectedMetadata: any = null;

      const tenantWithSettings: CanonicalTenantContext = {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'tokoku',
        metadata: {
          shipping_config: { jne: true, express: true },
          payment_settings: { qris_active: true, custom_provider: 'midtrans' },
          qris_payload: 'RAW_QRIS_PAYLOAD_STRING_123',
          telegram_chat_id: '99887766',
          custom_greeting: 'Selamat datang di Tokoku',
          products: [],
        },
      };

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: tenantWithSettings.id,
                  metadata: tenantWithSettings.metadata,
                  updated_at: '2026-11-20T10:00:00Z',
                },
                error: null,
              }),
              update: jest.fn((payload: any) => {
                projectedMetadata = payload.metadata;
                return {
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                      data: [{ id: tenantWithSettings.id }],
                      error: null,
                    }),
                    then: (resolve: any) => resolve({ data: [{ id: tenantWithSettings.id }], error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const committedRow = {
        id: '99999999-9999-4999-8999-999999999999',
        tenant_id: tenantWithSettings.id,
        title: 'Produk Uji OCC',
        name: 'Produk Uji OCC',
        slug: 'produk-uji-occ',
        price: 75000,
        category: 'digital',
      };

      const res = await executeOneWayProjection(
        mockSupabaseAdmin,
        tenantWithSettings,
        committedRow,
        'UPSERT'
      );

      expect(res.success).toBe(true);
      expect(res.projection_status).toBe('SYNCED');

      // Unrelated settings survive intact!
      expect(projectedMetadata.shipping_config).toEqual({ jne: true, express: true });
      expect(projectedMetadata.payment_settings).toEqual({ qris_active: true, custom_provider: 'midtrans' });
      expect(projectedMetadata.qris_payload).toBe('RAW_QRIS_PAYLOAD_STRING_123');
      expect(projectedMetadata.telegram_chat_id).toBe('99887766');
      expect(projectedMetadata.custom_greeting).toBe('Selamat datang di Tokoku');
      expect(projectedMetadata.products).toHaveLength(1);
      expect(projectedMetadata.products[0].slug).toBe('produk-uji-occ');
    });

    it('returns projection_status = FAILED_NEEDS_RECONCILIATION and recoverable_via when projection DB fails', async () => {
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Supabase metadata lock timeout' },
              }),
            };
          }
          return {};
        }),
      };

      const committedRow = {
        id: '12121212-1212-4212-8212-121212121212',
        title: 'Produk Gagal Proyeksi',
        price: 50000,
      };

      const res = await executeOneWayProjection(
        mockSupabaseAdmin,
        tenant,
        committedRow,
        'UPSERT'
      );

      expect(res.success).toBe(false);
      expect(res.projection_status).toBe('FAILED_NEEDS_RECONCILIATION');
      expect(res.recoverable_via).toBe('DRY_RUN_RECONCILIATION');
      expect(res.error).toContain('lock timeout');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 4: P1 Product Identity — Pre-Mutation Slug & SKU Collision Guard
  // ══════════════════════════════════════════════════════════════════════
  describe('BLOCKER-4: Pre-Mutation Slug & SKU Collision Guard', () => {
    it('blocks mutation with 409 PRODUCT_SLUG_CONFLICT before SQL mutation if another product owns the slug', async () => {
      let sqlMutationCalled = false;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'other-prod-uuid-999',
                    slug: 'slug-sudah-ada',
                  },
                ],
                error: null,
              }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: jest.fn(() => {
                sqlMutationCalled = true;
                return { select: jest.fn() };
              }),
              insert: jest.fn(() => {
                sqlMutationCalled = true;
                return { select: jest.fn() };
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: 'my-new-prod-uuid',
          name: 'Produk Baru Menggunakan Slug Sama',
          slug: 'slug-sudah-ada',
          price: 50000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.code).toBe('PRODUCT_SLUG_CONFLICT');
      expect(sqlMutationCalled).toBe(false);
    });

    it('blocks mutation with 409 PRODUCT_SKU_CONFLICT before SQL mutation if another product owns the SKU', async () => {
      let sqlMutationCalled = false;
      let callCount = 0;

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              limit: jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                  // Slug check: no conflict
                  return Promise.resolve({ data: [], error: null });
                }
                // SKU check: collision!
                return Promise.resolve({
                  data: [{ id: 'other-prod-sku-999', sku: 'SKU-DUPLICATE' }],
                  error: null,
                });
              }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: jest.fn(() => {
                sqlMutationCalled = true;
                return { select: jest.fn() };
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          id: 'my-prod-unique',
          name: 'Produk Unik',
          sku: 'SKU-DUPLICATE',
          price: 50000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.code).toBe('PRODUCT_SKU_CONFLICT');
      expect(sqlMutationCalled).toBe(false);
    });

    it('gracefully handles PostgreSQL unique constraint violation 23505 under race condition as 409', async () => {
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: jest.fn(() => ({
                select: jest.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "products_tenant_id_slug_key"',
                  },
                }),
              })),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant,
        rawInput: {
          name: 'Produk Balapan',
          price: 100000,
        },
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.code).toBe('PRODUCT_SLUG_CONFLICT');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 5: P1 Writer Boundary — Bulk Upload Canonical Ownership
  // ══════════════════════════════════════════════════════════════════════
  describe('BLOCKER-5: Bulk Upload Canonical Route Ownership', () => {
    it('fails closed with HTTP 415 on raw .xlsx file upload', async () => {
      const boundary = '----WebKitFormBoundaryXlsxTest';
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="products.xlsx"\r\n` +
        `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n` +
        `FAKE_BINARY_EXCEL_BYTES\r\n` +
        `--${boundary}--\r\n`;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/products/bulk-upload?tenant_slug=tokoku',
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'x-internal-secret': 'super-secret-admin-token-123456',
          },
          body: Buffer.from(body),
        }
      );

      const res = await bulkUploadPost(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(data.detail).toContain('.xlsx');
    });

    it('processes CSV rows through canonical writer and returns per-row summary', async () => {
      const csvContent =
        'name,price,category,description\n' +
        'Ebook Marketing,150000,digital,Buku digital marketing\n' +
        'Kursus Ads,350000,digital,Video tutorial ads\n';

      const boundary = '----WebKitFormBoundaryCsvTest';
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="catalog.csv"\r\n` +
        `Content-Type: text/csv\r\n\r\n` +
        `${csvContent}\r\n` +
        `--${boundary}--\r\n`;

      const req = new NextRequest(
        'http://localhost:3000/api/v1/products/bulk-upload?tenant_slug=tokoku',
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'x-internal-secret': 'super-secret-admin-token-123456',
          },
          body: Buffer.from(body),
        }
      );

      const res = await bulkUploadPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.success_count).toBe(2);
      expect(data.failure_count).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(true);
    });

    it('processes JSON array payload and returns partial_success if one row is invalid', async () => {
      const payload = [
        { name: 'Produk Sukses', price: 100000 },
        { name: '', price: 50000 }, // Invalid: empty name!
      ];

      const req = new NextRequest(
        'http://localhost:3000/api/v1/products/bulk-upload?tenant_slug=tokoku',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': 'super-secret-admin-token-123456',
          },
          body: JSON.stringify(payload),
        }
      );

      const res = await bulkUploadPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.success_count).toBe(1);
      expect(data.failure_count).toBe(1);
      expect(data.status).toBe('partial_success');
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(false);
      expect(data.results[1].statusCode).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // REGRESSION A: Legacy Deletion by Slug
  // ══════════════════════════════════════════════════════════════════════
  describe('REGRESSION A: Legacy Deletion by Slug', () => {
    it('prunes legacy metadata-only product identified by slug without leaving orphan entry', async () => {
      let updatedMetadataProducts: any[] | null = null;

      const tenantWithLegacy: CanonicalTenantContext = {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'tokoku',
        metadata: {
          products: [
            {
              id: 'legacy-alpha-99',
              slug: 'target-legacy-slug',
              name: 'Produk Target Hapus',
              price: 80000,
            },
            {
              id: 'legacy-beta-100',
              slug: 'tetap-ada-slug',
              name: 'Produk Tetap Ada',
              price: 120000,
            },
          ],
        },
      };

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: tenantWithLegacy.id, metadata: tenantWithLegacy.metadata },
                error: null,
              }),
              update: jest.fn((payload: any) => {
                updatedMetadataProducts = payload.metadata?.products;
                return {
                  eq: jest.fn().mockResolvedValue({ data: [{ id: tenantWithLegacy.id }], error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      // Call delete with the slug of the legacy item (not the id)
      const result = await deleteCanonicalProduct({
        tenant: tenantWithLegacy,
        productIdOrKey: 'target-legacy-slug',
        actor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(true);
      expect(result.deletedId).toBe('target-legacy-slug');
      expect(updatedMetadataProducts).toBeDefined();
      expect(updatedMetadataProducts).toHaveLength(1);
      expect(updatedMetadataProducts![0].slug).toBe('tetap-ada-slug');
      expect(updatedMetadataProducts!.some((p: any) => p.slug === 'target-legacy-slug')).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // REGRESSION B: Checkout Resolution by productTitle without productId
  // ══════════════════════════════════════════════════════════════════════
  describe('REGRESSION B: Checkout Resolution by productTitle without productId', () => {
    it('resolves product from canonical public.products using productTitle when productId is omitted', async () => {
      const result = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: '',
        productTitle: 'Starter Kit OnlineBoost',
        amount: 249000,
        customerName: 'Pembeli Sah',
        customerPhone: '081299990000',
        customerEmail: 'pembeli@example.com',
        paymentMethod: 'qris',
      });

      expect(result).toBeDefined();
      expect(result.orderId).toBeDefined();
      expect(result.grossAmount || result.gross_amount).toBe(249000);
    });

    it('fails closed with AMBIGUOUS_PRODUCT_TITLE if multiple canonical SQL products share the same title', async () => {
      await expect(
        createOrderAndInvoice({
          tenantSlug: 'tokoku',
          productId: '',
          productTitle: 'Duplicate Title Product',
          amount: 50000,
          customerName: 'Pembeli Ambigu',
          customerPhone: '081299992222',
          customerEmail: 'ambigu@example.com',
          paymentMethod: 'qris',
        })
      ).rejects.toThrow('AMBIGUOUS_PRODUCT_TITLE');
    });

    it('fails closed with LEGACY_PRODUCT_NOT_PURCHASABLE if productTitle is only found in legacy metadata', async () => {
      await expect(
        createOrderAndInvoice({
          tenantSlug: 'tokoku',
          productId: '',
          productTitle: 'Kursus SEO Legacy', // Only in tenant.metadata.products, not in SQL
          amount: 99000,
          customerName: 'Pembeli Legacy',
          customerPhone: '081299991111',
          customerEmail: 'pembeli.legacy@example.com',
          paymentMethod: 'qris',
        })
      ).rejects.toThrow('LEGACY_PRODUCT_NOT_PURCHASABLE');
    });
  });
});
