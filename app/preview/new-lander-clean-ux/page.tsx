'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  MessageCircle,
  Smartphone,
  BarChart3,
  Lock,
  Building2,
  Check,
  ChevronRight,
  TrendingUp,
  Cpu,
  Globe
} from 'lucide-react';

function NewLanderCleanUxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [referralCode, setReferralCode] = useState<string>(() => {
    return (
      searchParams.get('ref') ||
      searchParams.get('r') ||
      searchParams.get('code') ||
      ''
    ).trim().toLowerCase();
  });

  const [storeInput, setStoreInput] = useState('');
  const [activeProof, setActiveProof] = useState<number>(0);

  // Auto-rotate proof card highlights every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveProof((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Sync Referral Code from URL, Subdomain, Cookies, or LocalStorage
  useEffect(() => {
    let resolved = (
      searchParams.get('ref') ||
      searchParams.get('r') ||
      searchParams.get('code') ||
      ''
    ).trim().toLowerCase();

    if (!resolved && typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.includes('buzzerukm')) {
        resolved = 'buzzerukm';
      } else if (hostname.endsWith('.boontrack.com')) {
        const sub = hostname.replace('.boontrack.com', '').split('.').pop() || '';
        const RESERVED = new Set([
          'shop', 'app', 'creator', 'login', 'register', 'admin', 'www', 'chat', 'manager', 'affiliate', 'api'
        ]);
        if (sub && !RESERVED.has(sub)) {
          resolved = sub;
        }
      }
    }

    if (!resolved && typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)(?:ref|boontrack_referral_code|boontrack_merchant_ref)=([^;]+)/);
      if (match) {
        resolved = decodeURIComponent(match[1]).trim().toLowerCase();
      }
    }

    if (!resolved && typeof window !== 'undefined') {
      try {
        resolved = (
          localStorage.getItem('boontrack_referral_code') ||
          localStorage.getItem('boontrack_merchant_ref') ||
          localStorage.getItem('boontrack_affiliate_code') ||
          localStorage.getItem('affiliate_code') ||
          ''
        ).trim().toLowerCase();
      } catch (_) {}
    }

    if (resolved === 'mafiasakti' || resolved === 'kangsakti') {
      resolved = 'buzzerukm';
    }

    if (resolved) {
      setReferralCode(resolved);
      try {
        localStorage.setItem('boontrack_referral_code', resolved);
        localStorage.setItem('boontrack_merchant_ref', resolved);
        localStorage.setItem('boontrack_affiliate_code', resolved);
        const isBoonTrackDomain = typeof window !== 'undefined' && window.location.hostname.endsWith('.boontrack.com');
        const domainStr = isBoonTrackDomain ? '; domain=.boontrack.com' : '';
        document.cookie = `ref=${encodeURIComponent(resolved)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
        document.cookie = `boontrack_referral_code=${encodeURIComponent(resolved)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
      } catch (_) {}
    }
  }, [searchParams]);

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleClaimStore = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slugify(storeInput || 'toko-saya');
    const params = new URLSearchParams();
    params.set('shop', cleanSlug);
    params.set('store', cleanSlug);
    params.set('claim', cleanSlug);
    if (referralCode) {
      params.set('ref', referralCode);
    }
    router.push(`/register?${params.toString()}`);
  };

  const getRegisterUrl = () => {
    if (referralCode) {
      return `/register?ref=${encodeURIComponent(referralCode)}`;
    }
    return '/register';
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
      {/* 1. TOP STICKY BAR */}
      <div className="bg-slate-900 text-slate-200 py-2.5 px-4 text-xs font-medium text-center tracking-wide sticky top-0 z-50 shadow-sm flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold text-white">⚡ COBA GRATIS 7 HARI:</span>
          <span>Akses Penuh Meta CAPI Tracking &amp; Reader APK Otomatisasi Pembayaran.</span>
        </span>
      </div>

      {/* 2. HEADER NAVIGATION */}
      <header className="sticky top-[37px] z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo BoonTrack Shop Resmi */}
          <Link href="/" className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-0.5 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200 flex items-center justify-center">
              <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                <span className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 tracking-tighter">
                  B
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg sm:text-xl tracking-tight text-slate-950 leading-tight">
                  BoonTrack
                </span>
                <span className="font-extrabold text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 leading-tight">
                  Shop
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Commerce Engine
              </span>
            </div>
          </Link>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-bold text-slate-700 hover:text-slate-950 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
            >
              Masuk Dashboard
            </Link>
            <Link
              href={getRegisterUrl()}
              className="text-xs font-extrabold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Buka Toko Gratis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION (LASER FOCUS - TANPA DAFTAR HARGA) */}
      <section className="relative pt-12 pb-20 sm:pt-16 sm:pb-28 overflow-hidden bg-gradient-to-b from-white via-slate-50 to-white">
        {/* Glow ambient background elements */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl rounded-full pointer-events-none -z-10" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          {/* Sub-badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold tracking-wide shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>Infrastruktur Commerce Generasi Baru</span>
          </div>

          {/* Headline */}
          <div className="space-y-4 max-w-4xl mx-auto">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-950 tracking-tight leading-[1.12]">
              Dari Chat Sampai Order Beres.{' '}
              <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
                Semuanya Otomatis.
              </span>
            </h1>
            <p className="text-slate-600 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Infrastruktur etalase instan, pembayaran QRIS otomatis berlisensi Bank Indonesia, manajemen chat tim CS, dan pelacakan iklan Meta &amp; TikTok CAPI dalam satu dashboard terpadu.
            </p>
          </div>

          {/* Interactive Claim Input Box */}
          <div className="max-w-xl mx-auto pt-2">
            <form
              onSubmit={handleClaimStore}
              className="bg-white border-2 border-blue-600/30 p-2 sm:p-2.5 rounded-3xl shadow-2xl shadow-indigo-600/15 transition-all hover:border-blue-600/50 space-y-2.5"
            >
              <div className="flex items-center bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-3 text-xs sm:text-sm focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/20 transition-all">
                <span className="text-slate-400 font-mono select-none font-bold text-xs sm:text-sm shrink-0">
                  shop.boontrack.com/
                </span>
                <input
                  type="text"
                  required
                  placeholder="nama-toko-anda"
                  value={storeInput}
                  onChange={(e) => setStoreInput(e.target.value)}
                  className="bg-transparent text-slate-950 font-mono flex-1 focus:outline-none px-1.5 placeholder:text-slate-400 lowercase font-extrabold text-xs sm:text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/25 cursor-pointer active:scale-98 hover:scale-[1.01]"
              >
                <span>Klaim Toko &amp; Coba Gratis 7 Hari</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Tanpa Kartu Kredit
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Setup 30 Detik
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Batal Kapan Saja
              </span>
            </div>
          </div>

          {/* 4. FLOATING VISUAL PROOF COMPONENT (3 Kartu Mengambang Interaktif) */}
          <div className="pt-10 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {/* Card 1: Chat Closing */}
              <div
                onClick={() => setActiveProof(0)}
                className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                  activeProof === 0
                    ? 'bg-white border-blue-600 shadow-xl shadow-blue-500/10 ring-2 ring-blue-600/20 scale-[1.02]'
                    : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <MessageCircle className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                    WhatsApp Commerce
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Baru saja</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 leading-snug">
                  Pesanan #ORD-928 terverifikasi via QRIS.
                </h4>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Pelanggan memesan langsung di etalase, checkout tanpa ribet chat manual, dan konfirmasi terkirim instan.
                </p>
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-emerald-700 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Selesai Terbayar Otomatis</span>
                </div>
              </div>

              {/* Card 2: Instant Verification */}
              <div
                onClick={() => setActiveProof(1)}
                className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                  activeProof === 1
                    ? 'bg-white border-indigo-600 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-600/20 scale-[1.02]'
                    : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    <Smartphone className="w-3 h-3 text-blue-600" />
                    BoonTrack Reader APK
                  </span>
                  <span className="text-[10px] text-emerald-600 font-black font-mono">3 Detik</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 leading-snug">
                  ✓ Reader APK: Pembayaran Rp 160.000 Terdeteksi Otomatis
                </h4>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Mutasi bank dan notifikasi QRIS ditangkap langsung di HP merchant. Tanpa upload struk palsu.
                </p>
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-blue-700 font-bold">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>Auto-Match Mutasi Rekening</span>
                </div>
              </div>

              {/* Card 3: Ads CAPI Engine */}
              <div
                onClick={() => setActiveProof(2)}
                className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                  activeProof === 2
                    ? 'bg-white border-purple-600 shadow-xl shadow-purple-500/10 ring-2 ring-purple-600/20 scale-[1.02]'
                    : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    <Zap className="w-3 h-3 text-purple-600 fill-purple-600" />
                    Meta &amp; TikTok CAPI
                  </span>
                  <span className="text-[10px] text-purple-700 font-bold font-mono">Score 9.4/10</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 leading-snug">
                  ⚡ Meta Events Manager: Event &apos;Purchase&apos; Sukses Diterima via CAPI
                </h4>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Pelacakan akurat tembus proteksi iOS 17 &amp; AdBlocker. Algoritma iklan belajar lebih tajam.
                </p>
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-purple-700 font-bold">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                  <span>Konversi Ads Tercatat Sempurna</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECTION 3 PILAR FITUR RINGKAS */}
      <section className="py-20 bg-white border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-extrabold text-blue-600 tracking-wider uppercase">
              Fondasi Teknologi Utama
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
              Tiga Pilar Kekuatan BoonTrack Shop
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Dirancang untuk mengatasi kebocoran omzet, kendala closing chat, dan ketidakakuratan algoritma iklan digital.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pilar 1 */}
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200/80 hover:border-blue-300 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-xs">
                <MessageCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-950">
                WhatsApp Commerce
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Katalog interaktif dan penutupan order tanpa aplikasi tambahan. Pembeli memilih produk langsung di toko web Anda dan diteruskan ke alur pembayaran otomatis.
              </p>
              <ul className="space-y-2 pt-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Etalase ultra-cepat responsif mobile</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Mendukung produk fisik, digital, dan jasa</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dukungan produk affiliate &amp; link luar</span>
                </li>
              </ul>
            </div>

            {/* Pilar 2 */}
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shadow-xs">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-950">
                Auto-Verification Reader APK
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Mutasi bank dan QRIS dicek otomatis tanpa upload struk manual. Pesanan langsung ditandai lunas dalam hitungan detik tanpa membebani CS Anda.
              </p>
              <ul className="space-y-2 pt-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verifikasi real-time 3 detik</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Anti-bukti transfer palsu / Photoshop</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Notifikasi instan ke pembeli dan merchant</span>
                </li>
              </ul>
            </div>

            {/* Pilar 3 */}
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200/80 hover:border-purple-300 hover:bg-white hover:shadow-xl hover:shadow-purple-500/5 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold shadow-xs">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-950">
                Server-Side Ads Engine
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Tracking akurat tembus proteksi browser iOS &amp; Adblocker via Conversions API (CAPI). Menghilangkan data loss dan menurunkan biaya iklan per order.
              </p>
              <ul className="space-y-2 pt-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Event Purchase terkirim dari server cloud</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tombol manual override kirim sinyal iklan</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dukungan Meta Pixel &amp; TikTok Events API</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM TRUST BAR & FINANCIAL POLICY */}
      <section className="py-12 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black text-slate-900">
                  Infrastruktur QRIS Standar Bank Indonesia &amp; Payment Gateway Nasional Terlisensi
                </h4>
                <p className="text-[11px] text-slate-500">
                  Transaksi diproses aman melalui jaringan interkoneksi resmi QRIS nasional dan perbankan Indonesia.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-slate-400 text-xs font-bold">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Enkripsi SSL 256-Bit</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5 text-slate-700">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Interkoneksi Bank Nasional</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5 text-slate-700">
                <Globe className="w-4 h-4 text-purple-600" />
                <span>Server Cloud 99.9% Uptime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. PREVIEW FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="font-bold text-slate-800">BoonTrack Shop</span>
            <span>—</span>
            <span>Commerce Engine &amp; Growth Infrastructure</span>
          </div>
          <p className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} BoonTrack Inc. Seluruh hak cipta dilindungi undang-undang.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function NewLanderCleanUxPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white text-slate-400 text-xs">Memuat halaman preview...</div>}>
      <NewLanderCleanUxContent />
    </Suspense>
  );
}
