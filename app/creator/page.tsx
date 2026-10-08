'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  ShoppingBag,
  Camera,
  MessageCircle,
  CheckCircle,
  Share2,
  Globe,
  ChevronRight,
  Flame,
  Smartphone
} from 'lucide-react';

function InstagramIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function YoutubeIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
      <polygon points="10 15 15 12 10 9 10 15"/>
    </svg>
  );
}

export default function CreatorPublicLandingPage() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = handle.replace(/^@+/, '').trim().toLowerCase();
    if (cleanHandle) {
      router.push(`/register?handle=${encodeURIComponent(cleanHandle)}&ref=creator_claim`);
    } else {
      router.push('/register?ref=creator_landing');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-pink-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Background Sunset Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-orange-500/15 via-pink-500/10 to-transparent blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 -left-48 w-96 h-96 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 -right-48 w-96 h-96 bg-pink-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* ── 1. NAVBAR ────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0B0F17]/80 border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Wordmark */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-orange-500 to-pink-500 shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                <img
                  src="/branding/creator/icon.png"
                  alt="BoonTrack Creator Logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-lg tracking-tight text-white">boontrack</span>
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-orange-400 via-pink-500 to-rose-400 bg-clip-text text-transparent uppercase">
                CREATOR
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-300">
            <a href="#fitur" className="hover:text-white transition-colors">
              Fitur
            </a>
            <a href="#showcase" className="hover:text-white transition-colors">
              Showcase
            </a>
            <a href="#affiliate" className="hover:text-white transition-colors flex items-center gap-1.5">
              <span>Untuk Affiliate</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full">
                HOT
              </span>
            </a>
          </div>

          {/* CTA Buat Bio Link */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors px-3 py-2 hidden sm:block"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="relative inline-flex items-center justify-center p-0.5 overflow-hidden text-xs font-bold rounded-xl group bg-gradient-to-r from-orange-500 to-pink-500 shadow-md shadow-pink-500/20 hover:shadow-orange-500/30 transition-shadow"
            >
              <span className="relative px-4 py-2.5 transition-all ease-in duration-75 bg-[#0B0F17] rounded-[10px] group-hover:bg-transparent text-white flex items-center gap-1.5">
                <span>Buat Bio Link</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── 2. HERO SECTION ──────────────────────────────────── */}
      <section className="pt-12 md:pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Text & Claim Handle */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-orange-300/90 shadow-inner">
              <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
              <span>Bio Link & Rate Card Monetisasi Kreator #1</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.12]">
              Satu Link Bio.{' '}
              <span className="bg-gradient-to-r from-orange-400 via-pink-500 to-rose-400 bg-clip-text text-transparent">
                Semua Penghasilan
              </span>{' '}
              Kreator Anda.
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
              Showcase produk rekomendasi, direct deep-link Shopee/TikTok tanpa terpotong browser in-app, hingga pembayaran QRIS instan langsung ke rekening Anda.
            </p>

            {/* Interactive Claim Handle Form */}
            <div className="pt-2 max-w-xl mx-auto lg:mx-0">
              <form
                onSubmit={handleClaim}
                className="p-1.5 sm:p-2 bg-[#121824]/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-stretch sm:items-center gap-2 focus-within:border-pink-500/60 focus-within:ring-2 focus-within:ring-pink-500/20 transition-all"
              >
                <div className="flex items-center px-3 py-2 sm:py-0 text-sm font-mono text-zinc-400 flex-1">
                  <span className="text-zinc-500 select-none hidden sm:inline">creator.boontrack.com/@</span>
                  <span className="text-zinc-500 select-none sm:hidden">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                    placeholder="nama_kreator"
                    className="w-full bg-transparent text-white font-medium focus:outline-none placeholder-zinc-600 ml-1 text-sm sm:text-base"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 whitespace-nowrap"
                >
                  <span>Klaim Bio Link</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              <div className="flex items-center justify-center lg:justify-start gap-4 mt-3 text-[11px] text-zinc-400 px-2">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle className="w-3 h-3" /> Gratis Selamanya
                </span>
                <span>•</span>
                <span>Direct App Deep-Link</span>
                <span>•</span>
                <span>QRIS Instant Payout</span>
              </div>
            </div>
          </div>

          {/* Right Column: 3. Mobile Mockup Preview */}
          <div id="showcase" className="lg:col-span-5 flex justify-center relative">
            {/* Glow Aura behind phone */}
            <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 rounded-[48px] blur-2xl -z-10" />

            {/* Smartphone Frame */}
            <div className="w-[300px] sm:w-[320px] rounded-[42px] p-3 bg-gradient-to-b from-white/20 via-white/5 to-white/10 shadow-2xl shadow-black/80 border border-white/15">
              <div className="w-full h-full rounded-[34px] bg-[#090D14] overflow-hidden border border-black/40 flex flex-col relative text-zinc-200">
                {/* Phone Speaker & Camera Notch */}
                <div className="pt-3 pb-2 px-6 flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                  <span>9:41</span>
                  <div className="w-20 h-3.5 bg-black rounded-full" />
                  <span>5G 100%</span>
                </div>

                {/* Profile Header Inside Mockup */}
                <div className="p-4 pt-2 text-center space-y-2">
                  <div className="relative w-18 h-18 mx-auto rounded-full p-1 bg-gradient-to-tr from-orange-500 via-pink-500 to-rose-400 shadow-md shadow-pink-500/30">
                    <div className="w-full h-full rounded-full bg-[#151C2A] flex items-center justify-center font-bold text-lg text-white">
                      AG
                    </div>
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-blue-500 border-2 border-[#090D14] flex items-center justify-center text-[10px] text-white font-black shadow">
                      ✓
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <h3 className="font-bold text-sm text-white">Alldy Pratama</h3>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono">creator.boontrack.com/@alldy</p>
                    <p className="text-[11px] text-zinc-300 mt-1 px-3 line-clamp-2">
                      Review Gadget, Setup Meja Kerja & AI Tools 🚀
                    </p>
                  </div>

                  {/* Social Links Row */}
                  <div className="flex justify-center gap-3 pt-1">
                    <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white text-xs">
                      <InstagramIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white text-xs">
                      <YoutubeIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white text-xs">
                      <Globe className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* 3 Contoh Kartu Bio Link */}
                <div className="p-3.5 pt-0 space-y-2.5 flex-1 pb-6">
                  {/* Card 1: Rekomendasi Skincare / Shopee Direct */}
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/25 hover:border-orange-500/50 transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-orange-400 block">
                          Shopee Direct (Native App)
                        </span>
                        <p className="text-xs font-semibold text-white leading-snug">
                          Setup Ergonomic Desk Mat
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                  </div>

                  {/* Card 2: Preset Lightroom / Checkout QRIS */}
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-pink-500/10 to-rose-500/5 border border-pink-500/25 hover:border-pink-500/50 transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center flex-shrink-0">
                        <Camera className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-pink-400 block">
                          Checkout QRIS Instan
                        </span>
                        <p className="text-xs font-semibold text-white leading-snug">
                          Preset Moody Clean 2026
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                      49K
                    </span>
                  </div>

                  {/* Card 3: Booking Brand / WhatsApp */}
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/5 border border-emerald-500/25 hover:border-emerald-500/50 transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-400 block">
                          Booking Brand & Endorse
                        </span>
                        <p className="text-xs font-semibold text-white leading-snug">
                          Hubungi Manajemen via WA
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. VALUE PILLARS (3 GRID CARDS) ───────────────────── */}
      <section id="fitur" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-400">
            Arsitektur Standar Industri
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Kenapa Kreator Beralih ke BoonTrack?
          </p>
          <p className="text-sm sm:text-base text-zinc-400">
            Solusi teknis yang didesain untuk memaksimalkan setiap klik menjadi komisi dan konversi penjualan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1: Direct App Launch */}
          <div className="p-8 rounded-3xl bg-gradient-to-b from-[#121824] to-[#0D121C] border border-white/10 hover:border-orange-500/40 transition-all duration-300 relative group shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-orange-500/20 transition-all">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Direct App Launch</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Tautan e-commerce langsung memanggil aplikasi native Shopee & TikTok tanpa terperangkap browser in-app IG/TikTok yang sering menghilangkan cookie affiliate Anda.
            </p>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center text-xs font-semibold text-orange-400 gap-1">
              <span>Bypass WebView Trap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Pillar 2: Zero-Custodial Payout */}
          <div className="p-8 rounded-3xl bg-gradient-to-b from-[#121824] to-[#0D121C] border border-white/10 hover:border-pink-500/40 transition-all duration-300 relative group shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-pink-500/20 transition-all">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Zero-Custodial Payout</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Pembayaran hasil penjualan produk digital (preset, ebook, konsultasi) langsung 100% masuk ke QRIS atau rekening kreator tanpa penahanan dana saldo platform.
            </p>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center text-xs font-semibold text-pink-400 gap-1">
              <span>Settlement Otomatis Real-Time</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Pillar 3: Sub-Second Speed */}
          <div className="p-8 rounded-3xl bg-gradient-to-b from-[#121824] to-[#0D121C] border border-white/10 hover:border-rose-500/40 transition-all duration-300 relative group shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-rose-500/20 transition-all">
              <Zap className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Sub-Second Speed</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Infrastruktur edge ultra-ringan memuat landing bio dalam hitungan milidetik saat diklik oleh jutaan audiens dari Instagram bio maupun TikTok link.
            </p>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center text-xs font-semibold text-rose-400 gap-1">
              <span>99.9% Uptime CDN</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. AFFILIATE & CONVERSION SECTION ────────────────── */}
      <section id="affiliate" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative rounded-3xl p-8 sm:p-12 overflow-hidden bg-gradient-to-r from-orange-950/40 via-[#121824] to-pink-950/40 border border-white/10 shadow-2xl">
          <div className="max-w-2xl space-y-4">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30">
              UNTUK AFFILIATE & CREATOR ENTERPRISE
            </span>
            <h3 className="text-3xl font-extrabold text-white leading-tight">
              Ingin Bikin Script Video UGC Otomatis?
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Gunakan generator naskah 9-scene berbasis formula viral kami di <strong>studio.boontrack.com</strong> untuk mempercepat produksi konten endorsement dan affiliate TikTok/Shopee Anda.
            </p>
            <div className="pt-2">
              <a
                href="https://studio.boontrack.com/ugc-studio"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 font-bold text-xs sm:text-sm transition-colors shadow-lg"
              >
                <span>Buka BoonTrack Studio</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. FOOTER ────────────────────────────────────────── */}
      <footer className="py-10 border-t border-white/5 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi.</p>
          <div className="flex items-center gap-6 text-zinc-400">
            <Link href="/terms" className="hover:text-white transition-colors">Syarat & Ketentuan</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Kebijakan Privasi</Link>
            <a href="https://studio.boontrack.com" className="hover:text-white transition-colors">Studio Workspace</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
