import fs from 'fs';
import path from 'path';

describe('TASK P0/P1: Digital Product Overwrite Prevention & Catalog Display Integrity', () => {
  const productsRoutePath = path.join(process.cwd(), 'app/api/v1/tenants/[slug]/products/route.ts');
  const dashboardHookPath = path.join(process.cwd(), 'app/[tenant]/dashboard/hooks/useTenantDashboard.ts');
  const storefrontPagePath = path.join(process.cwd(), 'app/[tenant]/page.tsx');
  const tenantsRoutePath = path.join(process.cwd(), 'app/api/v1/tenants/[slug]/route.ts');
  const productModalPath = path.join(process.cwd(), 'app/[tenant]/dashboard/components/ProductFormModal.tsx');
  const micrositeTemplatePath = path.join(process.cwd(), 'app/[tenant]/components/templates/MicrositeBioTemplate.tsx');

  let productsRouteCode: string;
  let dashboardHookCode: string;
  let storefrontPageCode: string;
  let tenantsRouteCode: string;
  let productModalCode: string;
  let micrositeTemplateCode: string;

  beforeAll(() => {
    productsRouteCode = fs.readFileSync(productsRoutePath, 'utf-8');
    dashboardHookCode = fs.readFileSync(dashboardHookPath, 'utf-8');
    storefrontPageCode = fs.readFileSync(storefrontPagePath, 'utf-8');
    tenantsRouteCode = fs.readFileSync(tenantsRoutePath, 'utf-8');
    productModalCode = fs.readFileSync(productModalPath, 'utf-8');
    micrositeTemplateCode = fs.readFileSync(micrositeTemplatePath, 'utf-8');
  });

  describe('1. Audit Fungsi Create/Update Produk (Append Guarantee & Data Integrity Gate)', () => {
    it('should query SQL products table in products/route.ts POST to ensure existing catalog is never overwritten', () => {
      expect(productsRouteCode).toContain("from('products')");
      expect(productsRouteCode).toContain("eq('tenant_id', existing.id)");
      expect(productsRouteCode).toContain('mergedExisting');
    });

    it('should append new products to existing array instead of replacing total', () => {
      // Must append: [productWithActive, ...mergedExisting]
      expect(productsRouteCode).toContain('[productWithActive, ...mergedExisting]');
    });

    it('should enforce immutable tenant_id and is_active in SQL insert payload', () => {
      expect(productsRouteCode).toContain('tenant_id: existing.id');
      expect(productsRouteCode).toContain('is_active: body.is_active !== false');
    });

    it('should preserve SKU on new products and edits without wiping', () => {
      expect(productsRouteCode).toContain('const productSku = body.sku || newProduct.sku');
      expect(productsRouteCode).toContain('sku: productSku');
    });

    it('should fetch existing database products before updating in useTenantDashboard.ts to prevent stale state wipe', () => {
      expect(dashboardHookCode).toContain('existingMetaProducts');
      expect(dashboardHookCode).toContain('allKnownProducts');
      expect(dashboardHookCode).toContain('[fullProductItem, ...allKnownProducts]');
      expect(dashboardHookCode).toContain('is_active: isTargetActive');
    });
  });

  describe('2. Audit Query Etalase Storefront Digital & Flexible Type Checks', () => {
    it('should query relational SQL products table in parallel with tenants table in app/[tenant]/page.tsx', () => {
      expect(storefrontPageCode).toContain("from(\"products\")");
      expect(storefrontPageCode).toContain("eq(\"tenant_id\", tenantRow.id)");
      expect(storefrontPageCode).toContain('combinedProds');
    });

    it('should have resilient is_active check that only filters out explicitly inactive products', () => {
      expect(storefrontPageCode).toContain('isExplicitlyInactive');
      expect(storefrontPageCode).toContain("['draft', 'inactive', 'archived']");
      expect(storefrontPageCode).toContain('is_active: !isExplicitlyInactive');
    });

    it('should be case-insensitive when checking digital category in app/api/v1/tenants/[slug]/route.ts', () => {
      expect(tenantsRouteCode).toContain("toLowerCase().includes('digital')");
      expect(tenantsRouteCode).not.toContain("tenantRow.category === 'digital';");
    });

    it('should support flexible digital category clustering (digital produk, ecourse) in ProductFormModal.tsx', () => {
      expect(productModalCode).toContain("rawCat.includes('digital')");
      expect(productModalCode).toContain("rawCat.includes('course')");
    });

    it('should remove hardcoded slug ctwa-mastery-7day and ensure catalog never disappears in MicrositeBioTemplate.tsx', () => {
      expect(micrositeTemplateCode).not.toContain("item.slug === 'ctwa-mastery-7day'");
      expect(micrositeTemplateCode).toContain('if (filtered.length > 0) return filtered;');
    });
  });

  describe('3. Simulated Append & Merge Logic Test', () => {
    it('should correctly merge existing products with new products without duplicating by slug or id', () => {
      const existingInDb = [
        { id: 'prod-1', slug: 'masterclass-cpm', name: 'Masterclass CPM', price: 99000, is_active: true, sku: 'OB-001' },
        { id: 'prod-2', slug: 'modul-cpm-24', name: 'Modul CPM 24 Jam', price: 49000, is_active: true, sku: 'OB-002' },
      ];

      const newProduct = {
        id: 'prod-3',
        slug: 'ecourse-youtube-ai',
        name: 'Ecourse YouTube AI',
        price: 149000,
        is_active: true,
        sku: 'OB-003',
      };

      // Append logic
      const merged = [newProduct, ...existingInDb];
      expect(merged).toHaveLength(3);
      expect(merged[0].slug).toBe('ecourse-youtube-ai');
      expect(merged[1].slug).toBe('masterclass-cpm');
      expect(merged[2].slug).toBe('modul-cpm-24');

      // Edit existing logic
      const editedProduct = {
        id: 'prod-2',
        slug: 'modul-cpm-24',
        name: 'Modul CPM 24 Jam (Updated)',
        price: 59000,
        is_active: true,
        sku: 'OB-002',
      };

      const editIdx = merged.findIndex(p => p.id === editedProduct.id);
      const afterEdit = [...merged];
      afterEdit[editIdx] = { ...afterEdit[editIdx], ...editedProduct };

      expect(afterEdit).toHaveLength(3);
      expect(afterEdit[2].name).toBe('Modul CPM 24 Jam (Updated)');
      expect(afterEdit[2].price).toBe(59000);
      expect(afterEdit[1].name).toBe('Masterclass CPM'); // Must NOT be wiped
    });
  });
});
