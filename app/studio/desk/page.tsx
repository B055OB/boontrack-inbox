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
  Compass,
  RefreshCw
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';
import ShopUpgradeBanner from '@/components/studio/ShopUpgradeBanner';

function persistStudioSession(slug: string, sessionObj?: any) {
  if (typeof window === 'undefined') return;
  const isBoonTrack =
    window.location.hostname.endsWith('boontrack.com') ||
    window.location.hostname === 'boontrack.com';
  const domainStr = isBoonTrack ? '; domain=.boontrack.com' : '';

  const cleanSlug = slug.trim().toLowerCase();
  const sessionData = sessionObj || {
    slug: cleanSlug,
    name: 'Creator Studio',
    tier: 'PRO',
    render_credits: 3,
  };

  try {
    localStorage.setItem('studio_session', JSON.stringify(sessionData));
    localStorage.setItem('bt_tenant', cleanSlug);
    localStorage.setItem('merchant_session', cleanSlug);
    localStorage.setItem('merchant_store', cleanSlug);
  } catch {}

  document.cookie = `studio_session=${encodeURIComponent(cleanSlug)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
  document.cookie = `bt_tenant=${encodeURIComponent(cleanSlug)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
  document.cookie = `merchant_session=${encodeURIComponent(cleanSlug)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
  document.cookie = `merchant_store=${encodeURIComponent(cleanSlug)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
}

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

  // Auth Guard & Loading State
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [hasValidSession, setHasValidSession] = useState<boolean>(false);

  // Quick Activation Token State
  const [quickToken, setQuickToken] = useState('');
  const [quickTokenLoading, setQuickTokenLoading] = useState(false);
  const [quickTokenError, setQuickTokenError] = useState<string | null>(null);

  const handleQuickActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickTokenError(null);
    const cleanT = quickToken.trim().toUpperCase();
    if (!cleanT) {
      setQuickTokenError('Masukkan kode aktivasi (contoh: ACTXKPH).');
      return;
    }
    setQuickTokenLoading(true);
    try {
      const res = await fetch('/api/studio/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanT }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Kode aktivasi tidak valid.');
      }
      const activeSlug = data.slug || 'studio';
      const activeSession = data.session || { slug: activeSlug, render_credits: 1 };
      persistStudioSession(activeSlug, activeSession);
      setTenantSlug(activeSlug);
      setSessionData(activeSession);
      setRenderCredits(activeSession.render_credits || 1);
      setHasValidSession(true);
    } catch (err: any) {
      setQuickTokenError(err.message || 'Gagal memverifikasi token.');
    } finally {
      setQuickTokenLoading(false);
    }
  };

  // Dynamic session resolution (Zero Hardcoding - Supabase SSOT with Creator Fallback)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const paramSlug = (urlParams.get('slug') || urlParams.get('tenant') || '').trim().toLowerCase();
    const isDevQuery =
      urlParams.get('dev') === 'true' ||
      urlParams.get('demo') === 'true' ||
      urlParams.get('creator') === 'true';

    // 1. Cookies check
    const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant|studio_session)=([^;]+)/);
    const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim().toLowerCase() : '';

    // 2. LocalStorage check
    const localVal = (
      localStorage.getItem('merchant_store') ||
      localStorage.getItem('merchant_session') ||
      localStorage.getItem('bt_tenant') ||
      ''
    ).replace(/^["']|["']$/g, '').trim().toLowerCase();

    // 3. Stored session object
    const storedSession = localStorage.getItem('studio_session');
    let parsedSession: any = null;
    if (storedSession) {
      try {
        parsedSession = JSON.parse(storedSession);
      } catch {}
    }

    const resolvedSlug = (
      paramSlug ||
      parsedSession?.slug ||
      localVal ||
      cookieVal ||
      ''
    ).toLowerCase();

    const isDevEnv =
      process.env.NODE_ENV !== 'development' ? isDevQuery : true;

    // Check if a recognized active session exists
    const hasExistingSession = Boolean(
      resolvedSlug &&
      resolvedSlug !== 'null' &&
      resolvedSlug !== 'undefined'
    );

    if (hasExistingSession) {
      const activeSession = parsedSession || { slug: resolvedSlug, tier: 'FREE', render_credits: 1 };
      setTenantSlug(resolvedSlug);
      setSessionData(activeSession);
      if (typeof activeSession.render_credits === 'number') {
        setRenderCredits(activeSession.render_credits);
      }
      setHasValidSession(true);
      setIsCheckingAuth(false);
      // Synchronize cookies across subdomains with .boontrack.com
      persistStudioSession(resolvedSlug, activeSession);
      return;
    }

    // In local dev environment: auto-initialize creator fallback session
    if (isDevEnv) {
      const fallbackSlug = 'creator';
      const fallbackSession = {
        slug: fallbackSlug,
        name: 'Creator Studio (Dev)',
        tier: 'PRO',
        render_credits: 3,
        is_fallback: true,
      };
      persistStudioSession(fallbackSlug, fallbackSession);
      setTenantSlug(fallbackSlug);
      setSessionData(fallbackSession);
      setRenderCredits(3);
      setHasValidSession(true);
      setIsCheckingAuth(false);
      return;
    }

    // In production without active session: display Studio Activation & Gateway card without kicking back to '/'
    setHasValidSession(false);
    setIsCheckingAuth(false);
  }, []);

  // Fetch data real-time entitlements & antrean video (graceful 401/403 handling)
  const fetchDashboardData = useCallback(async (slug: string) => {
    if (!slug || slug === 'null') return;
    setIsLoadingStats(true);
    try {
      // 1. Fetch entitlements (Zero redirect on 401/403/404)
      const entRes = await fetch(`/api/tenants/${encodeURIComponent(slug)}/entitlements`);
      if (entRes.status === 401 || entRes.status === 403) {
        console.warn(`[StudioDesk] Entitlements returned ${entRes.status}. Retaining current workspace state without redirect.`);
      } else if (entRes.ok) {
        const entJson = await entRes.json();
        if (entJson.success && entJson.data) {
          const ent = entJson.data;
          setRenderCredits(ent.credits_remaining ?? 1);
          setIsUnlimited(Boolean(ent.is_unlimited || ent.tier === 'FOUNDER'));
          setTenantTier(ent.tier || 'FREE');
          setIsShopMember(Boolean(ent.is_shop_member));
        }
      }

      // 2. Fetch jobs metrics (Zero redirect on 401/403/404)
      const jobsRes = await fetch(`/api/studio/jobs?tenant_id=${encodeURIComponent(slug)}&limit=100`);
      if (jobsRes.status === 401 || jobsRes.status === 403) {
        console.warn(`[StudioDesk] Jobs returned ${jobsRes.status}. Retaining current metrics state.`);
      } else if (jobsRes.ok) {
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
    if (hasValidSession && tenantSlug && tenantSlug !== 'null') {
      fetchDashboardData(tenantSlug);
    }
  }, [hasValidSession, tenantSlug, fetchDashboardData]);

  const handleStartVideo = (e: React.MouseEvent) => {
    if (!isUnlimited && tenantTier !== 'FOUNDER' && renderCredits <= 0) {
      e.preventDefault();
      setIsPaywallOpen(true);
    }
  };

  // Quick Creator Mode Activation (1-Click Fallback for Visitors/Owner)
  const handleActivateQuickCreator = () => {
    const creatorSlug = 'creator';
    const creatorSession = {
      slug: creatorSlug,
      name: 'Creator Workspace',
      tier: 'FREE',
      render_credits: 1,
      is_fallback: true,
    };
    persistStudioSession(creatorSlug, creatorSession);
    setTenantSlug(creatorSlug);
    setSessionData(creatorSession);
    setRenderCredits(1);
    setHasValidSession(true);
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      const isBoonTrack =
        window.location.hostname.endsWith('boontrack.com') ||
        window.location.hostname === 'boontrack.com';
      const domainStr = isBoonTrack ? '; domain=.boontrack.com' : '';

      localStorage.removeItem('studio_session');
      localStorage.removeItem('merchant_store');
      localStorage.removeItem('merchant_session');
      localStorage.removeItem('bt_tenant');

      document.cookie = `studio_session=; path=/${domainStr}; max-age=0`;
      document.cookie = `bt_tenant=; path=/${domainStr}; max-age=0`;
      document.cookie = `merchant_session=; path=/${domainStr}; max-age=0`;
      document.cookie = `merchant_store=; path=/${domainStr}; max-age=0`;

      setHasValidSession(false);
      setSessionData(null);
      setTenantSlug('');
    }
  };

  // ── SKELETON / INITIALIZING STATE (PREVENTS 1-SEC FLASH) ──────────
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0B0F17] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-0 right-1/4 w-[600px] h-[350px] bg-gradient-to-b from-indigo-600/15 via-fuchsia-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-fuchsia-500 to-indigo-600 p-[1px] shadow-xl shadow-fuchsia-500/20 animate-pulse">
            <div className="w-full h-full bg-[#0B0F17] rounded-[15px] flex items-center justify-center">
              <Film className="w-7 h-7 text-fuchsia-400" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold tracking-tight text-white">Menghubungkan ke Studio Desk</h2>
            <p className="text-xs text-zinc-400">Memeriksa kredensial sesi workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── UNATHENTICATED GATEWAY STATE (ELEGANT ACTIVATION CARD) ─────────
  if (!hasValidSession) {
    const isStudioSubdomain =
      typeof window !== 'undefined' &&
      (window.location.hostname.startsWith('studio.') ||
        window.location.hostname === 'studio.boontrack.com');
    const registerUrl = isStudioSubdomain ? '/register' : '/studio/register';

    return (
      <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-hidden flex flex-col justify-between">
        {/* Glow meshes */}
        <div className="absolute top-0 right-1/4 w-[650px] h-[400px] bg-gradient-to-b from-indigo-600/20 via-fuchsia-600/15 to-transparent blur-[140px] pointer-events-none -z-10" />
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-700/15 rounded-full blur-[130px] pointer-events-none -z-10" />

        {/* Minimal Header */}
        <header className="border-b border-white/10 bg-[#0B0F17]/80 backdrop-blur-xl py-4 px-6 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-indigo-600 p-[1px] shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center">
                  <Film className="w-4 h-4 text-fuchsia-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">boontrack</span>
                <span className="text-[10px] font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent uppercase">
                  STUDIO
                </span>
              </div>
            </Link>

            <Link
              href="/"
              className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1"
            >
              <span>Beranda</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        {/* Main Gateway Card */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
          <div className="max-w-lg w-full bg-[#111624]/90 backdrop-blur-2xl border border-white/10 hover:border-fuchsia-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50 text-center relative overflow-hidden transition-all">
            <div className="absolute top-0 right-0 w-36 h-36 bg-fuchsia-600/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
              {/* Badge Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500/20 to-indigo-500/20 border border-fuchsia-500/30 p-[1px] mx-auto shadow-lg shadow-fuchsia-500/20">
                <div className="w-full h-full bg-[#0B0F17] rounded-[15px] flex items-center justify-center">
                  <Film className="w-8 h-8 text-fuchsia-400 animate-pulse" />
                </div>
              </div>

              {/* Title & Desc */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-[10px] font-extrabold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-fuchsia-400" />
                  <span>Ruang Produksi Kreator & Agensi</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Akses Studio Desk
                </h1>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-sm mx-auto">
                  Untuk memproduksi video iklan otomatis dan storyboard UGC manusiawi, silakan aktifkan akun kreator resmi Anda atau masuk dengan sesi Creator.
                </p>
              </div>

              {/* Actions Grid */}
              <div className="space-y-3 pt-2">
                {/* Inline Quick Token Activation */}
                <form onSubmit={handleQuickActivate} className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickToken}
                      onChange={(e) => setQuickToken(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                      placeholder="Punya Kode Bot? Misal ACTXKPH"
                      className="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-mono font-bold uppercase text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition"
                    />
                    <button
                      type="submit"
                      disabled={quickTokenLoading || !quickToken.trim()}
                      className="px-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      {quickTokenLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>Aktifkan</span>
                      )}
                    </button>
                  </div>
                  {quickTokenError && (
                    <p className="text-[11px] text-rose-400 text-left">{quickTokenError}</p>
                  )}
                </form>

                <Link
                  href={registerUrl}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-purple-600 to-indigo-600 hover:from-fuchsia-600 hover:to-indigo-700 text-white font-black text-xs sm:text-sm shadow-xl shadow-fuchsia-500/25 transition-all flex items-center justify-center gap-2 group active:scale-98"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Daftar / Minta Kode via Bot WhatsApp</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>

                <button
                  type="button"
                  onClick={handleActivateQuickCreator}
                  className="w-full py-3 px-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-zinc-200 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-purple-400" />
                  <span>Masuk Cepat Sebagai Creator (Mode Eksplorasi)</span>
                </button>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Terpisah dari akun toko retail</span>
                </span>
                <Link href="/" className="text-zinc-400 hover:text-zinc-200 underline decoration-zinc-600">
                  Kembali ke Beranda
                </Link>
              </div>
            </div>
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-white/10 py-4 text-center text-xs text-zinc-500">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL • Studio Konten & Naskah Manusiawi</p>
        </footer>
      </div>
    );
  }

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
