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
    },
  },
  STARTER: {
    key: 'STARTER',
    name: 'Solo / Starter',
    uiLabel: 'Solo / Starter (199k)',
    monthlyPrice: 199000,
    description: 'Storefront mandiri, katalog tanpa batas, cek ongkir multi-ekspedisi, QRIS dinamis 0% MDR, auto-reply dasar.',
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
    },
  },
  CHECKOUT_LITE: {
    key: 'CHECKOUT_LITE',
    name: 'Paket Checkout Lite',
    uiLabel: 'Checkout Lite (59k)',
    monthlyPrice: 59000,
    description: 'Single Page Checkout instan, maks 3 produk aktif, QRIS dinamis 0% MDR, basic browser pixel.',
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
