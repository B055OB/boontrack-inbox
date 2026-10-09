'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ExternalLink,
  Film,
  Zap,
  Clock,
  Video,
  CheckCircle2,
  Sliders,
  Smartphone,
  ChevronRight,
  Store,
  Download,
  BookOpen,
  Layers,
  Flame,
  Check
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';

export default function StudioWorkspaceDashboard() {
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [renderCredits, setRenderCredits] = useState<number>(0);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false);
  const [tenantTier, setTenantTier] = useState<string>('FREE');
  const [completedVideosCount, setCompletedVideosCount] = useState<number>(0);
  const [queuedJobsCount, setQueuedJobsCount] = useState<number>(0);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Dynamic session resolution (Zero Hardcoding - Supabase SSOT)
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

      const resolved = (localVal || cookieVal || 'studio').toLowerCase();
      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
      }

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (typeof parsed.render_credits === 'number') {
            setRenderCredits(parsed.render_credits);
          }
        } catch {}
      }
    }
  }, []);

  // Fetch real-time entitlements and jobs for creator dashboard
  const fetchDashboardData = useCallback(async (slug: string) => {
    setIsLoadingStats(true);
    try {
      // 1. Fetch entitlements
      const entRes = await fetch(`/api/tenants/${encodeURIComponent(slug)}/entitlements`);
      if (entRes.ok) {
        const entJson = await entRes.json();
        if (entJson.success && entJson.data) {
          const ent = entJson.data;
          setRenderCredits(ent.credits_remaining ?? 0);
          setIsUnlimited(Boolean(ent.is_unlimited || ent.tier === 'FOUNDER'));
          setTenantTier(ent.tier || 'FREE');
        }
      }

      // 2. Fetch jobs metrics
      const jobsRes = await fetch(`/api/studio/jobs?tenant_id=${encodeURIComponent(slug)}&limit=100`);
      if (jobsRes.ok) {
        const jobsJson = await jobsRes.json();
        if (jobsJson.success) {
          if (jobsJson.telemetry) {
            setCompletedVideosCount(jobsJson.telemetry.completed || 0);
            setQueuedJobsCount((jobsJson.telemetry.queued || 0) + (jobsJson.telemetry.processing || 0));
          } else if (Array.isArray(jobsJson.jobs)) {
            const completed = jobsJson.jobs.filter((j: any) => j.status === 'COMPLETED').length;
            const queued = jobsJson.jobs.filter((j: any) => j.status === 'QUEUED' || j.status === 'PROCESSING').length;
            setCompletedVideosCount(completed);
            setQueuedJobsCount(queued);
          }
        }
      }
    } catch (e) {
      console.warn('[StudioDashboard] Failed to fetch dashboard metrics:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (tenantSlug) {
      fetchDashboardData(tenantSlug);
    }
  }, [tenantSlug, fetchDashboardData]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Electric Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-fuchsia-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── 1. HEADER & WORKSPACE IDENTITY ─────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <Link href="/studio" className="flex items-center gap-2.5 group">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-indigo-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
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
                <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent uppercase">
                  STUDIO
                </span>
              </div>
            </Link>

            {/* Tenant Context Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 font-mono">
              <Store className="w-3 h-3 text-fuchsia-400" />
              <span>
                Workspace: <strong className="text-white">@{tenantSlug}</strong>
              </span>
            </div>

            {/* Creator Engine Status Pill (Sanitized - Ramah Kreator) */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Studio Engine: Siap Produksi</span>
            </div>
          </div>

          {/* Quick Credit Action & Navigation Shortcuts */}
          <div className="flex items-center gap-3 text-xs">
            {/* Quick Credit Status */}
            {isUnlimited || tenantTier === 'FOUNDER' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono text-[11px]">Founder Unlimited</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsPaywallOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 font-bold transition cursor-pointer"
                title="Beli Kuota Token Render"
              >
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-mono text-[11px]">{renderCredits} Token</span>
                <span className="px-1.5 py-0.5 rounded bg-violet-500/30 text-[10px] text-white font-mono ml-0.5">
                  + Top Up
                </span>
              </button>
            )}

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10 flex-1 w-full">

        {/* ── 2. HERO GREETING & SUITE INTRO ────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-300 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Studio Kreator & Produksi Video Iklan</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Studio Workspace Dashboard
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-2xl leading-relaxed">
              Pusat kendali pembuatan naskah video performa tinggi, perakitan multi-hook otomatis, dan generator variasi iklan MP4 siap tayang di media sosial.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/studio/fcd-automator"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-extrabold text-xs tracking-wide shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-2 active:scale-98"
            >
              <Sliders className="w-4 h-4" />
              <span>Buka Studio Editor →</span>
            </Link>
          </div>
        </div>

        {/* ── 3. 4 KARTU METRIK RAMAH KREATOR ───────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ringkasan Produksi Kreator</span>
            </h2>
            <span className="text-[11px] text-zinc-500 font-mono">Realtime Workspace Stats</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Sisa Kuota Token */}
            <div className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-violet-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Sisa Kuota Token</span>
                  <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                    {isUnlimited || tenantTier === 'FOUNDER' ? (
                      <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                        Founder Unlimited
                      </span>
                    ) : (
                      <>
                        <span>{isLoadingStats ? '...' : renderCredits}</span>
                        <span className="text-xs font-medium text-zinc-400 font-mono">Token</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {isUnlimited || tenantTier === 'FOUNDER'
                      ? 'Render bebas batas kuota'
                      : 'Kredit untuk render video instan'}
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                <button
                  type="button"
                  onClick={() => setIsPaywallOpen(true)}
                  className="text-xs font-bold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <span>+ Top Up Token</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {tenantTier}
                </span>
              </div>
            </div>

            {/* Metric 2: Video Siap Unduh */}
            <Link
              href="/studio/jobs"
              className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Video Siap Unduh</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Download className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                    <span>{isLoadingStats ? '...' : completedVideosCount}</span>
                    <span className="text-xs font-medium text-zinc-400 font-mono">MP4</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Video vertikal 9:16 siap posting
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                <span>Buka Unduhan MP4</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>

            {/* Metric 3: Antrean Render */}
            <div className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-sky-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-sky-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Antrean Render</span>
                  <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                    {queuedJobsCount > 0 ? (
                      <>
                        <span className="text-amber-400">{queuedJobsCount}</span>
                        <span className="text-xs font-medium text-amber-300/80 font-mono">Memproses</span>
                      </>
                    ) : (
                      <>
                        <span>0</span>
                        <span className="text-xs font-medium text-zinc-400 font-mono">Antrean</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {queuedJobsCount > 0
                      ? 'Sedang dikonversi ke MP4'
                      : 'Mesin render siap memproses seketika'}
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Siap Diproses</span>
                </span>
                <Link href="/studio/jobs" className="text-sky-400 hover:text-sky-300 text-xs font-semibold">
                  Status
                </Link>
              </div>
            </div>

            {/* Metric 4: Formula Naskah Tersimpan */}
            <Link
              href="/studio/fcd-automator"
              className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-fuchsia-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-28 h-28 bg-fuchsia-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Formula Naskah Tersimpan</span>
                  <div className="w-8 h-8 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                    <span>50+</span>
                    <span className="text-xs font-medium text-zinc-400 font-mono">Template</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Koleksi Hook & Naskah Viral Teruji
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs font-bold text-fuchsia-400 group-hover:text-fuchsia-300">
                <span>Jelajahi Formula Hook</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>
        </section>

        {/* ── 4. HERO CARD DOMINAN: FCD AUTOMATOR ───────────────── */}
        <section className="relative rounded-3xl p-7 sm:p-9 bg-gradient-to-br from-[#12162B] via-[#0E1322] to-[#0A0D18] border border-indigo-500/30 hover:border-indigo-500/50 shadow-2xl shadow-indigo-950/40 transition-all overflow-hidden group">
          {/* Subtle Ambient Radial Glows */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-600/25 transition-all duration-700" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 shadow-sm">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Modul Utama Studio</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/5 text-zinc-300 border border-white/10">
                  Fast Creative Delivery (FCD)
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  3 Hook × 1 Body × 2 CTA = 6 Iklan Unik
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                  FCD Automator: Matrix Multi-Iklan & Pratinjau 9:16 Safe-Zone
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300 mt-2.5 leading-relaxed">
                  Rakit 1 kampanye produk menjadi 6 variasi naskah iklan vertikal unik secara otomatis. 
                  Dilengkapi canvas simulator rasio 9:16 dengan panduan Safe-Zone TikTok & Instagram Reels agar teks judul 
                  dan visual hook tidak tertutup UI medsos, serta batch rendering instan.
                </p>
              </div>

              {/* 3 Core Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Creative Matrix</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Otomatisasi 3 sudut hook & 2 CTA urgensi berbeda sekali susun.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-fuchsia-300 text-xs font-bold">
                    <Smartphone className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>9:16 Safe-Zone</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Simulasi presisi bebas distorsi overlay tombol like & caption medsos.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                    <Film className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Batch MP4 Render</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Hemat waktu, langsung eksekusi seluruh variasi iklan ke antrean.
                  </p>
                </div>
              </div>
            </div>

            {/* Dominant CTA Button */}
            <div className="shrink-0 flex flex-col items-start lg:items-end gap-3">
              <Link
                href="/studio/fcd-automator"
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-black text-sm tracking-wide shadow-xl shadow-indigo-600/35 hover:shadow-indigo-600/50 transition-all flex items-center justify-center gap-3 active:scale-98 group/cta cursor-pointer"
              >
                <span>Buka Studio Editor →</span>
                <ArrowRight className="w-4 h-4 group-hover/cta:translate-x-1.5 transition-transform" />
              </Link>
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 self-center lg:self-end">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tanpa batas draft • Siap pakai</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── 5. LAUNCHPAD MODUL STUDIO TAMBAHAN ────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-fuchsia-400" />
              <span>Modul Kreator Lainnya</span>
            </h2>
            <span className="text-xs text-zinc-500 font-mono">Tools Pendukung</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: UGC Script Studio */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#111624]/90 border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                    <Video className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/25">
                    9-Scene Storyboard
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                    UGC Script Studio
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Generator naskah video berbasis formula viral untuk TikTok & Shopee Video. Dilengkapi pembagian 9 scene terstruktur, instruksi visual kamera, dan naskah narasi voiceover siap baca.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-[11px]">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-purple-400 font-bold block">Hook 3s</span>
                    <span className="text-zinc-400 text-[10px]">Pemicu Atensi</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-indigo-400 font-bold block">9 Scene</span>
                    <span className="text-zinc-400 text-[10px]">Struktur Alur</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                    <span className="text-emerald-400 font-bold block">Direct CTA</span>
                    <span className="text-zinc-400 text-[10px]">Keranjang Kuning</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between relative z-10">
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Siap untuk sesi aktif
                </span>
                <Link
                  href="/ugc-studio"
                  className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 hover:text-white font-bold text-xs transition flex items-center gap-1.5"
                >
                  <span>Buka UGC Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 2: Galeri & Riwayat Unduh Video */}
            <div className="p-6 sm:p-7 rounded-3xl bg-[#111624]/90 border border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <Film className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    Galeri & Unduhan
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                    Riwayat Render Video
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Akses terpusat ke seluruh materi video hasil eksekusi FCD Automator. Pantau status antrean render, pratinjau video MP4, dan salin link unduhan siap tayang.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                    <span className="text-zinc-400 font-sans">Status Antrean</span>
                    <span className="text-emerald-400 font-bold">{queuedJobsCount} Aktif</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                    <span className="text-zinc-400 font-sans">Video Siap Unduh</span>
                    <span className="text-white font-bold">{completedVideosCount} File</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between relative z-10">
                <span className="text-xs text-zinc-400">
                  Format MP4 H.264 standar medsos
                </span>
                <Link
                  href="/studio/jobs"
                  className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 hover:text-white font-bold text-xs transition flex items-center gap-1.5"
                >
                  <span>Buka Riwayat Render</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. WORKFLOW 3-LANGKAH PRODUKSI KREATIF ─────────────── */}
        <section className="p-8 sm:p-10 rounded-3xl bg-[#0F1420] border border-white/10 space-y-8">
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
              Alur Kerja Kreator
            </span>
            <h3 className="text-2xl font-bold text-white">
              Workflow 3-Langkah Pembuatan Konten Pemenang
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Standar alur kerja terotomasi untuk menghasilkan materi video siap posting dalam hitungan menit tanpa ribet editing manual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 font-extrabold text-sm flex items-center justify-center border border-indigo-500/30">
                1
              </div>
              <h4 className="text-base font-bold text-white">Input Brief & Pilih Hook</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Tentukan nama produk, target masalah pembeli, dan pilih formula hook viral (Pattern Interrupt, FOMO, atau Before-After).
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 font-extrabold text-sm flex items-center justify-center border border-purple-500/30">
                2
              </div>
              <h4 className="text-base font-bold text-white">Cek Safe-Zone 9:16</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Pratinjau visual vertikal di canvas smartphone agar hook dan CTA tidak terpotong oleh avatar, komentar, atau caption medsos.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 relative">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 font-extrabold text-sm flex items-center justify-center border border-emerald-500/30">
                3
              </div>
              <h4 className="text-base font-bold text-white">Batch Render & Download</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Klik render untuk memproses 6 variasi iklan secara otomatis, lalu unduh MP4 untuk langsung di-upload ke TikTok Ads & Shopee Video.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-500 bg-[#0B0F17]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL • BoonTrack Studio Creative Engine</p>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/studio/fcd-automator" className="hover:text-white transition-colors">FCD Automator</Link>
            <span>•</span>
            <Link href="/ugc-studio" className="hover:text-white transition-colors">UGC Script Studio</Link>
            <span>•</span>
            <Link href="/studio/jobs" className="hover:text-white transition-colors">Riwayat Video</Link>
            <span>•</span>
            <a href="https://shop.boontrack.com" className="hover:text-white transition-colors">Shop Platform</a>
          </div>
        </div>
      </footer>

      {/* ── STUDIO PAYWALL / TOP-UP TOKEN MODAL ─────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => {
          setIsPaywallOpen(false);
          if (tenantSlug) fetchDashboardData(tenantSlug);
        }}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
      />
    </div>
  );
}
