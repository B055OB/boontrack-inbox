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
  Loader2
} from 'lucide-react';

export default function ShopLandingPage() {
  const router = useRouter();
  const [storeSlug, setStoreSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug.trim() || isLoading) return;
    
    setIsLoading(true);
    const cleanSlug = storeSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    router.push(`/register?slug=${cleanSlug}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-600 selection:text-white pb-24 md:pb-16">
      
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-blue-600 px-4 py-2 text-center text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-sm">
        <span>⚡ Buka Toko Online Terintegrasi WhatsApp & QRIS Otomatis.</span>
        <Link href="/register" className="underline hover:text-blue-100 ml-1">
          Coba Sekarang PROMO! &rarr;
        </Link>
      </div>

      {/* HEADER MINIMALIS */}
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-sm">
            B
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            BoonTrack <span className="text-blue-600 font-medium text-sm">Shop</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/login" 
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg transition"
          >
            Masuk
          </Link>
          <Link 
            href="/register" 
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/20"
          >
            Daftar
          </Link>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8 text-center space-y-6">
        
        {/* Badge Tagline */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Platform Penjualan & WhatsApp Commerce</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          Dari Chat Sampai Order Beres. <br className="hidden sm:block" />
          <span className="text-blue-600">Otomatis.</span>
        </h1>

        {/* Hero Subheadline */}
        <p className="text-slate-600 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
          Toko online berbasis web & WhatsApp untuk menerima order, pembayaran QRIS instan, dan mengelola penjualan tanpa repot cek mutasi manual.
        </p>

        {/* Claim Store Form Component */}
        <div className="max-w-md mx-auto pt-2">
          <form onSubmit={handleCreateStore} className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xl shadow-slate-200/50 space-y-2">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus-within:border-blue-500 focus-within:bg-white transition">
              <span className="text-slate-400 font-mono select-none">shop.boontrack.com/</span>
              <input
                type="text"
                placeholder="nama-toko-anda"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                disabled={isLoading}
                className="bg-transparent text-slate-900 font-mono flex-1 focus:outline-none px-1 placeholder:text-slate-400 lowercase font-medium disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-75"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiapkan Toko Anda...</span>
                </>
              ) : (
                <>
                  <Store className="w-4 h-4" />
                  <span>Buat Toko Saya — Gratis &rarr;</span>
                </>
              )}
            </button>
          </form>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1 text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              URL Toko Instan
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              QRIS Dinamis Otomatis
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Notifikasi Otomatis WhatsApp
            </span>
          </div>
        </div>

        {/* 3. SECTION CARA KERJA (3-STEP MENTAL CHUNKING) */}
        <section className="pt-14 pb-4 text-left">
          <div className="text-center space-y-1 mb-8">
            <h2 className="text-xl md:text-2xl font-black text-slate-900">Cara Kerja Toko Otomatis Anda</h2>
            <p className="text-xs text-slate-500">Hanya butuh 3 langkah mudah sampai penjualan pertama Anda mengalir.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center mb-3 border border-blue-100">
                01
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Siapkan Toko</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload katalog produk dan hubungkan nomor WhatsApp dalam hitungan menit.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center mb-3 border border-blue-100">
                02
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Pembeli Checkout</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pembeli memilih barang dan bayar via QRIS otomatis tanpa perlu kirim bukti transfer.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 font-black text-xs flex items-center justify-center mb-3 border border-emerald-100">
                03
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Pesanan Beres</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Notifikasi invoice dan konfirmasi terkirim otomatis ke WhatsApp pembeli & merchant.
              </p>
            </div>
          </div>
        </section>

        {/* 4. PRICING CARDS / ENGINE COMPARISON */}
        <section className="pt-10 text-left space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900">Pilih Paket Engine Bisnis Anda</h2>
            <p className="text-xs text-slate-500">Pilih mesin otomasi terlengkap yang paling pas untuk skala operasional Anda.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            
            {/* Card 1: Growth */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                  Starter Pack Bisnis Digital
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Growth</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Starter Pack Bisnis Digital & AI Otomatis</p>
                  <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm text-slate-400 line-through font-semibold">Rp 349 ribu</span>
                    <span className="text-2xl sm:text-3xl font-black text-slate-900">Rp 199 ribu</span>
                    <span className="text-xs text-slate-500 font-medium">/bln</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                      Hemat 43%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Solusi komplit untuk pebisnis mandiri yang ingin melayani chat 24 jam nonstop dan verifikasi bayar instan.
                </p>
                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Otak AI Pintar (Gemini & Groq Router) siap jawab chat 24/7</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dual Assistant: AI aktif di Webchat Storefront & WhatsApp (Jalur Unofficial)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Custom Bot Persona & Knowledge Base toko tanpa batas</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Etalase Digital Instan (shop.boontrack.com/[nama-toko])</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Generator QRIS Dinamis Otomatis per transaksi (Midtrans Core API)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Auto-Reconciliation: Verifikasi pembayaran lunas detik itu juga</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Auto Billing & E-Receipt instan terkirim ke WhatsApp pembeli</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dashboard Pengaturan Katalog & Manajemen Stok Produk Digital</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Ringkasan Laporan Penjualan & Riwayat Transaksi Real-time</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=growth"
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center block transition shadow-md"
                >
                  Pilih Paket Growth
                </Link>
              </div>
            </div>

            {/* Card 2: Growth Tracking System */}
            <div className="bg-white border-2 border-blue-600 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-xl shadow-blue-600/10 relative">
              <div className="space-y-4">
                <div className="inline-block px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                  All-in Bundle Paling Hemat &bull; Termasuk Add-on Full Tracking
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Growth Tracking System</h3>
                  <p className="text-xs text-blue-600 font-bold mt-0.5">Fondasi Lengkap Seller Scale-Up Iklan & Produk Fisik</p>
                  <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm text-slate-400 line-through font-semibold">Rp 599 ribu</span>
                    <span className="text-2xl sm:text-3xl font-black text-blue-600">Rp 299 ribu</span>
                    <span className="text-xs text-slate-500 font-medium">/bln</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                      Hemat 50%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Mesin terlengkap untuk scale up iklan berbayar dan toko produk fisik dengan pelacakan data server-side & ongkir kurir nasional.
                </p>
                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="text-[11px] font-black uppercase text-blue-700 tracking-wide pb-1">
                    ⭐ SEMUA FITUR DI PAKET GROWTH, DITAMBAH:
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Built-in Meta Conversions API (CAPI Server-Side Tracking) anti-adblock</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>TikTok Events API & Multi-Pixel Injection untuk optimasi ROAS iklan</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Modul Lengkap Kurir Fisik: Cek ongkir otomatis se-Indonesia</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Manajemen Resi Otomatis & Auto-Tracking status paket pelanggan</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Kalkulator Ongkir & Form Alamat Checkout Otomatis</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Laporan Keuangan Lengkap: Laba/Rugi, HPP, & Margin per produk</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Ekspor Pembukuan ke CSV / Excel siap pajak & audit</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Multi-Device Connection (Support hingga 2 WhatsApp CS)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=growth_tracking"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center block transition shadow-lg shadow-blue-600/30"
                >
                  Pilih Paket Growth Tracking
                </Link>
              </div>
            </div>

            {/* Card 3: Pro Scale */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  Enterprise Grade &bull; Official Meta API
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Pro Scale</h3>
                  <p className="text-xs text-emerald-700 font-bold mt-0.5">Infrastruktur Resmi Anti-Banned untuk Brand & Volume Tinggi</p>
                  <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm text-slate-400 line-through font-semibold">Rp 899 ribu</span>
                    <span className="text-2xl sm:text-3xl font-black text-slate-900">Rp 499 ribu</span>
                    <span className="text-xs text-slate-500 font-medium">/bulan</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                      Hemat 45%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Infrastruktur resmi kelas enterprise untuk brand dengan ribuan transaksi harian tanpa takut nomor diblokir.
                </p>
                <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                  <div className="text-[11px] font-black uppercase text-emerald-700 tracking-wide pb-1">
                    ⭐ SEMUA FITUR GROWTH TRACKING SYSTEM, DITAMBAH:
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>WhatsApp Official API (Jalur Resmi Meta Cloud API)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Akun Anti-Banned & Anti-Blokir untuk volume chat masif</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dukungan Resmi Verifikasi Centang Hijau (Official Business Account)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Multi-Agent CS Dashboard (Handle pelanggan bareng tim tanpa rebutan)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dedicated IP & Prioritas Antrean Server Pembayaran Tertinggi</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Template Broadcast Promosi Resmi Meta dengan Tombol Interaktif</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dedicated Setup Assistance & Konsultasi Integrasi VIP</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/register?plan=pro_scale"
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center block transition shadow-md"
                >
                  Pilih Paket Pro Scale
                </Link>
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* 5. STICKY BOTTOM BAR (MOBILE ONLY) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 backdrop-blur-md p-3 md:hidden z-50 shadow-lg">
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