"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Store, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Bot, 
  QrCode, 
  Smartphone,
  TrendingUp
} from "lucide-react";

function CleanShopLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [storeName, setStoreName] = useState("");
  const [refCode, setRefCode] = useState("buzzerukm");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ref = searchParams?.get("ref") || searchParams?.get("via") || "buzzerukm";
      setRefCode(ref);
    }
  }, [searchParams]);

  const sanitizeSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeSlug(storeName);
    if (!clean) return;

    setLoading(true);
    router.push(`/register?store=${encodeURIComponent(clean)}&ref=${encodeURIComponent(refCode)}`);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* Top Notification Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white text-xs font-semibold py-2 px-4 text-center">
        <span>⚡ WhatsApp Commerce & Kasir QRIS Otomatis Terintegrasi Resmi.</span>
        <a href="#claim-section" className="underline ml-2 hover:text-blue-200 transition font-bold">
          Klaim Toko Anda Sekarang →
        </a>
      </div>

      {/* Navbar Clean */}
      <header className="border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900">
                BoonTrack <span className="text-blue-600">Shop</span>
              </span>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Commerce Engine</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#fitur" className="hover:text-blue-600 transition">Fitur</a>
            <a href="#keunggulan" className="hover:text-blue-600 transition">Keunggulan</a>
            <a href="#harga" className="hover:text-blue-600 transition">Harga</a>
          </nav>

          <button
            onClick={() => router.push(`/register?ref=${encodeURIComponent(refCode)}`)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <span>Daftar Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero Section (Clean White & Soft Blue) */}
      <section id="claim-section" className="relative pt-12 sm:pt-20 pb-16 sm:pb-24 overflow-hidden bg-gradient-to-b from-blue-50/60 via-slate-50/30 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100/80 border border-blue-200/60 text-blue-700 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Platform Penjualan & WhatsApp Tercepat di Indonesia</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
            Tingkatkan Penjualan dengan <br className="hidden sm:inline" />
            <span className="text-blue-600">Manajemen Order Otomatis.</span>
          </h1>

          <p className="text-sm sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Platform commerce berbasis web & WhatsApp untuk Anda pebisnis online. Kasir otomatis, QRIS dinamis 3 detik, dan asisten bot closing 24 jam.
          </p>

          {/* Form Input Klaim Nama Toko Clean */}
          <form onSubmit={handleClaim} className="w-full max-w-xl mx-auto pt-4">
            <div className="bg-white border-2 border-slate-200 focus-within:border-blue-600 p-2 rounded-2xl shadow-xl shadow-blue-500/5 flex flex-col sm:flex-row gap-2 transition-all">
              <div className="relative flex-1 flex items-center">
                <span className="pl-3.5 text-xs font-mono text-slate-400 select-none hidden sm:inline">
                  shop.boontrack.com/
                </span>
                <input
                  type="text"
                  required
                  placeholder="nama-toko-anda"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full bg-transparent px-3 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !storeName.trim()}
                className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 shrink-0"
              >
                <span>{loading ? "Memproses..." : "Klaim Toko Sekarang"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 mt-4 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Domain Subfolder Instan</span>
              <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-blue-500" /> Verifikasi QRIS Otomatis</span>
              <span className="flex items-center gap-1.5"><Bot className="w-4 h-4 text-indigo-500" /> Bot Closing WhatsApp</span>
            </div>
          </form>

        </div>
      </section>

      {/* Grid 3 Fitur Unggulan */}
      <section id="fitur" className="py-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Solusi Praktis Tanpa Kebocoran Omzet</h2>
            <p className="text-slate-500 text-sm mt-2">Didesain khusus untuk mempercepat closing transaksi produk fisik, digital, dan jasa.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Etalase Toko Mobile Ringan</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Tampilan mobile yang dimuat secepat kilat di iOS & Android tanpa lag, mempermudah pembeli langsung memilih produk dan checkout.
              </p>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">QRIS Dinamis 3 Detik</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Sistem verifikasi transfer otomatis via Xendit tanpa cek mutasi manual. Tagihan langsung dinyatakan lunas detik itu juga.
              </p>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Notifikasi & Follow-up Bot</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Kirim invoice otomatis, link download produk digital, atau konfirmasi booking jasa langsung ke WhatsApp pelanggan.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Pricing Tiers Clean */}
      <section id="harga" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Investasi Ringan untuk Bisnis Anda</h2>
            <p className="text-slate-500 text-sm mt-2">Pilih paket sesuai kebutuhan skala penjualan Anda.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            
            {/* Growth */}
            <div className="p-8 bg-white rounded-3xl border-2 border-slate-200 flex flex-col justify-between hover:border-blue-500 transition-all">
              <div className="space-y-4">
                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">Starter & UMKM</span>
                <h3 className="text-xl font-bold text-slate-900">Growth Plan</h3>
                <div className="text-3xl font-black text-slate-900">
                  Rp 199.000 <span className="text-xs font-normal text-slate-500">/bulan</span>
                </div>
                <ul className="space-y-3 pt-4 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> Kuota 300 Order Otomatis/Bulan</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> 2 CS Inbox Seats</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> QRIS Dinamis Otomatis</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> URL Domain Toko Resmi</li>
                </ul>
              </div>
              <button
                onClick={() => router.push(`/register?plan=growth&ref=${encodeURIComponent(refCode)}`)}
                className="mt-8 w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl text-center transition cursor-pointer"
              >
                Pilih Paket Growth
              </button>
            </div>

            {/* Pro Scale */}
            <div className="p-8 bg-gradient-to-b from-blue-50/50 to-white rounded-3xl border-2 border-blue-600 relative flex flex-col justify-between shadow-lg shadow-blue-500/10">
              <div className="absolute -top-3 right-6 bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Paling Diminati
              </div>
              <div className="space-y-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Skala Bisnis Skala Besar</span>
                <h3 className="text-xl font-bold text-slate-900">Pro Scale Plan</h3>
                <div className="text-3xl font-black text-blue-600">
                  Rp 499.000 <span className="text-xs font-normal text-slate-500">/bulan</span>
                </div>
                <ul className="space-y-3 pt-4 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> <b>Unlimited Order & Transaksi</b></li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> 5 Multi-Agent CS Seats</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> AI Assistant Closing Bot</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-600" /> Dukungan Teknis Prioritas 24/7</li>
                </ul>
              </div>
              <button
                onClick={() => router.push(`/register?plan=pro_scale&ref=${encodeURIComponent(refCode)}`)}
                className="mt-8 w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl text-center transition shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Pilih Paket Pro Scale
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* Footer Clean */}
      <footer className="border-t border-slate-100 py-10 bg-slate-50 text-center text-xs text-slate-400">
        <p>© 2026 BoonTrack. All rights reserved. Platform Commerce & WhatsApp Automation.</p>
      </footer>

    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center text-slate-400 text-xs">Memuat BoonTrack Shop...</div>}>
      <CleanShopLanding />
    </Suspense>
  );
}