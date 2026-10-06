/**
 * @file subscription-tiers.ts
 * @description Canonical subscription tier constants & grant helpers compliant with ARCHITECTURE.md (§3.1 and §5.1).
 */

export interface CanonicalTierDef {
  key: 'CHECKOUT_LITE' | 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE';
  name: string;
  uiLabel: string;
  monthlyPrice: number;
  description: string;
  badgeClasses: string;
  features: {
    has_capi: boolean;
    ads_tracking: boolean;
    multi_cs: boolean;
    inbox: boolean;
    ai_bot: boolean;
    broadcast: boolean;
    custom_domain: boolean;
    unlimited_products: boolean;
    single_page_checkout: boolean;
    crm: boolean;
  };
}

export const CANONICAL_TIERS: Record<string, CanonicalTierDef> = {
  PRO_SCALE: {
    key: 'PRO_SCALE',
    name: 'Ads Performance',
    uiLabel: 'Ads Performance (299k)',
    monthlyPrice: 299000,
    description: 'Meta & TikTok CAPI Server-Side, God Button konversi, 2 Seats CS Inbox, Advanced Analytics.',
    badgeClasses: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    features: {
      has_capi: true,
      ads_tracking: true,
      multi_cs: false,
      inbox: true,
      ai_bot: true,
      broadcast: false,
      custom_domain: false,
      unlimited_products: true,
      single_page_checkout: true,
      crm: true,
    },
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    name: 'Team Scale',
    uiLabel: 'Team Scale (499k)',
    monthlyPrice: 499000,
    description: 'Unlimited Multi-Seat CS, Official Meta Cloud API (WABA), Broadcast WA, Custom Domain + SSL.',
    badgeClasses: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    features: {
      has_capi: true,
      ads_tracking: true,
      multi_cs: true,
      inbox: true,
      ai_bot: true,
      broadcast: true,
      custom_domain: true,
      unlimited_products: true,
      single_page_checkout: true,
      crm: true,
    },
  },
  STARTER: {
    key: 'STARTER',
    name: 'Solo / Starter',
    uiLabel: 'Solo / Starter (199k)',
    monthlyPrice: 199000,
    description: 'Storefront mandiri, katalog tanpa batas, cek ongkir multi-ekspedisi, QRIS dinamis, auto-reply dasar.',
    badgeClasses: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    features: {
      has_capi: false,
      ads_tracking: false,
      multi_cs: false,
      inbox: false,
      ai_bot: true,
      broadcast: false,
      custom_domain: false,
      unlimited_products: true,
      single_page_checkout: true,
      crm: false,
    },
  },
  CHECKOUT_LITE: {
    key: 'CHECKOUT_LITE',
    name: 'Paket Checkout Lite',
    uiLabel: 'Checkout Lite (59k)',
    monthlyPrice: 59000,
    description: 'Single Page Checkout instan, maks 3 produk aktif, QRIS dinamis, basic browser pixel.',
    badgeClasses: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    features: {
      has_capi: false,
      ads_tracking: false,
      multi_cs: false,
      inbox: false,
      ai_bot: false,
      broadcast: false,
      custom_domain: false,
      unlimited_products: false,
      single_page_checkout: true,
      crm: false,
    },
  },
};

export const CANONICAL_TIER_LIST: CanonicalTierDef[] = [
  CANONICAL_TIERS.PRO_SCALE,
  CANONICAL_TIERS.ENTERPRISE,
  CANONICAL_TIERS.STARTER,
  CANONICAL_TIERS.CHECKOUT_LITE,
];

/**
 * Standard Tier Hierarchy Levels:
 * FREE / TRIAL (0) < STARTER / BASIC (1) < PRO (2) < SCALE (3) < ENTERPRISE / SPECIAL_GRANT (4).
 */
export const TIER_HIERARCHY_LEVELS: Record<string, number> = {
  FREE: 0,
  TRIAL: 0,
  CHECKOUT_LITE: 0,
  LITE: 0,
  STARTER: 1,
  BASIC: 1,
  SOLO: 1,
  GROWTH: 1,
  PRO: 2,
  PRO_SCALE: 2,
  ADS_PERFORMANCE: 2,
  GROWTH_PLUS: 2,
  SCALE: 3,
  TEAM_SCALE: 3,
  ENTERPRISE: 4,
  SPECIAL_GRANT: 4,
};

/**
 * Minimum tier level required for each feature.
 * Higher tiers automatically inherit all lower tier capabilities.
 */
export const FEATURE_MIN_LEVELS: Record<string, number> = {
  single_page_checkout: 0,
  unlimited_products: 1,
  ai_bot: 1,
  has_capi: 2,
  capi: 2,
  ads_tracking: 2,
  inbox: 2,
  crm: 2,
  has_crm: 2,
  memory_crm: 2,
  export: 2,
  multi_cs: 3,
  broadcast: 3,
  custom_domain: 3,
};

/**
 * Convert any raw tier string to its canonical numeric hierarchy level (0-4).
 */
export function getTierLevel(rawTier?: string | null): number {
  if (!rawTier) return 1;
  const norm = String(rawTier).toUpperCase().trim();
  if (norm.includes('ENTERPRISE') || norm.includes('SPECIAL_GRANT')) return 4;
  if (norm.includes('TEAM') || norm === 'SCALE') return 3;
  if (
    norm.includes('PRO') ||
    norm.includes('ADS') ||
    norm.includes('PERFORMANCE') ||
    norm.includes('PLUS')
  ) {
    return 2;
  }
  if (norm.includes('CHECKOUT') || norm.includes('LITE')) return 0;
  if (norm.includes('FREE')) return 0;
  if (
    norm.includes('STARTER') ||
    norm.includes('SOLO') ||
    norm.includes('BASIC') ||
    norm.includes('GROWTH')
  ) {
    return 1;
  }
  return TIER_HIERARCHY_LEVELS[norm] ?? 1;
}

/**
 * Centralized feature gating helper:
 * Returns true if the tier or tenant metadata allows access to the requested feature.
 */
export function canAccessFeature(
  rawTier?: string | null,
  featureKey: string = '',
  tenantMeta?: any
): boolean {
  if (!featureKey) return false;
  const normFeature = featureKey.toLowerCase().replace(/-/g, '_');

  // 1. Direct explicit boolean override in tenant metadata (features or capabilities)
  if (tenantMeta?.features?.[normFeature] === true || tenantMeta?.features?.[featureKey] === true) {
    return true;
  }
  if (tenantMeta?.capabilities?.[normFeature] === true || tenantMeta?.capabilities?.[featureKey] === true) {
    return true;
  }

  // 2. Active special grant check (Special grants on ENTERPRISE or TEAM inherit all features)
  const isGrant = Boolean(
    tenantMeta?.subscription?.type === 'granted' ||
      tenantMeta?.subscription?.subscription_type === 'granted' ||
      tenantMeta?.subscription_type === 'granted' ||
      tenantMeta?.subscription?.is_grant
  );

  const userLevel = getTierLevel(rawTier);

  // Level 4 (ENTERPRISE / SPECIAL_GRANT) inherits EVERYTHING without exception
  if (
    userLevel >= 4 ||
    (isGrant &&
      (String(rawTier || '').toUpperCase().includes('ENTERPRISE') ||
        String(rawTier || '').toUpperCase().includes('TEAM')))
  ) {
    return true;
  }

  const minLevel = FEATURE_MIN_LEVELS[normFeature] ?? 2;
  return userLevel >= minLevel;
}

/**
 * Centralized tenant-level feature access helper:
 * Evaluates tenant object (including subscription_tier, tier, metadata, and capabilities)
 * against the target feature.
 */
export function hasTierAccess(tenant: any, featureKey: string): boolean {
  if (!tenant || !featureKey) return false;
  const normFeature = featureKey.toLowerCase().replace(/-/g, '_');

  // Direct feature flags check in metadata or root
  if (
    tenant.metadata?.features?.[normFeature] === true ||
    tenant.metadata?.features?.[featureKey] === true ||
    tenant.features?.[normFeature] === true ||
    tenant.features?.[featureKey] === true ||
    tenant.metadata?.capabilities?.[normFeature] === true ||
    tenant.capabilities?.[normFeature] === true
  ) {
    return true;
  }

  // Resolve best tier candidate
  const tierCandidate =
    tenant.subscription_tier ||
    tenant.tier ||
    tenant.metadata?.subscription?.plan_tier ||
    tenant.metadata?.plan_tier ||
    tenant.metadata?.tier ||
    tenant.metadata?.plan_type ||
    'STARTER';

  return canAccessFeature(tierCandidate, normFeature, tenant.metadata);
}

/**
 * Resolve canonical tier definition from any raw string (backward compatible)
 */
export function resolveCanonicalTier(rawTier?: string | null): CanonicalTierDef {
  const norm = String(rawTier || '').toUpperCase().trim();
  if (norm.includes('ENTERPRISE') || norm.includes('TEAM')) {
    return CANONICAL_TIERS.ENTERPRISE;
  }
  if (norm.includes('PRO') || norm.includes('ADS') || norm.includes('PLUS') || norm.includes('PERFORMANCE')) {
    return CANONICAL_TIERS.PRO_SCALE;
  }
  if (norm.includes('CHECKOUT') || norm.includes('LITE')) {
    return CANONICAL_TIERS.CHECKOUT_LITE;
  }
  return CANONICAL_TIERS.STARTER;
}

/**
 * Calculate dynamic valid_until:
 * Extends by N * 30 days from current valid_until if active in the future;
 * otherwise calculates from now.
 */
export function calculateGrantValidUntil(
  currentValidUntil?: string | null,
  months: number = 1
): { validUntil: string; isExtended: boolean; baseDate: Date } {
  const safeMonths = Math.max(1, Math.min(12, Math.floor(months)));
  const addMs = safeMonths * 30 * 24 * 60 * 60 * 1000;

  let baseDate = new Date();
  let isExtended = false;

  if (currentValidUntil) {
    const existingDate = new Date(currentValidUntil);
    if (!isNaN(existingDate.getTime()) && existingDate.getTime() > Date.now()) {
      baseDate = existingDate;
      isExtended = true;
    }
  }

  const targetDate = new Date(baseDate.getTime() + addMs);
  return {
    validUntil: targetDate.toISOString(),
    isExtended,
    baseDate,
  };
}

/**
 * Calculate remaining days from an ISO date string
 */
export function getRemainingDays(validUntil?: string | null): number {
  if (!validUntil) return 0;
  const d = new Date(validUntil);
  if (isNaN(d.getTime())) return 0;
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

