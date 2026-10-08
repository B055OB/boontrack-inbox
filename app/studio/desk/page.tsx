'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Film,
  Zap,
  Sparkles,
  Layers,
  FolderKanban,
  PlaySquare,
  Clock,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Plus,
  Cpu,
  Video,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';

export default function StudioDeskPage() {
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [sessionData, setSessionData] = useState<any>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

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

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          setSessionData(JSON.parse(storedSession));
        } catch {}
      }
    }
  }, []);

  const currentCredits = sessionData?.render_credits ?? 1;

  const handleStartVideo = (e: React.MouseEvent) => {
    if (currentCredits <= 0) {
      e.preventDefault();
      setIsPaywallOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Background Electric Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[450px] bg-gradient-to-b from-fuchsia-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/desk" className="flex items-center gap-2.5 group">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-purple-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                  <Film className="w-4 h-4 text-fuchsia-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight text-white">boontrack</span>
                  <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-400 bg-clip-text text-transparent uppercase">
                    STUDIO DESK
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Production Control Room & UGC Engine
                </p>
              </div>
            </Link>

            <span className="hidden sm:inline-block w-px h-6 bg-white/10" />

            {/* Active Workspace Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono text-slate-400">Workspace:</span>
              <span className="font-bold text-white font-mono">{tenantSlug}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Credit Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-bold text-violet-300">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>{currentCredits} Render Credit{currentCredits === 1 ? ' (Trial)' : 's'}</span>
            </div>

            {/* Top Up Button */}
            <button
              type="button"
              onClick={() => setIsPaywallOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Top Up Kredit</span>
            </button>

            {/* Buat Naskah UGC Link */}
            <Link
              href="/studio/ugc-studio"
              onClick={handleStartVideo}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-500/20 flex items-center gap-1.5 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Buat Naskah UGC</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── MAIN WORKSPACE CONTENT ────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Welcome Verification Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-fuchsia-950/40 border border-fuchsia-500/30 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Workspace WhatsApp Terverifikasi</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Selamat Datang di Studio Desk, {sessionData?.name || 'Kreator Brand'}!
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Ruang produksi konten Anda telah aktif. Gunakan Generator Naskah 9-Adegan berdaya AI untuk merancang hook, story, dan call-to-action video iklan performa tinggi.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/studio/ugc-studio"
              onClick={handleStartVideo}
              className="py-3 px-5 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-extrabold text-xs shadow-md transition flex items-center gap-2"
            >
              <span>Mulai Buat Video</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 4 Stat Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Render Credits */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/40 transition space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Render Credits</span>
              <Zap className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono flex items-baseline justify-between">
              <div>
                {currentCredits}
                <span className="text-xs font-normal text-slate-400 ml-1.5">
                  {currentCredits <= 1 ? '/ 1 Trial Kuota' : 'Credits'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPaywallOpen(true)}
                className="text-[11px] font-bold text-violet-400 hover:text-violet-300 underline cursor-pointer"
              >
                Top Up
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {currentCredits > 0
                ? `Tersedia ${currentCredits} kredit render video UGC resolusi Full HD`
                : 'Kredit habis. Top up sekarang untuk melanjutkan render.'}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/40 transition space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Concurrent Jobs</span>
              <Cpu className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">
              0 <span className="text-xs font-normal text-slate-400">/ 1 Slot Antrean</span>
            </div>
            <p className="text-[10px] text-slate-500">
              Antrean paralel pemrosesan video otomatis
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-pink-500/40 transition space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">UGC Scripts</span>
              <Film className="w-4 h-4 text-pink-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">
              Ready <span className="text-xs font-normal text-slate-400">9-Scene AI</span>
            </div>
            <p className="text-[10px] text-slate-500">
              Generator naskah iklan TikTok & Reels otomatis
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-emerald-500/40 transition space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Status Akun</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-emerald-400 flex items-center gap-1.5">
              <span>AKTIF</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              WA: {sessionData?.whatsapp || 'Terhubung'}
            </p>
          </div>
        </div>

        {/* Studio Production Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1: UGC Script Studio */}
          <Link
            href="/studio/ugc-studio"
            onClick={handleStartVideo}
            className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 hover:border-fuchsia-500/50 hover:bg-white/[0.04] transition group flex flex-col justify-between space-y-6"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-fuchsia-400 transition-colors">
                UGC Script Studio (9-Scene AI)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tulis naskah video viral berbasis formula Hook, Problem, Solution, dan Strong CTA dalam hitungan detik.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-400">
              <span>Buka Editor Naskah</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Feature 2: Storyboard & Asset Library */}
          <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 opacity-90 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                Creative Asset Library
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Simpan footage B-roll produk, audio voiceover AI, dan grafis promosi untuk otomatisasi render cepat.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
              <span>Terintegrasi dengan Script</span>
            </div>
          </div>

          {/* Feature 3: Cloud Render Queue & FCD Automator */}
          <Link
            href="/studio/fcd-automator"
            className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 hover:border-indigo-500/50 hover:bg-white/[0.04] transition group flex flex-col justify-between space-y-6"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                Render Queue & FCD Automator
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Antrean batch render multi-variasi (3 Hook x 1 Body x 2 CTA) otomatis tingkat server FFmpeg siap ekspor untuk TikTok Ads & Meta CAPI.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
              <span>Buka FCD Automator</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </main>

      {/* ── NATIVE STUDIO PAYWALL MODAL ───────────────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={currentCredits}
      />

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5">
        <p>BoonTrack Studio • Production Control Room & Media Engine</p>
      </footer>
    </div>
  );
}
