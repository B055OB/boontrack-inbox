'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Film,
  Sparkles,
  ArrowRight,
  Store,
  ExternalLink,
  Layers,
  Video,
  CheckCircle2,
  TrendingUp,
  LogIn
} from 'lucide-react';

export default function StudioDashboardPage() {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();

      const resolved = (localVal || cookieVal || '').toLowerCase();
      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
      }
    }
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 selection:bg-rose-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* Top Navbar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-[1px] shadow-lg shadow-rose-900/20">
              <div className="w-full h-full bg-neutral-950 rounded-[11px] flex items-center justify-center">
                <Film className="w-5 h-5 text-rose-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">BoonTrack Studio</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  Workspace
                </span>
              </div>
              <p className="text-xs text-neutral-400">Pusat Kreativitas, Produksi UGC, & Kolaborasi Brand</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {tenantSlug ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
                  <Store className="w-3.5 h-3.5 text-rose-400" />
                  <span>Toko:</span>
                  <strong className="text-white">@{tenantSlug}</strong>
                </span>
                <Link
                  href={`/${tenantSlug}/dashboard`}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Dashboard Toko</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-400">
                  Mode Standalone
                </span>
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors inline-flex items-center gap-1.5 shadow-md shadow-rose-950/40"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login Merchant</span>
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative rounded-3xl bg-gradient-to-b from-neutral-900/90 to-neutral-900/30 border border-neutral-800/80 p-8 md:p-12 overflow-hidden shadow-2xl backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800/80 border border-neutral-700/60 text-xs text-rose-300">
              <Sparkles className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>AI Content Engine for TikTok & Shopee Video</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Akselerasi Konversi Iklan dengan Naskah UGC Teruji.
            </h2>
            <p className="text-sm md:text-base text-neutral-300 leading-relaxed">
              Buat arahan visual syuting, teks narasi, dan hook psikologis 9-scene otomatis. 
              Tersambung langsung dengan ekosistem WhatsApp Commerce dan landing checkout BoonTrack.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/ugc-studio"
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs md:text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-rose-950/50 hover:gap-3"
              >
                <span>Buka UGC Script Studio</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://creator.boontrack.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-xl bg-neutral-800/90 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs md:text-sm font-medium border border-neutral-700/80 transition-colors flex items-center gap-2"
              >
                <span>Portal Kreator BoonTrack</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              </a>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: UGC Script Studio */}
          <Link
            href="/ugc-studio"
            className="group rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800 hover:border-rose-500/50 p-6 transition-all duration-300 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-white group-hover:text-rose-400 transition-colors flex items-center gap-1.5">
                  UGC Script Studio
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Formula hook 3 detik pertama, 9-scene visual breakdown, teks layar, dan arahan voiceover siap syuting talent.
                </p>
              </div>
            </div>
            <div className="pt-6 border-t border-neutral-800/60 mt-6 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Siap Digunakan
              </span>
              <span className="font-semibold text-rose-400 group-hover:underline">Buka Generator &rarr;</span>
            </div>
          </Link>

          {/* Card 2: Creator Showcase & Rate Card */}
          <a
            href="https://creator.boontrack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 p-6 transition-all duration-300 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-white group-hover:text-sky-400 transition-colors flex items-center gap-1.5">
                  Katalog Kreator & Rate Card
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                </h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Platform portofolio publik kreator dengan integrasi rate card interaktif, showcase video review, dan penerimaan pesanan.
                </p>
              </div>
            </div>
            <div className="pt-6 border-t border-neutral-800/60 mt-6 flex items-center justify-between text-[11px] text-neutral-400">
              <span>creator.boontrack.com</span>
              <span className="font-semibold text-sky-400 group-hover:underline">Jelajahi Profil &rarr;</span>
            </div>
          </a>

          {/* Card 3: Performance Ads Matching */}
          <div className="rounded-2xl bg-neutral-900/40 border border-neutral-800 p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-white flex items-center gap-1.5">
                  Ads & Commerce Pipeline
                </h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Sambungkan video iklan UGC dengan katalog toko, integrasi Meta Ads Pixel / TikTok Pixel, serta checkout otomatis.
                </p>
              </div>
            </div>
            <div className="pt-6 border-t border-neutral-800/60 mt-6 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="text-neutral-500">BoonTrack Native Suite</span>
              <span className="text-neutral-400">Terhubung</span>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
