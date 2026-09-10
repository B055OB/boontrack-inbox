'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Zap, 
  Store, 
  ShieldCheck, 
  Sparkles, 
  Bot, 
  ArrowRight, 
  CheckCircle2, 
  Users2, 
  Headphones, 
  Check, 
  Loader2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  ExternalLink,
  Lock,
  Scale,
  RotateCcw,
  HelpCircle,
  X,
  CreditCard,
  BarChart3,
  Layers,
  Send,
  Smartphone,
  Globe,
  Truck
} from 'lucide-react';
import Footer from './components/Footer';

export default function ShopLandingPage() {
  const router = useRouter();
  const [storeSlug, setStoreSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug.trim() || isLoading) return;
    
    setIsLoading(true);
    const cleanSlug = storeSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    router.push(`/register?slug=${cleanSlug}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-blue-600 selection:text-white pb-20 md:pb-0">
      
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 px-4 py-2.5 text-center text-xs font-semibold text-white flex flex-wrap items-center justify-center gap-1.5 shadow-sm">
        <span className="flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
          <span>Platform WhatsApp Commerce & Checkout Terintegrasi Sistem Pembayaran Otomatis & QRIS Nasional.</span>
        </span>
        <Link href="/register" className="underline hover:text-blue-100 font-bold ml-1 inline-flex items-center gap-0.5">
          Coba Sekarang &rarr;
        </Link>
      </div>

      {/* 2. HEADER NAV */}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/20 group-hover:scale-105 transition">
              B
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-slate-900 block leading-tight">
                BoonTrack <span className="text-blue-600 font-bold text-sm">Shop</span>
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                Commerce Engine
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <a href="#fitur" className="hover:text-blue-600 transition">Fitur Unggulan</a>
          <a href="#cara-kerja" className="hover:text-blue-600 transition">Cara Kerja</a>
          <a href="#pricing" className="hover:text-blue-600 transition">Paket & Harga</a>
          <a href="#kepatuhan" className="hover:text-blue-600 transition">Kepatuhan & Legal</a>
          <button 
            type="button" 
            onClick={() => setIsContactModalOpen(true)} 
            className="hover:text-blue-600 transition cursor-pointer"
          >
            Hubungi Kami
          </button>
        </nav>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Link 
            href="/login" 
            className="text-xs font-bold text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl hover:bg-slate-100 transition"
          >
            Masuk
          </Link>
          <Link 
            href="/register" 
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition shadow-md shadow-blue-600/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>Buka Toko</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* 3. HERO SECTION */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 text-center space-y-8">
        
        {/* Badge Tagline */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold uppercase tracking-wider shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Solusi Penjualan Otomatis & WhatsApp Commerce Terpercaya</span>
        </div>

        {/* Hero Headline */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-950 tracking-tight leading-[1.15]">
            Dari Chat Sampai Order Beres. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800">
              Semuanya Otomatis.
            </span>
          </h1>
          <p className="text-slate-600 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Infrastruktur etalase web instan, checkout pembayaran QRIS dinamis berlisensi, manajemen tim CS multi-seat, dan pelacakan iklan Meta & TikTok CAPI dalam satu dashboard terpadu.
          </p>
        </div>

        {/* Claim Store Form Component */}
        <div className="max-w-md mx-auto pt-2">
          <form onSubmit={handleCreateStore} className="bg-white border-2 border-blue-600/30 p-2 sm:p-2.5 rounded-2xl shadow-xl shadow-blue-600/10 space-y-2">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm focus-within:border-blue-600 focus-within:bg-white transition">
              <span className="text-slate-400 font-mono select-none font-semibold">shop.boontrack.com/</span>
              <input
                type="text"
                placeholder="nama-toko-anda"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                disabled={isLoading}
                className="bg-transparent text-slate-900 font-mono flex-1 focus:outline-none px-1 placeholder:text-slate-400 lowercase font-bold disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/25 cursor-pointer active:scale-98 disabled:opacity-75"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiapkan Toko Anda...</span>
                </>
              ) : (
                <>
                  <Store className="w-4 h-4" />
                  <span>Klaim Nama Toko Saya — Mulai Sekarang &rarr;</span>
                </>
              )}
            </button>
          </form>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-4 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              URL Toko Aktif Seketika
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              QRIS Dinamis Otomatis
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Notifikasi WhatsApp Realtime
            </span>
          </div>
        </div>

        {/* 4. LOGO PARTNER & TRUST FOOTPRINT */}
        <div className="pt-6 pb-2 border-y border-slate-200/80 text-center space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Didukung Ekosistem Pembayaran & Logistik Terverifikasi di Indonesia
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-extrabold text-slate-500 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all">
            <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-100 border border-slate-200">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>QRIS Bersama Bank Indonesia</span>
            </span>
            <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-100 border border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Payment Gateway Terlisensi Bank Indonesia</span>
            </span>
            <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-100 border border-slate-200">
              <Smartphone className="w-4 h-4 text-green-600" />
              <span>WhatsApp Official Cloud API</span>
            </span>
            <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-100 border border-slate-200">
              <Truck className="w-4 h-4 text-orange-600" />
              <span>Multi-Ekspedisi (Reguler, Kargo & Instant)</span>
            </span>
          </div>
        </div>

        {/* 5. FITUR UNGGULAN (VALUE PROPOSITION) */}
        <section id="fitur" className="pt-12 text-left space-y-8 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
              Dibuat Khusus untuk Pebisnis Modern & Merchant Skala Besar
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Semua perlengkapan teknologi yang Anda butuhkan untuk jualan tanpa kendala administrasi.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">Etalase Web & Fast Checkout</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Toko online responsif mobile dengan katalog rapi, varian produk, foto WebP ringan, dan single-page checkout berkonversi tinggi.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">CAPI Server-Side Tracking</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kirim event Purchase dan AddToCart langsung via Meta CAPI & TikTok Events API tanpa terblokir ad-blocker atau kebijakan iOS.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">CS Inbox & AI Smart Bot</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kelola banyak nomor admin dalam satu inbox bersama, didukung AI Auto-Reply yang siap menjawab tanya jawab stok 24 jam nonstop.
              </p>
            </div>
          </div>
        </section>

        {/* 6. CARA KERJA (3 LANGKAH) */}
        <section id="cara-kerja" className="pt-12 text-left scroll-mt-20">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Mulai Jualan dalam 3 Langkah Mudah</h2>
            <p className="text-xs sm:text-sm text-slate-500">Tanpa koding rumit. Dalam 5 menit etalase Anda langsung siap menerima transaksi.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center mb-3">
                01
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1.5">Pilih Paket & Klaim Slug</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tentukan paket langganan dan pilih alamat toko Anda seperti <code className="text-blue-600 font-mono">shop.boontrack.com/tokosaya</code>.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center mb-3">
                02
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1.5">Input Produk & Aktifkan QRIS</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload foto barang fisik atau file digital Anda, tentukan harga, dan tautkan nomor WhatsApp untuk notifikasi pesanan.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center mb-3">
                03
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1.5">Order Mengalir Otomatis</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pembeli bayar via QRIS otomatis tanpa kirim struk transfer. Invoice dan resi terkirim instan via sistem WhatsApp.
              </p>
            </div>
          </div>
        </section>

        {/* 7. PRICING TABLE (3 OFFICIAL TIERS) */}
        <section id="pricing" className="pt-14 text-left space-y-8 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="inline-block px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
              Paket Langganan Resmi
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-950">
              Pilih Paket Sesuai Kebutuhan Bisnis Anda
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Pilihan mesin otomasi transparan tanpa biaya tersembunyi. Dapat di-upgrade kapan saja.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
            
            {/* TIER 1: SOLO */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    Starter Mandiri
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Hemat 43%
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">Solo</h3>
                  <p className="text-xs text-slate-500 mt-1">Untuk solo merchant, UMKM, & pengelola toko praktis mandiri.</p>
                  
                  <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 line-through">Rp 349.000</span>
                    <span className="text-3xl font-black text-slate-900">Rp 199.000</span>
                    <span className="text-xs text-slate-500 font-medium">/bulan</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Katalog & Pesanan Tanpa Batas</strong> (Produk Fisik & Digital)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>1 User Akun Merchant</strong> (Owner Mandiri)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>QRIS Dinamis Otomatis</strong> (Verifikasi Instan)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Notifikasi WhatsApp Pesanan & Invoice Otomatis</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Cek Ongkir Otomatis Multi-Ekspedisi (Reguler, Kargo & Instant)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Subdomain Toko Resmi (<code className="text-blue-600 font-mono">shop.boontrack.com/[slug]</code>)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=solo"
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center block transition shadow-md"
                >
                  Pilih Paket Solo
                </Link>
              </div>
            </div>

            {/* TIER 2: ADS PERFORMANCE (POPULAR) */}
            <div className="bg-white border-2 border-blue-600 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-xl shadow-blue-600/10 relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md">
                Paling Populer &bull; Scale-Up Ads
              </div>

              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                    Performance Marketer
                  </span>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                    Hemat 50%
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">Ads Performance</h3>
                  <p className="text-xs text-slate-500 mt-1">Dirancang khusus untuk pengiklan Meta & TikTok yang mengejar akurasi event tinggi.</p>
                  
                  <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 line-through">Rp 599.000</span>
                    <span className="text-3xl font-black text-blue-600">Rp 299.000</span>
                    <span className="text-xs text-slate-500 font-medium">/bulan</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5 font-bold text-slate-900">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Semua Fitur Paket Solo</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Meta Conversions API (CAPI Server-Side)</strong> & Pixel Event</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>TikTok Events API</strong> Integrasi Akurasi Maksimal</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>God Button</strong> & Pelacakan Atribusi Parameter UTM Iklan</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>2 Seats CS Inbox Terpusat</strong> (Multi-Agent CS)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Dashboard Analytics ROAS & Event Match Quality (EMQ)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Fitur Quick Stock & Manajemen Variasi Inventaris Lengkap</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=ads_performance"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center block transition shadow-lg shadow-blue-600/30 active:scale-98"
                >
                  Pilih Ads Performance
                </Link>
              </div>
            </div>

            {/* TIER 3: TEAM SCALE */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-3 py-1 rounded-full">
                    Enterprise & Tim
                  </span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                    Official Meta WABA
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">Team Scale</h3>
                  <p className="text-xs text-slate-500 mt-1">Solusi komplit untuk brand, agensi, dan tim customer service berskala besar.</p>
                  
                  <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 line-through">Rp 899.000</span>
                    <span className="text-3xl font-black text-slate-900">Rp 499.000</span>
                    <span className="text-xs text-slate-500 font-medium">/bulan</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2.5 font-bold text-slate-900">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Semua Fitur Ads Performance</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Multi-Seat CS Tanpa Batas</strong> (Bebas Tambah Admin)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Official Meta WABA Cloud API</strong> (Centang Hijau Ready)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>AI Assistant Closing Bot 24/7</strong> (Auto Follow-up Leads)</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>WhatsApp Broadcast Campaign & Pengingat Keranjang Otomatis</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Custom Domain Pribadi (<code className="text-purple-600 font-mono">tokoanda.com</code>) + Free SSL</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dedicated Technical Account Manager & Support Prioritas</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=team_scale"
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center block transition shadow-md"
                >
                  Pilih Team Scale
                </Link>
              </div>
            </div>

          </div>
        </section>

        {/* 8. LEGAL COMPLIANCE HIGHLIGHT SECTION */}
        <section id="kepatuhan" className="pt-12 text-left space-y-6 scroll-mt-20">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-slate-800">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Standar Kepatuhan Sistem Pembayaran & Regulasi PMSE Kemendag RI</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white">
                Keamanan Transaksi & Perlindungan Hukum Terjamin
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                PT BOONTRACK INOVASI DIGITAL berkomitmen menerapkan transparansi perniagaan elektronik dan perlindungan privasi data pribadi pengguna sesuai UU No. 27 Tahun 2022 (UU PDP).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-8">
              <Link 
                href="/privacy" 
                className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-blue-500 transition group block"
              >
                <Lock className="w-5 h-5 text-emerald-400 mb-2 group-hover:scale-110 transition" />
                <h4 className="text-xs font-bold text-white mb-1">Privacy Policy</h4>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Kebijakan privasi & standar perlindungan data pengguna sesuai regulasi UU PDP.
                </p>
              </Link>

              <Link 
                href="/terms" 
                className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-blue-500 transition group block"
              >
                <Scale className="w-5 h-5 text-blue-400 mb-2 group-hover:scale-110 transition" />
                <h4 className="text-xs font-bold text-white mb-1">Terms of Service</h4>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Syarat & ketentuan pemanfaatan platform SaaS bagi merchant & pembeli.
                </p>
              </Link>

              <Link 
                href="/refund" 
                className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-blue-500 transition group block"
              >
                <RotateCcw className="w-5 h-5 text-amber-400 mb-2 group-hover:scale-110 transition" />
                <h4 className="text-xs font-bold text-white mb-1">Refund Policy</h4>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Prosedur pengembalian dana, pembatalan langganan, dan penyelesaian dispute.
                </p>
              </Link>

              <button 
                type="button" 
                onClick={() => setIsContactModalOpen(true)}
                className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-blue-500 transition group text-left cursor-pointer"
              >
                <Phone className="w-5 h-5 text-purple-400 mb-2 group-hover:scale-110 transition" />
                <h4 className="text-xs font-bold text-white mb-1">Contact Us</h4>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Alamat kantor Bandung, email support, dan saluran WhatsApp operasional.
                </p>
              </button>
            </div>
          </div>
        </section>

        {/* 9. FAQ SECTION */}
        <section className="pt-10 text-left max-w-3xl mx-auto space-y-4">
          <div className="text-center space-y-1 mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">Pertanyaan yang Sering Diajukan</h2>
            <p className="text-xs text-slate-500">Ketahui lebih banyak sebelum Anda mengaktifkan toko online Anda.</p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <h4 className="font-bold text-slate-900 text-sm mb-1">Bagaimana metode pembayaran QRIS di BoonTrack diproses?</h4>
              <p className="text-slate-600 leading-relaxed">
                Pembayaran diproses secara instan melalui Payment Gateway terlisensi Bank Indonesia dan jaringan QRIS Nasional. Setiap transaksi menghasilkan barcode QRIS dinamis unik yang mendeteksi pelunasan secara real-time tanpa upload bukti transfer.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <h4 className="font-bold text-slate-900 text-sm mb-1">Apakah saya bisa menggunakan domain sendiri seperti nama-brand.com?</h4>
              <p className="text-slate-600 leading-relaxed">
                Ya, pada paket <strong>Team Scale</strong>, Anda dapat menghubungkan domain pribadi (.com, .id, dsb) lengkap dengan sertifikat keamanan SSL gratis otomatis dari server kami.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-2xl">
              <h4 className="font-bold text-slate-900 text-sm mb-1">Bagaimana jika saya memerlukan bantuan konfigurasi teknis CAPI atau WABA?</h4>
              <p className="text-slate-600 leading-relaxed">
                Tim teknis kami siap memandu Anda melalui WhatsApp Customer Care di <strong>+62 812-3745-0222</strong> atau email <strong>support@boontrack.com</strong>.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* 10. MODAL INTERAKTIF CONTACT US (LEGAL COMPLIANCE POPUP) */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">Informasi Kontak Resmi Penyelenggara</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <p className="font-black text-slate-900">PT BOONTRACK INOVASI DIGITAL</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Entitas Pengembang & Penyelenggara Layanan SaaS BoonTrack Commerce Engine</p>
              </div>

              <div className="space-y-3 text-slate-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 block">Alamat Kantor Bisnis:</span>
                    <p className="text-slate-600 leading-relaxed">
                      Jl Saturnus Selatan Komplek Boemi Kirana A16, Buahbatu, Kota Bandung, Jawa Barat 40286, Indonesia.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 block">WhatsApp Customer Care:</span>
                    <a 
                      href="https://wa.me/6281237450222" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-emerald-700 font-bold hover:underline"
                    >
                      +62 812-3745-0222 (081237450222)
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 block">Email Layanan:</span>
                    <p className="text-slate-600">
                      Support: <a href="mailto:support@boontrack.com" className="text-blue-600 hover:underline font-semibold">support@boontrack.com</a><br />
                      Legal & Kepatuhan: <a href="mailto:compliance@boontrack.com" className="text-blue-600 hover:underline font-semibold">compliance@boontrack.com</a>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 block">Jam Operasional Layanan:</span>
                    <p className="text-slate-600">
                      Senin – Jumat: 09:00 – 18:00 WIB
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href="/contact"
                  className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                >
                  <span>Buka Halaman Kontak Terpisah</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold cursor-pointer hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. FOOTER KEPATUHAN & LEGAL LENGKAP */}
      <Footer />

      {/* 12. STICKY BOTTOM BAR (MOBILE ONLY) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 backdrop-blur-md p-3 md:hidden z-30 shadow-lg">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <Link
            href="/register"
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center shadow-md shadow-blue-600/30 transition flex items-center justify-center gap-1.5"
          >
            <span>Buka Toko Sekarang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/login"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-300 transition"
          >
            Masuk
          </Link>
        </div>
      </div>

    </div>
  );
}