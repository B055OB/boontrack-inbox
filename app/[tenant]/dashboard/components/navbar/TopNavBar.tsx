'use client';

import React from 'react';
import Link from 'next/link';
import { Store, ExternalLink, ArrowUpRight } from 'lucide-react';
import { PlanTier } from '../../hooks/useDashboardData';

interface TopNavBarProps {
  tenantSlug: string;
  displayName: string;
  planTier: PlanTier;
  permissions: {
    isSolo: boolean;
    isAdsPerformance: boolean;
    isTeamScale: boolean;
  };
  onUpgrade: (targetTier: 'ads_performance' | 'team_scale') => void;
}

export default function TopNavBar({
  tenantSlug,
  displayName,
  permissions,
  onUpgrade,
}: TopNavBarProps) {
  return (
    <header className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Link
          href={`/${tenantSlug}`}
          target="_blank"
          className="text-xs font-bold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 transition inline-flex items-center gap-1.5 shadow-xs shrink-0"
        >
          <Store className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Lihat Etalase Toko</span>
          <span className="sm:hidden">Toko</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </Link>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight truncate">
            {displayName}
          </h1>
          
          <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md border shrink-0 ${
            permissions.isTeamScale
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : permissions.isAdsPerformance
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}>
            {permissions.isTeamScale
              ? 'Team Scale (499k)'
              : permissions.isAdsPerformance
              ? 'Ads Performance (299k)'
              : 'Solo (199k)'}
          </span>

          {/* Tombol Inline Upgrade Paket */}
          {!permissions.isTeamScale && (
            <button
              type="button"
              onClick={() => onUpgrade(permissions.isSolo ? 'ads_performance' : 'team_scale')}
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold transition cursor-pointer"
            >
              <span>Upgrade</span>
              <ArrowUpRight className="w-3 h-3 text-amber-600" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs shrink-0">
        <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-[11px] sm:text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">Storefront Active</span>
          <span className="sm:hidden">Online</span>
        </span>
      </div>
    </header>
  );
}