'use client';

import React from 'react';
import { Lock, ArrowRight, MessageCircle } from 'lucide-react';

interface LockedFeatureCardProps {
  title: string;
  badge: string;
  description: string;
  targetTier: 'ads_performance' | 'team_scale';
  targetTierLabel: string;
  onUpgrade: (targetTier: 'ads_performance' | 'team_scale') => void;
}

export default function LockedFeatureCard({
  title,
  badge,
  description,
  targetTier,
  targetTierLabel,
  onUpgrade,
}: LockedFeatureCardProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 inline-block mb-2">
            {badge}
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">{title}</h2>
          <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onUpgrade(targetTier)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3.5 rounded-xl text-xs shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
          >
            <span>Upgrade Sekarang ({targetTierLabel})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href={`https://wa.me/6281977655099?text=${encodeURIComponent(
              `Halo Tim Billing BoonTrack, saya tertarik upgrade paket Pro/Scale untuk fitur ${title} (${badge}) & Paket Tahunan. Mohon info biaya dan panduan aktivasi.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-3.5 rounded-xl text-xs transition cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>Tanya Tim Billing</span>
          </a>
        </div>
      </div>
    </div>
  );
}
