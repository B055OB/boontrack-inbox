"use client";

import React, { useState } from "react";
import { 
  QrCode, 
  MessageSquareCheck, 
  Zap, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles 
} from "lucide-react";

export default function ShopLandingPage() {
  const [storeSlug, setStoreSlug] = useState("");

  const handleClaimStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug) return;
    const sanitized = storeSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    window.location.href = `/register?store=${sanitized}`;
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <div className="bg-blue-600 text-white text-xs md:text-sm py-2 px-4 text-center font-medium flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>Update Engine 2026: Pembayaran QRIS Native via WhatsApp Meta Cloud API resmi aktif!</span>
      </div>

      {/* 2. NAVIGATION BAR */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20">
              B
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              BoonTrack <span className="text-blue-600 font-bold">Shop</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#fitur" className="hover:text-blue-600 transition-colors">Fitur Unggulan</a>
            <a href="#cara-kerja" className="hover:text-blue-600 transition-colors">Cara Kerja</a>
            <a href="#fitur" className="hover:text-blue-600 transition-colors">Otomasi WhatsApp</a>
          </nav>

          <div className="flex items-center gap-3">
            <a 
              href="/register" 
              className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-3 py-2"
            >
              Masuk Toko
            </a>
            <a 
              href="#claim" 
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-sm hover:shadow-md transition-all"
            >
              Buka Toko Gratis
            </a>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION */}
      <section id="claim" className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          <span className="text-xs md:text-sm font-bold text-blue-800">#1 WhatsApp-Native Commerce Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-[1.15] mb-6">
          Landing Page Super Ngebut. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
            QRIS & Notifikasi Tembus Langsung ke WhatsApp.
          </span>
        </h1>

        <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Satu pintu untuk bikin katalog etalase instan, integrasi WhatsApp Bisnis resmi, terima pembayaran QRIS otomatis 24/7, dan follow-up pelanggan tanpa ribet simpan kontak manual.
        </p>

        {/* Interactive URL Claim Bar */}
        <div className="max-w-xl mx-auto mb-6">
          <form onSubmit={handleClaimStore} className="p-2 bg-white rounded-2xl border-2 border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col sm:flex-row items-stretch gap-2 focus-within:border-blue-600 transition-all">
            <div className="flex items-center pl-4 pr-1 py-2 text-slate-400 font-semibold text-sm sm:text-base flex-1">
              <span className="text-slate-400 select-none">shop.boontrack.com/</span>
              <input 
                type="text" 
                placeholder="namatokomu" 
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                className="w-full bg-transparent text-slate-900 placeholder:text-slate-300 font-bold focus:outline-none pl-1"
                required
              />
            </div>
            <button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/20 active:scale-95"
            >
              Klaim Link Toko <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-500 font-medium">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Setup &lt; 2 Menit</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> WhatsApp Cloud API Resmi</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Otomasi QRIS Real-time</span>
        </div>
      </section>

      {/* 4. VALUE PROPOSITION GRID */}
      <section id="fitur" className="py-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-4">
              Dibangun Khusus untuk Scale-Up Penjualan Online & Ads Traffic
            </h2>
            <p className="text-slate-600 text-base sm:text-lg">
              Tinggalkan cara lama yang bikin checkout drop karena form rumit dan verifikasi bukti transfer manual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Native QRIS Image Dispatch</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Saat pembeli checkout, kode QRIS berbentuk gambar resmi langsung terkirim di chat WhatsApp. Pembayaran terverifikasi otomatis dalam 3 detik.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                <MessageSquareCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">WhatsApp Bisnis Resmi</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Hubungkan nomor brand Anda langsung melalui Meta Cloud API. Kirim reminder tagihan otomatis tanpa risiko nomor diblokir.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-2xl flex items-center justify-center mb-6">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Ultra-Fast Loading Storefront</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Halaman etalase toko dioptimasi dengan Next.js agar terbuka instan saat diklik dari Meta Ads, TikTok Ads, maupun link bio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 3-STEP WORKFLOW */}
      <section id="cara-kerja" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">3 Langkah Praktis</h2>
            <p className="text-slate-600">Otomasi alur jualan Anda dari hulu ke hilir</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl mb-6 shadow-lg shadow-slate-900/10">
                1
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Buat Katalog Produk</h4>
              <p className="text-sm text-slate-600">Upload foto produk, tentukan harga dan varian. Dapatkan link toko cantik secara instan.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-xl mb-6 shadow-lg shadow-blue-600/20">
                2
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Pembeli Klik & Checkout</h4>
              <p className="text-sm text-slate-600">Pembeli memilih item di web, order langsung terkirim ke WhatsApp dengan data terstruktur.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl mb-6 shadow-lg shadow-emerald-600/20">
                3
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">QRIS & Notifikasi Auto</h4>
              <p className="text-sm text-slate-600">Sistem mengirim gambar QRIS, mencatat settlement pembayaran, dan mengubah status lunas 100% otomatis.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM CONVERSION CTA */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 rounded-3xl p-8 sm:p-14 text-center text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Siap Mengubah Chat WhatsApp Jadi Mesin Kasir Otomatis?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base mb-8">
              Tingkatkan efisiensi CS, hilangkan verifikasi mutasi manual, dan berikan pengalaman belanja terbaik untuk pelanggan toko Anda.
            </p>
            <a 
              href="#claim" 
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-base shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
            >
              Mulai Buat Toko Online Sekarang <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <p>© 2026 BoonTrack. All rights reserved.</p>
      </footer>

    </div>
  );
}