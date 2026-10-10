'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Check,
  ShieldCheck,
  Cpu,
  FolderKanban,
  Activity,
  LogOut,
  UserCheck,
  SplitSquareVertical,
  Wrench,
  Copy,
  Send,
  Compass
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';
import ShopUpgradeBanner from '@/components/studio/ShopUpgradeBanner';

export default function StudioDeskPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [sessionData, setSessionData] = useState<any>(null);
  const [renderCredits, setRenderCredits] = useState<number>(1);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false);
  const [tenantTier, setTenantTier] = useState<string>('FREE');
  const [isShopMember, setIsShopMember] = useState<boolean>(false);
  const [completedVideosCount, setCompletedVideosCount] = useState<number>(0);
  const [queuedJobsCount, setQueuedJobsCount] = useState<number>(0);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Dynamic session resolution (Zero Hardcoding - Supabase SSOT)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant|studio_session)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();

      const storedSession = localStorage.getItem('studio_session');
      let parsedSession: any = null;
      if (storedSession) {
        try {
          parsedSession = JSON.parse(storedSession);
          setSessionData(parsedSession);
          if (typeof parsedSession.render_credits === 'number') {
            setRenderCredits(parsedSession.render_credits);
          }
        } catch {}
      }

      const resolved = (localVal || cookieVal || parsedSession?.slug || '').toLowerCase();

      // Auth Guard: Jika tidak ada sesi aktif, alihkan ke landing page publik
      const hasAuth = Boolean(
        (resolved && resolved !== 'null' && resolved !== 'undefined') ||
        parsedSession
      );

      if (!hasAuth) {
        const isStudioSubdomain = window.location.hostname.startsWith('studio.') || window.location.hostname === 'studio.boontrack.com';
        if (isStudioSubdomain) {
          window.location.href = '/';
        } else {
          router.replace('/studio');
        }
        return;
      }

      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
      }
    }
  }, [router]);

  // Fetch data real-time entitlements & antrean video
  const fetchDashboardData = useCallback(async (slug: string) => {
    setIsLoadingStats(true);
    try {
      // 1. Fetch entitlements
      const entRes = await fetch(`/api/tenants/${encodeURIComponent(slug)}/entitlements`);
      if (entRes.ok) {
        const entJson = await entRes.json();
        if (entJson.success && entJson.data) {
          const ent = entJson.data;
          setRenderCredits(ent.credits_remaining ?? 1);
          setIsUnlimited(Boolean(ent.is_unlimited || ent.tier === 'FOUNDER'));
          setTenantTier(ent.tier || 'FREE');
          setIsShopMember(Boolean(ent.is_shop_member));
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
      console.warn('[StudioDesk] Failed to fetch dashboard metrics:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (tenantSlug && tenantSlug !== 'null') {
      fetchDashboardData(tenantSlug);
    }
  }, [tenantSlug, fetchDashboardData]);

  const handleStartVideo = (e: React.MouseEvent) => {
    if (!isUnlimited && tenantTier !== 'FOUNDER' && renderCredits <= 0) {
      e.preventDefault();
      setIsPaywallOpen(true);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('studio_session');
      localStorage.removeItem('merchant_store');
      localStorage.removeItem('merchant_session');
      localStorage.removeItem('bt_tenant');
      document.cookie = 'merchant_store=; path=/; max-age=0';
      document.cookie = 'merchant_session=; path=/; max-age=0';
      document.cookie = 'bt_tenant=; path=/; max-age=0';
      document.cookie = 'studio_session=; path=/; max-age=0';
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-fuchsia-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── 1. HEADER & IDENTITAS WORKSPACE ─────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Logo & Identitas */}
          <div className="flex items-center gap-3">
            <Link href="/desk" className="flex items-center gap-2.5 group">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-indigo-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                  <Film className="w-4 h-4 text-fuchsia-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-lg tracking-tight text-white">boontrack</span>
                <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent uppercase">
                  STUDIO DESK
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

            {/* Status Asisten Cerdas */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Asisten Konten Cerdas: Siap Digunakan</span>
            </div>
          </div>

          {/* Quick Credit Action & Shortcuts */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {/* Status Kredit Video */}
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
                title="Beli Kuota Token Render (QRIS Instan)"
              >
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-mono text-[11px]">{renderCredits} Kredit Video{renderCredits === 1 ? ' (Trial)' : ''}</span>
                <span className="px-1.5 py-0.5 rounded bg-violet-500/30 text-[10px] text-white font-mono ml-0.5">
                  + Top Up QRIS
                </span>
              </button>
            )}

            <Link
              href="/studio/fcd-automator"
              onClick={handleStartVideo}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-500/20 flex items-center gap-1.5 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Studio Konten</span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-colors"
              title="Keluar dari Workspace"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN WORKSPACE CONTENT ───────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10 flex-1 w-full">

        {/* ── 2. HERO GREETING & VERIFIED BANNER ───────────────── */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-fuchsia-950/40 border border-fuchsia-500/30 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Workspace Studio Terverifikasi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Selamat Datang di Studio Desk, {sessionData?.name || `@${tenantSlug}`}!
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Ruang produksi konten Anda telah aktif. Gunakan <strong>Asisten Konten Cerdas</strong> untuk memproduksi <strong>Mode Video Otomatis</strong> (video instan siap tayang) atau <strong>Mode Panduan Naskah Asli</strong> (konten manusiawi: testimoni, jasa kuras toren, unboxing nyata).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Link
              href="/studio/fcd-automator"
              onClick={handleStartVideo}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-black text-xs shadow-xl shadow-indigo-600/30 transition flex items-center gap-2 active:scale-95"
            >
              <Video className="w-4 h-4" />
              <span>Bikin Video Otomatis</span>
            </Link>

            <Link
              href="/studio/ugc-studio"
              className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/15 transition flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-purple-300" />
              <span>Panduan Naskah Asli</span>
            </Link>
          </div>
        </div>

        {/* ── BANNER PENAWARAN UPGRADE TOKO (NON-MEMBER) ───────── */}
        <ShopUpgradeBanner
          isShopMember={isShopMember}
          tenantSlug={tenantSlug}
        />

        {/* ── 3. 4 KARTU METRIK RAMAH KREATOR ───────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ringkasan Produksi Konten</span>
            </h2>
            <span className="text-[11px] text-zinc-500 font-mono">Realtime Entitlement Stats</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Sisa Kuota Kredit */}
            <div className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-violet-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-28 h-28 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Sisa Kuota Kredit</span>
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
                        <span className="text-xs font-medium text-zinc-400 font-mono">
                          {renderCredits === 1 ? 'Trial Kuota' : 'Kredit'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {isUnlimited || tenantTier === 'FOUNDER'
                      ? 'Render bebas batas kuota'
                      : renderCredits > 0
                        ? `Tersedia ${renderCredits} kredit video Full HD siap pakai`
                        : 'Kredit habis. Top up sekarang untuk melanjutkan render.'}
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                <button
                  type="button"
                  onClick={() => setIsPaywallOpen(true)}
                  className="text-xs font-bold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <span>+ Top Up QRIS</span>
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
                    Video vertikal 9:16 bersih tanpa watermark
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                <span>Buka Unduhan MP4</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>

            {/* Metric 3: Antrean Pemrosesan */}
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
                      ? 'Sedang dikonversi ke format MP4'
                      : 'Mesin pemroses siap menerima tugas'}
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Server Standby</span>
                </span>
                <Link href="/studio/jobs" className="text-sky-400 hover:text-sky-300 text-xs font-semibold">
                  Status
                </Link>
              </div>
            </div>

            {/* Metric 4: Panduan Naskah Asli */}
            <Link
              href="/studio/ugc-studio"
              className="p-5 rounded-2xl bg-[#111624]/90 border border-white/10 hover:border-fuchsia-500/40 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-28 h-28 bg-fuchsia-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Panduan Naskah Asli</span>
                  <div className="w-8 h-8 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UserCheck className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
                    <span>Manusiawi</span>
                    <span className="text-xs font-medium text-zinc-400 font-mono">Anti-Kaku</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Panduan adegan syuting testimoni & aksi nyata
                  </p>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between relative z-10 text-xs font-bold text-fuchsia-400 group-hover:text-fuchsia-300">
                <span>Buka Editor Naskah</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>
        </section>

        {/* ── 4. HERO CARD UTAMA: ALUR KERJA TERARAH (NO-TIMELINE) ── */}
        <section className="relative rounded-3xl p-7 sm:p-9 bg-gradient-to-br from-[#12162B] via-[#0E1322] to-[#0A0D18] border border-indigo-500/30 hover:border-indigo-500/50 shadow-2xl shadow-indigo-950/40 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-600/25 transition-all duration-700" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 shadow-sm">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Alur 5 Langkah No-Timeline Editor</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/5 text-zinc-300 border border-white/10">
                  Tanpa Garis Waktu Rumit
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  1 Ide Menjadi 6 Variasi Video Iklan
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                  Studio Konten: Video Otomatis & Panduan Rekam Asli
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300 mt-2.5 leading-relaxed">
                  Pilih cara kerja yang paling pas untuk bisnis Anda: <strong>Bikin Video Otomatis</strong> untuk promosi instan siap posting, atau <strong>Bikin Panduan Rekam Asli</strong> agar kreator Anda bisa berbicara santai di depan kamera untuk konten testimoni dan bukti servis lapangan.
                </p>
              </div>

              {/* 3 Core Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Langkah 1 & 2</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Riset tren & pilih mode otomatis atau panduan rekam asli.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-fuchsia-300 text-xs font-bold">
                    <Smartphone className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Langkah 3</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Hasil jadi seketika tanpa edit timeline (Aman 9:16 Medsos).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                    <SplitSquareVertical className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Langkah 4 & 5</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    Salin caption medsos & ekspor paket variasi split-test iklan.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="shrink-0 flex flex-col items-start lg:items-end gap-3">
              <Link
                href="/studio/fcd-automator"
                onClick={handleStartVideo}
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-black text-sm tracking-wide shadow-xl shadow-indigo-600/35 hover:shadow-indigo-600/50 transition-all flex items-center justify-center gap-3 active:scale-98 group/cta cursor-pointer"
              >
                <span>Buka Studio Konten →</span>
                <ArrowRight className="w-4 h-4 group-hover/cta:translate-x-1.5 transition-transform" />
              </Link>
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 self-center lg:self-end">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tanpa batas draft • Pembayaran QRIS Instan</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── 5. LAUNCHPAD DUA MODE PRODUKSI UTAMA ───────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-fuchsia-400" />
              <span>Dua Mode Eksekusi Konten</span>
            </h2>
            <span className="text-[11px] text-zinc-500 font-mono">Pilihan Fleksibel Sesuai Kebutuhan</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Mode 1: Video Otomatis */}
            <Link
              href="/studio/fcd-automator"
              onClick={handleStartVideo}
              className="p-6 rounded-3xl bg-[#111624]/80 border border-white/10 hover:border-indigo-500/50 hover:bg-white/[0.03] transition-all flex flex-col justify-between shadow-lg group cursor-pointer"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Video className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                    Instan Siap Posting
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                    Mode Video Otomatis
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Hasilkan video promosi instan vertikal 9:16 Full HD dari materi produk Anda, lengkap dengan variasi pembuka (hook) untuk uji iklan.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between text-xs text-indigo-400 font-semibold">
                <span>Mulai Buat Video Otomatis →</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Mode 2: Panduan Naskah Asli */}
            <Link
              href="/studio/ugc-studio"
              className="p-6 rounded-3xl bg-[#111624]/80 border border-white/10 hover:border-fuchsia-500/50 hover:bg-white/[0.03] transition-all flex flex-col justify-between shadow-lg group cursor-pointer"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25">
                    Alami & Manusiawi
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-fuchsia-400 transition-colors">
                    Mode Panduan Naskah Asli
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Panduan urutan adegan yang mudah dibaca kreator di depan kamera: cocok untuk testimoni jujur, review unboxing, dan aksi nyata jasa kuras toren/servis.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between text-xs text-fuchsia-400 font-semibold">
                <span>Buka Panduan Naskah →</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Modul 3: Antrean Unduhan */}
            <Link
              href="/studio/jobs"
              className="p-6 rounded-3xl bg-[#111624]/80 border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.03] transition-all flex flex-col justify-between shadow-lg group cursor-pointer"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Download className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    Siap Unduh
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Riwayat & Unduhan MP4
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Daftar seluruh video MP4 Full HD yang telah selesai diproses, siap langsung diunduh ke ponsel atau laptop Anda.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/5 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Buka Daftar Unduhan →</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </section>

      </main>

      {/* ── PAYWALL MODAL (PEMBAYARAN QRIS INSTAN) ─────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
        isShopMember={isShopMember}
      />

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-zinc-500 bg-[#0B0F17] mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL • Studio Konten & Naskah Manusiawi</p>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/studio/fcd-automator" className="hover:text-white transition-colors">Video Otomatis</Link>
            <span>•</span>
            <Link href="/studio/ugc-studio" className="hover:text-white transition-colors">Panduan Naskah Asli</Link>
            <span>•</span>
            <Link href="/studio/jobs" className="hover:text-white transition-colors">Unduhan MP4</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
