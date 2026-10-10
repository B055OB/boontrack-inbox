/**
 * @file lib/config/studio-pricing.ts
 * @description Single Source of Truth (SSOT) untuk Paket Harga Kredit Video & Langganan BoonTrack Studio.
 * 
 * TWO-TIER PRICING ARCHITECTURE:
 * 1. Pembedaan harga otomatis berdasarkan status pengguna:
 *    - Publik / Non-Member:
 *      * Ketengan (5 Kredit): Rp 20.000 (Rp 4.000/kredit)
 *      * Starter (25 Kredit): Rp 75.000 (Rp 3.000/kredit)
 *      * Creator Hemat (50 Kredit): Rp 135.000 (Rp 2.700/kredit)
 *    - Member Toko (Active Shop Subscribers):
 *      * Ketengan (5 Kredit): Rp 15.000 (Rp 3.000/kredit)
 *      * Starter (25 Kredit): Rp 49.000 (Rp 1.960/kredit)
 *      * Creator Hemat (50 Kredit): Rp 89.000 (Rp 1.780/kredit)
 * 2. Paket Langganan Bulanan:
 *    - Nonaktifkan sementara (is_active: false / hold).
 * 3. Masa aktif saldo kredit: 12 bulan.
 * 4. Konsumsi Kredit (Credit Burn Logic):
 *    - Jalur A (Mode Video Otomatis / Render MP4): 3 Kredit
 *    - Jalur B (Mode Panduan Naskah Asli / UGC Script): 1 Kredit
 *    - Sesi Riset Tren: Kuota ter-bundle (0 Kredit)
 */

export type StudioPackageId = 'ketengan' | 'starter' | 'creator' | 'pro_monthly';

export interface StudioPricingTier {
  price: number;
  formattedPrice: string;
  pricePerCredit: number;
  formattedPricePerCredit: string;
}

export interface StudioTokenPackage {
  id: StudioPackageId;
  name: string;
  credits: number;
  publicTier: StudioPricingTier;
  memberTier: StudioPricingTier;
  price: number;
  formattedPrice: string;
  pricePerCredit: number;
  formattedPricePerCredit: string;
  description: string;
  periodLabel?: string;
  badge?: string;
  isPopular?: boolean;
  features: string[];
  billingType: 'ONE_TIME' | 'SUBSCRIPTION';
  isActive: boolean;
  validityMonths: number;
}

export const STUDIO_TOKEN_PACKAGES: Record<StudioPackageId, StudioTokenPackage> = {
  ketengan: {
    id: 'ketengan',
    name: 'Paket Ketengan',
    credits: 5,
    publicTier: {
      price: 20000,
      formattedPrice: 'Rp 20.000',
      pricePerCredit: 4000,
      formattedPricePerCredit: 'Rp 4.000/kredit',
    },
    memberTier: {
      price: 15000,
      formattedPrice: 'Rp 15.000',
      pricePerCredit: 3000,
      formattedPricePerCredit: 'Rp 3.000/kredit',
    },
    price: 20000,
    formattedPrice: 'Rp 20.000',
    pricePerCredit: 4000,
    formattedPricePerCredit: 'Rp 4.000/kredit',
    description: 'Beli ketengan via QRIS Instan • Uji coba cepat',
    badge: 'Uji Coba Cepat',
    features: [
      '🎬 Setara 1 Video Otomatis Jadi (+ 2 naskah) atau 5 Panduan Naskah Asli',
      'Resolusi 1080p Tajam & Bebas Watermark',
      'Masa Aktif Saldo 12 Bulan',
    ],
    billingType: 'ONE_TIME',
    isActive: true,
    validityMonths: 12,
  },
  starter: {
    id: 'starter',
    name: 'Paket Starter',
    credits: 25,
    publicTier: {
      price: 75000,
      formattedPrice: 'Rp 75.000',
      pricePerCredit: 3000,
      formattedPricePerCredit: 'Rp 3.000/kredit',
    },
    memberTier: {
      price: 49000,
      formattedPrice: 'Rp 49.000',
      pricePerCredit: 1960,
      formattedPricePerCredit: 'Rp 1.960/kredit',
    },
    price: 75000,
    formattedPrice: 'Rp 75.000',
    pricePerCredit: 3000,
    formattedPricePerCredit: 'Rp 3.000/kredit',
    description: 'Sekali beli via QRIS Instan • No Watermark',
    features: [
      '🎬 Setara hingga 8 Video Otomatis Jadi atau 25 Panduan Naskah Asli',
      'Cocok untuk suplai konten rutin mingguan',
      'Resolusi 1080p Tajam & Bebas Watermark',
      'Masa Aktif Saldo 12 Bulan',
    ],
    billingType: 'ONE_TIME',
    isActive: true,
    validityMonths: 12,
  },
  creator: {
    id: 'creator',
    name: 'Paket Kreator Hemat',
    credits: 50,
    publicTier: {
      price: 135000,
      formattedPrice: 'Rp 135.000',
      pricePerCredit: 2700,
      formattedPricePerCredit: 'Rp 2.700/kredit',
    },
    memberTier: {
      price: 89000,
      formattedPrice: 'Rp 89.000',
      pricePerCredit: 1780,
      formattedPricePerCredit: 'Rp 1.780/kredit',
    },
    price: 135000,
    formattedPrice: 'Rp 135.000',
    pricePerCredit: 2700,
    formattedPricePerCredit: 'Rp 2.700/kredit',
    description: 'Paling banyak dipilih kreator & merchant aktif',
    badge: 'Paling Hemat',
    isPopular: true,
    features: [
      '🎬 Setara hingga 16 Video Otomatis Jadi atau 50 Panduan Naskah Asli',
      'Ideal untuk A/B testing materi iklan TikTok & Meta Ads',
      'Prioritas Pemrosesan & Render Cepat',
      'Masa Aktif Saldo 12 Bulan',
    ],
    billingType: 'ONE_TIME',
    isActive: true,
    validityMonths: 12,
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Langganan Studio Pro',
    credits: 100,
    publicTier: {
      price: 149000,
      formattedPrice: 'Rp 149.000',
      pricePerCredit: 1490,
      formattedPricePerCredit: 'Rp 1.490/kredit',
    },
    memberTier: {
      price: 149000,
      formattedPrice: 'Rp 149.000',
      pricePerCredit: 1490,
      formattedPricePerCredit: 'Rp 1.490/kredit',
    },
    price: 149000,
    formattedPrice: 'Rp 149.000',
    pricePerCredit: 1490,
    formattedPricePerCredit: 'Rp 1.490/kredit',
    description: 'Paket langganan bulanan (sementara di-hold)',
    periodLabel: '/ bulan',
    badge: 'PRO PLAN (HOLD)',
    features: [
      '100 Video 1080p Full HD per bulan',
      'Antrean prioritas render',
      'Penyimpanan cloud prioritas',
      'Masa aktif: 1 bulan',
    ],
    billingType: 'SUBSCRIPTION',
    isActive: false, // Ditahan sementara sesuai spesifikasi
    validityMonths: 1,
  },
};

/**
 * Aturan Konsumsi Kredit (Credit Burn Logic)
 */
export const STUDIO_CREDIT_COSTS = {
  VIDEO_OTOMATIS_MP4: 3, // Jalur A: Mode Video Otomatis / Render MP4 = 3 Kredit
  PANDUAN_NASKAH_ASLI: 1, // Jalur B: Mode Panduan Naskah Asli / UGC Script = 1 Kredit
  RISET_TREN: 0, // Sesi Riset Tren: Kuota ter-bundle (0 Kredit)
} as const;

/**
 * Helper untuk menentukan apakah tenant memiliki langganan toko aktif (Shop Member)
 */
export function isTenantShopMember(tenant: { tier?: string | null; metadata?: any; is_shop_subscriber?: boolean } | null | undefined): boolean {
  if (!tenant) return false;
  if ((tenant as any).is_shop_subscriber === true) return true;
  const tier = String(tenant.tier || '').toUpperCase();
  const paidShopTiers = ['SOLO', 'PRO_SCALE', 'ADS_PERFORMANCE', 'ENTERPRISE', 'TEAM_SCALE', 'PRO', 'FOUNDER', 'MEMBER'];
  if (paidShopTiers.includes(tier)) {
    return true;
  }
  const meta = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  if (
    meta.is_shop_member === true ||
    meta.is_shop_subscriber === true ||
    meta.is_subscriber === true ||
    meta.has_active_shop === true ||
    meta.is_tenant_subscriber === true
  ) {
    return true;
  }
  return false;
}

/**
 * Helper untuk mengambil paket Studio berdasarkan id/alias string dan status keanggotaan.
 */
export function getStudioTokenPackage(
  packageKey: string,
  isShopMember: boolean = false
): StudioTokenPackage | null {
  if (!packageKey || typeof packageKey !== 'string') return null;
  const clean = packageKey.trim().toLowerCase();
  let base: StudioTokenPackage | null = null;
  if (clean === 'ketengan' || clean === 'eceran' || clean === '5') {
    base = STUDIO_TOKEN_PACKAGES.ketengan;
  } else if (clean === 'starter' || clean === '25') {
    base = STUDIO_TOKEN_PACKAGES.starter;
  } else if (clean === 'creator' || clean === 'hemat' || clean === 'kreator' || clean === '50') {
    base = STUDIO_TOKEN_PACKAGES.creator;
  } else if (clean === 'pro_monthly' || clean === 'pro' || clean === 'pro-monthly' || clean === '100') {
    base = STUDIO_TOKEN_PACKAGES.pro_monthly;
  }

  if (!base) return null;

  const tierData = isShopMember ? base.memberTier : base.publicTier;
  return {
    ...base,
    price: tierData.price,
    formattedPrice: tierData.formattedPrice,
    pricePerCredit: tierData.pricePerCredit,
    formattedPricePerCredit: tierData.formattedPricePerCredit,
  };
}
