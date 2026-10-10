'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  Film,
  Zap,
  CheckCircle2,
  Sliders,
  Smartphone,
  ChevronRight,
  ShieldCheck,
  Check,
  Flame,
  Layers,
  Cpu,
  LogIn,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  Video,
  Volume2,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import {
  STUDIO_TOKEN_PACKAGES,
  StudioPackageId
} from '@/lib/config/studio-pricing';

// Hook demonstration definitions for FCD Automator Interactive Demo
const FCD_DEMO_HOOKS = [
  {
    id: 'hook-1',
    badge: 'Formula Keraguan (Agitation)',
    hookTitle: 'Hook 1: Kelemahan & Keraguan',
    hookCopy: 'Jujur, tadinya skeptis banget sama produk ini...',
    visualScene: 'Talent memegang produk di depan kamera dengan ekspresi penasaran / ragu.',
    stickerText: 'JUJUR, TADINYA RAGU BANGET! 🤯',
    duration: '0-3 Detik',
    psychology: 'Menghancurkan skepticism audiens dengan validasi keraguan mereka di 3 detik pertama.',
  },
  {
    id: 'hook-2',
    badge: 'Formula Interupsi (Direct Urgency)',
    hookTitle: 'Hook 2: Pola Interupsi Viral',
    hookCopy: 'Stop scrolling! Jangan beli ini sebelum kamu tahu 3 rahasia ini!',
    visualScene: 'Talent memberi isyarat tangan stop, zoom cepat ke detail produk.',
    stickerText: 'JANGAN BELI SEBELUM TAHU INI! 🛑',
    duration: '0-3 Detik',
    psychology: 'Menciptakan pattern interrupt seketika agar jempol audiens berhenti scrolling.',
  },
  {
    id: 'hook-3',
    badge: 'Formula Social Proof (Curiosity Gap)',
    hookTitle: 'Hook 3: Rasa Ingin Tahu & Tren',
    hookCopy: 'Kenapa video iklan brand sebelah selalu tembus jutaan views?',
    visualScene: 'Talent menunjuk grafik pertumbuhan / split screen hasil pemakaian produk.',
    stickerText: 'RAHASIA IKLAN TEMBUS 1JT VIEWS 📈',
    duration: '0-3 Detik',
    psychology: 'Memicu rasa FOMO (Fear of Missing Out) dan penasaran terhadap rahasia di dalam video.',
  },
];

const FAQS = [
  {
    q: 'Apa yang dimaksud dengan 1 Koin Trial Gratis?',
    a: 'Setiap akun Studio baru yang mendaftar langsung mendapatkan 1 Render Credit (Trial). 1 Koin ini dapat Anda gunakan untuk merender 1 video FCD penuh resolusi 1080p Full HD tanpa watermark, sehingga Anda bisa menguji kualitas hasil video kami secara langsung.',
  },
  {
    q: 'Bagaimana cara kerja Fast Creative Delivery (FCD) Automator?',
    a: 'FCD Automator memecah video iklan menjadi modul terpisah: Hook pembuka (3 detik), Body penjelasan produk, dan CTA ajakan bertindak. Cukup siapkan 3 hook, 1 body, dan 2 CTA, sistem kami akan menggabungkannya menjadi 6 variasi video iklan unik siap split testing di TikTok Ads & Meta Ads.',
  },
  {
    q: 'Apakah video yang dihasilkan memiliki watermark?',
    a: 'Sama sekali tidak. Semua video yang diproduksi oleh BoonTrack Studio 100% bebas watermark, beresolusi 1080p Full HD, dan siap langsung diunggah ke TikTok Ads, Reels, Shorts, atau Shopee Video.',
  },
  {
    q: 'Metode pembayaran apa saja yang didukung untuk top up?',
    a: 'Kami menggunakan payment gateway resmi Xendit dengan Single Source of Truth. Anda dapat membayar instan melalui QRIS (Semua bank & e-wallet seperti GoPay, OVO, ShopeePay, DANA) serta Virtual Account bank terkemuka.',
  },
  {
    q: 'Apa yang terjadi jika kuota koin render saya habis?',
    a: 'Anda dapat melakukan top up koin kapan saja melalui menu Top Up di dashboard Studio. Paket Starter (25 kredit) dan Paket Creator (50 kredit) berbayar sekali beli (one-time QRIS) tanpa langganan terikat.',
  },
];

export default function StudioLandingPage() {
  const router = useRouter();

  // Auth Redirect: If user already has an active session, redirect to desk workspace
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
      const localSession = localStorage.getItem('studio_session');

      const resolved = (localVal || cookieVal || '').toLowerCase();
      const hasAuth = Boolean(
        (resolved && resolved !== 'null' && resolved !== 'undefined') ||
        localSession
      );

      if (hasAuth) {
        const isStudioSubdomain = window.location.hostname.startsWith('studio.') || window.location.hostname === 'studio.boontrack.com';
        if (isStudioSubdomain) {
          window.location.href = '/desk';
        } else {
          router.replace('/studio/desk');
        }
      }
    }
  }, [router]);

  // Interactive Demo State
  const [selectedHookIndex, setSelectedHookIndex] = useState(0);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const currentHook = FCD_DEMO_HOOKS[selectedHookIndex];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Dynamic Background Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[850px] h-[550px] bg-gradient-to-b from-fuchsia-600/20 via-purple-600/12 to-transparent blur-[160px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-0 w-[600px] h-[600px] bg-purple-700/10 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* ── 1. NAVBAR HEADER ─────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Logo & Ecosystem Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-purple-600 shadow-lg shadow-fuchsia-500/25 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                <Film className="w-4 h-4 text-fuchsia-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-white">boontrack</span>
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-400 bg-clip-text text-transparent uppercase">
                STUDIO
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-zinc-300">
            <a href="#demo-fcd" className="hover:text-white transition-colors">
              Demo FCD Automator
            </a>
            <a href="#cara-kerja" className="hover:text-white transition-colors">
              Cara Kerja
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Paket Harga
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Tombol Masuk / Login */}
            <Link
              href="/login?redirectTo=/desk"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 text-zinc-400" />
              <span>Masuk / Login</span>
            </Link>

            {/* Primary CTA: Coba Gratis (1 Koin Trial) */}
            <Link
              href="/studio/register"
              className="px-4 py-2 rounded-xl text-xs font-black tracking-wide bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white shadow-lg shadow-fuchsia-600/30 transition-all flex items-center gap-1.5 active:scale-95 hover:shadow-fuchsia-500/50"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Coba Gratis (1 Koin Trial)</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. HERO SECTION ──────────────────────────────────────── */}
      <section className="pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-8 relative">
        {/* Floating Pulse Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-fuchsia-500/15 via-purple-500/15 to-indigo-500/15 border border-fuchsia-500/30 text-xs font-bold text-fuchsia-300 shadow-sm animate-pulse">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>FCD Automator Engine • 1 Koin Trial Gratis untuk Pengguna Baru</span>
        </div>

        {/* Hero Title */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
            Akselerasi Konversi Iklan dengan{' '}
            <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
              FCD Automator
            </span>{' '}
            & Naskah UGC 9-Scene
          </h1>
          <p className="text-sm sm:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed">
            Hasilkan hingga <strong className="text-white">6 variasi video iklan direct-response</strong> dalam 1 kali render.
            Uji formula hook 3-detik tanpa boncos di TikTok Ads, Shopee Video, dan Reels dengan 9:16 Safe-Zone otomatis.
          </p>
        </div>

        {/* Primary CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto pt-2">
          <Link
            href="/studio/register"
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-fuchsia-600/40 hover:shadow-fuchsia-600/60 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <span>Coba Gratis (1 Koin Trial)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="#demo-fcd"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm border border-white/10 transition flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 text-fuchsia-400 fill-fuchsia-400" />
            <span>Lihat Demo Hook FCD</span>
          </a>
        </div>

        {/* Subtext Guarantees */}
        <p className="text-[11px] sm:text-xs text-zinc-400 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Langsung aktif via WhatsApp • Tanpa kartu kredit • 100% Bebas Watermark</span>
        </p>

        {/* Ecosystem Highlights Bar */}
        <div className="pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] text-zinc-400 font-mono block">Rasio Native</span>
            <strong className="text-xs sm:text-sm text-white font-bold flex items-center gap-1.5 mt-0.5">
              <Smartphone className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>9:16 Safe-Zone</span>
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] text-zinc-400 font-mono block">Matrix Formula</span>
            <strong className="text-xs sm:text-sm text-white font-bold flex items-center gap-1.5 mt-0.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>3 Hook × 1 Body = 6 Iklan</span>
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] text-zinc-400 font-mono block">Resolusi Video</span>
            <strong className="text-xs sm:text-sm text-white font-bold flex items-center gap-1.5 mt-0.5">
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span>1080p Full HD Clean</span>
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[10px] text-zinc-400 font-mono block">Pembayaran</span>
            <strong className="text-xs sm:text-sm text-white font-bold flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SSOT Xendit QRIS</span>
            </strong>
          </div>
        </div>
      </section>

      {/* ── 3. INTERACTIVE DEMO VIDEO HOOK FCD AUTOMATOR ────────── */}
      <section id="demo-fcd" className="py-16 sm:py-20 bg-[#0F1422] border-y border-white/10 scroll-mt-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
              Interactive Simulator
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Simulator FCD Automator: Ganti Hook Seketika
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Lihat bagaimana 1 footage produk yang sama dapat dipasangkan dengan 3 variasi hook psikologis berbeda. 
              Aktifkan simulasi <strong>Safe-Zone</strong> untuk membuktikan teks hook Anda tidak tertutup tombol media sosial.
            </p>
          </div>

          {/* Interactive Demo Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Hook Selector Tabs & Matrix Details (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Pilih Sudut Hook Pembuka (3 Detik Pertama):
                </span>

                <div className="space-y-3">
                  {FCD_DEMO_HOOKS.map((hook, index) => {
                    const isSelected = selectedHookIndex === index;
                    return (
                      <div
                        key={hook.id}
                        onClick={() => setSelectedHookIndex(index)}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                          isSelected
                            ? 'bg-gradient-to-r from-fuchsia-950/50 via-purple-950/30 to-transparent border-fuchsia-500/60 shadow-lg shadow-fuchsia-500/10'
                            : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isSelected
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30'
                                  : 'bg-white/5 text-zinc-400 border-white/10'
                              }`}
                            >
                              {hook.badge}
                            </span>
                            <h3 className="text-sm sm:text-base font-bold text-white pt-1">
                              {hook.hookTitle}
                            </h3>
                            <p className="text-xs text-zinc-300 font-mono italic">
                              "{hook.hookCopy}"
                            </p>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition ${
                              isSelected
                                ? 'bg-fuchsia-500 text-white border-fuchsia-400'
                                : 'border-white/20 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-fuchsia-500/20 text-[11px] text-zinc-300 space-y-1">
                            <p className="text-zinc-400">
                              <strong className="text-fuchsia-300">Psikologi:</strong> {hook.psychology}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Safe-Zone Toggle Controls */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-fuchsia-400" />
                    <span>Overlay Panduan Safe-Zone TikTok & Reels</span>
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Garis panduan untuk memastikan teks hook tidak tertutup tombol Like, Komentar, atau Username.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSafeZone(!showSafeZone)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                    showSafeZone
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-white/10 text-zinc-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {showSafeZone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>Safe-Zone: {showSafeZone ? 'AKTIF' : 'NONAKTIF'}</span>
                </button>
              </div>

              {/* FCD Matrix Equation Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/20 border border-purple-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Kalkulasi Hasil Render Matrix FCD:</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-mono text-white flex-wrap">
                  <span className="px-2 py-1 rounded-md bg-white/10">3 Hook Unik</span>
                  <span>×</span>
                  <span className="px-2 py-1 rounded-md bg-white/10">1 Body Footage</span>
                  <span>×</span>
                  <span className="px-2 py-1 rounded-md bg-white/10">2 CTA Urgensi</span>
                  <span>=</span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    6 Video MP4 Siap Posting
                  </span>
                </div>
              </div>
            </div>

            {/* Right: 9:16 Safe-Zone Phone Mockup Canvas (5 Cols) */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-[36px] bg-black border-4 border-zinc-700 shadow-2xl shadow-fuchsia-950/40 overflow-hidden flex flex-col justify-between select-none">
                {/* Simulated Camera Hole Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-full z-40 border border-zinc-800" />

                {/* Simulated Background Video Footage */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500/30 to-purple-600/30 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-400 mb-4 animate-bounce">
                    <Video className="w-8 h-8" />
                  </div>
                  <p className="text-[11px] text-zinc-400 max-w-[200px] leading-relaxed">
                    {currentHook.visualScene}
                  </p>
                  
                  {/* Waveform Animation */}
                  <div className="flex items-center gap-1 mt-4">
                    <span className="w-1 h-3 bg-fuchsia-400 rounded-full animate-pulse" />
                    <span className="w-1 h-6 bg-pink-400 rounded-full animate-pulse delay-75" />
                    <span className="w-1 h-4 bg-purple-400 rounded-full animate-pulse delay-150" />
                    <span className="w-1 h-8 bg-indigo-400 rounded-full animate-pulse delay-100" />
                    <span className="w-1 h-5 bg-fuchsia-400 rounded-full animate-pulse delay-200" />
                  </div>
                </div>

                {/* On-Screen Hook Sticker (Safe within TikTok Center View) */}
                <div className="relative z-30 pt-16 px-6 text-center">
                  <div className="inline-block p-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs sm:text-sm tracking-tight shadow-xl shadow-amber-500/20 rotate-[-1deg] animate-in zoom-in-95 duration-200">
                    {currentHook.stickerText}
                  </div>
                </div>

                {/* Simulated Social Media Right Action Buttons */}
                <div className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-3.5">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">24.5k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">1.2k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Bookmark className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">8.9k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Share2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">Share</span>
                  </div>

                  {/* Rotating Music Disc */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-purple-600 p-0.5 animate-spin">
                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                      <Music className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                </div>

                {/* Bottom Caption & Product CTA */}
                <div className="relative z-30 p-4 space-y-1.5 bg-gradient-to-t from-black via-black/80 to-transparent">
                  <span className="text-[11px] font-bold text-white block">@brand_resmi_kamu</span>
                  <p className="text-[10px] text-zinc-300 line-clamp-2">
                    {currentHook.hookCopy} Cek link di keranjang kuning sekarang sebelum kehabisan diskon!
                  </p>
                  <div className="pt-1 flex items-center gap-1.5 text-[9px] text-zinc-400">
                    <Music className="w-3 h-3 text-fuchsia-400" />
                    <span className="truncate">Suara Asli - Penawaran Spesial Indonesia</span>
                  </div>
                </div>

                {/* Safe-Zone Guide Overlay (Green Border Box) */}
                {showSafeZone && (
                  <div className="absolute inset-0 pointer-events-none z-30 border-2 border-emerald-400/60 rounded-[32px] m-2 flex flex-col justify-between p-2">
                    <div className="flex justify-between items-center text-[9px] font-mono text-emerald-400 bg-black/60 px-2 py-0.5 rounded-full self-start">
                      <span>✓ 9:16 Safe-Zone Bounds</span>
                    </div>
                    <div className="text-[9px] font-mono text-emerald-300 bg-black/70 px-2 py-0.5 rounded-md self-center text-center">
                      Area Bebas Tabrakan UI Medsos
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CARA KERJA 3-LANGKAH ─────────────────────────────── */}
      <section id="cara-kerja" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-10 scroll-mt-20">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
            Alur Produksi Cepat
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Workflow 3-Langkah Pembuatan Konten Pemenang
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            Standar alur kerja terotomasi untuk menghasilkan materi video siap tayang di ads manager dalam hitungan menit.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Step 1 */}
          <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 space-y-4 relative group hover:border-fuchsia-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/20 text-fuchsia-400 font-black text-base flex items-center justify-center border border-fuchsia-500/30">
              1
            </div>
            <h3 className="text-lg font-bold text-white">Input Brief & Sudut Hook</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Tentukan nama produk, 3 keunggulan utama, target audiens, dan formula hook psikologis yang ingin diuji (Problem, Agitation, atau Direct Urgency).
            </p>
            <div className="pt-2 text-[11px] text-fuchsia-400 font-mono">
              ⏱️ Estimasi: 1 Menit
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 space-y-4 relative group hover:border-purple-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 font-black text-base flex items-center justify-center border border-purple-500/30">
              2
            </div>
            <h3 className="text-lg font-bold text-white">AI Meracik Storyboard 9-Scene</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Engine AI meracik naskah 9 kartu adegan terstruktur: arahan visual kamera, teks layar sticker, dan script voiceover bahasa Indonesia yang meyakinkan.
            </p>
            <div className="pt-2 text-[11px] text-purple-400 font-mono">
              ⚡ Proses: Otomatis 30 Detik
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 space-y-4 relative group hover:border-emerald-500/40 transition">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 font-black text-base flex items-center justify-center border border-emerald-500/30">
              3
            </div>
            <h3 className="text-lg font-bold text-white">Batch Render & Unduh MP4</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Otomatisasi penggabungan 3 Hook × 1 Body × 2 CTA pada cloud worker beresolusi 1080p tanpa watermark, siap langsung diekspor ke Meta Ads & TikTok.
            </p>
            <div className="pt-2 text-[11px] text-emerald-400 font-mono">
              🚀 Output: 6 Video MP4 Bersih
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. SECTION PAKET HARGA RESMI (SSOT XENDIT) ───────────── */}
      <section id="pricing" className="py-16 sm:py-24 bg-[#0F1422] border-y border-white/10 scroll-mt-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
              SSOT Paket Resmi Xendit
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Pilihan Paket Token Render BoonTrack Studio
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Tanpa biaya langganan tersembunyi. Beli token sesuai kebutuhan produksi Anda atau aktifkan paket bulanan untuk volume tinggi.
            </p>
          </div>

          {/* Free Trial Spotlight Banner */}
          <div className="max-w-3xl mx-auto p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-fuchsia-950/60 via-purple-950/40 to-indigo-950/40 border border-fuchsia-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-center sm:text-left">
            <div className="space-y-1">
              <span className="text-xs font-black text-yellow-300 flex items-center justify-center sm:justify-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>Pengguna Baru? Dapatkan 1 Koin Trial Gratis!</span>
              </span>
              <p className="text-xs text-zinc-300">
                Daftar akun sekarang dan rasakan kemudahan render 1 video FCD penuh 1080p tanpa syarat kartu kredit.
              </p>
            </div>

            <Link
              href="/studio/register"
              className="px-5 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-zinc-100 font-black text-xs shrink-0 shadow-md transition"
            >
              Klaim 1 Koin Trial →
            </Link>
          </div>

          {/* 3 Pricing Cards Grid (Read directly from SSOT STUDIO_TOKEN_PACKAGES) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
            {/* Package 1: Starter */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.starter;
              return (
                <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 flex flex-col justify-between space-y-6 hover:border-white/20 transition relative">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                      <p className="text-xs text-zinc-400">{pkg.description}</p>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      <div className="text-3xl font-black text-white tracking-tight">
                        {pkg.formattedPrice}
                      </div>
                      <span className="text-xs text-zinc-400 font-mono mt-1 block">
                        ⚡ {pkg.credits} Render Credits Siap Pakai
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/5 text-xs text-zinc-300">
                      {pkg.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      <li className="flex items-center gap-2 text-zinc-400">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Akses Generator Naskah 9-Scene</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center border border-white/10 transition block"
                  >
                    Beli Paket Starter
                  </Link>
                </div>
              );
            })()}

            {/* Package 2: Creator (Recommended / Paling Hemat) */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.creator;
              return (
                <div className="p-7 rounded-3xl bg-gradient-to-b from-[#171D30] to-[#111624] border-2 border-fuchsia-500 shadow-2xl shadow-fuchsia-500/20 flex flex-col justify-between space-y-6 relative group">
                  {/* Floating Best Value Badge */}
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-black text-[10px] uppercase tracking-wider shadow-md">
                    {pkg.badge || 'Paling Hemat'}
                  </div>

                  <div className="space-y-4 pt-1">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>{pkg.name}</span>
                        <Zap className="w-4 h-4 text-fuchsia-400" />
                      </h3>
                      <p className="text-xs text-zinc-400">{pkg.description}</p>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                        <span>{pkg.formattedPrice}</span>
                      </div>
                      <span className="text-xs text-fuchsia-300 font-mono mt-1 block font-bold">
                        ⚡ {pkg.credits} Render Credits Siap Pakai
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/10 text-xs text-zinc-200">
                      {pkg.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Resolusi 1080p Full HD • No Watermark</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Akses Generator Naskah 9-Scene</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-xs text-center shadow-lg shadow-fuchsia-600/30 transition block active:scale-98"
                  >
                    Pilih Paket Creator (Rekomendasi)
                  </Link>
                </div>
              );
            })()}

            {/* Package 3: Pro Monthly */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.pro_monthly;
              return (
                <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 flex flex-col justify-between space-y-6 hover:border-white/20 transition relative">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {pkg.badge || 'PRO'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{pkg.description}</p>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                        <span>{pkg.formattedPrice}</span>
                        <span className="text-xs font-normal text-zinc-400">{pkg.periodLabel || '/ bulan'}</span>
                      </div>
                      <span className="text-xs text-zinc-400 font-mono mt-1 block">
                        ⚡ {pkg.credits} Video 1080p Full HD per bulan
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/5 text-xs text-zinc-300">
                      {pkg.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center border border-white/10 transition block"
                  >
                    Langganan Studio Pro
                  </Link>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ── 6. FAQ ACCORDION SECTION ────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 scroll-mt-20">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400 flex items-center justify-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Pertanyaan Umum</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-fuchsia-300 transition cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 text-fuchsia-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-zinc-300 leading-relaxed border-t border-white/5 animate-in fade-in duration-150">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 7. FINAL CALL TO ACTION ─────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="p-8 sm:p-14 rounded-3xl bg-gradient-to-r from-purple-950/60 via-[#111624] to-fuchsia-950/60 border border-fuchsia-500/30 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-3 max-w-2xl mx-auto relative z-10">
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Mulai Uji Formula Hook Video Iklan Anda Hari Ini
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Daftar gratis tanpa risiko, dapatkan 1 Koin Trial instan, dan buktikan betapa cepatnya memproduksi 6 variasi iklan video performa tinggi.
            </p>
          </div>

          <div className="pt-2 relative z-10">
            <Link
              href="/studio/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-fuchsia-600/40 transition active:scale-95"
            >
              <span>Daftar Akun Baru (1 Koin Trial Gratis)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 8. FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10 text-center text-xs text-zinc-500 bg-[#0B0F17] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white">boontrack</span>
              <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest">STUDIO</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Production Control Room & FCD Automator</span>
            </div>

            <div className="flex items-center gap-5 text-zinc-400">
              <a href="https://shop.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Shop Platform
              </a>
              <span>•</span>
              <a href="https://creator.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Creator Showcase
              </a>
              <span>•</span>
              <a href="https://affiliate.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Affiliate Partner
              </a>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500">
            <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-zinc-400 transition-colors">Syarat & Ketentuan</Link>
              <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Kebijakan Privasi</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
