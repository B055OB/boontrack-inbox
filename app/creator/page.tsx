'use client';

import React, { useState } from 'react';
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
  Globe,
  ChevronRight,
  Flame,
  Smartphone,
  TrendingUp,
  CreditCard,
  Users,
  Check,
  Star
} from 'lucide-react';

function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function YoutubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
      <polygon points="10 15 15 12 10 9 10 15"/>
    </svg>
  );
}

function TikTokIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

export default function CreatorCleanLandingPage() {
  const router = useRouter();
  const [handle, setHandle] = useState('');

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
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 selection:bg-orange-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Soft Ambient Sunset Glow in Hero Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] bg-gradient-to-b from-orange-500/10 via-rose-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-80 right-0 w-[450px] h-[450px] bg-pink-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* ── A. NAVBAR BERSIH ───────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/85 border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Wordmark */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500 shadow-md shadow-orange-500/15 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-[11px] flex items-center justify-center overflow-hidden">
                <img
                  src="/branding/creator/icon.png"
                  alt="BoonTrack Creator Logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-slate-900">boontrack</span>
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 bg-clip-text text-transparent uppercase">
                CREATOR
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#fitur" className="hover:text-slate-900 transition-colors">
              Fitur
            </a>
            <a href="#untuk-siapa" className="hover:text-slate-900 transition-colors">
              Untuk Siapa?
            </a>
            <a href="#showcase" className="hover:text-slate-900 transition-colors flex items-center gap-1.5">
              <span>Inspirasi Showcase</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 rounded-full">
                Live
              </span>
            </a>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors px-3 py-2"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-bold text-xs sm:text-sm tracking-wide shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>Mulai Gratis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── B. HERO SECTION (CLEAN & HIGH-CONVERTING) ─────────── */}
      <section className="pt-12 md:pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headlines & Interactive Claim Handle */}
          <div className="lg:col-span-7 space-y-7 text-center lg:text-left">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50/80 border border-orange-200/70 text-xs font-bold text-orange-700 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>Platform Bio Link & Komisi No. 1 Kreator Indonesia</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.12]">
              Satu Link Bio untuk{' '}
              <span className="bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 bg-clip-text text-transparent">
                Semua Karya, Jualan,
              </span>{' '}
              dan Endorse Kamu.
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
              Showcase produk rekomendasi, direct deep-link Shopee/TikTok tanpa terpotong browser in-app, hingga pembayaran QRIS instan langsung ke rekening Anda.
            </p>

            {/* Interactive Claim Handle Bar */}
            <div className="pt-2 max-w-xl mx-auto lg:mx-0">
              <form
                onSubmit={handleClaim}
                className="p-2 bg-white border-2 border-slate-200/90 hover:border-slate-300 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10 rounded-2xl shadow-xl shadow-slate-200/60 transition-all flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <div className="flex items-center px-3 py-2 sm:py-0 text-sm font-mono text-slate-400 flex-1">
                  <span className="text-slate-400 select-none hidden sm:inline font-semibold">creator.boontrack.com/@</span>
                  <span className="text-slate-400 select-none sm:hidden font-semibold">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                    placeholder="nama_kamu"
                    className="w-full bg-transparent text-slate-900 font-bold focus:outline-none placeholder-slate-400 ml-1 text-sm sm:text-base font-sans"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-extrabold text-xs sm:text-sm tracking-wide shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <span>Klaim Bio Link</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Micro-Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mt-3 text-xs text-slate-500 px-2 font-medium">
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <Check className="w-3.5 h-3.5" /> 100% Gratis Selamanya
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Zap className="w-3.5 h-3.5 text-orange-500" /> Direct Native App Launch
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <CreditCard className="w-3.5 h-3.5 text-rose-500" /> QRIS Instant Settlement
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Mobile Mockup Preview (Clean Light Style ala Bento/Lynk) */}
          <div id="showcase" className="lg:col-span-5 flex justify-center relative">
            {/* Ambient Background Aura */}
            <div className="absolute -inset-4 bg-gradient-to-r from-orange-400/20 via-rose-400/20 to-pink-400/20 rounded-[52px] blur-3xl -z-10" />

            {/* Floating Trust Pills around phone */}
            <div className="hidden sm:flex absolute -left-6 top-16 z-20 bg-white/90 backdrop-blur-md border border-slate-200/80 px-3.5 py-2 rounded-2xl shadow-lg shadow-slate-200/80 items-center gap-2 text-xs font-bold text-slate-800 animate-bounce duration-1000">
              <span className="w-7 h-7 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                ⚡
              </span>
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase leading-none">Anti WebView Trap</p>
                <p className="text-xs font-bold text-slate-800 leading-tight">Shopee App Direct</p>
              </div>
            </div>

            <div className="hidden sm:flex absolute -right-6 bottom-24 z-20 bg-white/90 backdrop-blur-md border border-slate-200/80 px-3.5 py-2 rounded-2xl shadow-lg shadow-slate-200/80 items-center gap-2 text-xs font-bold text-slate-800">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                ✓
              </span>
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase leading-none">Zero Custody</p>
                <p className="text-xs font-bold text-emerald-700 leading-tight">QRIS Langsung Cair</p>
              </div>
            </div>

            {/* Smartphone Frame (Pure Clean Light Frame) */}
            <div className="w-[300px] sm:w-[325px] rounded-[46px] p-3.5 bg-white border-4 border-slate-200/90 shadow-2xl shadow-slate-300/80">
              <div className="w-full h-full rounded-[36px] bg-[#F8FAFC] overflow-hidden border border-slate-200/80 flex flex-col relative text-slate-800">
                {/* Phone Notch & Status Bar */}
                <div className="pt-3 pb-2 px-6 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span>9:41</span>
                  <div className="w-20 h-4 bg-slate-900 rounded-full" />
                  <span>5G 100%</span>
                </div>

                {/* Profile Header Inside Mockup */}
                <div className="p-4 pt-2 text-center space-y-2">
                  <div className="relative w-18 h-18 mx-auto rounded-full p-1 bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500 shadow-md shadow-orange-500/20">
                    <div className="w-full h-full rounded-full bg-slate-100 border-2 border-white flex items-center justify-center font-black text-lg text-slate-700">
                      AP
                    </div>
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow">
                      ✓
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">Alldy Pratama</h3>
                    <p className="text-[11px] text-slate-500 font-mono">creator.boontrack.com/@alldy</p>
                    <p className="text-[11px] text-slate-600 mt-1 px-2 leading-relaxed">
                      Review Gadget, Setup Kerja Minimalis & Tips Konten 🚀
                    </p>
                  </div>

                  {/* Social Links Row */}
                  <div className="flex justify-center gap-2.5 pt-1">
                    <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 text-xs">
                      <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 text-xs">
                      <TikTokIcon className="w-3.5 h-3.5 text-slate-900" />
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 text-xs">
                      <YoutubeIcon className="w-3.5 h-3.5 text-red-600" />
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 text-xs">
                      <Globe className="w-3.5 h-3.5 text-slate-600" />
                    </span>
                  </div>
                </div>

                {/* 3 Contoh Kartu Bio Link (Clean White Cards) */}
                <div className="p-3.5 pt-0 space-y-2.5 flex-1 pb-6">
                  {/* Card 1: Rekomendasi Skincare / Shopee Direct */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-orange-600 block">
                          Shopee Direct (Buka Aplikasi)
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-snug">
                          Meja Ergonomis Standing Desk
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500 transition-colors" />
                  </div>

                  {/* Card 2: Preset Lightroom / Checkout QRIS */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                        <Camera className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-rose-600 block">
                          BoonTrack QRIS Checkout
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-snug">
                          Lightroom Preset Moody 2026
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      49K
                    </span>
                  </div>

                  {/* Card 3: Booking Brand / WhatsApp */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-600 block">
                          Tanya Rate Card & Jadwal Endorse
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-snug">
                          Hubungi Manajemen via WhatsApp
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── C. VALUE PILLARS (CLEAN WHITE CARDS) ──────────────── */}
      <section id="fitur" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200/80">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-orange-600 bg-orange-100 px-3 py-1 rounded-full border border-orange-200">
            ARSITEKTUR KHUSUS KREATOR
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Kenapa Kreator Indonesia Pindah ke BoonTrack?
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Dibuat untuk menghilangkan segala friksi teknis yang membuat affiliate dan produk digital kamu kehilangan pembeli.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1: Direct App Launch */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 hover:border-orange-300 shadow-sm hover:shadow-xl transition-all duration-300 group">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-inner">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3">Direct App Launch</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Tautan Shopee & TikTok Affiliate langsung membuka aplikasi resmi tanpa terjebak browser in-app IG/TikTok yang menghilangkan tracking cookie komisi kamu.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-orange-600 gap-1.5">
              <span>Bypass WebView Trap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Pillar 2: Zero-Custodial Payout */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 hover:border-rose-300 shadow-sm hover:shadow-xl transition-all duration-300 group">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3">Zero-Custodial Payout</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Pembayaran penjualan produk digital (preset, e-book, tiket event, konsultasi) 100% langsung masuk ke QRIS atau rekening bank kamu tanpa penahanan saldo platform.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-rose-600 gap-1.5">
              <span>Settlement Real-Time Otomatis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Pillar 3: Sub-Second Speed */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 hover:border-pink-300 shadow-sm hover:shadow-xl transition-all duration-300 group">
            <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-inner">
              <Zap className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3">Sub-Second Speed</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Halaman bio super ringan memuat dalam hitungan milidetik saat diklik jutaan followers dari profil Instagram & TikTok tanpa loading berat yang bikin kabur.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-pink-600 gap-1.5">
              <span>99.9% Uptime CDN Global</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </section>

      {/* ── D. UNTUK SIAPA? (CREATOR PERSONA CATEGORIES) ───────── */}
      <section id="untuk-siapa" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-slate-50/70 border-y border-slate-200/80 rounded-3xl my-8">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
            KATEGORI PENGGUNA
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Cocok untuk Semua Tipe Kreator & Influencer
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Apapun format konten yang kamu buat, BoonTrack Creator siap jadi rumah utama portofolio dan bisnis kamu.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-2xl">🛍️</span>
            <h4 className="font-extrabold text-slate-900">Affiliate Marketer</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Kumpulkan ratusan racun produk Shopee & TikTok dalam satu etalase rapi tanpa khawatir tracking link hilang.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-2xl">📸</span>
            <h4 className="font-extrabold text-slate-900">Fotografer & Desainer</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Jual preset Lightroom, font, template Canva, dan file digital dengan pembayaran QRIS serta download otomatis.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-2xl">🤝</span>
            <h4 className="font-extrabold text-slate-900">Talent & Kolaborator</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tampilkan paket rate card video endorsement, live shopping, dan sambungkan brand langsung ke WhatsApp manajer.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-2xl">🎙️</span>
            <h4 className="font-extrabold text-slate-900">Edukatif & Coach</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Buka slot konsultasi 1-on-1, tiket webinar, dan e-book panduan tanpa perlu setup website mahal yang rumit.
            </p>
          </div>
        </div>
      </section>

      {/* ── E. CTA BANNER (CLEAN SUNSET CALLOUT) ───────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl p-8 sm:p-14 bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 text-white shadow-2xl shadow-orange-500/20 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Subtle Graphic Accents */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-2xl pointer-events-none -mr-20 -mt-20" />

          <div className="space-y-3 text-center md:text-left relative z-10 max-w-xl">
            <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-white/20 text-white backdrop-blur-md">
              MULAI SEKARANG
            </span>
            <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Siap Maksimalkan Penghasilan Kreator Kamu?
            </h3>
            <p className="text-sm sm:text-base text-white/90 leading-relaxed">
              Gratis selamanya, setup selesai dalam 2 menit, dan langsung siap dipasang di bio Instagram & TikTok.
            </p>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link
              href="/register"
              className="px-8 py-4 rounded-full bg-white text-slate-900 hover:bg-slate-100 font-extrabold text-sm transition-all shadow-xl text-center active:scale-95 whitespace-nowrap"
            >
              Buat Bio Link Sekarang
            </Link>
          </div>
        </div>
      </section>

      {/* ── F. CLEAN LIGHT FOOTER ────────────────────────────── */}
      <footer className="py-10 border-t border-slate-200/80 bg-white text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi.</p>
          <div className="flex items-center gap-6 text-slate-600 font-medium">
            <Link href="/terms" className="hover:text-slate-900 transition-colors">Syarat & Ketentuan</Link>
            <Link href="/privacy" className="hover:text-slate-900 transition-colors">Kebijakan Privasi</Link>
            <a href="https://studio.boontrack.com" className="hover:text-slate-900 transition-colors">Studio Workspace</a>
            <a href="https://shop.boontrack.com" className="hover:text-slate-900 transition-colors">Shop Platform</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
