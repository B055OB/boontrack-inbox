/**
 * __tests__/routing/tenant_runtime_boundary.test.ts
 *
 * P0 Architectural Routing Boundary Acceptance Test Matrix (CTO Mandate)
 *
 * Matrix Coverage:
 * 1. app/margasari -> Resolves PUBLIC_SERVICE_V1 (Public Service Portal)
 * 2. shop/margasari -> REJECT / 404 (Domain Boundary Guard)
 * 3. shop/retail-tenant -> Resolves SHOP_V1 (Storefront)
 * 4. PUBLIC_SERVICE_V1 -> Capabilities `cart` & `checkout` bernilai FALSE
 * 5. template_code = 'INVALID_XYZ' -> Melempar Controlled Error, BUKAN StorefrontTemplate (No Silent Fallback)
 * 6. Regresi tenant Shop biasa tetap berjalan normal (buzzerukm, suhu-official, generic commerce)
 */

import {
  resolveTenantRuntime,
  assertTenantRuntimeAllowed,
  getTemplateCapabilities,
  resolveTemplate,
  executeStorefrontRuntimePipeline,
  TemplateNotCompatibleError,
  UnknownTemplateError,
} from '@/lib/resolvers/tenant-runtime-resolver';
import type { TenantRecord } from '@/lib/types/tenant-runtime';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('P0 Architectural Routing Boundary - CTO Mandate Acceptance Matrix', () => {

  // ── TEST 1: app/margasari -> Resolves PUBLIC_SERVICE_V1 ───────────────────
  describe('Matrix 1: app/margasari resolution', () => {
    it('resolves PUBLIC_SERVICE_V1 for app/margasari host path format', () => {
      const runtime = resolveTenantRuntime({
        host: 'app/margasari',
        tenant: { slug: 'margasari' },
      });

      expect(runtime.templateCode).toBe('PUBLIC_SERVICE_V1');
      expect(runtime.tenantKind).toBe('CUSTOM_APP');
      expect(runtime.businessType).toMatch(/PUBLIC_SERVICE|B2G/);
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);

      // Verify civic capabilities enabled
      expect(runtime.capabilities.service_catalog).toBe(true);
      expect(runtime.capabilities.citizen_request).toBe(true);
      expect(runtime.capabilities.complaint).toBe(true);
      expect(runtime.capabilities.announcement).toBe(true);
      expect(runtime.capabilities.public_information).toBe(true);
      expect(runtime.capabilities.document_request).toBe(true);
      expect(runtime.capabilities.ai_public_service_assistant).toBe(true);
      expect(runtime.capabilities.AI_PUBLIC_SERVICE_ASSISTANT).toBe(true);
    });

    it('resolves PUBLIC_SERVICE_V1 for app.boontrack.com host with tenant data', () => {
      const tenant: TenantRecord = {
        slug: 'margasari',
        name: 'Kelurahan Margasari',
        category: 'public_service',
        business_type: 'PUBLIC_SERVICE',
        template_code: 'PUBLIC_SERVICE_V1',
      };

      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant,
      });

      expect(runtime.templateCode).toBe('PUBLIC_SERVICE_V1');
      expect(runtime.tenantKind).toBe('CUSTOM_APP');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
    });
  });

  // ── TEST 2: shop/margasari -> REJECT / 404 ────────────────────────────────
  describe('Matrix 2: Domain Boundary Guard (shop/margasari REJECT / 404)', () => {
    it('rejects margasari on shop/margasari with 404 TEMPLATE_NOT_COMPATIBLE', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop/margasari',
        tenant: { slug: 'margasari' },
      });

      expect(runtime.isAllowedHost).toBe(false);
      expect(runtime.statusCode).toBe(404);
      expect(runtime.error).toBe('TEMPLATE_NOT_COMPATIBLE');
      expect(runtime.errorMessage).toContain('shop.boontrack.com');
    });

    it('rejects civic/custom app on shop.boontrack.com domain with 404', () => {
      const civicTenant: TenantRecord = {
        slug: 'civic-portal',
        category: 'public_service',
        business_type: 'PUBLIC_SERVICE',
        template_code: 'PUBLIC_SERVICE_V1',
      };

      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: civicTenant,
      });

      expect(runtime.isAllowedHost).toBe(false);
      expect(runtime.statusCode).toBe(404);
      expect(runtime.error).toBe('TEMPLATE_NOT_COMPATIBLE');
    });

    it('throws TemplateNotCompatibleError when throwOnError is true on shop domain mismatch', () => {
      expect(() => {
        resolveTenantRuntime({
          host: 'shop.boontrack.com',
          tenant: { slug: 'margasari' },
          throwOnError: true,
        });
      }).toThrow(TemplateNotCompatibleError);
    });

    it('throws 404 when assertTenantRuntimeAllowed is called on shop/margasari', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop/margasari',
        tenant: { slug: 'margasari' },
      });

      expect(() => assertTenantRuntimeAllowed(runtime)).toThrow(TemplateNotCompatibleError);
    });
  });

  // ── TEST 3: shop/retail-tenant -> Resolves SHOP_V1 ─────────────────────────
  describe('Matrix 3: shop/retail-tenant resolution', () => {
    it('resolves SHOP_V1 for shop/retail-tenant host path format', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop/retail-tenant',
        tenant: { slug: 'retail-tenant', business_type: 'RETAIL' },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.tenantKind).toBe('SAAS');
      expect(runtime.businessType).toBe('RETAIL');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);

      // Verify commerce capabilities enabled
      expect(runtime.capabilities.catalog).toBe(true);
      expect(runtime.capabilities.cart).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
      expect(runtime.capabilities.payment).toBe(true);
      expect(runtime.capabilities.order).toBe(true);
      expect(runtime.capabilities.sales_rep).toBe(true);
      expect(runtime.capabilities.shopping_bag).toBe(true);
      expect(runtime.capabilities.promo).toBe(true);
      expect(runtime.capabilities.price_badge).toBe(true);
      expect(runtime.capabilities.sales_assistant).toBe(true);
      expect(runtime.capabilities.ecommerce_order_flow).toBe(true);
    });

    it('resolves SHOP_V1 on shop.boontrack.com for standard retail merchant', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'tokoberkah',
          name: 'Toko Berkah',
          category: 'retail_physical',
          business_type: 'RETAIL',
        },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
      expect(runtime.capabilities.checkout).toBe(true);
    });
  });

  // ── TEST 4: PUBLIC_SERVICE_V1 -> Capabilities cart & checkout FALSE ───────
  describe('Matrix 4: Capability boundaries for PUBLIC_SERVICE_V1', () => {
    it('strictly sets cart, checkout, and ecommerce flow capabilities to FALSE', () => {
      const capabilities = getTemplateCapabilities('PUBLIC_SERVICE_V1');

      // MUST BE FALSE (CTO MANDATE)
      expect(capabilities.cart).toBe(false);
      expect(capabilities.checkout).toBe(false);
      expect(capabilities.shopping_bag).toBe(false);
      expect(capabilities.promo).toBe(false);
      expect(capabilities.price_badge).toBe(false);
      expect(capabilities.sales_assistant).toBe(false);
      expect(capabilities.ecommerce_order_flow).toBe(false);
      expect(capabilities.payment).toBe(false);
      expect(capabilities.order).toBe(false);
      expect(capabilities.sales_rep).toBe(false);

      // MUST BE TRUE
      expect(capabilities.service_catalog).toBe(true);
      expect(capabilities.citizen_request).toBe(true);
      expect(capabilities.complaint).toBe(true);
      expect(capabilities.announcement).toBe(true);
      expect(capabilities.public_information).toBe(true);
      expect(capabilities.document_request).toBe(true);
      expect(capabilities.ai_public_service_assistant).toBe(true);
      expect(capabilities.AI_PUBLIC_SERVICE_ASSISTANT).toBe(true);
    });

    it('enforces capabilities when resolved through resolveTenantRuntime', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'kelurahan-margasari',
          template_code: 'PUBLIC_SERVICE_V1',
        },
      });

      expect(runtime.capabilities.cart).toBe(false);
      expect(runtime.capabilities.checkout).toBe(false);
      expect(runtime.capabilities.shopping_bag).toBe(false);
      expect(runtime.capabilities.ecommerce_order_flow).toBe(false);
      expect(runtime.capabilities.service_catalog).toBe(true);
      expect(runtime.capabilities.citizen_request).toBe(true);
    });
  });

  // ── TEST 5: template_code = 'INVALID_XYZ' -> Controlled Error, NOT StorefrontTemplate ──
  describe('Matrix 5: No Silent Fallback for invalid or unknown template codes', () => {
    it('resolves UNKNOWN_TEMPLATE and error status when template_code is INVALID_XYZ', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'custom-tenant',
          template_code: 'INVALID_XYZ',
        },
      });

      // NO SILENT FALLBACK TO SHOP_V1!
      expect(runtime.templateCode).not.toBe('SHOP_V1');
      expect(runtime.templateCode).toBe('UNKNOWN_TEMPLATE');
      expect(runtime.isAllowedHost).toBe(false);
      expect(runtime.statusCode).toBe(422);
      expect(runtime.error).toBe('UNKNOWN_TEMPLATE');
      expect(runtime.errorMessage).toContain('INVALID_XYZ');
    });

    it('throws UnknownTemplateError when throwOnError is true for invalid template', () => {
      expect(() => {
        resolveTenantRuntime({
          host: 'app.boontrack.com',
          tenant: {
            slug: 'invalid-test',
            template_code: 'INVALID_XYZ',
          },
          throwOnError: true,
        });
      }).toThrow(UnknownTemplateError);
    });

    it('throws UnknownTemplateError when assertTenantRuntimeAllowed is called', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'corrupt-tenant',
          template_code: 'UNKNOWN_CUSTOM_HACK',
        },
      });

      expect(() => assertTenantRuntimeAllowed(runtime)).toThrow(UnknownTemplateError);
    });

    it('rejects unknown template even on shop domain without falling back to Storefront', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'broken-merchant',
          template_code: 'NON_EXISTENT_THEME_404',
        },
      });

      expect(runtime.templateCode).toBe('UNKNOWN_TEMPLATE');
      expect(runtime.templateCode).not.toBe('SHOP_V1');
    });
  });

  // ── TEST 6: Regresi tenant Shop biasa tetap berjalan normal ────────────────
  describe('Matrix 6: Shop ordinary regression tests', () => {
    it('resolves buzzerukm normally with SHOP_V1 runtime', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'buzzerukm',
          name: 'Buzzer UKM Indonesia',
          category: 'service',
          business_type: 'RETAIL',
        },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.tenantKind).toBe('SAAS');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
      expect(runtime.capabilities.checkout).toBe(true);
      expect(runtime.capabilities.cart).toBe(true);
      expect(runtime.capabilities.payment).toBe(true);
    });

    it('resolves suhu-official normally with SHOP_V1 runtime', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'suhu-official',
          name: 'Suhu Official Store',
          category: 'digital',
          business_type: 'DIGITAL',
        },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
      expect(runtime.capabilities.catalog).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
    });

    it('resolves FNB merchant with SHOP_V1 runtime', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'kopi-kenangan-mantan',
          category: 'fnb',
          business_type: 'FNB',
        },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.businessType).toBe('FNB');
      expect(runtime.capabilities.cart).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
    });

    it('supports alternative positional arguments (host, tenant)', () => {
      const runtime = resolveTenantRuntime('shop.boontrack.com', {
        slug: 'retail-pos',
        business_type: 'RETAIL',
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
    });

    it('resolves DROP_V1 template code with full commerce capabilities', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'boon',
          name: 'BoonTrack Official Shop',
          template_code: 'DROP_V1',
        },
      });

      expect(runtime.templateCode).toBe('DROP_V1');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
      expect(runtime.capabilities.catalog).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
    });

    it('aliases legacy APP_SHOP template code to DROP_V1 seamlessly', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'boon',
          name: 'BoonTrack Official Shop',
          template_code: 'APP_SHOP',
        },
      });

      expect(runtime.templateCode).toBe('DROP_V1');
      expect(runtime.isAllowedHost).toBe(true);
      expect(runtime.statusCode).toBe(200);
      expect(runtime.capabilities.catalog).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
    });
  });

  // ── TEST 7: Fail-Closed Template Resolver (resolveTemplate) ───────────────
  describe('Matrix 7: Fail-Closed Template Resolver (CTO Mandate)', () => {
    it('rejects PUBLIC_SERVICE business when configured with SHOP_V1 (no silent fallback)', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'dinas-kesehatan',
          business_type: 'PUBLIC_SERVICE',
          template_code: 'SHOP_V1',
        },
      });

      const result = resolveTemplate(runtime);
      expect(result.status).toBe('ERROR');
      expect(result.error).toBe('TEMPLATE_INCOMPATIBLE');
      expect(result.statusCode).toBe(404);
      expect(result.errorMessage).toContain('Inkompatibilitas arsitektur');
    });

    it('rejects RETAIL commerce business when configured with PUBLIC_SERVICE_V1', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'kuras-toren-karawang',
          business_type: 'FIELD_SERVICE',
          template_code: 'PUBLIC_SERVICE_V1',
        },
      });

      const result = resolveTemplate(runtime);
      expect(result.status).toBe('ERROR');
      expect(result.error).toBe('TEMPLATE_INCOMPATIBLE');
      expect(result.statusCode).toBe(404);
      expect(result.errorMessage).toContain('Bisnis komersial');
    });

    it('rejects corrupt/unregistered sub-variant under SHOP_V1 with CORRUPT_CONFIG 422', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'toko-abc',
          business_type: 'RETAIL',
          template_code: 'SHOP_V1',
          metadata: {
            selected_template: 'dr_anak_schema_leak',
          },
        },
      });

      const result = resolveTemplate(runtime);
      expect(result.status).toBe('ERROR');
      expect(result.error).toBe('CORRUPT_CONFIG');
      expect(result.statusCode).toBe(422);
      expect(result.errorMessage).toContain('Sub-varian template');
    });

    it('successfully resolves valid subvariants (storefront, personal, microsite)', () => {
      const runtimeStore = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'store-1',
          template_code: 'SHOP_V1',
          metadata: { selected_template: 'storefront' },
        },
      });
      expect(resolveTemplate(runtimeStore).status).toBe('SUCCESS');
      expect(resolveTemplate(runtimeStore).subVariant).toBe('storefront');

      const runtimePersonal = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'coach-andi',
          template_code: 'SHOP_V1',
          metadata: { selected_template: 'personal' },
        },
      });
      expect(resolveTemplate(runtimePersonal).status).toBe('SUCCESS');
      expect(resolveTemplate(runtimePersonal).subVariant).toBe('personal');

      const runtimeMicro = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'bio-funnel',
          template_code: 'SHOP_V1',
          metadata: { selected_template: 'microsite' },
        },
      });
      expect(resolveTemplate(runtimeMicro).status).toBe('SUCCESS');
      expect(resolveTemplate(runtimeMicro).subVariant).toBe('microsite');
    });
  });

  // ── TEST 8: Canonical Runtime Pipeline (executeStorefrontRuntimePipeline) ─
  describe('Matrix 8: Canonical Runtime Pipeline Sequential Flow', () => {
    it('executes Host ➔ Tenant Resolver ➔ TenantRuntimeContext ➔ TemplateResolver', () => {
      const pipeline = executeStorefrontRuntimePipeline({
        host: 'shop.boontrack.com',
        tenantSlug: 'tokoberkah',
        tenantRecord: {
          id: 'tenant-uuid-12345',
          slug: 'tokoberkah',
          name: 'Toko Berkah',
          business_type: 'RETAIL',
          template_code: 'SHOP_V1',
        },
      });

      expect(pipeline.isReady).toBe(true);
      expect(pipeline.runtime.tenantId).toBe('tenant-uuid-12345');
      expect(pipeline.runtime.templateCode).toBe('SHOP_V1');
      expect(pipeline.templateResult.status).toBe('SUCCESS');
      expect(pipeline.templateResult.subVariant).toBe('storefront');
    });

    it('fails closed when tenantRecord is null (tenant not in database)', () => {
      const pipeline = executeStorefrontRuntimePipeline({
        host: 'shop.boontrack.com',
        tenantSlug: 'unregistered-store',
        tenantRecord: null,
      });

      expect(pipeline.isReady).toBe(false);
      expect(pipeline.runtime.statusCode).toBe(404);
      expect(pipeline.templateResult.status).toBe('ERROR');
      expect(pipeline.error).toContain('tidak ditemukan di database');
    });
  });

  // ── TEST 9: Scoped Cache Key Header & Sensitive Anti-Cache Headers ───────
  describe('Matrix 9: Scoped Cache Key Headers & Sensitive Anti-Cache', () => {
    it('enforces private, no-store on sensitive API endpoints', async () => {
      const req = new NextRequest('https://shop.boontrack.com/api/v1/orders/ORD-123', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.headers.get('cache-control')).toBe('private, no-store, no-cache, must-revalidate');
      expect(res.headers.get('pragma')).toBe('no-cache');
    });

    it('enforces private, no-store on checkout, admin, and dashboard routes', async () => {
      const checkoutReq = new NextRequest('https://shop.boontrack.com/checkout/order-999', {
        headers: { host: 'shop.boontrack.com' },
      });
      const checkoutRes = await middleware(checkoutReq);
      expect(checkoutRes.headers.get('cache-control')).toBe('private, no-store, no-cache, must-revalidate');

      const adminReq = new NextRequest('https://shop.boontrack.com/admin', {
        headers: { host: 'shop.boontrack.com' },
      });
      const adminRes = await middleware(adminReq);
      expect(adminRes.headers.get('cache-control')).toBe('private, no-store, no-cache, must-revalidate');
    });

    it('attaches x-tenant-slug, x-tenant-id, and Cache-Tag on shop.boontrack.com storefront requests', async () => {
      const req = new NextRequest('https://shop.boontrack.com/tokoberkah', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.headers.get('x-tenant-slug')).toBe('tokoberkah');
      expect(res.headers.get('cache-tag')).toBe('tenant-tokoberkah');
      expect(res.headers.get('x-tenant-id')).toBeDefined();
    });
  });
});
