'use client';

import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import AdsTrackingPro from '../AdsTrackingPro';

export interface AdsTrackingTabProps {
  isAdsTrackingUnlocked: boolean;
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
  tenantSlug,
  displayName,
  onSaved,
  onUpgradeTier,
  renderLockedFeatureCard,
}: AdsTrackingTabProps) {
  if (!isAdsTrackingUnlocked) {
    if (renderLockedFeatureCard) {
      return (
        <>
          {renderLockedFeatureCard({
            title: "Ads Tracking Pro (Meta CAPI & ROAS)",
            badge: "Fitur Eksklusif Ads Performance & Team Scale",
            description: "Fitur Eksklusif Ads Performance & Team Scale. Aktifkan integrasi CAPI Server-Side dan pelacakan ROAS iklan riil.",
            targetTier: 'ads_performance',
            targetTierLabel: 'Ads Performance',
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
              Fitur Eksklusif Ads Performance & Team Scale
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
              Ads Tracking Pro (Meta CAPI & ROAS)
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
              Fitur Eksklusif Ads Performance & Team Scale. Aktifkan integrasi CAPI Server-Side dan pelacakan ROAS iklan riil.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onUpgradeTier?.('ads_performance')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl text-xs shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <span>Upgrade ke Ads Performance</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdsTrackingPro
      tenantSlug={tenantSlug}
      displayName={displayName}
      onSaved={onSaved}
    />
  );
}
