'use client';

import React from 'react';
import {
  Lock,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  MessageCircle,
  AlertCircle,
} from 'lucide-react';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

export interface FeatureComparison {
  problemTitle?: string;
  problem: string;
  solutionTitle?: string;
  solution: string;
}

export interface FeatureLockedTeaserProps {
  featureTitle: string;
  badgeTier: string;
  headline: string;
  bullets: string[];
  comparison?: FeatureComparison;
  calloutBanner?: string;
  ctaText?: string;
  featureIcon?: React.ReactNode;
  onUpgrade?: () => void;
  upgradeUrl?: string;
  compact?: boolean;
  className?: string;
  tenantSlug?: string;
}

export default function FeatureLockedTeaser({
  featureTitle,
  badgeTier,
  headline,
  bullets = [],
  comparison,
  calloutBanner,
  ctaText = 'Upgrade Paket Sekarang',
  featureIcon,
  onUpgrade,
  upgradeUrl,
  compact = false,
  className = '',
  tenantSlug,
}: FeatureLockedTeaserProps) {
  const handlePrimaryClick = () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    if (upgradeUrl) {
      window.open(upgradeUrl, '_blank');
      return;
    }
    // Default fallback: direct to platform billing WhatsApp
    const waNumber = getPlatformWhatsApp() || '6281977655099';
    const text = encodeURIComponent(
      `Halo Tim Billing BoonTrack, saya tertarik upgrade paket Pro/Scale untuk fitur "${featureTitle}" (${badgeTier})${
        tenantSlug ? ` di toko "${tenantSlug}"` : ''
      } & Paket Tahunan. Mohon info biaya dan panduan aktivasi.`
    );
    window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank');
  };

  const handleConsultClick = () => {
    const waNumber = getPlatformWhatsApp() || '6281977655099';
    const text = encodeURIComponent(
      `Halo Tim Billing BoonTrack, saya tertarik upgrade paket Pro/Scale untuk fitur "${featureTitle}" (${badgeTier})${
        tenantSlug ? ` di toko "${tenantSlug}"` : ''
      } & Paket Tahunan. Mohon info biaya dan panduan aktivasi.`
    );
    window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank');
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950 text-white shadow-2xl transition-all ${
        compact ? 'p-4 sm:p-5' : 'p-6 sm:p-10 max-w-2xl mx-auto w-full'
      } ${className}`}
    >
      {/* Radiant Ambient Glow Behind the Card */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-12 w-64 h-64 bg-violet-600/10 rounded-full blur-2xl"
        aria-hidden="true"
      />

      {/* Header: Lock Icon Badge + Tier Chip */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-3">
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 via-slate-800/80 to-indigo-500/20 border border-amber-300/30 flex items-center justify-center shadow-lg shadow-amber-500/10 text-amber-300 backdrop-blur-md">
            {featureIcon || <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />}
          </div>
          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center border-2 border-slate-900 shadow-xs">
            <Lock className="w-3 h-3 stroke-[2.5]" />
          </div>
        </div>

        {/* Feature Title & Tier Badge */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30 shadow-2xs">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{badgeTier}</span>
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-slate-400">
              {featureTitle}
            </span>
          </div>

          <h2
            className={`font-black text-white tracking-tight leading-snug ${
              compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
            }`}
          >
            {headline}
          </h2>
        </div>

        {/* Komparasi Masalah vs Solusi (Business Education Block) */}
        {comparison && (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-1 text-left">
            <div className="p-3 sm:p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-1">
              <div className="flex items-center gap-1.5 text-rose-400 text-[10px] font-black uppercase tracking-wide">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{comparison.problemTitle || 'Tantangan Saat Ini'}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-rose-200/90 leading-relaxed">
                {comparison.problem}
              </p>
            </div>

            <div className="p-3 sm:p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-wide">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{comparison.solutionTitle || 'Solusi BoonTrack'}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-emerald-200/90 leading-relaxed">
                {comparison.solution}
              </p>
            </div>
          </div>
        )}

        {/* Value Proposition Bullets (3 Poin Benefit Utama) */}
        {bullets && bullets.length > 0 && (
          <div
            className={`w-full text-left bg-slate-900/70 border border-slate-800/80 rounded-2xl backdrop-blur-sm mt-3 ${
              compact ? 'p-3.5 space-y-2.5' : 'p-5 sm:p-6 space-y-3'
            }`}
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Nilai Bisnis &amp; Keunggulan Fitur</span>
            </div>
            {bullets.map((bullet, idx) => {
              // Parse optional "Judul: Deskripsi" structure
              const colonIndex = bullet.indexOf(':');
              const hasColon = colonIndex > 0 && colonIndex < 40;
              const pointHeader = hasColon ? bullet.slice(0, colonIndex + 1) : null;
              const pointBody = hasColon ? bullet.slice(colonIndex + 1).trim() : bullet;

              return (
                <div key={idx} className="flex items-start gap-2.5 text-slate-200">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <p className={`leading-relaxed text-slate-300 ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    {pointHeader ? (
                      <>
                        <strong className="text-white font-extrabold mr-1">{pointHeader}</strong>
                        <span>{pointBody}</span>
                      </>
                    ) : (
                      bullet
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Callout Penawaran Tahunan / Tips Hemat */}
        {calloutBanner && (
          <div className="w-full p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-bold flex items-start gap-2.5 shadow-sm text-left mt-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed text-amber-100">{calloutBanner}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div
          className={`w-full pt-3 flex flex-col sm:flex-row items-center justify-center gap-2.5 ${
            compact ? 'flex-col' : ''
          }`}
        >
          <button
            type="button"
            onClick={handlePrimaryClick}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-blue-600 to-indigo-600 hover:from-indigo-400 hover:via-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>{ctaText}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleConsultClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/80 font-bold text-xs px-4 py-3.5 rounded-xl transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            <span>Tanya Tim Billing</span>
          </button>
        </div>

        {/* Security / Guarantee Microcopy */}
        <p className="text-[10px] text-slate-500 pt-1">
          Aktivasi instan tanpa downtime toko. Data &amp; konfigurasi katalog Anda tetap 100% aman.
        </p>
      </div>
    </div>
  );
}
