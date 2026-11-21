/**
 * STAGE B1: SHOP PAYMENT OPTIONS UI SHELL & SERVER TAMPER REJECTION TEST SUITE
 * CTO Limited Go Directive (21 November 2026)
 *
 * Verifies:
 * 1. UI Shell across all 6 modular product forms:
 *    - PhysicalRetailProductForm
 *    - DigitalProductForm
 *    - FnbCulinaryProductForm
 *    - FieldServiceProductForm
 *    - ProServiceProductForm
 *    - CreatorAgencyProductForm
 * 2. FULL_PREPAID active & selected by default as the ONLY selectable/submittable scheme.
 * 3. Gated schemes explicitly locked & disabled in UI:
 *    - DP_PREPAID (CORE-PAY-DP gated, disabled)
 *    - COD_FULL (CORE-COD gated, disabled)
 * 4. Preview labels show FULFILLMENT_HANDOVER and EVENT_RELATIVE_24H only (NO generic 7-day option).
 * 5. Strict server-side validation in canonical-product-writer.ts rejecting tampered
 *    DP_PREPAID or COD_FULL payloads with HTTP 403 and invalid schemes with HTTP 400.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  validatePaymentSchemePayload,
  upsertCanonicalProduct,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';
import { POST as productPostRoute } from '@/app/api/v1/tenants/[slug]/products/route';
import { PUT as productPutRoute, PATCH as productPatchRoute } from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import { POST as bulkUploadRoute } from '@/app/api/v1/products/bulk-upload/route';
import { NextRequest } from 'next/server';
import PaymentOptionsConfigSection, {
  STAGE_B1_ALLOWED_SCHEMES,
  STAGE_B1_PREVIEW_TRIGGERS,
} from '@/app/[tenant]/dashboard/components/modules/PaymentOptionsConfigSection';
import PhysicalRetailProductForm from '@/app/[tenant]/dashboard/components/modules/physical-retail/ProductForm';
import DigitalProductForm from '@/app/[tenant]/dashboard/components/modules/digital-product/ProductForm';
import FnbCulinaryProductForm from '@/app/[tenant]/dashboard/components/modules/fnb-culinary/ProductForm';
import FieldServiceProductForm from '@/app/[tenant]/dashboard/components/modules/field-service/ProductForm';
import ProServiceProductForm from '@/app/[tenant]/dashboard/components/modules/pro-service/ProductForm';
import CreatorAgencyProductForm from '@/app/[tenant]/dashboard/components/modules/creator-agency/ProductForm';
import { ProductItem } from '@/lib/product-catalog';

describe('STAGE B1: SHOP PAYMENT OPTIONS UI SHELL & TAMPER REJECTION', () => {
  const mockTenant: CanonicalTenantContext = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tokoku',
    category: 'digital',
    tier: 'PRO_SCALE',
    metadata: {
      products: [],
    },
  };

  const mockActor: CanonicalWriterActor = {
    actorId: 'usr-stage-b1',
    actorRole: 'OWNER',
    isInternalMachine: false,
  };

  beforeAll(() => {
    process.env.ADMIN_INTERNAL_SECRET = 'super-secret-admin-token-123456';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: SERVER-SIDE VALIDATION & TAMPER REJECTION (canonical-product-writer.ts)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Server-Side Payment Scheme Validation & Tamper Rejection', () => {
    it('allows valid FULL_PREPAID payload at top level', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_scheme: 'FULL_PREPAID',
      });
      expect(res.valid).toBe(true);
      expect(res.status).toBe(200);
      expect(res.scheme).toBe('FULL_PREPAID');
    });

    it('defaults to FULL_PREPAID when payment_scheme is omitted', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Standar',
        price: 50000,
      });
      expect(res.valid).toBe(true);
      expect(res.status).toBe(200);
      expect(res.scheme).toBe('FULL_PREPAID');
    });

    it('rejects tampered top-level payment_scheme: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper DP',
        price: 200000,
        payment_scheme: 'DP_PREPAID',
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
      expect(res.error).toContain('CORE-PAY-DP');
    });

    it('rejects tampered top-level payment_scheme: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper COD',
        price: 150000,
        payment_scheme: 'COD_FULL',
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
      expect(res.error).toContain('CORE-COD');
    });

    it('rejects tampered nested payment_options.scheme: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper Nested DP',
        price: 300000,
        payment_options: {
          scheme: 'DP_PREPAID',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
    });

    it('rejects tampered nested fulfillment_metadata.payment_options.scheme: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper Fulfillment COD',
        price: 400000,
        fulfillment_metadata: {
          payment_options: {
            scheme: 'COD_FULL',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
    });

    it('rejects tampered nested metadata.payment_scheme: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper Metadata DP',
        price: 250000,
        metadata: {
          payment_scheme: 'DP_PREPAID',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
    });

    it('rejects tampered allowed_schemes array containing DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper Array DP',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
          allowed_schemes: ['FULL_PREPAID', 'DP_PREPAID'],
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
    });

    it('rejects tampered allowed_schemes array containing COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Tamper Array COD',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
          allowed_schemes: ['COD_FULL'],
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
    });

    it('rejects unknown / invalid payment schemes with HTTP 400', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Unknown Scheme',
        price: 50000,
        payment_scheme: 'CRYPTO_ESCROW',
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.code).toBe('INVALID_PAYMENT_SCHEME');
      expect(res.error).toContain('CRYPTO_ESCROW');
    });

    // ── ADVERSARIAL MULTI-LOCATION TAMPER VALIDATION (STAGE B1-B) ──
    it('rejects adversarial mixed payload: top-level FULL_PREPAID with nested metadata.payment_options.scheme: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
          allowed_schemes: ['FULL_PREPAID'],
        },
        metadata: {
          payment_options: {
            scheme: 'DP_PREPAID',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
    });

    it('rejects adversarial mixed payload: top-level FULL_PREPAID with nested fulfillment_metadata.allowed_schemes containing COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
          allowed_schemes: ['FULL_PREPAID'],
        },
        fulfillment_metadata: {
          allowed_schemes: ['FULL_PREPAID', 'COD_FULL'],
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('rejects adversarial mixed payload: top-level FULL_PREPAID with nested single_page_config.payment_scheme: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_scheme: 'FULL_PREPAID',
        single_page_config: {
          payment_scheme: 'DP_PREPAID',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
    });

    it('rejects adversarial mixed payload: top-level FULL_PREPAID with nested single_page_config.payment_options.allowed_schemes: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_scheme: 'FULL_PREPAID',
        single_page_config: {
          payment_options: {
            allowed_schemes: ['COD_FULL'],
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('rejects unknown scheme in nested metadata while top-level is FULL_PREPAID with HTTP 400', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
        },
        metadata: {
          payment_scheme: 'CRYPTO_ESCROW',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.code).toBe('INVALID_PAYMENT_SCHEME');
      expect(res.error).toContain('CRYPTO_ESCROW');
    });

    it('rejects unknown scheme in nested fulfillment_metadata while top-level is FULL_PREPAID with HTTP 400', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_scheme: 'FULL_PREPAID',
        fulfillment_metadata: {
          allowed_schemes: ['BARTER_TRADE'],
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.code).toBe('INVALID_PAYMENT_SCHEME');
      expect(res.error).toContain('BARTER_TRADE');
    });

    it('rejects unknown scheme in nested single_page_config while top-level is FULL_PREPAID with HTTP 400', () => {
      const res = validatePaymentSchemePayload({
        name: 'Produk Uji',
        price: 100000,
        payment_scheme: 'FULL_PREPAID',
        single_page_config: {
          payment_options: {
            scheme: 'UNKNOWN_GATEWAY',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.code).toBe('INVALID_PAYMENT_SCHEME');
      expect(res.error).toContain('UNKNOWN_GATEWAY');
    });

    // ── STEP 1 B1-01: ADVERSARIAL DUAL-ALIAS (SNAKE_CASE & CAMELCASE) TESTS ──
    it('rejects top-level dual-alias attack: payment_options: FULL_PREPAID + paymentOptions: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Dual Alias DP',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
        },
        paymentOptions: {
          scheme: 'DP_PREPAID',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
    });

    it('rejects top-level dual-alias attack: payment_options: FULL_PREPAID + paymentOptions: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Dual Alias COD',
        price: 100000,
        payment_options: {
          scheme: 'FULL_PREPAID',
        },
        paymentOptions: {
          scheme: 'COD_FULL',
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('rejects nested metadata dual-alias attack: metadata.payment_options: FULL_PREPAID + metadata.paymentOptions: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Nested Meta Dual Alias',
        price: 100000,
        metadata: {
          payment_options: {
            scheme: 'FULL_PREPAID',
          },
          paymentOptions: {
            scheme: 'COD_FULL',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('rejects nested fulfillment_metadata dual-alias attack: fulfillment_metadata.payment_options: FULL_PREPAID + fulfillment_metadata.paymentOptions: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Nested Fulfillment Dual Alias',
        price: 100000,
        fulfillment_metadata: {
          payment_options: {
            scheme: 'FULL_PREPAID',
          },
          paymentOptions: {
            scheme: 'DP_PREPAID',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
    });

    it('rejects camelCase container alias fulfillmentMetadata.paymentOptions: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'CamelCase Container Alias',
        price: 100000,
        fulfillmentMetadata: {
          paymentOptions: {
            scheme: 'COD_FULL',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('rejects nested single_page_config dual-alias attack: single_page_config.payment_options: FULL_PREPAID + single_page_config.paymentOptions: DP_PREPAID with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'Nested SPC Dual Alias',
        price: 100000,
        single_page_config: {
          payment_options: {
            scheme: 'FULL_PREPAID',
          },
          paymentOptions: {
            scheme: 'DP_PREPAID',
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('DP_PREPAID');
    });

    it('rejects camelCase container alias singlePageConfig.paymentOptions: COD_FULL with HTTP 403', () => {
      const res = validatePaymentSchemePayload({
        name: 'CamelCase SPC Container Alias',
        price: 100000,
        singlePageConfig: {
          paymentOptions: {
            allowedSchemes: ['COD_FULL'],
          },
        },
      });
      expect(res.valid).toBe(false);
      expect(res.status).toBe(403);
      expect(res.code).toBe('PAYMENT_SCHEME_GATED');
      expect(res.error).toContain('COD_FULL');
    });

    it('enforces failure atomicity: upsertCanonicalProduct rejects dual-alias attack with zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Produk Dual Alias Attack',
          price: 150000,
          payment_options: {
            scheme: 'FULL_PREPAID',
            allowed_schemes: ['FULL_PREPAID'],
          },
          paymentOptions: {
            scheme: 'DP_PREPAID',
          },
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('enforces failure atomicity: upsertCanonicalProduct rejects DP_PREPAID with HTTP 403 with zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, metadata: mockTenant.metadata, updated_at: '2026-11-20T10:00:00.000Z' },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Buku Tampered DP',
          price: 150000,
          payment_scheme: 'DP_PREPAID',
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('PAYMENT_SCHEME_GATED');
      // Proof of failure atomicity: SQL upsert was never invoked
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('enforces failure atomicity: upsertCanonicalProduct rejects COD_FULL with HTTP 403 with zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Produk Tampered COD',
          price: 120000,
          payment_scheme: 'COD_FULL',
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('enforces failure atomicity: upsertCanonicalProduct rejects adversarial mixed payload with zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Produk Mixed Attack',
          price: 150000,
          payment_options: {
            scheme: 'FULL_PREPAID',
            allowed_schemes: ['FULL_PREPAID'],
          },
          metadata: {
            payment_options: {
              scheme: 'DP_PREPAID',
            },
          },
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('enforces failure atomicity: upsertCanonicalProduct rejects unknown nested scheme with zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Produk Unknown Attack',
          price: 150000,
          payment_options: {
            scheme: 'FULL_PREPAID',
          },
          single_page_config: {
            payment_scheme: 'GOLD_BARTER',
          },
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('INVALID_PAYMENT_SCHEME');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('persistence cleanliness: allows valid FULL_PREPAID, strips hints, and does NOT inject unratified payment keys into fulfillment_metadata or metadata', async () => {
      let savedSqlRowPayload: any = null;
      let updatedTenantMetadata: any = null;

      const mockSqlUpsert = jest.fn((payload: any) => {
        savedSqlRowPayload = payload;
        return {
          select: jest.fn().mockResolvedValue({
            data: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                tenant_id: mockTenant.id,
                title: 'Produk Bersih',
                name: 'Produk Bersih',
                slug: 'produk-bersih',
                price: 100000,
                promo_price: 0,
                category: 'digital',
                product_type: 'DIGITAL_FILE',
                is_active: true,
                requires_shipping: false,
                fulfillment_metadata: payload.fulfillment_metadata,
                updated_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        };
      });

      const mockTenantUpdate = jest.fn((payload: any) => {
        updatedTenantMetadata = payload.metadata;
        return {
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({ data: [{ id: mockTenant.id }], error: null }),
            }),
          }),
        };
      });

      const mockSupabaseAdmin = {
        from: jest.fn((table: string) => {
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              upsert: mockSqlUpsert,
            };
          }
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, metadata: mockTenant.metadata, updated_at: '2026-11-20T10:00:00.000Z' },
                error: null,
              }),
              update: mockTenantUpdate,
            };
          }
          return {};
        }),
      };

      const result = await upsertCanonicalProduct({
        tenant: mockTenant,
        rawInput: {
          name: 'Produk Bersih',
          price: 100000,
          payment_scheme: 'FULL_PREPAID',
          payment_options: {
            scheme: 'FULL_PREPAID',
            allowed_schemes: ['FULL_PREPAID'],
          },
          metadata: {
            payment_scheme: 'FULL_PREPAID',
            payment_options: {
              scheme: 'FULL_PREPAID',
              allowed_schemes: ['FULL_PREPAID'],
            },
          },
          fulfillment_metadata: {
            payment_scheme: 'FULL_PREPAID',
            payment_options: {
              scheme: 'FULL_PREPAID',
              allowed_schemes: ['FULL_PREPAID'],
            },
          },
        },
        actor: mockActor,
        customSupabaseAdmin: mockSupabaseAdmin,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);

      // Verify SQL payload has ZERO unratified keys
      expect(savedSqlRowPayload).toBeDefined();
      expect(savedSqlRowPayload.payment_scheme).toBeUndefined();
      expect(savedSqlRowPayload.payment_options).toBeUndefined();
      expect(savedSqlRowPayload.allowed_schemes).toBeUndefined();
      expect(savedSqlRowPayload.fulfillment_metadata?.payment_scheme).toBeUndefined();
      expect(savedSqlRowPayload.fulfillment_metadata?.payment_options).toBeUndefined();
      expect(savedSqlRowPayload.fulfillment_metadata?.allowed_schemes).toBeUndefined();

      // Verify Projected Metadata has ZERO unratified keys
      expect(updatedTenantMetadata).toBeDefined();
      const projectedItem = updatedTenantMetadata.products[0];
      expect(projectedItem).toBeDefined();
      expect(projectedItem.payment_scheme).toBeUndefined();
      expect(projectedItem.payment_options).toBeUndefined();
      expect(projectedItem.fulfillment_metadata?.payment_scheme).toBeUndefined();
      expect(projectedItem.fulfillment_metadata?.payment_options).toBeUndefined();

      // Verify Result Product has ZERO unratified keys
      expect(result.product.payment_scheme).toBeUndefined();
      expect(result.product.payment_options).toBeUndefined();
      expect(result.product.fulfillment_metadata?.payment_scheme).toBeUndefined();
      expect(result.product.fulfillment_metadata?.payment_options).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 4: ROUTE-LEVEL TAMPER REJECTION ACROSS ALL ENTRYPOINTS (POST, PUT, PATCH, BULK)
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Route-Level Payment Tamper Rejection (POST, PUT, PATCH, bulk)', () => {
    it('Route POST /api/v1/tenants/[slug]/products rejects tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              upsert: mockSqlUpsert,
              insert: mockSqlUpsert,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          name: 'Produk Tamper Post',
          price: 100000,
          payment_options: { scheme: 'FULL_PREPAID' },
          metadata: {
            payment_options: { scheme: 'DP_PREPAID' },
          },
        }),
      });

      const res = await productPostRoute(req, { params: Promise.resolve({ slug: 'tokoku' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('Route PUT /api/v1/tenants/[slug]/products/[id] rejects tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpdate = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              update: mockSqlUpdate,
              upsert: mockSqlUpdate,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products/prod-123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          name: 'Produk Tamper PUT',
          price: 100000,
          fulfillment_metadata: {
            allowed_schemes: ['FULL_PREPAID', 'COD_FULL'],
          },
        }),
      });

      const res = await productPutRoute(req, { params: Promise.resolve({ slug: 'tokoku', id: 'prod-123' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpdate).not.toHaveBeenCalled();
    });

    it('Route PATCH /api/v1/tenants/[slug]/products/[id] rejects tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpdate = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              update: mockSqlUpdate,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products/prod-123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          single_page_config: {
            payment_scheme: 'DP_PREPAID',
          },
        }),
      });

      const res = await productPatchRoute(req, { params: Promise.resolve({ slug: 'tokoku', id: 'prod-123' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpdate).not.toHaveBeenCalled();
    });

    it('Route POST /api/v1/products/bulk-upload rejects tampered items with HTTP 403 before any write occurs', async () => {
      const mockSqlUpsert = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              upsert: mockSqlUpsert,
              insert: mockSqlUpsert,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/products/bulk-upload?tenant_slug=tokoku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify([
          { name: 'Produk A', price: 50000 },
          { name: 'Produk B', price: 60000, metadata: { payment_scheme: 'DP_PREPAID' } },
        ]),
      });

      const res = await bulkUploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('Route POST /api/v1/tenants/[slug]/products rejects dual-alias tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpsert = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              upsert: mockSqlUpsert,
              insert: mockSqlUpsert,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          name: 'Produk Dual Alias Post',
          price: 100000,
          payment_options: { scheme: 'FULL_PREPAID' },
          paymentOptions: { scheme: 'DP_PREPAID' },
        }),
      });

      const res = await productPostRoute(req, { params: Promise.resolve({ slug: 'tokoku' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });

    it('Route PUT /api/v1/tenants/[slug]/products/[id] rejects dual-alias tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpdate = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              update: mockSqlUpdate,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products/prod-123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          name: 'Produk Dual Alias PUT',
          price: 100000,
          fulfillment_metadata: {
            payment_options: { scheme: 'FULL_PREPAID' },
          },
          fulfillmentMetadata: {
            paymentOptions: { scheme: 'COD_FULL' },
          },
        }),
      });

      const res = await productPutRoute(req, { params: Promise.resolve({ slug: 'tokoku', id: 'prod-123' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpdate).not.toHaveBeenCalled();
    });

    it('Route PATCH /api/v1/tenants/[slug]/products/[id] rejects dual-alias tampered payload with HTTP 403 and zero SQL write', async () => {
      const mockSqlUpdate = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              update: mockSqlUpdate,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/tenants/tokoku/products/prod-123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify({
          single_page_config: {
            payment_options: { scheme: 'FULL_PREPAID' },
          },
          singlePageConfig: {
            paymentOptions: { scheme: 'DP_PREPAID' },
          },
        }),
      });

      const res = await productPatchRoute(req, { params: Promise.resolve({ slug: 'tokoku', id: 'prod-123' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpdate).not.toHaveBeenCalled();
    });

    it('Route POST /api/v1/products/bulk-upload rejects dual-alias tampered items with HTTP 403 before any write occurs', async () => {
      const mockSqlUpsert = jest.fn();
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue({
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: mockTenant.id, slug: mockTenant.slug, metadata: mockTenant.metadata, category: 'digital', tier: 'PRO_SCALE' },
                error: null,
              }),
            };
          }
          if (table === 'products') {
            return {
              upsert: mockSqlUpsert,
              insert: mockSqlUpsert,
            };
          }
          return {};
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/products/bulk-upload?tenant_slug=tokoku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'super-secret-admin-token-123456',
        },
        body: JSON.stringify([
          { name: 'Produk Clean', price: 50000 },
          {
            name: 'Produk Dual Attack',
            price: 60000,
            metadata: {
              payment_options: { scheme: 'FULL_PREPAID' },
              paymentOptions: { scheme: 'COD_FULL' },
            },
          },
        ]),
      });

      const res = await bulkUploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('PAYMENT_SCHEME_GATED');
      expect(mockSqlUpsert).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: UI SHELL & COMPONENT SPECIFICATIONS (PaymentOptionsConfigSection)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. PaymentOptionsConfigSection Component UI Specifications', () => {
    it('defines STAGE_B1_ALLOWED_SCHEMES with FULL_PREPAID only', () => {
      expect(STAGE_B1_ALLOWED_SCHEMES).toEqual(['FULL_PREPAID']);
    });

    it('defines STAGE_B1_PREVIEW_TRIGGERS with FULFILLMENT_HANDOVER and EVENT_RELATIVE_24H only', () => {
      expect(STAGE_B1_PREVIEW_TRIGGERS).toEqual([
        'FULFILLMENT_HANDOVER',
        'EVENT_RELATIVE_24H',
      ]);
      // Verify no generic 7-day option in triggers
      expect(STAGE_B1_PREVIEW_TRIGGERS).not.toContain('7_DAYS');
      expect(STAGE_B1_PREVIEW_TRIGGERS).not.toContain('GENERIC_7_DAYS');
    });

    it('renders FULL_PREPAID as active, checked, and default', () => {
      const productForm: ProductItem = {
        id: 1,
        name: 'Tes Produk',
        price: 100000,
        category: 'digital',
        description: 'Deskripsi tes',
        image: '',
        stock: 100,
        payment_scheme: 'FULL_PREPAID',
      };
      const setProductForm = jest.fn();

      const html = renderToStaticMarkup(
        React.createElement(PaymentOptionsConfigSection, {
          productForm,
          setProductForm,
        })
      );

      // Check header and badge
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');

      // Check FULL_PREPAID card is checked and active
      expect(html).toContain('value="FULL_PREPAID"');
      expect(html).toContain('checked=""');
      expect(html).toContain('Bayar Penuh di Awal (FULL_PREPAID)');
      expect(html).toContain('Aktif (Default)');
    });

    it('renders DP_PREPAID as visibly locked/disabled with CORE-PAY-DP Gated badge', () => {
      const productForm: ProductItem = {
        id: 1,
        name: 'Tes Produk',
        price: 100000,
        category: 'digital',
        description: 'Deskripsi tes',
        image: '',
        stock: 100,
      };
      const setProductForm = jest.fn();

      const html = renderToStaticMarkup(
        React.createElement(PaymentOptionsConfigSection, {
          productForm,
          setProductForm,
        })
      );

      // Check DP_PREPAID card is disabled
      expect(html).toContain('value="DP_PREPAID"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('Uang Muka / Bertahap (DP_PREPAID)');
      expect(html).toContain('CORE-PAY-DP Gated');
    });

    it('renders COD_FULL as visibly locked/disabled with CORE-COD Gated badge', () => {
      const productForm: ProductItem = {
        id: 1,
        name: 'Tes Produk',
        price: 100000,
        category: 'digital',
        description: 'Deskripsi tes',
        image: '',
        stock: 100,
      };
      const setProductForm = jest.fn();

      const html = renderToStaticMarkup(
        React.createElement(PaymentOptionsConfigSection, {
          productForm,
          setProductForm,
        })
      );

      // Check COD_FULL card is disabled
      expect(html).toContain('value="COD_FULL"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('Bayar di Tempat (COD_FULL)');
      expect(html).toContain('CORE-COD Gated');
    });

    it('renders preview labels for FULFILLMENT_HANDOVER and EVENT_RELATIVE_24H only (NO 7-day option)', () => {
      const productForm: ProductItem = {
        id: 1,
        name: 'Tes Produk',
        price: 100000,
        category: 'digital',
        description: 'Deskripsi tes',
        image: '',
        stock: 100,
      };
      const setProductForm = jest.fn();

      const html = renderToStaticMarkup(
        React.createElement(PaymentOptionsConfigSection, {
          productForm,
          setProductForm,
        })
      );

      // Verify exact settlement trigger preview labels are rendered
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');

      // Verify that no generic 7-day option exists in rendered HTML
      expect(html).not.toMatch(/7[- ]?day/i);
      expect(html).not.toMatch(/7[- ]?hari/i);
      expect(html).not.toContain('H+7');
      expect(html).not.toContain('H-7');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: INTEGRATION ACROSS ALL 6 MODULAR PRODUCT FORMS
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Integration Across All 6 Modular Product Forms', () => {
    const dummySetForm = jest.fn();
    const dummyOnMetadata = jest.fn();

    it('Form 1: PhysicalRetailProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 101,
        name: 'Kaos Polos Premium',
        price: 120000,
        product_type: 'PHYSICAL',
        category: 'fisik',
        description: 'Bahan combed 30s',
        image: '',
        stock: 50,
        weight_grams: 250,
      };

      const html = renderToStaticMarkup(
        React.createElement(PhysicalRetailProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      // Verify logistics section exists
      expect(html).toContain('Pengaturan Logistik, Ekspedisi &amp; Berat Paket');
      // Verify PaymentOptionsConfigSection is rendered inside PhysicalRetailProductForm
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });

    it('Form 2: DigitalProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 102,
        name: 'E-Course Next.js Pro',
        price: 350000,
        product_type: 'DIGITAL',
        category: 'digital',
        description: 'Video HD 10 Modul',
        image: '',
        stock: 9999,
        download_url: 'https://drive.google.com/test',
      };

      const html = renderToStaticMarkup(
        React.createElement(DigitalProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      expect(html).toContain('Payload File / Link Unduhan (Akses Digital Instan)');
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });

    it('Form 3: FnbCulinaryProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 103,
        name: 'Paket Rendang Padang 500g',
        price: 95000,
        product_type: 'FOOD',
        category: 'kuliner',
        description: 'Rendang daging sapi empuk',
        image: '',
        stock: 20,
        weight_grams: 500,
      };

      const html = renderToStaticMarkup(
        React.createElement(FnbCulinaryProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      expect(html).toContain('Spesifikasi Menu Kuliner, Ketahanan &amp; Porsi');
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });

    it('Form 4: FieldServiceProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 104,
        name: 'Jasa Cuci AC Split',
        price: 85000,
        product_type: 'FIELD_SERVICE',
        category: 'jasa',
        description: 'Cuci AC bersih & cek freon',
        image: '',
        stock: 9999,
      };

      const html = renderToStaticMarkup(
        React.createElement(FieldServiceProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      expect(html).toContain('Koordinasi Layanan Jasa Lapangan');
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });

    it('Form 5: ProServiceProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 105,
        name: 'Konsultasi Bisnis 1-on-1',
        price: 500000,
        product_type: 'PROFESSIONAL_SERVICE',
        category: 'konsultasi',
        description: 'Sesi 60 menit via Zoom',
        image: '',
        stock: 9999,
      };

      const html = renderToStaticMarkup(
        React.createElement(ProServiceProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      expect(html).toContain('Sesi Konsultasi &amp; Reservasi Jadwal Privat');
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });

    it('Form 6: CreatorAgencyProductForm integrates PaymentOptionsConfigSection', () => {
      const productForm: ProductItem = {
        id: 106,
        name: 'Paket Endorsement TikTok 1 Video',
        price: 1500000,
        product_type: 'AGENCY',
        category: 'agency',
        description: 'Video Reels & TikTok 60 Detik',
        image: '',
        stock: 9999,
      };

      const html = renderToStaticMarkup(
        React.createElement(CreatorAgencyProductForm, {
          productForm,
          setProductForm: dummySetForm,
          onMetadataChange: dummyOnMetadata,
        })
      );

      expect(html).toContain('Paket Kreator, Live Streaming &amp; Campaign Agency');
      expect(html).toContain('Skema Pembayaran Produk (Payment Policy)');
      expect(html).toContain('FULL_PREPAID Aktif');
      expect(html).toContain('CORE-PAY-DP Gated');
      expect(html).toContain('CORE-COD Gated');
      expect(html).toContain('FULFILLMENT_HANDOVER');
      expect(html).toContain('EVENT_RELATIVE_24H');
      expect(html).not.toMatch(/7[- ]?day/i);
    });
  });
});
