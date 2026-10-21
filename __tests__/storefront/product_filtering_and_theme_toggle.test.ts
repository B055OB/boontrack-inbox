import {
  resolveStorefrontSections,
  isSectionActive,
} from '@/lib/resolvers/tenant-runtime-resolver';

describe('Storefront Product Filtering & Theme Toggle Audit', () => {
  describe('Product Filtering Logic (Zero Draft/Hidden Leakage)', () => {
    const isExplicitlyInactive = (item: any): boolean => {
      if (!item || typeof item !== 'object') return true;
      if (item.is_active === false) return true;
      const status = String(item.status || '').toLowerCase().trim();
      return ['draft', 'inactive', 'archived', 'hidden', 'sembunyi'].includes(status);
    };

    const filterActiveProducts = (products: any[]): any[] => {
      return products.filter((p) => !isExplicitlyInactive(p));
    };

    it('keeps active products without status or with status ACTIVE', () => {
      const products = [
        { id: 'prod-1', name: 'Produk Aktif 1', price: 100000, is_active: true },
        { id: 'prod-2', name: 'Produk Aktif 2', price: 150000, status: 'ACTIVE', is_active: true },
        { id: 'prod-3', name: 'Produk Aktif 3', price: 200000 },
      ];

      const filtered = filterActiveProducts(products);
      expect(filtered).toHaveLength(3);
      expect(filtered.map((p) => p.id)).toEqual(['prod-1', 'prod-2', 'prod-3']);
    });

    it('strictly filters out products with is_active = false', () => {
      const products = [
        { id: 'prod-1', name: 'Produk Aktif', price: 100000, is_active: true },
        { id: 'prod-2', name: 'Produk Nonaktif', price: 150000, is_active: false },
      ];

      const filtered = filterActiveProducts(products);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('prod-1');
    });

    it('strictly filters out products with status DRAFT, HIDDEN, ARCHIVED, INACTIVE, or SEMBUNYI', () => {
      const products = [
        { id: 'prod-1', name: 'Produk Aktif', price: 100000, status: 'ACTIVE', is_active: true },
        { id: 'prod-2', name: 'Produk Draft', price: 50000, status: 'DRAFT', is_active: true },
        { id: 'prod-3', name: 'Produk Hidden', price: 60000, status: 'HIDDEN', is_active: true },
        { id: 'prod-4', name: 'Produk Archived', price: 70000, status: 'ARCHIVED', is_active: true },
        { id: 'prod-5', name: 'Produk Sembunyi', price: 80000, status: 'SEMBUNYI', is_active: true },
        { id: 'prod-6', name: 'Produk Inactive', price: 90000, status: 'INACTIVE', is_active: true },
      ];

      const filtered = filterActiveProducts(products);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('prod-1');
    });

    it('handles case-insensitive status values properly', () => {
      const products = [
        { id: 'prod-1', name: 'Produk draft lowercase', status: 'draft' },
        { id: 'prod-2', name: 'Produk hidden mixed case', status: 'Hidden' },
        { id: 'prod-3', name: 'Produk active lowercase', status: 'active', is_active: true },
      ];

      const filtered = filterActiveProducts(products);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('prod-3');
    });
  });

  describe('Theme Toggle Audit: Sembunyikan / Tampilkan Produk', () => {
    it('enables catalog section by default when no toggles are specified', () => {
      const sections = resolveStorefrontSections({});
      expect(sections.catalog?.is_active).toBe(true);
      expect(isSectionActive(sections.catalog)).toBe(true);
    });

    it('disables catalog section when metadata.show_products is false', () => {
      const sections = resolveStorefrontSections({ show_products: false });
      expect(sections.catalog?.is_active).toBe(false);
      expect(isSectionActive(sections.catalog)).toBe(false);
    });

    it('disables catalog section when metadata.display_catalog is false', () => {
      const sections = resolveStorefrontSections({ display_catalog: false });
      expect(sections.catalog?.is_active).toBe(false);
      expect(isSectionActive(sections.catalog)).toBe(false);
    });

    it('disables catalog section when theme.show_products is false', () => {
      const sections = resolveStorefrontSections({
        theme: { show_products: false },
      });
      expect(sections.catalog?.is_active).toBe(false);
      expect(isSectionActive(sections.catalog)).toBe(false);
    });

    it('disables catalog section when theme_config.show_products is false', () => {
      const sections = resolveStorefrontSections({
        theme_config: { show_products: false },
      });
      expect(sections.catalog?.is_active).toBe(false);
      expect(isSectionActive(sections.catalog)).toBe(false);
    });

    it('disables catalog section when sections.catalog.is_active is false', () => {
      const sections = resolveStorefrontSections({
        sections: {
          catalog: { is_active: false },
        },
      });
      expect(sections.catalog?.is_active).toBe(false);
      expect(isSectionActive(sections.catalog)).toBe(false);
    });

    it('enables catalog section when show_products is explicitly true', () => {
      const sections = resolveStorefrontSections({
        show_products: true,
        theme: { show_products: true },
      });
      expect(sections.catalog?.is_active).toBe(true);
      expect(isSectionActive(sections.catalog)).toBe(true);
    });
  });

  describe('Storefront & Microsite Catalog Visibility Rules', () => {
    it('evaluates whether catalog block should render based on showProducts and active items', () => {
      const shouldRenderCatalog = (
        showProductsFlag: boolean,
        catalogSectionActive: boolean,
        productsCount: number
      ): boolean => {
        if (!showProductsFlag) return false;
        if (!catalogSectionActive) return false;
        return productsCount > 0;
      };

      // Scenario 1: showProducts = true, catalog is_active = true, products > 0 => RENDER
      expect(shouldRenderCatalog(true, true, 5)).toBe(true);

      // Scenario 2: showProducts = false (user toggled off in dashboard) => DO NOT RENDER
      expect(shouldRenderCatalog(false, true, 5)).toBe(false);

      // Scenario 3: catalogSectionActive = false => DO NOT RENDER
      expect(shouldRenderCatalog(true, false, 5)).toBe(false);

      // Scenario 4: No active products left (all draft/hidden) => DO NOT RENDER
      expect(shouldRenderCatalog(true, true, 0)).toBe(false);
    });
  });
});
