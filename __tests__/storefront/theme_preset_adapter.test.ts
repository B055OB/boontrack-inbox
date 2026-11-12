import {
  ALL_STOREFRONT_PRESETS,
  CATALOG_PRESETS,
  LEGACY_VISUAL_THEME_IDS,
  LEGACY_VISUAL_THEME_TOKENS_MAP,
  MICROSITE_PRESETS,
  PRESET_MODE_MAP,
  PROFILE_PRESETS,
  type LegacyTenantThemeMetadata,
  type StorefrontPresetId,
} from '@/types/storefront-presets';
import { normalizeStorefrontTheme } from '@/lib/adapters/storefrontThemeAdapter';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const prop = (obj as Record<string, unknown>)[key];
    if (prop !== null && (typeof prop === 'object' || typeof prop === 'function') && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
  return obj;
}

describe('normalizeStorefrontTheme (Phase 2 Storefront Theme Adapter)', () => {
  describe('1. Contract invariants & empty/null handling', () => {
    it.each([null, undefined, {}, [] as unknown as LegacyTenantThemeMetadata])(
      'returns deterministic retail_classic + clean_minimal defaults for empty input (%p)',
      (input) => {
        const result = normalizeStorefrontTheme(input);

        expect(result.contractVersion).toBe(2);
        expect(result.mode).toBe('catalog');
        expect(result.preset).toBe('retail_classic');
        expect(result.legacyVisualTheme).toBe('clean_minimal');
        expect(result.tokens).toEqual(LEGACY_VISUAL_THEME_TOKENS_MAP.clean_minimal);
        expect(Object.keys(result.tokens).sort()).toEqual([
          'borderRadius',
          'brandColor',
          'buttonStyle',
          'fontFamily',
          'mode',
        ]);
        expect(result.catalog).toEqual({
          showProducts: true,
          productDisplayMode: 'all',
          featuredProductIds: [],
          flagshipMode: false,
        });
        expect(result.links).toEqual([]);
        expect(result.sourceTrace.resolvedFrom).toBe('default_fallback');
        expect(result.sourceTrace.auroraFallbackCorrected).toBe(true);
      },
    );

    it('recognizes all 10 canonical presets (3 catalog + 4 microsite + 3 profile) via storefront_v2', () => {
      expect(CATALOG_PRESETS).toHaveLength(3);
      expect(MICROSITE_PRESETS).toHaveLength(4);
      expect(PROFILE_PRESETS).toHaveLength(3);
      expect(ALL_STOREFRONT_PRESETS).toHaveLength(10);

      ALL_STOREFRONT_PRESETS.forEach((preset: StorefrontPresetId) => {
        const normalized = normalizeStorefrontTheme({
          storefront_v2: {
            version: 2,
            preset,
          },
        });

        expect(normalized.preset).toBe(preset);
        expect(normalized.mode).toBe(PRESET_MODE_MAP[preset]);
        expect(normalized.sourceTrace.resolvedFrom).toBe('v2_preset');
      });
    });
  });

  describe('2. aurora_gradient preview-vs-live anomaly protection', () => {
    it('enforces clean_minimal (NOT aurora_gradient) when visual_theme is unset or unknown on microsite', () => {
      const unsetMicrosite = normalizeStorefrontTheme({
        template: 'microsite',
        microsite: {
          headline: 'Link Resmi Toko',
          buttons: [{ title: 'Order', url: 'https://wa.me/628111111111' }],
        },
      });

      expect(unsetMicrosite.preset).toBe('minimalist');
      expect(unsetMicrosite.legacyVisualTheme).toBe('clean_minimal');
      expect(unsetMicrosite.tokens.brandColor).toBe('#2563EB');
      expect(unsetMicrosite.sourceTrace.auroraFallbackCorrected).toBe(true);

      const unknownTheme = normalizeStorefrontTheme({
        template: 'default',
        visual_theme: 'corrupt_legacy_gradient_v99',
      });

      expect(unknownTheme.legacyVisualTheme).toBe('clean_minimal');
      expect(unknownTheme.sourceTrace.auroraFallbackCorrected).toBe(true);
    });

    it('preserves aurora_gradient when explicitly configured in database metadata', () => {
      const explicitAurora = normalizeStorefrontTheme({
        selected_template: 'microsite',
        theme: {
          theme_id: 'aurora_gradient',
        },
      });

      expect(explicitAurora.mode).toBe('microsite');
      expect(explicitAurora.preset).toBe('minimalist');
      expect(explicitAurora.legacyVisualTheme).toBe('aurora_gradient');
      expect(explicitAurora.tokens).toEqual(LEGACY_VISUAL_THEME_TOKENS_MAP.aurora_gradient);
      expect(explicitAurora.sourceTrace.auroraFallbackCorrected).toBe(false);
    });
  });

  describe('3. Legacy template precedence & preset inference', () => {
    it('respects selected_template > storefront_template > template > theme.template precedence', () => {
      const result = normalizeStorefrontTheme({
        selected_template: 'personal',
        storefront_template: 'microsite',
        template: 'default',
        theme: { template: 'default' },
      });

      expect(result.mode).toBe('profile');
      expect(result.preset).toBe('consultant');
      expect(result.sourceTrace.inferredPresetFrom).toBe('selected_template');
    });

    it('maps microsite + flagship / grid layout signals to retail preset with catalog active', () => {
      const gridMicrosite = normalizeStorefrontTheme({
        storefront_template: 'microsite',
        microsite_product_layout: 'grid',
        featured_product_ids: ['prod-1', 'prod-2', 'prod-1'],
      });

      expect(gridMicrosite.mode).toBe('microsite');
      expect(gridMicrosite.preset).toBe('retail');
      expect(gridMicrosite.catalog.flagshipMode).toBe(true);
      expect(gridMicrosite.catalog.showProducts).toBe(true);
      expect(gridMicrosite.catalog.productDisplayMode).toBe('featured');
      expect(gridMicrosite.catalog.featuredProductIds).toEqual(['prod-1', 'prod-2']);
    });

    it('supports storefront_style hints for bento, bold, editorial_shop, and profile variants', () => {
      expect(
        normalizeStorefrontTheme({ template: 'microsite', storefront_style: 'bento' }).preset,
      ).toBe('bento');
      expect(
        normalizeStorefrontTheme({ template: 'microsite', storefront_style: 'bold' }).preset,
      ).toBe('bold');
      expect(
        normalizeStorefrontTheme({ template: 'default', storefront_style: 'editorial' }).preset,
      ).toBe('editorial_shop');
      expect(
        normalizeStorefrontTheme({ template: 'personal', storefront_style: 'studio' }).preset,
      ).toBe('studio');
      expect(
        normalizeStorefrontTheme({ template: 'personal', storefront_style: 'corporate' }).preset,
      ).toBe('corporate');
    });
  });

  describe('4. All 6 legacy visual themes & bounded token validation', () => {
    it.each(LEGACY_VISUAL_THEME_IDS)('maps legacy visual theme %s cleanly', (themeId) => {
      const result = normalizeStorefrontTheme({ visual_theme: themeId });
      expect(result.legacyVisualTheme).toBe(themeId);
      expect(result.tokens).toEqual(LEGACY_VISUAL_THEME_TOKENS_MAP[themeId]);
      expect(result.sourceTrace.auroraFallbackCorrected).toBe(false);
    });

    it('expands 3-digit hex brandColor, accepts valid token overrides, and drops invalid hex/tokens', () => {
      const validOverrides = normalizeStorefrontTheme({
        visual_theme: 'midnight_luxe',
        theme: {
          brand_color: '#f60',
          mode: 'dark',
          font_family: 'Plus Jakarta Sans',
          border_radius: 'full',
          button_style: 'bordered',
        },
      });

      expect(validOverrides.tokens).toEqual({
        brandColor: '#FF6600',
        mode: 'dark',
        fontFamily: 'plus_jakarta_sans',
        borderRadius: 'pill',
        buttonStyle: 'outline',
      });

      const invalidOverrides = normalizeStorefrontTheme({
        visual_theme: 'bold_performance',
        theme: {
          primary_color: 'javascript:alert(1)',
          mode: 'sepia',
          font_family: 'Comic Sans MS',
          border_radius: '999px',
          button_style: 'blinking',
        },
      });

      expect(invalidOverrides.tokens).toEqual(LEGACY_VISUAL_THEME_TOKENS_MAP.bold_performance);
    });
  });

  describe('5. Fragmented show_products key normalization (11+ keys)', () => {
    const fragmentedCases: Array<[string, string, LegacyTenantThemeMetadata, boolean]> = [
      [
        'storefront_v2.catalog.showProducts',
        'storefront_v2.catalog.showProducts',
        { template: 'microsite', storefront_v2: { catalog: { showProducts: true } } },
        true,
      ],
      [
        'sections.catalog.is_active',
        'sections.catalog',
        { template: 'default', sections: { catalog: { is_active: false } } },
        false,
      ],
      [
        'sections.products.enabled',
        'sections.products',
        { template: 'microsite', sections: { products: { enabled: true } } },
        true,
      ],
      [
        'storefront_sections.catalog.visible',
        'storefront_sections.catalog',
        { template: 'default', storefront_sections: { catalog: { visible: false } } },
        false,
      ],
      [
        'storefront_sections.products (boolean)',
        'storefront_sections.products',
        { template: 'microsite', storefront_sections: { products: true } },
        true,
      ],
      [
        'show_products ("false" string)',
        'show_products',
        { template: 'default', show_products: 'false' },
        false,
      ],
      [
        'display_catalog (numeric 1)',
        'display_catalog',
        { template: 'microsite', display_catalog: 1 },
        true,
      ],
      [
        'microsite_show_products',
        'microsite_show_products',
        { template: 'microsite', microsite_show_products: true },
        true,
      ],
      [
        'theme.show_products',
        'theme.show_products',
        { template: 'default', theme: { show_products: false } },
        false,
      ],
      [
        'theme_config.show_products ("1" string)',
        'theme_config.show_products',
        { template: 'microsite', theme_config: { show_products: '1' } },
        true,
      ],
      [
        'microsite.show_products',
        'microsite.show_products',
        { template: 'microsite', microsite: { show_products: true } },
        true,
      ],
      [
        'microsite_settings.show_products',
        'microsite_settings.show_products',
        { template: 'microsite', microsite_settings: { show_products: true } },
        true,
      ],
    ];

    it.each(fragmentedCases)(
      'resolves %s -> sourceKey=%s, showProducts=%s',
      (_label, expectedSourceKey, payload, expectedBool) => {
        const result = normalizeStorefrontTheme(payload);
        expect(result.catalog.showProducts).toBe(expectedBool);
        expect(result.catalog.productDisplayMode).toBe(expectedBool ? 'all' : 'hidden');
        expect(result.sourceTrace.showProductsSourceKey).toBe(expectedSourceKey);
      },
    );

    it('defaults microsite showProducts to false when unset and no featured/flagship cues exist', () => {
      const result = normalizeStorefrontTheme({ template: 'microsite' });
      expect(result.catalog.showProducts).toBe(false);
      expect(result.catalog.productDisplayMode).toBe('hidden');
      expect(result.sourceTrace.showProductsSourceKey).toBeNull();
    });
  });

  describe('6. Links normalization, legacy synthesis & XSS filtering', () => {
    it('filters unsafe schemes, inactive entries, and keeps safe normalized links', () => {
      const result = normalizeStorefrontTheme({
        template: 'microsite',
        microsite: {
          buttons: [
            { id: 'b1', title: 'XSS Link', url: 'javascript:alert(document.cookie)' },
            { id: 'b2', title: 'Obfuscated XSS', url: ' \u0007JaVaScRiPt:alert(1)' },
            { id: 'b3', title: 'Data URI', url: 'data:text/html,<script>alert(1)</script>' },
            { id: 'b4', title: 'Protocol Relative', url: '//evil.attacker.com/phish' },
            { id: 'b5', title: 'Disabled', url: 'https://boontrack.com', isActive: false },
            { id: 'b6', title: 'Chat Admin', url: 'wa.me/6281234567890', is_highlighted: true },
            { id: 'b7', title: 'Catalog Page', url: '/produk/unggulan' },
            { id: 'b8', title: 'Support Email', url: 'mailto:cs@example.com' },
          ],
        },
      });

      expect(result.links).toEqual([
        {
          id: 'b6',
          label: 'Chat Admin',
          url: 'https://wa.me/6281234567890',
          kind: 'whatsapp',
          isHighlighted: true,
          sortOrder: 0,
        },
        {
          id: 'b7',
          label: 'Catalog Page',
          url: '/produk/unggulan',
          kind: 'custom',
          isHighlighted: false,
          sortOrder: 1,
        },
        {
          id: 'b8',
          label: 'Support Email',
          url: 'mailto:cs@example.com',
          kind: 'email',
          isHighlighted: false,
          sortOrder: 2,
        },
      ]);
    });

    it('synthesizes links from legacy links.* map when button arrays are absent', () => {
      const result = normalizeStorefrontTheme({
        template: 'microsite',
        links: {
          whatsapp: '0812-3456-7890',
          instagram: 'https://instagram.com/tokoku',
          website: 'www.tokoku.id',
          malicious: 'javascript:void(0)',
        },
      });

      expect(result.links).toEqual([
        {
          id: 'synth-whatsapp-0',
          label: 'Chat WhatsApp',
          url: 'https://wa.me/6281234567890',
          kind: 'whatsapp',
          isHighlighted: true,
          sortOrder: 0,
        },
        {
          id: 'synth-instagram-1',
          label: 'Instagram',
          url: 'https://instagram.com/tokoku',
          kind: 'instagram',
          isHighlighted: false,
          sortOrder: 1,
        },
        {
          id: 'synth-website-2',
          label: 'Website',
          url: 'https://www.tokoku.id',
          kind: 'website',
          isHighlighted: false,
          sortOrder: 2,
        },
      ]);
    });
  });

  describe('7. Strict immutability & determinism guarantees', () => {
    it('never mutates deeply frozen input metadata and returns identical results across invocations', () => {
      const rawPayload: LegacyTenantThemeMetadata = deepFreeze({
        selected_template: 'microsite',
        visual_theme: 'warm_terra',
        is_flagship: true,
        featured_product_ids: ['sku-a', 'sku-b', 'sku-a'],
        sections: {
          catalog: { is_active: true },
        },
        theme: {
          brand_color: '#1D4ED8',
          font_family: 'DM Sans',
        },
        microsite: {
          headline: 'Studio Katalog',
          bio: 'Official Storefront',
          buttons: [
            { id: '1', title: 'WhatsApp CS', url: 'https://wa.me/62811223344', isHighlighted: true },
          ],
        },
      });

      const snapshotBefore = JSON.stringify(rawPayload);

      const firstRun = normalizeStorefrontTheme(rawPayload);
      const secondRun = normalizeStorefrontTheme(rawPayload);

      expect(JSON.stringify(rawPayload)).toBe(snapshotBefore);
      expect(firstRun).toEqual(secondRun);
      expect(firstRun.preset).toBe('retail');
      expect(firstRun.mode).toBe('microsite');
      expect(firstRun.tokens.brandColor).toBe('#1D4ED8');
      expect(firstRun.tokens.fontFamily).toBe('dm_sans');
      expect(firstRun.catalog.featuredProductIds).toEqual(['sku-a', 'sku-b']);
      expect(firstRun.profile).toEqual({
        headline: 'Studio Katalog',
        bio: 'Official Storefront',
        ctaLabel: null,
      });
    });
  });
});
