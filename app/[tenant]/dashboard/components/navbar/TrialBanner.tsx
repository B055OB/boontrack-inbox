'use client';

import React, { useMemo } from 'react';
import { Clock, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';

interface TrialBannerProps {
  daysLeft: number | null;
  tier?: string;
  trialEndsAt?: string | null;
  onUpgrade: (targetTier: 'ads_performance' | 'team_scale' | 'solo' | 'checkout_lite') => void;
}

export default function TrialBanner({
  daysLeft,
  tier,
  trialEndsAt,
  onUpgrade,
}: TrialBannerProps) {
  // Hanya tampilkan jika tier adalah trial (ADS_PERFORMANCE dengan trialEndsAt, SOLO_TRIAL, dll.)
  const isAdsTrial = Boolean(
    tier && (tier.toLowerCase().includes('ads') || tier.toLowerCase().includes('performance'))
  );
  const isTrial = Boolean(
    trialEndsAt ||
    isAdsTrial ||
    (tier && (tier.toLowerCase().includes('trial') || tier.toUpperCase() === 'SOLO_TRIAL'))
  );

  // Kalkulasi dinamis real-time sisa hari dari trial_ends_at
  // Gunakan Math.floor agar hari yang ditampilkan = hari penuh tersisa.
  // Jika sisa waktu < 24 jam, tampilkan dalam jam.
  const { calculatedDays, hoursLeft, showHours } = useMemo(() => {
    if (trialEndsAt) {
      const diffMs = new Date(trialEndsAt).getTime() - Date.now();
      if (diffMs <= 0) return { calculatedDays: 0, hoursLeft: 0, showHours: false };
      const totalHours = diffMs / (1000 * 60 * 60);
      const days = Math.floor(totalHours / 24);
      if (days < 1) {
        // Kurang dari 24 jam — tampilkan dalam jam
        return { calculatedDays: 0, hoursLeft: Math.floor(totalHours), showHours: true };
      }
      return { calculatedDays: days, hoursLeft: 0, showHours: false };
    }
    const fallback = daysLeft !== null ? Math.max(0, daysLeft) : null;
    return { calculatedDays: fallback, hoursLeft: 0, showHours: false };
  }, [trialEndsAt, daysLeft]);

  if (!isTrial && calculatedDays === null) {
    return null;
  }

  const safeDays = calculatedDays !== null ? calculatedDays : 0;
  const isExpired = safeDays === 0 && !showHours;

  // Label paket dinamis berdasarkan tier aktif — TIDAK hardcoded
  const planLabel = useMemo(() => {
    const t = (tier || '').toLowerCase();
    if (t.includes('ads') || t.includes('performance') || t === 'pro_scale') return 'Ads Performance';
    if (t.includes('enterprise') || t.includes('team')) return 'Team Scale';
    if (t.includes('checkout') || t.includes('lite')) return 'Checkout Lite';
    if (t.includes('starter') || t.includes('solo')) return 'Solo';
    // Fallback: kapitalisasi tier raw agar tetap bermakna
    return tier ? tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Trial';
  }, [tier]);

  // Teks sisa waktu: hari jika >= 1 hari, jam jika < 24 jam
  const timeLeftLabel = showHours
    ? `${hoursLeft} jam tersisa`
    : `${safeDays} hari tersisa`;

  return (
    <div
      role="alert"
      className={`w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b text-xs transition-colors ${
        isExpired
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : (safeDays <= 3 || showHours)
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
          <span
            className={`font-extrabold tracking-wide uppercase text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md shrink-0 border ${
              isExpired
                ? 'bg-rose-100 border-rose-300 text-rose-800'
                : isAdsTrial
                ? 'bg-blue-100 border-blue-300 text-blue-800'
                : 'bg-white/80 border-amber-300/60 text-amber-800'
            }`}
          >
            {isExpired ? 'Trial Kedaluwarsa' : `${planLabel} Trial`}
          </span>
          <p className="font-medium text-xs truncate">
            {isExpired ? (
              <span className="font-bold text-rose-700">
                Masa Trial {planLabel} telah berakhir! Akses storefront &amp; fitur automasi dibatasi.
              </span>
            ) : (
              <span>
                Masa Trial {planLabel}:{' '}
                <strong className="font-black text-amber-950 font-mono">
                  {timeLeftLabel}
                </strong>
                .{' '}
                {showHours
                  ? 'Kurang dari 24 jam! Segera upgrade agar toko tidak terputus.'
                  : safeDays <= 3
                  ? 'Segera upgrade agar automasi toko & etalase tidak terputus.'
                  : isAdsTrial
                  ? 'Nikmati fitur automasi toko, deteksi pembayaran & pixel tracking CAPI aktif tanpa biaya awal.'
                  : 'Nikmati fitur otomatisasi toko & katalog aktif tanpa biaya awal.'}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onUpgrade('ads_performance')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer text-white ${
            isExpired
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
          <span>{isExpired ? 'Aktivasi Paket Sekarang' : 'Upgrade Sekarang'}</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-80" />
        </button>
      </div>
    </div>
  );
}
