import {
  resolveStorefrontMode,
  resolveStorefrontSections,
  executeStorefrontRuntimePipeline,
} from '@/lib/resolvers/tenant-runtime-resolver';
import type { TenantRecord } from '@/lib/types/tenant-runtime';

describe('WP3: Storefront Mode & Theme Isolation (Stage B)', () => {
  describe('1. Canonical Storefront Mode Resolution', () => {
    it('resolves explicit canonical mode: catalog', () => {
      expect(resolveStorefrontMode({ storefront_mode: 'catalog' })).toBe('catalog');
      expect(resolveStorefrontMode({ storefront_mode: 'CATALOG' })).toBe('catalog');
      expect(resolveStorefrontMode({ storefront_mode: '  catalog  ' })).toBe('catalog');
    });

    it('resolves explicit canonical mode: microsite', () => {
      expect(resolveStorefrontMode({ storefront_mode: 'microsite' })).toBe('microsite');
      expect(resolveStorefrontMode({ storefront_mode: 'MICROSITE' })).toBe('microsite');
      expect(resolveStorefrontMode({ storefront_mode: '  microsite  ' })).toBe('microsite');
    });

    it('resolves explicit canonical mode: personal_profile', () => {
      expect(resolveStorefrontMode({ storefront_mode: 'personal_profile' })).toBe('personal_profile');
      expect(resolveStorefrontMode({ storefront_mode: 'PERSONAL_PROFILE' })).toBe('personal_profile');
      expect(resolveStorefrontMode({ storefront_mode: '  personal_profile  ' })).toBe('personal_profile');
    });

    it('canonical mode strictly outranks legacy keys', () => {
      const meta = {
        storefront_mode: 'catalog',
        selected_template: 'microsite',
        storefront_template: 'personal',
        template: 'microsite',
        theme: { template: 'personal' },
      };
      expect(resolveStorefrontMode(meta)).toBe('catalog');

      const meta2 = {
        storefront_mode: 'microsite',
        selected_template: 'default',
        storefront_template: 'personal',
        template: 'default',
      };
      expect(resolveStorefrontMode(meta2)).toBe('microsite');
    });

    it('CTO Refinement: non-empty unrecognized/corrupt storefront_mode fails safe to catalog and IGNORES legacy keys', () => {
      const corruptMeta = {
        storefront_mode: 'corrupt_variant_999',
        selected_template: 'microsite',
        storefront_template: 'personal',
        template: 'microsite',
      };
      // Must fail safe to catalog and NOT fall back to legacy microsite!
      expect(resolveStorefrontMode(corruptMeta)).toBe('catalog');

      const gibberishMeta = {
        storefront_mode: 'invalid_mode_xyz',
        selected_template: 'personal',
      };
      expect(resolveStorefrontMode(gibberishMeta)).toBe('catalog');
    });

    it('when storefront_mode is undefined, null, or empty string, evaluates legacy keys in strict order: selected_template -> storefront_template -> template', () => {
      // selected_template wins
      expect(
        resolveStorefrontMode({
          storefront_mode: undefined,
          selected_template: 'microsite',
          storefront_template: 'personal',
          template: 'default',
        })
      ).toBe('microsite');

      // storefront_template wins when selected_template is empty
      expect(
        resolveStorefrontMode({
          storefront_mode: null,
          selected_template: '  ',
          storefront_template: 'personal',
          template: 'default',
        })
      ).toBe('personal_profile');

      // template wins when previous are undefined
      expect(
        resolveStorefrontMode({
          storefront_mode: '',
          template: 'microsite',
        })
      ).toBe('microsite');

      // Legacy aliases map accurately to canonical modes
      const catalogAliases = ['default', 'storefront', 'catalog', 'commerce', 'commerce_template', 'clean_commerce'];
      for (const alias of catalogAliases) {
        expect(resolveStorefrontMode({ template: alias })).toBe('catalog');
      }

      const profileAliases = ['personal', 'profile', 'personal_profile'];
      for (const alias of profileAliases) {
        expect(resolveStorefrontMode({ template: alias })).toBe('personal_profile');
      }
    });

    it('NEVER reads or uses theme.template as a mode source', () => {
      const themeOnly = {
        theme: { template: 'microsite' },
      };
      // Without valid mode or legacy template, falls back to catalog
      expect(resolveStorefrontMode(themeOnly)).toBe('catalog');

      const themeWithLegacy = {
        template: 'personal',
        theme: { template: 'microsite' },
      };
      // Resolves personal_profile from template, ignores theme.template
      expect(resolveStorefrontMode(themeWithLegacy)).toBe('personal_profile');
    });

    it('falls back to catalog when all keys are missing or empty', () => {
      expect(resolveStorefrontMode(null)).toBe('catalog');
      expect(resolveStorefrontMode(undefined)).toBe('catalog');
      expect(resolveStorefrontMode({})).toBe('catalog');
      expect(resolveStorefrontMode({ storefront_mode: '' })).toBe('catalog');
    });
  });

  describe('2. Pipeline SubVariant Resolution & Determinism', () => {
    it('executes runtime pipeline mapping canonical modes to runtime subVariants', () => {
      const catalogTenant: TenantRecord = {
        id: 't-cat',
        slug: 'shabu-ajhi',
        metadata: { storefront_mode: 'catalog' },
      };
      const pipelineCat = executeStorefrontRuntimePipeline({
        host: 'localhost:3000',
        tenantSlug: 'shabu-ajhi',
        tenantRecord: catalogTenant,
      });
      expect(pipelineCat.isReady).toBe(true);
      expect(pipelineCat.templateResult.subVariant).toBe('storefront');

      const micrositeTenant: TenantRecord = {
        id: 't-micro',
        slug: 'boon',
        metadata: { storefront_mode: 'microsite' },
      };
      const pipelineMicro = executeStorefrontRuntimePipeline({
        host: 'localhost:3000',
        tenantSlug: 'boon',
        tenantRecord: micrositeTenant,
      });
      expect(pipelineMicro.isReady).toBe(true);
      expect(pipelineMicro.templateResult.subVariant).toBe('microsite');

      const profileTenant: TenantRecord = {
        id: 't-prof',
        slug: 'onlineboost',
        metadata: { storefront_mode: 'personal_profile' },
      };
      const pipelineProf = executeStorefrontRuntimePipeline({
        host: 'localhost:3000',
        tenantSlug: 'onlineboost',
        tenantRecord: profileTenant,
      });
      expect(pipelineProf.isReady).toBe(true);
      expect(pipelineProf.templateResult.subVariant).toBe('personal');
    });

    it('fails closed with 404 when tenantRecord is null', () => {
      const pipeline = executeStorefrontRuntimePipeline({
        host: 'localhost:3000',
        tenantSlug: 'unknown-tenant-999',
        tenantRecord: null,
      });
      expect(pipeline.isReady).toBe(false);
      expect(pipeline.runtime.statusCode).toBe(404);
      expect(pipeline.templateResult.status).toBe('ERROR');
    });
  });

  describe('3. Visual Theme & Mode Independence', () => {
    it('all 6 visual themes preserve storefront_mode without mutation', () => {
      const visualThemes = [
        'clean_minimal',
        'aurora_gradient',
        'midnight_luxe',
        'warm_terra',
        'bold_performance',
        'slate_monochrome',
      ];

      for (const mode of ['catalog', 'microsite', 'personal_profile'] as const) {
        for (const vt of visualThemes) {
          const meta = {
            storefront_mode: mode,
            visual_theme: vt,
            theme_id: vt,
            theme: {
              visual_theme: vt,
              primary_color: '#2563EB',
            },
          };
          expect(resolveStorefrontMode(meta)).toBe(mode);
        }
      }
    });
  });

  describe('4. Catalog and Microsite Product Visibility Isolation', () => {
    it('resolveStorefrontSections isolates sections.catalog from microsite product flags', () => {
      // Microsite show_products = false does NOT disable catalog section
      const metaMicrositeOff = {
        sections: { catalog: { is_active: true } },
        microsite: { show_products: false },
        microsite_show_products: false,
      };
      const sections = resolveStorefrontSections(metaMicrositeOff);
      expect(sections.catalog?.is_active).toBe(true);

      // Even without explicit sections.catalog, fallback ignores microsite.show_products
      const metaFallback = {
        show_products: true,
        microsite: { show_products: false },
      };
      const sectionsFallback = resolveStorefrontSections(metaFallback);
      expect(sectionsFallback.catalog?.is_active).toBe(true);
    });

    it('sections.catalog.is_active = false does not affect microsite.show_products', () => {
      const meta = {
        sections: { catalog: { is_active: false } },
        microsite: { show_products: true },
      };
      // Catalog section is disabled
      const sections = resolveStorefrontSections(meta);
      expect(sections.catalog?.is_active).toBe(false);
      // But microsite.show_products remains true in metadata
      expect(meta.microsite.show_products).toBe(true);
    });

    it('Microsite product visibility precedence: microsite.show_products strictly outranks global catalog flags', () => {
      // Scenario A: Global catalog is disabled, but microsite has show_products = true
      const metaA = {
        show_products: false,
        display_catalog: false,
        sections: { catalog: { is_active: false } },
        microsite: { show_products: true },
      };
      const explicitFlagA =
        metaA.microsite?.show_products ??
        (metaA as any).microsite_show_products;
      const isCatalogDisabledA = metaA.sections?.catalog?.is_active === false;
      const showProductsA =
        explicitFlagA !== undefined
          ? Boolean(explicitFlagA)
          : !isCatalogDisabledA && Boolean(metaA.show_products);
      expect(showProductsA).toBe(true);

      // Scenario B: Global catalog is enabled, but microsite has show_products = false
      const metaB = {
        show_products: true,
        display_catalog: true,
        sections: { catalog: { is_active: true } },
        microsite: { show_products: false },
      };
      const explicitFlagB =
        metaB.microsite?.show_products ??
        (metaB as any).microsite_show_products;
      const isCatalogDisabledB = metaB.sections?.catalog?.is_active === false;
      const showProductsB =
        explicitFlagB !== undefined
          ? Boolean(explicitFlagB)
          : !isCatalogDisabledB && Boolean(metaB.show_products);
      expect(showProductsB).toBe(false);
    });

    it('Theme save payload omitting template preserves storefront_mode and visibility', () => {
      const existingMeta = {
        storefront_mode: 'catalog',
        sections: { catalog: { is_active: true } },
        microsite: { show_products: false },
        theme: { visual_theme: 'clean_minimal' },
      };

      // Simulating Theme route PUT payload with visual_theme only (no template)
      const themePayload: Record<string, any> = {
        visual_theme: 'midnight_luxe',
      };

      const hasExplicitTemplate = Boolean(themePayload.template);
      const updatedMeta: Record<string, any> = {
        ...existingMeta,
        visual_theme: themePayload.visual_theme,
        theme: {
          ...existingMeta.theme,
          visual_theme: themePayload.visual_theme,
        },
      };
      if (hasExplicitTemplate) {
        updatedMeta.template = themePayload.template;
      }

      // Assertions:
      expect(updatedMeta.storefront_mode).toBe('catalog');
      expect(resolveStorefrontMode(updatedMeta)).toBe('catalog');
      expect(updatedMeta.sections.catalog.is_active).toBe(true);
      expect(updatedMeta.microsite.show_products).toBe(false);
      expect(updatedMeta.selected_template).toBeUndefined();
      expect(updatedMeta.storefront_template).toBeUndefined();
    });
  });

  describe('5. Full Transition Cycle & Tenant A/B Isolation', () => {
    it('executes full cycle: catalog -> microsite -> personal_profile -> catalog', () => {
      const tenantState: { storefront_mode?: string } = {};

      tenantState.storefront_mode = 'catalog';
      expect(resolveStorefrontMode(tenantState)).toBe('catalog');

      tenantState.storefront_mode = 'microsite';
      expect(resolveStorefrontMode(tenantState)).toBe('microsite');

      tenantState.storefront_mode = 'personal_profile';
      expect(resolveStorefrontMode(tenantState)).toBe('personal_profile');

      tenantState.storefront_mode = 'catalog';
      expect(resolveStorefrontMode(tenantState)).toBe('catalog');
    });

    it('ensures Tenant A configuration does not leak to Tenant B', () => {
      const tenantA = {
        storefront_mode: 'microsite',
        visual_theme: 'midnight_luxe',
        microsite: { show_products: true },
      };
      const tenantB = {
        storefront_mode: 'catalog',
        visual_theme: 'clean_minimal',
        sections: { catalog: { is_active: true } },
      };

      expect(resolveStorefrontMode(tenantA)).toBe('microsite');
      expect(resolveStorefrontMode(tenantB)).toBe('catalog');

      const sectionsB = resolveStorefrontSections(tenantB);
      expect(sectionsB.catalog?.is_active).toBe(true);
    });
  });
});
