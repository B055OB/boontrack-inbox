/**
 * @file lib/config/studio-pricing.ts
 * @description Single Source of Truth (SSOT) untuk Paket Harga Kredit Video & Langganan BoonTrack Studio.
 * 
 * ATURAN ARSITEKTUR:
 * 1. Seluruh UI Studio (Modal Paywall, Pricing Page, Topup Button) dan Gateway Invoice Xendit
 *    WAJIB mengacu ke konfigurasi ini. Dilarang menduplikasi nominal harga atau kuota kredit di JSX/Route.
 * 2. Besaran nominal IDR dan kuota kredit video render:
 *    - starter: 25 kredit, Rp 49.000 (One-time QRIS)
 *    - creator: 50 kredit, Rp 99.000 (One-time QRIS, recommended)
 *    - pro_monthly: 100 kredit, Rp 149.000 (Langganan bulanan)
 */

export type StudioPackageId = 'starter' | 'creator' | 'pro_monthly';

export interface StudioTokenPackage {
  id: StudioPackageId;
  name: string;
  credits: number;
  price: number; // Nominal IDR
  formattedPrice: string;
  description: string;
  periodLabel?: string;
  badge?: string;
  isPopular?: boolean;
  features: string[];
  billingType: 'ONE_TIME' | 'SUBSCRIPTION';
}

export const STUDIO_TOKEN_PACKAGES: Record<StudioPackageId, StudioTokenPackage> = {
  starter: {
    id: 'starter',
    name: 'Paket Starter',
    credits: 25,
    price: 49000,
    formattedPrice: 'Rp 49.000',
    description: 'Sekali beli via QRIS • No Watermark',
    features: [
      '25 Render Credits Siap Pakai',
      'Resolusi 1080p Full HD',
    ],
    billingType: 'ONE_TIME',
  },
  creator: {
    id: 'creator',
    name: 'Paket Creator',
    credits: 50,
    price: 99000,
    formattedPrice: 'Rp 99.000',
    description: 'Sekali beli via QRIS • No Watermark',
    badge: 'Paling Hemat',
    isPopular: true,
    features: [
      '50 Render Credits Siap Pakai',
      'Antrean Render FFmpeg Prioritas',
    ],
    billingType: 'ONE_TIME',
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Langganan Studio Pro',
    credits: 100,
    price: 149000,
    formattedPrice: 'Rp 149.000',
    description: 'Solusi lengkap untuk brand, merchant & kreator aktif',
    periodLabel: '/ bulan',
    badge: 'PRO PLAN',
    features: [
      '100 Video 1080p Full HD per bulan',
      'Antrean prioritas render FFmpeg',
      'Penyimpanan cloud prioritas',
      'Komersial clean metadata (is_aigc: 1)',
    ],
    billingType: 'SUBSCRIPTION',
  },
};

/**
 * Helper untuk mengambil paket Studio berdasarkan id/alias string.
 * Mendukung alias 'pro' -> 'pro_monthly'.
 */
export function getStudioTokenPackage(packageKey: string): StudioTokenPackage | null {
  if (!packageKey || typeof packageKey !== 'string') return null;
  const clean = packageKey.trim().toLowerCase();
  if (clean === 'starter') return STUDIO_TOKEN_PACKAGES.starter;
  if (clean === 'creator') return STUDIO_TOKEN_PACKAGES.creator;
  if (clean === 'pro_monthly' || clean === 'pro' || clean === 'pro-monthly') {
    return STUDIO_TOKEN_PACKAGES.pro_monthly;
  }
  return null;
}
