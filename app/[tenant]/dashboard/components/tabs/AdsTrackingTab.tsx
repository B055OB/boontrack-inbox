'use client';

import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import AdsTrackingPro from '../AdsTrackingPro';

export interface AdsTrackingTabProps {
  isAdsTrackingUnlocked: boolean;
  /**
   * true bila tier adalah CHECKOUT_LITE (Rp 59k) — berhak atas Basic Browser Pixel.
   * Sesuai ARCHITECTURE.md §3.1 & §5.1.
   */
  isCheckoutLite?: boolean;
  /**
   * true bila tier adalah STARTER / SOLO / SOLO_TRIAL — juga berhak atas Basic Browser Pixel
   * (Meta & TikTok Pixel ID browser-side), tapi bukan CAPI / GTM.
   * Sesuai ARCHITECTURE.md §3.1.
   */
  isSoloOrTrial?: boolean;
  tenantSlug: string;
  displayName: string;
  onSaved?: (msg: string) => void;
  onUpgradeTier?: (targetTier: 'ads_performance' | 'team_scale') => void;
  renderLockedFeatureCard?: (props: {
    title: string;
    badge: string;
    description: string;
    targetTier: 'ads_performance' | 'team_scale';
    targetTierLabel: string;
  }) => React.ReactNode;
}

export default function AdsTrackingTab({
  isAdsTrackingUnlocked,
  isCheckoutLite = false,
  isSoloOrTrial = false,
  tenantSlug,
  displayName,
  onSaved,
  onUpgradeTier,
  renderLockedFeatureCard,
}: AdsTrackingTabProps) {
  // Tier yang berhak atas Basic Browser Pixel (Meta & TikTok Pixel ID):
  // - Ads Performance / Team Scale / Enterprise (isAdsTrackingUnlocked = true) → akses penuh
  // - CHECKOUT_LITE (Rp 59k) → Basic Pixel saja
  // - STARTER / SOLO (isSoloOrTrial) → Basic Pixel saja
  // Ref: ARCHITECTURE.md §3.1 & §5.1
  const hasBasicPixelAccess = isAdsTrackingUnlocked || isCheckoutLite || isSoloOrTrial;

  // Kunci TOTAL hanya bila tidak punya akses sama sekali
  if (!hasBasicPixelAccess) {
    if (renderLockedFeatureCard) {
      return (
        <>
          {renderLockedFeatureCard({
            title: "Ads Tracking & Basic Pixel",
            badge: "Tersedia mulai paket Checkout Lite (Rp 59k)",
            description: "Aktifkan pelacakan Meta Pixel & TikTok Pixel untuk toko Anda. Server-Side CAPI, GTM Container, dan Advanced ROAS tersedia di paket Ads Performance (Rp 299k).",
            targetTier: 'ads_performance',
            targetTierLabel: 'Ads Performance (Rp 299k)',
          })}
        </>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 inline-block mb-2">
              Tersedia mulai Checkout Lite (Rp 59k)
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
              Ads Tracking & Basic Pixel
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
              Aktifkan pelacakan <strong>Meta Pixel</strong> & <strong>TikTok Pixel</strong> browser-side untuk toko Anda.
              Server-Side CAPI, GTM Container, dan Advanced ROAS tersedia eksklusif di paket Ads Performance (Rp 299k).
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onUpgradeTier?.('ads_performance')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3.5 rounded-xl text-xs shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <span>Upgrade Sekarang</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // isCheckoutLite prop diteruskan ke AdsTrackingPro untuk mengunci seksi CAPI/GTM
  // Tier STARTER (isSoloOrTrial) diperlakukan sama seperti Checkout Lite di dalam AdsTrackingPro
  const isBasicPixelOnly = !isAdsTrackingUnlocked;

  return (
    <AdsTrackingPro
      tenantSlug={tenantSlug}
      displayName={displayName}
      onSaved={onSaved}
      isCheckoutLite={isBasicPixelOnly}
      onUpgradeTier={onUpgradeTier}
    />
  );
}
