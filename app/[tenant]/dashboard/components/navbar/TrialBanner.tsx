'use client';

import React from 'react';
import { Clock, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';

interface TrialBannerProps {
  daysLeft: number | null;
  tier?: string;
  onUpgrade: (targetTier: 'ads_performance' | 'team_scale') => void;
}

export default function TrialBanner({
  daysLeft,
  tier,
  onUpgrade,
}: TrialBannerProps) {
  // Hanya tampilkan jika tier adalah trial (SOLO_TRIAL, solo_trial, dll.)
  const isTrial = Boolean(
    tier && (tier.toLowerCase().includes('trial') || tier.toUpperCase() === 'SOLO_TRIAL')
  );

  if (!isTrial && daysLeft === null) {
    return null;
  }

  const safeDays = daysLeft !== null ? Math.max(0, daysLeft) : 0;
  const isExpired = safeDays === 0;

  return (
    <div
      role="alert"
      className={`w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b text-xs transition-colors ${
        isExpired
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : safeDays <= 3
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200 text-amber-900'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            isExpired
              ? 'bg-rose-100 text-rose-700'
              : 'bg-amber-100 text-amber-700 animate-pulse'
          }`}
        >
          {isExpired ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-extrabold tracking-wide uppercase text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md bg-white/80 border border-amber-300/60 text-amber-800 shrink-0">
            Reverse Trial
          </span>
          <p className="font-medium text-xs truncate">
            {isExpired ? (
              <span className="font-bold text-rose-700">
                Masa Trial Solo telah berakhir! Akses storefront & fitur automasi dibatasi.
              </span>
            ) : (
              <span>
                Masa Trial Solo:{' '}
                <strong className="font-black text-amber-950 font-mono">
                  {safeDays} hari tersisa
                </strong>
                . Nikmati fitur otomatisasi toko & katalog aktif tanpa biaya awal.
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onUpgrade('ads_performance')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
          <span>Upgrade Sekarang</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-80" />
        </button>
      </div>
    </div>
  );
}
