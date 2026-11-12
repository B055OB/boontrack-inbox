/**
 * Read-Only Legacy Storefront Theme Adapter (Phase 2 — Task A.2)
 *
 * Normalizes fragmented legacy JSONB metadata (`tenants.metadata` / `tenant_settings`)
 * into the deterministic Phase 2 `NormalizedStorefrontConfig` contract.
 *
 * Architectural Guarantees:
 * - Strict Read-Only / Pure Function: NEVER mutates input objects or arrays.
 * - Zero Network / Zero DB I/O: Synchronous normalization safe for RSC, API, & client preview.
 * - XSS-Hardened URI Sanitization & Strict Hex Color Validation.
 * - Resolves the `aurora_gradient` preview-vs-live drift deterministically to `clean_minimal`.
 *
 * Baseline Checkpoint: 08c7368 (Storefront Theme Harmonization Phase 2 / Task A.2)
 */

import {
  ALL_STOREFRONT_PRESETS,
  DEFAULT_LEGACY_VISUAL_THEME_ID,
  LEGACY_VISUAL_THEME_IDS,
  LEGACY_VISUAL_THEME_TOKENS_MAP,
  PRESET_MODE_MAP,
  THEME_BORDER_RADII,
  THEME_BUTTON_STYLES,
  THEME_FONT_FAMILIES,
  THEME_SURFACE_MODES,
  type CatalogDisplayMode,
  type GlobalThemeTokens,
  type LegacyBioButtonInput,
  type LegacyTenantThemeMetadata,
  type LegacyVisualThemeId,
  type NormalizedCatalogVisibility,
  type NormalizedProfileCopy,
  type NormalizedStorefrontConfig,
  type NormalizedStorefrontLink,
  type StorefrontLayoutMode,
  type StorefrontLinkKind,
  type StorefrontPresetId,
  type ThemeBorderRadius,
  type ThemeButtonStyle,
  type ThemeFontFamily,
  type ThemeSurfaceMode,
} from '@/types/storefront-presets';

// ---------------------------------------------------------------------------
// Internal Safe Type Guards & Primitives (Zero Mutation)
// ---------------------------------------------------------------------------

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return null;
}

function readSectionFlag(section: unknown): boolean | null {
  const directBool = parseBooleanLike(section);
  if (directBool !== null) return directBool;
  if (!isRecord(section)) return null;

  const candidates = [section.is_active, section.isActive, section.enabled, section.visible];
  for (const candidate of candidates) {
    const parsed = parseBooleanLike(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' || typeof item === 'number') {
      const normalized = String(item).trim();
      if (normalized.length > 0 && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result;
}

function isCanonicalPreset(value: string | null): value is StorefrontPresetId {
  if (!value) return false;
  return (ALL_STOREFRONT_PRESETS as readonly string[]).includes(value);
}

function isLegacyVisualThemeId(value: string | null): value is LegacyVisualThemeId {
  if (!value) return false;
  return (LEGACY_VISUAL_THEME_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Bounded Token Sanitizers (Hex Colors, Enumerations, Font Aliases)
// ---------------------------------------------------------------------------

const HEX_COLOR_6_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_3_REGEX = /^#[0-9a-fA-F]{3}$/;

/** Validates a hex color (`#RGB` or `#RRGGBB`) and expands `#RGB` -> `#RRGGBB` uppercase. */
function normalizeHexColor(value: unknown): string | null {
  const raw = readNonEmptyString(value);
  if (!raw) return null;
  if (HEX_COLOR_6_REGEX.test(raw)) {
    return raw.toUpperCase();
  }
  if (HEX_COLOR_3_REGEX.test(raw)) {
    const [, r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function normalizeSurfaceMode(value: unknown): ThemeSurfaceMode | null {
  const raw = readNonEmptyString(value)?.toLowerCase();
  if (!raw) return null;
  return (THEME_SURFACE_MODES as readonly string[]).includes(raw)
    ? (raw as ThemeSurfaceMode)
    : null;
}

function normalizeBorderRadius(value: unknown): ThemeBorderRadius | null {
  const raw = readNonEmptyString(value)?.toLowerCase();
  if (!raw) return null;
  if ((THEME_BORDER_RADII as readonly string[]).includes(raw)) {
    return raw as ThemeBorderRadius;
  }
  if (raw === 'none' || raw === 'square') return 'sharp';
  if (raw === 'full') return 'pill';
  return null;
}

function normalizeButtonStyle(value: unknown): ThemeButtonStyle | null {
  const raw = readNonEmptyString(value)?.toLowerCase();
  if (!raw) return null;
  if ((THEME_BUTTON_STYLES as readonly string[]).includes(raw)) {
    return raw as ThemeButtonStyle;
  }
  if (raw === 'filled') return 'solid';
  if (raw === 'bordered' || raw === 'ghost') return 'outline';
  return null;
}

const FONT_ALIAS_MAP: Readonly<Record<string, ThemeFontFamily>> = {
  'plus_jakarta_sans': 'plus_jakarta_sans',
  'plus jakarta sans': 'plus_jakarta_sans',
  'jakarta': 'plus_jakarta_sans',
  'inter': 'inter',
  'dm_sans': 'dm_sans',
  'dm sans': 'dm_sans',
  'poppins': 'poppins',
  'playfair_display': 'playfair_display',
  'playfair display': 'playfair_display',
  'playfair': 'playfair_display',
  'space_grotesk': 'space_grotesk',
  'space grotesk': 'space_grotesk',
};

function normalizeFontFamily(value: unknown): ThemeFontFamily | null {
  const raw = readNonEmptyString(value)?.toLowerCase();
  if (!raw) return null;
  if ((THEME_FONT_FAMILIES as readonly string[]).includes(raw)) {
    return raw as ThemeFontFamily;
  }
  return FONT_ALIAS_MAP[raw] ?? null;
}

// ---------------------------------------------------------------------------
// URI XSS Filtering & Link Synthesis
// ---------------------------------------------------------------------------

const ALLOWED_SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;

/**
 * Sanitizes untrusted button/social links.
 * Accepts `https:`, `http:`, `mailto:`, `tel:`, and clean root-relative paths (`/foo`).
 * Rejects `javascript:`, `data:`, `vbscript:`, protocol-relative `//`, and unknown schemes.
 */
function sanitizeStorefrontUrl(rawUrl: unknown): string | null {
  const str = readNonEmptyString(rawUrl);
  if (!str) return null;

  // Strip ASCII control characters that attackers use to obfuscate `javascript:`
  const cleaned = str.replace(CONTROL_CHARS_REGEX, '').trim();
  if (cleaned.length === 0) return null;

  // Allow safe root-relative paths (`/produk/abc`), block protocol-relative `//evil.com`
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) {
    return cleaned;
  }

  // Upgrade bare wa.me or www. links cleanly to https://
  if (/^(wa\.me|www\.)/i.test(cleaned)) {
    return `https://${cleaned}`;
  }

  if (ALLOWED_SAFE_PROTOCOL.test(cleaned)) {
    return cleaned;
  }

  // Reject everything else (javascript:, data:, vbscript:, arbitrary non-HTTP schemes)
  return null;
}

function normalizeWhatsAppToUrl(rawValue: unknown): string | null {
  const str = readNonEmptyString(rawValue);
  if (!str) return null;

  // Already a URL? Validate cleanly through URI sanitizer
  if (str.includes('http://') || str.includes('https://') || /^wa\.me\//i.test(str)) {
    return sanitizeStorefrontUrl(str);
  }

  const digits = str.replace(/[^\d]/g, '');
  if (digits.length < 7) return null;

  const e164 = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${e164}`;
}

function inferLinkKind(url: string, explicitKind: unknown): StorefrontLinkKind {
  const kindStr = readNonEmptyString(explicitKind)?.toLowerCase();
  if (
    kindStr === 'custom' ||
    kindStr === 'whatsapp' ||
    kindStr === 'instagram' ||
    kindStr === 'tiktok' ||
    kindStr === 'website' ||
    kindStr === 'email' ||
    kindStr === 'phone'
  ) {
    return kindStr;
  }

  const lower = url.toLowerCase();
  if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com')) return 'whatsapp';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.startsWith('mailto:')) return 'email';
  if (lower.startsWith('tel:')) return 'phone';
  return 'custom';
}

function normalizeButtonsList(rawList: readonly unknown[]): readonly NormalizedStorefrontLink[] {
  const normalized: NormalizedStorefrontLink[] = [];

  rawList.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const item = entry as LegacyBioButtonInput;

    // Skip explicitly deactivated buttons
    const activeFlag = parseBooleanLike(item.isActive ?? item.is_active);
    if (activeFlag === false) return;

    const label =
      readNonEmptyString(item.title) ??
      readNonEmptyString(item.label) ??
      readNonEmptyString(item.name);
    if (!label) return;

    const url = sanitizeStorefrontUrl(item.url ?? item.href);
    if (!url) return;

    const id = readNonEmptyString(item.id) ?? `btn-${index}`;
    const isHighlighted =
      parseBooleanLike(item.isHighlighted ?? item.is_highlighted ?? item.highlight) ?? false;
    const icon = readNonEmptyString(item.icon) ?? undefined;

    normalized.push({
      id,
      label,
      url,
      kind: inferLinkKind(url, item.kind),
      isHighlighted,
      ...(icon ? { icon } : {}),
      sortOrder: normalized.length,
    });
  });

  return normalized;
}

const SYNTHETIC_LINK_CONFIGS: readonly {
  readonly key: string;
  readonly label: string;
  readonly kind: StorefrontLinkKind;
  readonly isWhatsapp?: boolean;
}[] = [
  { key: 'whatsapp', label: 'Chat WhatsApp', kind: 'whatsapp', isWhatsapp: true },
  { key: 'instagram', label: 'Instagram', kind: 'instagram' },
  { key: 'tiktok', label: 'TikTok', kind: 'tiktok' },
  { key: 'website', label: 'Website', kind: 'website' },
  { key: 'shopee', label: 'Shopee', kind: 'custom' },
  { key: 'tokopedia', label: 'Tokopedia', kind: 'custom' },
  { key: 'youtube', label: 'YouTube', kind: 'custom' },
];

function synthesizeLegacyMapLinks(
  meta: UnknownRecord,
): readonly NormalizedStorefrontLink[] {
  const result: NormalizedStorefrontLink[] = [];
  const linksMap = isRecord(meta.links) ? meta.links : null;

  for (const cfg of SYNTHETIC_LINK_CONFIGS) {
    const rawVal =
      linksMap?.[cfg.key] ?? (cfg.key === 'whatsapp' ? meta.whatsapp : undefined);
    const url = cfg.isWhatsapp
      ? normalizeWhatsAppToUrl(rawVal)
      : sanitizeStorefrontUrl(rawVal);

    if (!url) continue;

    result.push({
      id: `synth-${cfg.key}-${result.length}`,
      label: cfg.label,
      url,
      kind: cfg.kind,
      isHighlighted: cfg.key === 'whatsapp' && result.length === 0,
      sortOrder: result.length,
    });
  }

  return result;
}

function normalizeAllLinks(meta: UnknownRecord): readonly NormalizedStorefrontLink[] {
  const microsite = isRecord(meta.microsite) ? meta.microsite : null;
  const micrositeSettings = isRecord(meta.microsite_settings) ? meta.microsite_settings : null;

  const candidateArrays: readonly unknown[] = [
    microsite?.buttons,
    micrositeSettings?.buttons,
    Array.isArray(microsite?.links) ? microsite.links : undefined,
    meta.buttons,
    meta.custom_links,
    Array.isArray(meta.links) ? meta.links : undefined,
  ];

  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) continue;
    const parsed = normalizeButtonsList(candidate);
    if (parsed.length > 0) return parsed;
  }

  return synthesizeLegacyMapLinks(meta);
}

// ---------------------------------------------------------------------------
// Catalog Visibility & Preset Resolution Helpers
// ---------------------------------------------------------------------------

function resolveFlagshipSignal(meta: UnknownRecord): boolean {
  const theme = isRecord(meta.theme) ? meta.theme : null;
  const microsite = isRecord(meta.microsite) ? meta.microsite : null;

  const boolSignals = [
    meta.is_flagship,
    meta.flagship_mode,
    microsite?.is_flagship,
    theme?.is_flagship,
    meta.storefront_v2 && isRecord(meta.storefront_v2) && isRecord(meta.storefront_v2.catalog)
      ? meta.storefront_v2.catalog.flagshipMode
      : undefined,
  ];

  for (const signal of boolSignals) {
    if (parseBooleanLike(signal) === true) return true;
  }

  const layoutHints = [
    meta.product_layout,
    meta.microsite_product_layout,
    microsite?.product_layout,
    meta.storefront_style,
  ];

  for (const hint of layoutHints) {
    const str = readNonEmptyString(hint)?.toLowerCase();
    if (str === 'grid' || str === 'flagship') return true;
  }

  return false;
}

function resolveFeaturedProductIds(meta: UnknownRecord): readonly string[] {
  const v2Catalog =
    isRecord(meta.storefront_v2) && isRecord(meta.storefront_v2.catalog)
      ? meta.storefront_v2.catalog
      : null;
  const microsite = isRecord(meta.microsite) ? meta.microsite : null;

  const candidates = [
    v2Catalog?.featuredProductIds,
    meta.featured_product_ids,
    microsite?.featured_product_ids,
  ];

  for (const candidate of candidates) {
    const parsed = readStringArray(candidate);
    if (parsed.length > 0) return parsed;
  }

  return [];
}

function resolvePresetAndOrigin(
  meta: UnknownRecord,
  isFlagship: boolean,
): {
  readonly preset: StorefrontPresetId;
  readonly resolvedFrom: 'v2_preset' | 'legacy_metadata' | 'default_fallback';
  readonly rawTemplateKey: string | null;
  readonly inferredPresetFrom: string;
} {
  // 1. Check declarative storefront_v2.preset or top-level preset
  const v2 = isRecord(meta.storefront_v2) ? meta.storefront_v2 : null;
  const v2Preset = readNonEmptyString(v2?.preset)?.toLowerCase() ?? null;
  if (isCanonicalPreset(v2Preset)) {
    return {
      preset: v2Preset,
      resolvedFrom: 'v2_preset',
      rawTemplateKey: v2Preset,
      inferredPresetFrom: 'storefront_v2.preset',
    };
  }

  const topPreset = readNonEmptyString(meta.preset)?.toLowerCase() ?? null;
  if (isCanonicalPreset(topPreset)) {
    return {
      preset: topPreset,
      resolvedFrom: 'v2_preset',
      rawTemplateKey: topPreset,
      inferredPresetFrom: 'preset',
    };
  }

  // 2. Check fragmented legacy template precedence
  const theme = isRecord(meta.theme) ? meta.theme : null;
  const templateCandidates: readonly { readonly key: string; readonly val: unknown }[] = [
    { key: 'selected_template', val: meta.selected_template },
    { key: 'storefront_template', val: meta.storefront_template },
    { key: 'template', val: meta.template },
    { key: 'theme.template', val: theme?.template },
  ];

  let matchedKey: string | null = null;
  let rawTemplate: string | null = null;

  for (const candidate of templateCandidates) {
    const str = readNonEmptyString(candidate.val)?.toLowerCase() ?? null;
    if (str) {
      matchedKey = candidate.key;
      rawTemplate = str;
      break;
    }
  }

  const styleHint = readNonEmptyString(meta.storefront_style)?.toLowerCase() ?? null;

  // Support legacy templates storing a canonical preset name directly
  if (isCanonicalPreset(rawTemplate)) {
    return {
      preset: rawTemplate,
      resolvedFrom: 'legacy_metadata',
      rawTemplateKey: rawTemplate,
      inferredPresetFrom: matchedKey ?? 'legacy_template',
    };
  }

  if (rawTemplate === 'microsite' || rawTemplate === 'bio' || rawTemplate === 'linktree') {
    if (styleHint === 'bento') {
      return {
        preset: 'bento',
        resolvedFrom: 'legacy_metadata',
        rawTemplateKey: rawTemplate,
        inferredPresetFrom: `${matchedKey}+storefront_style(bento)`,
      };
    }
    if (styleHint === 'bold') {
      return {
        preset: 'bold',
        resolvedFrom: 'legacy_metadata',
        rawTemplateKey: rawTemplate,
        inferredPresetFrom: `${matchedKey}+storefront_style(bold)`,
      };
    }
    if (isFlagship || styleHint === 'retail') {
      return {
        preset: 'retail',
        resolvedFrom: 'legacy_metadata',
        rawTemplateKey: rawTemplate,
        inferredPresetFrom: isFlagship
          ? `${matchedKey}+flagship_grid`
          : `${matchedKey}+storefront_style(retail)`,
      };
    }
    return {
      preset: 'minimalist',
      resolvedFrom: 'legacy_metadata',
      rawTemplateKey: rawTemplate,
      inferredPresetFrom: matchedKey ?? 'microsite',
    };
  }

  if (
    rawTemplate === 'personal' ||
    rawTemplate === 'profile' ||
    rawTemplate === 'consultant' ||
    rawTemplate === 'corporate' ||
    rawTemplate === 'studio' ||
    rawTemplate === 'agency'
  ) {
    const resolvedProfile: StorefrontPresetId =
      rawTemplate === 'studio' || styleHint === 'studio'
        ? 'studio'
        : rawTemplate === 'corporate' || styleHint === 'corporate'
          ? 'corporate'
          : 'consultant';
    return {
      preset: resolvedProfile,
      resolvedFrom: 'legacy_metadata',
      rawTemplateKey: rawTemplate,
      inferredPresetFrom: matchedKey ?? 'personal',
    };
  }

  if (
    rawTemplate === 'default' ||
    rawTemplate === 'storefront' ||
    rawTemplate === 'catalog' ||
    rawTemplate === 'shop'
  ) {
    const resolvedCatalog: StorefrontPresetId =
      styleHint === 'bento' || styleHint === 'bento_commerce'
        ? 'bento_commerce'
        : styleHint === 'editorial' || styleHint === 'editorial_shop'
          ? 'editorial_shop'
          : 'retail_classic';
    return {
      preset: resolvedCatalog,
      resolvedFrom: 'legacy_metadata',
      rawTemplateKey: rawTemplate,
      inferredPresetFrom: matchedKey ?? 'default',
    };
  }

  const hasAnyLegacyThemeSignal =
    rawTemplate !== null ||
    readNonEmptyString(meta.visual_theme) !== null ||
    readNonEmptyString(meta.theme_id) !== null ||
    isRecord(meta.theme) ||
    isRecord(meta.microsite);

  return {
    preset: 'retail_classic',
    resolvedFrom: hasAnyLegacyThemeSignal ? 'legacy_metadata' : 'default_fallback',
    rawTemplateKey: rawTemplate,
    inferredPresetFrom: hasAnyLegacyThemeSignal ? 'unmapped_template_fallback' : 'empty_metadata',
  };
}

function resolveVisualThemeAndTokens(meta: UnknownRecord): {
  readonly legacyVisualTheme: LegacyVisualThemeId;
  readonly tokens: GlobalThemeTokens;
  readonly rawVisualThemeKey: string | null;
  readonly auroraFallbackCorrected: boolean;
} {
  const theme = isRecord(meta.theme) ? meta.theme : null;
  const themeConfig = isRecord(meta.theme_config) ? meta.theme_config : null;
  const v2 = isRecord(meta.storefront_v2) ? meta.storefront_v2 : null;
  const v2Tokens = isRecord(v2?.tokens) ? v2.tokens : null;

  // Collect first non-empty raw visual theme identifier (visual_theme preferred over legacy theme_id)
  const rawVisualCandidates = [
    theme?.visual_theme,
    meta.visual_theme,
    themeConfig?.visual_theme,
    theme?.theme_id,
    meta.theme_id,
    themeConfig?.theme_id,
  ];

  let rawVisualThemeKey: string | null = null;
  for (const candidate of rawVisualCandidates) {
    const str = readNonEmptyString(candidate)?.toLowerCase() ?? null;
    if (str) {
      rawVisualThemeKey = str;
      break;
    }
  }

  const legacyVisualTheme: LegacyVisualThemeId = isLegacyVisualThemeId(rawVisualThemeKey)
    ? rawVisualThemeKey
    : DEFAULT_LEGACY_VISUAL_THEME_ID;

  // Whenever unset or unknown, we enforce `clean_minimal` rather than legacy preview drift to `aurora_gradient`
  const auroraFallbackCorrected = !isLegacyVisualThemeId(rawVisualThemeKey);

  const baseTokens = LEGACY_VISUAL_THEME_TOKENS_MAP[legacyVisualTheme];

  const brandColor =
    normalizeHexColor(v2Tokens?.brandColor) ??
    normalizeHexColor(theme?.brand_color) ??
    normalizeHexColor(theme?.primary_color) ??
    normalizeHexColor(themeConfig?.primary_color) ??
    normalizeHexColor(meta.brand_color) ??
    normalizeHexColor(meta.primary_color) ??
    baseTokens.brandColor;

  const mode =
    normalizeSurfaceMode(v2Tokens?.mode) ??
    normalizeSurfaceMode(theme?.mode) ??
    normalizeSurfaceMode(themeConfig?.mode) ??
    baseTokens.mode;

  const fontFamily =
    normalizeFontFamily(v2Tokens?.fontFamily) ??
    normalizeFontFamily(theme?.fontFamily ?? theme?.font_family) ??
    normalizeFontFamily(themeConfig?.fontFamily) ??
    baseTokens.fontFamily;

  const borderRadius =
    normalizeBorderRadius(v2Tokens?.borderRadius) ??
    normalizeBorderRadius(theme?.borderRadius ?? theme?.border_radius) ??
    normalizeBorderRadius(themeConfig?.borderRadius) ??
    baseTokens.borderRadius;

  const buttonStyle =
    normalizeButtonStyle(v2Tokens?.buttonStyle) ??
    normalizeButtonStyle(theme?.buttonStyle ?? theme?.button_style) ??
    normalizeButtonStyle(themeConfig?.buttonStyle) ??
    baseTokens.buttonStyle;

  return {
    legacyVisualTheme,
    tokens: {
      brandColor,
      mode,
      fontFamily,
      borderRadius,
      buttonStyle,
    },
    rawVisualThemeKey,
    auroraFallbackCorrected,
  };
}

function resolveCatalogVisibility(
  meta: UnknownRecord,
  mode: StorefrontLayoutMode,
  flagshipMode: boolean,
  featuredProductIds: readonly string[],
): {
  readonly visibility: NormalizedCatalogVisibility;
  readonly showProductsSourceKey: string | null;
} {
  const v2Catalog =
    isRecord(meta.storefront_v2) && isRecord(meta.storefront_v2.catalog)
      ? meta.storefront_v2.catalog
      : null;
  const sections = isRecord(meta.sections) ? meta.sections : null;
  const storefrontSections = isRecord(meta.storefront_sections)
    ? meta.storefront_sections
    : null;
  const theme = isRecord(meta.theme) ? meta.theme : null;
  const themeConfig = isRecord(meta.theme_config) ? meta.theme_config : null;
  const microsite = isRecord(meta.microsite) ? meta.microsite : null;
  const micrositeSettings = isRecord(meta.microsite_settings) ? meta.microsite_settings : null;

  const checks: readonly { readonly key: string; readonly resolved: boolean | null }[] = [
    { key: 'storefront_v2.catalog.showProducts', resolved: parseBooleanLike(v2Catalog?.showProducts) },
    { key: 'sections.catalog', resolved: readSectionFlag(sections?.catalog) },
    { key: 'sections.products', resolved: readSectionFlag(sections?.products) },
    { key: 'storefront_sections.catalog', resolved: readSectionFlag(storefrontSections?.catalog) },
    { key: 'storefront_sections.products', resolved: readSectionFlag(storefrontSections?.products) },
    { key: 'show_products', resolved: parseBooleanLike(meta.show_products) },
    { key: 'display_catalog', resolved: parseBooleanLike(meta.display_catalog) },
    { key: 'microsite_show_products', resolved: parseBooleanLike(meta.microsite_show_products) },
    { key: 'theme.show_products', resolved: parseBooleanLike(theme?.show_products) },
    { key: 'theme_config.show_products', resolved: parseBooleanLike(themeConfig?.show_products) },
    { key: 'microsite.show_products', resolved: parseBooleanLike(microsite?.show_products) },
    {
      key: 'microsite_settings.show_products',
      resolved: parseBooleanLike(micrositeSettings?.show_products),
    },
  ];

  let showProducts: boolean | null = null;
  let showProductsSourceKey: string | null = null;

  for (const check of checks) {
    if (check.resolved !== null) {
      showProducts = check.resolved;
      showProductsSourceKey = check.key;
      break;
    }
  }

  if (showProducts === null) {
    // Catalog mode shows products by default; microsite/profile only opt in via flagship/featured
    showProducts =
      mode === 'catalog' ? true : flagshipMode || featuredProductIds.length > 0;
  }

  const rawDisplayMode = readNonEmptyString(v2Catalog?.productDisplayMode)?.toLowerCase();
  let productDisplayMode: CatalogDisplayMode;
  if (!showProducts) {
    productDisplayMode = 'hidden';
  } else if (rawDisplayMode === 'all' || rawDisplayMode === 'featured' || rawDisplayMode === 'hidden') {
    productDisplayMode = rawDisplayMode;
  } else {
    productDisplayMode = featuredProductIds.length > 0 ? 'featured' : 'all';
  }

  return {
    visibility: {
      showProducts,
      productDisplayMode,
      featuredProductIds,
      flagshipMode,
    },
    showProductsSourceKey,
  };
}

function resolveProfileCopy(meta: UnknownRecord): NormalizedProfileCopy {
  const microsite = isRecord(meta.microsite) ? meta.microsite : null;
  const micrositeSettings = isRecord(meta.microsite_settings) ? meta.microsite_settings : null;
  const theme = isRecord(meta.theme) ? meta.theme : null;

  const headline =
    readNonEmptyString(microsite?.headline) ??
    readNonEmptyString(micrositeSettings?.headline) ??
    readNonEmptyString(theme?.headline) ??
    readNonEmptyString(meta.tagline);

  const bio =
    readNonEmptyString(microsite?.bio) ??
    readNonEmptyString(micrositeSettings?.bio) ??
    readNonEmptyString(theme?.bio) ??
    readNonEmptyString(meta.description);

  const ctaLabel = readNonEmptyString(microsite?.cta_label);

  return { headline, bio, ctaLabel };
}

// ---------------------------------------------------------------------------
// Public Entry Point
// ---------------------------------------------------------------------------

/**
 * Normalizes any legacy or Phase 2 tenant metadata JSONB object into the strict
 * `NormalizedStorefrontConfig` contract. Safe for `null`, `undefined`, and partial inputs.
 */
export function normalizeStorefrontTheme(
  rawMetadata: Readonly<LegacyTenantThemeMetadata> | null | undefined,
): NormalizedStorefrontConfig {
  const meta: UnknownRecord = isRecord(rawMetadata) ? rawMetadata : {};

  const flagshipMode = resolveFlagshipSignal(meta);
  const featuredProductIds = resolveFeaturedProductIds(meta);

  const presetResolution = resolvePresetAndOrigin(meta, flagshipMode);
  const mode: StorefrontLayoutMode = PRESET_MODE_MAP[presetResolution.preset];

  const themeResolution = resolveVisualThemeAndTokens(meta);
  const catalogResolution = resolveCatalogVisibility(
    meta,
    mode,
    flagshipMode,
    featuredProductIds,
  );
  const links = normalizeAllLinks(meta);
  const profile = resolveProfileCopy(meta);

  return {
    contractVersion: 2,
    mode,
    preset: presetResolution.preset,
    tokens: themeResolution.tokens,
    legacyVisualTheme: themeResolution.legacyVisualTheme,
    catalog: catalogResolution.visibility,
    links,
    profile,
    sourceTrace: {
      resolvedFrom: presetResolution.resolvedFrom,
      rawTemplateKey: presetResolution.rawTemplateKey,
      rawVisualThemeKey: themeResolution.rawVisualThemeKey,
      inferredPresetFrom: presetResolution.inferredPresetFrom,
      showProductsSourceKey: catalogResolution.showProductsSourceKey,
      auroraFallbackCorrected: themeResolution.auroraFallbackCorrected,
    },
  };
}
