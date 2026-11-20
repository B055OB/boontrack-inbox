/**
 * Declarative Storefront Theme & Preset Contract (Phase 2 — Single Source of Truth)
 *
 * Pure TypeScript contract & immutable lookup tables for BoonTrack multi-tenant storefronts.
 * Zero runtime I/O, zero database queries, and zero global mutation side-effects.
 *
 * Baseline Checkpoint: 08c7368 (Storefront Theme Harmonization Phase 2 / Task A.1)
 */

// ---------------------------------------------------------------------------
// 1. Declarative Layout Modes & Preset Identifiers (10 Canonical Presets)
// ---------------------------------------------------------------------------

/** Catalog storefronts optimized for physical/digital product browsing and checkout. */
export const CATALOG_PRESETS = [
  'retail_classic',
  'bento_commerce',
  'editorial_shop',
] as const;
export type CatalogPresetId = (typeof CATALOG_PRESETS)[number];

/** Microsite / link-in-bio storefronts optimized for creators and traffic hubs. */
export const MICROSITE_PRESETS = [
  'minimalist',
  'bento',
  'retail',
  'bold',
] as const;
export type MicrositePresetId = (typeof MICROSITE_PRESETS)[number];

/** Personal / organizational profile storefronts for agencies, studios, & consultants. */
export const PROFILE_PRESETS = [
  'corporate',
  'studio',
  'consultant',
] as const;
export type ProfilePresetId = (typeof PROFILE_PRESETS)[number];

/** Complete union of the 10 canonical storefront presets across all 3 modes. */
export const ALL_STOREFRONT_PRESETS = [
  ...CATALOG_PRESETS,
  ...MICROSITE_PRESETS,
  ...PROFILE_PRESETS,
] as const;
export type StorefrontPresetId = (typeof ALL_STOREFRONT_PRESETS)[number];

/** Canonical top-level layout family derived strictly from the active preset (WP3 Stage B). */
export type StorefrontCanonicalMode = 'catalog' | 'microsite' | 'personal_profile';
export type StorefrontLayoutMode = 'catalog' | 'microsite' | 'personal_profile' | 'profile';

/** Maps every canonical preset to its governing layout mode. */
export const PRESET_MODE_MAP: Readonly<Record<StorefrontPresetId, StorefrontLayoutMode>> = {
  // Catalog (3)
  retail_classic: 'catalog',
  bento_commerce: 'catalog',
  editorial_shop: 'catalog',
  // Microsite (4)
  minimalist: 'microsite',
  bento: 'microsite',
  retail: 'microsite',
  bold: 'microsite',
  // Profile (3)
  corporate: 'profile',
  studio: 'profile',
  consultant: 'profile',
} as const;

// ---------------------------------------------------------------------------
// 2. Bounded Global Theme Tokens (Strictly Constrained to 5 Controls)
// ---------------------------------------------------------------------------

export const THEME_SURFACE_MODES = ['light', 'dark'] as const;
export type ThemeSurfaceMode = (typeof THEME_SURFACE_MODES)[number];

export const THEME_BORDER_RADII = ['sharp', 'rounded', 'pill'] as const;
export type ThemeBorderRadius = (typeof THEME_BORDER_RADII)[number];

export const THEME_BUTTON_STYLES = ['solid', 'outline', 'soft', 'glass'] as const;
export type ThemeButtonStyle = (typeof THEME_BUTTON_STYLES)[number];

export const THEME_FONT_FAMILIES = [
  'plus_jakarta_sans',
  'inter',
  'dm_sans',
  'poppins',
  'playfair_display',
  'space_grotesk',
] as const;
export type ThemeFontFamily = (typeof THEME_FONT_FAMILIES)[number];

/**
 * Global Theme Tokens — intentionally bounded to exactly 5 design tokens
 * to prevent palette fragmentation and guarantee predictable dark/light rendering.
 */
export interface GlobalThemeTokens {
  readonly brandColor: string;
  readonly mode: ThemeSurfaceMode;
  readonly fontFamily: ThemeFontFamily;
  readonly borderRadius: ThemeBorderRadius;
  readonly buttonStyle: ThemeButtonStyle;
}

// ---------------------------------------------------------------------------
// 3. Legacy Theme Compatibility Constants (From Phase 1 Architecture Audit)
// ---------------------------------------------------------------------------

/** Legacy 6 visual theme IDs currently stored in tenants.metadata. */
export const LEGACY_VISUAL_THEME_IDS = [
  'clean_minimal',
  'aurora_gradient',
  'midnight_luxe',
  'warm_terra',
  'bold_performance',
  'slate_monochrome',
] as const;
export type LegacyVisualThemeId = (typeof LEGACY_VISUAL_THEME_IDS)[number];

/** Single source of truth for legacy visual theme -> bounded GlobalThemeTokens mapping. */
export const LEGACY_VISUAL_THEME_TOKENS_MAP: Readonly<
  Record<LegacyVisualThemeId, GlobalThemeTokens>
> = {
  clean_minimal: {
    brandColor: '#2563EB',
    mode: 'light',
    fontFamily: 'inter',
    borderRadius: 'rounded',
    buttonStyle: 'solid',
  },
  aurora_gradient: {
    brandColor: '#9333EA',
    mode: 'light',
    fontFamily: 'plus_jakarta_sans',
    borderRadius: 'pill',
    buttonStyle: 'glass',
  },
  midnight_luxe: {
    brandColor: '#38BDF8',
    mode: 'dark',
    fontFamily: 'playfair_display',
    borderRadius: 'rounded',
    buttonStyle: 'outline',
  },
  warm_terra: {
    brandColor: '#D97706',
    mode: 'light',
    fontFamily: 'plus_jakarta_sans',
    borderRadius: 'rounded',
    buttonStyle: 'soft',
  },
  bold_performance: {
    brandColor: '#059669',
    mode: 'light',
    fontFamily: 'space_grotesk',
    borderRadius: 'sharp',
    buttonStyle: 'solid',
  },
  slate_monochrome: {
    brandColor: '#334155',
    mode: 'light',
    fontFamily: 'dm_sans',
    borderRadius: 'sharp',
    buttonStyle: 'outline',
  },
} as const;

export const DEFAULT_LEGACY_VISUAL_THEME_ID: LegacyVisualThemeId = 'clean_minimal';
export const DEFAULT_STOREFRONT_PRESET_ID: StorefrontPresetId = 'retail_classic';
export const DEFAULT_GLOBAL_THEME_TOKENS: GlobalThemeTokens =
  LEGACY_VISUAL_THEME_TOKENS_MAP.clean_minimal;

// ---------------------------------------------------------------------------
// 4. Normalized Storefront Configuration Output Contract
// ---------------------------------------------------------------------------

export type StorefrontLinkKind =
  | 'custom'
  | 'whatsapp'
  | 'instagram'
  | 'tiktok'
  | 'website'
  | 'email'
  | 'phone';

export interface NormalizedStorefrontLink {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly kind: StorefrontLinkKind;
  readonly isHighlighted: boolean;
  readonly icon?: string;
  readonly sortOrder: number;
}

export type CatalogDisplayMode = 'all' | 'featured' | 'hidden';

export interface NormalizedCatalogVisibility {
  readonly showProducts: boolean;
  readonly productDisplayMode: CatalogDisplayMode;
  readonly featuredProductIds: readonly string[];
  readonly flagshipMode: boolean;
}

export interface NormalizedProfileCopy {
  readonly headline: string | null;
  readonly bio: string | null;
  readonly ctaLabel: string | null;
}

/** Diagnostic trace indicating how legacy vs v2 metadata keys were resolved. */
export interface NormalizedStorefrontSourceTrace {
  readonly resolvedFrom: 'v2_preset' | 'legacy_metadata' | 'default_fallback';
  readonly rawTemplateKey: string | null;
  readonly rawVisualThemeKey: string | null;
  readonly inferredPresetFrom: string;
  readonly showProductsSourceKey: string | null;
  readonly auroraFallbackCorrected: boolean;
}

/**
 * Pure normalized storefront configuration produced by `normalizeStorefrontTheme`.
 * Consumed by downstream storefront views & dashboard previews without inspecting raw JSONB.
 */
export interface NormalizedStorefrontConfig {
  readonly contractVersion: 2;
  readonly mode: StorefrontLayoutMode;
  readonly preset: StorefrontPresetId;
  readonly tokens: GlobalThemeTokens;
  readonly legacyVisualTheme: LegacyVisualThemeId;
  readonly catalog: NormalizedCatalogVisibility;
  readonly links: readonly NormalizedStorefrontLink[];
  readonly profile: NormalizedProfileCopy;
  readonly sourceTrace: NormalizedStorefrontSourceTrace;
}

// ---------------------------------------------------------------------------
// 5. Legacy Tenant Metadata Input Shape (Fragmented Supabase JSONB Surface)
// ---------------------------------------------------------------------------

export interface LegacyBioButtonInput {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly label?: unknown;
  readonly name?: unknown;
  readonly url?: unknown;
  readonly href?: unknown;
  readonly isHighlighted?: unknown;
  readonly is_highlighted?: unknown;
  readonly highlight?: unknown;
  readonly isActive?: unknown;
  readonly is_active?: unknown;
  readonly icon?: unknown;
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}
export interface LegacySectionFlagInput {
  readonly is_active?: unknown;
  readonly isActive?: unknown;
  readonly enabled?: unknown;
  readonly visible?: unknown;
  readonly [key: string]: unknown;
}
export interface StorefrontV2Input {
  readonly version?: unknown;
  readonly preset?: unknown;
  readonly tokens?: {
    readonly brandColor?: unknown;
    readonly mode?: unknown;
    readonly fontFamily?: unknown;
    readonly borderRadius?: unknown;
    readonly buttonStyle?: unknown;
    readonly [key: string]: unknown;
  } | null;
  readonly catalog?: {
    readonly showProducts?: unknown;
    readonly productDisplayMode?: unknown;
    readonly featuredProductIds?: unknown;
    readonly flagshipMode?: unknown;
  } | null;
  readonly [key: string]: unknown;
}
/**
 * Exhaustive readonly representation of the fragmented legacy JSONB metadata
 * observed across `tenants.metadata` and `tenant_settings` in BoonTrack.
 */
export interface LegacyTenantThemeMetadata {
  // Declarative V2 (forward-compatible target)
  readonly storefront_v2?: StorefrontV2Input | null;
  readonly preset?: unknown;

  // Fragmented legacy template keys
  readonly selected_template?: unknown;
  readonly storefront_template?: unknown;
  readonly template?: unknown;
  readonly storefront_style?: unknown;

  // Fragmented legacy visual theme keys
  readonly visual_theme?: unknown;
  readonly theme_id?: unknown;
  readonly primary_color?: unknown;
  readonly brand_color?: unknown;

  // Nested theme objects
  readonly theme?: {
    readonly template?: unknown;
    readonly visual_theme?: unknown;
    readonly theme_id?: unknown;
    readonly primary_color?: unknown;
    readonly brand_color?: unknown;
    readonly mode?: unknown;
    readonly font_family?: unknown;
    readonly fontFamily?: unknown;
    readonly border_radius?: unknown;
    readonly borderRadius?: unknown;
    readonly button_style?: unknown;
    readonly buttonStyle?: unknown;
    readonly show_products?: unknown;
    readonly is_flagship?: unknown;
    readonly headline?: unknown;
    readonly bio?: unknown;
    readonly [key: string]: unknown;
  } | null;

  readonly theme_config?: {
    readonly visual_theme?: unknown;
    readonly theme_id?: unknown;
    readonly primary_color?: unknown;
    readonly show_products?: unknown;
    readonly mode?: unknown;
    readonly fontFamily?: unknown;
    readonly borderRadius?: unknown;
    readonly buttonStyle?: unknown;
    readonly [key: string]: unknown;
  } | null;

  // Fragmented catalog visibility & layout flags
  readonly show_products?: unknown;
  readonly display_catalog?: unknown;
  readonly microsite_show_products?: unknown;
  readonly is_flagship?: unknown;
  readonly flagship_mode?: unknown;
  readonly product_layout?: unknown;
  readonly microsite_product_layout?: unknown;
  readonly featured_product_ids?: unknown;

  // Section-level toggles
  readonly sections?: {
    readonly catalog?: LegacySectionFlagInput | boolean | null;
    readonly products?: LegacySectionFlagInput | boolean | null;
    readonly [key: string]: unknown;
  } | null;

  readonly storefront_sections?: {
    readonly catalog?: LegacySectionFlagInput | boolean | null;
    readonly products?: LegacySectionFlagInput | boolean | null;
    readonly [key: string]: unknown;
  } | null;

  // Microsite containers & link arrays
  readonly microsite?: {
    readonly show_products?: unknown;
    readonly buttons?: readonly unknown[] | null;
    readonly links?: readonly unknown[] | null;
    readonly headline?: unknown;
    readonly bio?: unknown;
    readonly cta_label?: unknown;
    readonly featured_product_ids?: unknown;
    readonly is_flagship?: unknown;
    readonly product_layout?: unknown;
    readonly [key: string]: unknown;
  } | null;

  readonly microsite_settings?: {
    readonly show_products?: unknown;
    readonly buttons?: readonly unknown[] | null;
    readonly headline?: unknown;
    readonly bio?: unknown;
    readonly [key: string]: unknown;
  } | null;

  readonly buttons?: readonly unknown[] | null;
  readonly custom_links?: readonly unknown[] | null;
  readonly links?: Readonly<Record<string, unknown>> | readonly unknown[] | null;
  readonly whatsapp?: unknown;
  readonly tagline?: unknown;
  readonly description?: unknown;

  readonly [key: string]: unknown;
}
