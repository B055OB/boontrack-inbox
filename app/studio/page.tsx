'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ExternalLink,
  Film,
  Layers,
  Cpu,
  Video,
  CheckCircle2,
  FolderKanban,
  Activity,
  PlayCircle,
  Terminal,
  UploadCloud,
  ChevronRight,
  Store
} from 'lucide-react';

export default function StudioWorkspaceDashboard() {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);

  // Dynamic session resolution (Zero Hardcoding)
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
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Background Electric Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[450px] bg-gradient-to-b from-fuchsia-600/12 via-purple-600/8 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/8 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* ── 1. HEADER & WORKSPACE IDENTITY ─────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <Link href="/studio" className="flex items-center gap-2.5 group">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-purple-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                  <img
                    src="/branding/studio/icon.png"
                    alt="BoonTrack Studio Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-lg tracking-tight text-white">boontrack</span>
                <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent uppercase">
                  STUDIO
                </span>
              </div>
            </Link>

            {/* Tenant Context Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 font-mono">
              <Store className="w-3 h-3 text-fuchsia-400" />
              {tenantSlug ? (
                <span>
                  Workspace: <strong className="text-white">@{tenantSlug}</strong>
                </span>
              ) : (
                <span className="text-zinc-400">Demo Workspace</span>
              )}
            </div>

            {/* Compute Status Pill */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Level 1 Compute: Active (FFmpeg CPU)</span>
            </div>
          </div>

          {/* Navigation Shortcuts */}
          <div className="flex items-center gap-3 text-xs">
            <a
              href="https://creator.boontrack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors"
            >
              <span>Showcase Publik</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
            <a
              href="https://shop.boontrack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors"
            >
              <span>Toko Utama</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </div>
        </div>
      </header>

      {/* ── MAIN WORKSPACE CONTENT ───────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">

        {/* Hero Banner Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/25 text-xs text-fuchsia-300 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>B2B Content Production Engine</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Studio Workspace Dashboard
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-2xl leading-relaxed">
              Pusat komando produksi naskah video performa tinggi, manajemen materi B-roll, dan telemetry pipeline rendering video BoonTrack.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/ugc-studio"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-fuchsia-600/30 transition-all inline-flex items-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>Buka UGC Script Studio</span>
            </Link>
          </div>
        </div>

        {/* ── 2. QUICK LAUNCHPAD GRID (3 CARDS) ────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-fuchsia-400" />
              Launchpad Modul Studio
            </h2>
            <span className="text-xs text-zinc-500 font-mono">3 Core Engines</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1 (Highlight): UGC Script Studio (9-Scene Engine) */}
            <div className="lg:col-span-6 p-7 rounded-3xl bg-gradient-to-br from-[#151226] via-[#101322] to-[#0D101C] border border-fuchsia-500/30 hover:border-fuchsia-500/60 shadow-xl shadow-fuchsia-950/30 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 flex items-center justify-center shadow-inner">
                    <Video className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                    Engine Unggulan
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-white group-hover:text-fuchsia-300 transition-colors">
                    UGC Script Studio (9-Scene Engine)
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 mt-2 leading-relaxed">
                    Buat naskah video Shopee & TikTok berbasis visual hooks dan formula viral teruji. 
                    Dilengkapi arahan visual kamera tiap scene, teks layar dinamis, dan narasi voiceover yang siap dibacakan talent.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-[11px]">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-fuchsia-400 font-bold block">Hook 3s</span>
                    <span className="text-zinc-400 text-[10px]">Pemicu Atensi</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-purple-400 font-bold block">9 Scene</span>
                    <span className="text-zinc-400 text-[10px]">Struktur Narasi</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-emerald-400 font-bold block">Direct CTA</span>
                    <span className="text-zinc-400 text-[10px]">Keranjang Kuning</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between relative z-10">
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Tersedia untuk sesi aktif
                </span>
                <Link
                  href="/ugc-studio"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-xs tracking-wide shadow-md shadow-fuchsia-900/40 transition-all flex items-center gap-2"
                >
                  <span>Buka Script Generator</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Card 2: Creative Asset Library */}
            <div className="lg:col-span-3 p-6 rounded-3xl bg-[#111624] border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between shadow-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/25">
                    Ready for Compose
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">Creative Asset Library</h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Kelola foto produk, footage B-roll, dan visual hook yang siap dirakit menjadi materi iklan video multi-format.
                  </p>
                </div>

                <div className="space-y-2 pt-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-zinc-400">Footage B-Roll</span>
                    <span className="text-white font-mono font-bold">Siap Pakai</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-zinc-400">Audio Backsound</span>
                    <span className="text-white font-mono font-bold">Bebas Royalti</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between text-xs text-purple-400 font-semibold">
                <span>Manajemen Aset</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Card 3: Media Render Jobs & Telemetry */}
            <Link
              href="/studio/jobs"
              className="lg:col-span-3 p-6 rounded-3xl bg-[#111624] border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.03] transition-all flex flex-col justify-between shadow-lg group cursor-pointer"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    Worker Pool Standby
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Media Render Jobs & Telemetry
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Antrean status render otomatis video FCD (FFmpeg queue status) & pipeline konversi video iklan performa tinggi.
                  </p>
                </div>

                <div className="space-y-2 pt-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-zinc-400 font-sans">Queue Status</span>
                    <span className="text-emerald-400 font-bold">0 Pending</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-zinc-400 font-sans">CPU Thread</span>
                    <span className="text-zinc-300">FFmpeg 7.x Active</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Buka Telemetri Render →</span>
                <Activity className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </section>

        {/* ── 3. WORKFLOW 3-LANGKAH ─────────────────────────────── */}
        <section className="p-8 sm:p-10 rounded-3xl bg-[#0F1420] border border-white/10 space-y-8">
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
              Pipeline Produksi
            </span>
            <h3 className="text-2xl font-bold text-white">
              Workflow 3-Langkah Pembuatan Konten Pemenang
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Standar alur kerja terotomasi untuk menghasilkan materi video siap posting dalam hitungan menit.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-fuchsia-500/20 text-fuchsia-400 font-extrabold text-sm flex items-center justify-center border border-fuchsia-500/30">
                1
              </div>
              <h4 className="text-base font-bold text-white">Input Brief Produk</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Tentukan nama produk, 3 keunggulan utama, target audiens spesifik, serta gaya bahasa (tone) yang diinginkan.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 font-extrabold text-sm flex items-center justify-center border border-purple-500/30">
                2
              </div>
              <h4 className="text-base font-bold text-white">Generate Hook & Storyboard</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Engine AI meracik formula hook 3 detik pembuka dan membagi naskah menjadi 9 scene visual, teks layar, dan voiceover.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 font-extrabold text-sm flex items-center justify-center border border-emerald-500/30">
                3
              </div>
              <h4 className="text-base font-bold text-white">Export & Launch Campaign</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Salin seluruh arahan syuting ke talent kreator atau eksekusi syuting mandiri, lalu pasang di TikTok Ads / Shopee Video.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-500 bg-[#0B0F17]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL • BoonTrack Studio Production Engine</p>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/ugc-studio" className="hover:text-white transition-colors">UGC Studio Engine</Link>
            <span>•</span>
            <a href="https://creator.boontrack.com" className="hover:text-white transition-colors">Creator Showcase</a>
            <span>•</span>
            <a href="https://shop.boontrack.com" className="hover:text-white transition-colors">Shop Platform</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
