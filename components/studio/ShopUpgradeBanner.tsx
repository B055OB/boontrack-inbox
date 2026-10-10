'use client';

import React from 'react';
import Link from 'next/link';
import { Store, ArrowRight, Sparkles, ShieldCheck, Zap } from 'lucide-react';

export interface ShopUpgradeBannerProps {
  /**
   * Jika true (sudah member), banner otomatis disembunyikan.
   */
  isShopMember?: boolean;
  tenantSlug?: string;
  className?: string;
  variant?: 'banner' | 'card' | 'compact';
  onActionClick?: () => void;
}

export default function ShopUpgradeBanner({
  isShopMember = false,
  tenantSlug = 'studio',
  className = '',
  variant = 'banner',
  onActionClick,
}: ShopUpgradeBannerProps) {
  // Hanya tampilkan khusus untuk user dengan status non-member / publik
  if (isShopMember) {
    return null;
  }

  const registerHref = tenantSlug && tenantSlug !== 'studio'
    ? `/register?slug=${encodeURIComponent(tenantSlug)}&ref=studio_upgrade`
    : '/register?ref=studio_upgrade';

  if (variant === 'compact') {
    return (
      <div
        className={`px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-950/70 via-teal-950/50 to-slate-900 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs shadow-lg ${className}`}
        role="region"
        aria-label="Penawaran Upgrade Toko BoonTrack"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">💡</span>
          <p className="text-emerald-200 text-[11px] truncate">
            <strong>Buka Toko Online di BoonTrack Shop:</strong> Dapatkan bonus 15 Kredit Studio gratis + Kunci harga member termurah (mulai 15rb/paket) selamanya!
          </p>
        </div>
        <Link
          href={registerHref}
          onClick={onActionClick}
          className="shrink-0 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center gap-1 transition active:scale-95 shadow-sm"
        >
          <span>Aktifkan Toko Sekarang →</span>
        </Link>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`p-5 rounded-2xl bg-gradient-to-br from-[#0e1f18] via-[#0d1624] to-[#121324] border border-emerald-500/35 relative overflow-hidden shadow-xl ${className}`}
        role="region"
        aria-label="Penawaran Upgrade Toko BoonTrack"
      >
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
              💡
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
              Penawaran Khusus Kreator
            </span>
          </div>

          <p className="text-xs text-emerald-100 font-medium leading-relaxed">
            💡 Buka Toko Online di BoonTrack Shop: Dapatkan bonus 15 Kredit Studio gratis + Kunci harga member termurah (mulai 15rb/paket) selamanya!
          </p>

          <div className="pt-1 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-300 font-bold">
                <Sparkles className="w-3 h-3 text-emerald-400" /> +15 Kredit Masuk Saldo
              </span>
              <span>•</span>
              <span className="font-mono">Diskon s/d 35% Selamanya</span>
            </div>

            <Link
              href={registerHref}
              onClick={onActionClick}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-500/20"
            >
              <span>Aktifkan Toko Sekarang →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Default 'banner' variant (ideal untuk Studio Desk & Halaman Studio)
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900/90 to-teal-950/60 border border-emerald-500/35 relative overflow-hidden shadow-xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${className}`}
      role="region"
      aria-label="Penawaran Upgrade Toko BoonTrack"
    >
      <div className="absolute top-0 right-1/4 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex items-start gap-3.5 max-w-3xl">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
          <span className="text-base">💡</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Bonus Spesial Member Toko
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              Hemat Pengeluaran Produksi Konten
            </span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-100 font-medium leading-relaxed">
            💡 Buka Toko Online di BoonTrack Shop: Dapatkan bonus 15 Kredit Studio gratis + Kunci harga member termurah (mulai 15rb/paket) selamanya!
          </p>
        </div>
      </div>

      <div className="relative z-10 shrink-0 self-start md:self-center">
        <Link
          href={registerHref}
          onClick={onActionClick}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-lg shadow-emerald-500/25"
        >
          <span>Aktifkan Toko Sekarang →</span>
        </Link>
      </div>
    </div>
  );
}
