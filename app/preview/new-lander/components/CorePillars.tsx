'use client';

import React, { useState } from 'react';
import { 
  QrCode, 
  Key, 
  Zap, 
  ShieldCheck, 
  CheckCircle2, 
  Smartphone, 
  Activity, 
  Users2, 
  Layers, 
  Cpu, 
  ChevronRight,
  TrendingUp,
  Percent,
  Check
} from 'lucide-react';

export default function CorePillars() {
  // State for Pillar 1 toggle (Pairing Code vs WABA)
  const [activeEngine, setActiveEngine] = useState<'pairing' | 'waba'>('pairing');

  // State for Pillar 2 interactive mock test
  const [isCapiSimulated, setIsCapiSimulated] = useState(false);

  return (
    <section id="pilar" className="py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/60 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold">
            <Cpu className="w-3.5 h-3.5" />
            <span>Arsitektur SaaS Berstandar Enterprise</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            3 Pilar Teknologi yang Menggerakkan Bisnis Anda
          </h2>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Infrastruktur otomatisasi backend modern yang menggabungkan perpesanan real-time, pelacakan iklan server-side, dan ekosistem afiliasi tanpa ribet.
          </p>
        </div>

        {/* ── PILLAR 1: Dual-Engine WhatsApp Gateway (Text Left, Visual Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
              <span>Pilar 1</span>
              <span>•</span>
              <span>Connectivity Freedom</span>
            </div>
            
            <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              Dual-Engine WhatsApp Gateway: Zero-Token Pairing vs WABA Resmi
            </h3>
            
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Pilihan arsitektur fleksibel sesuai skala operasional bisnis Anda. Mulai secara instan tanpa biaya token percakapan atau tingkatkan ke Cloud API resmi Meta untuk skala siaran massal.
            </p>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine A (Zero-Token Gateway):</strong> Hubungkan nomor WhatsApp toko hanya dengan memasukkan <strong>8-Digit Pairing Code</strong>. Bebas biaya token Meta, cocok untuk UMKM & brand mandiri.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine B (Official WABA Cloud API):</strong> Integrasi Meta Business Cloud resmi dengan centang hijau (Green Tick), anti-banned, dan kapasitas broadcast massal berkecepatan tinggi.
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Dual-Engine Switcher Mockup */}
          <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
            {/* Engine Toggle Pills */}
            <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 gap-1.5 mb-6">
              <button
                type="button"
                onClick={() => setActiveEngine('pairing')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeEngine === 'pairing'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Engine A: Pairing Code (0 Biaya)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveEngine('waba')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeEngine === 'waba'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Engine B: WABA Resmi Meta</span>
              </button>
            </div>

            {/* Dynamic Engine Card Preview */}
            {activeEngine === 'pairing' ? (
              <div className="bg-slate-950 rounded-2xl p-5 border border-emerald-500/30 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-400 font-bold uppercase">
                    Tautkan Perangkat via Nomor HP
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                    Zero Token Cost
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] text-slate-400 block">Kode Pairing 8-Digit Anda:</span>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center gap-3 font-mono text-xl sm:text-2xl font-black text-emerald-400 tracking-widest">
                    <span>8492</span>
                    <span className="text-slate-600">-</span>
                    <span>7104</span>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    Buka WhatsApp di HP -&gt; Perangkat Tertaut -&gt; Tautkan dengan Nomor Telepon.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sesi Tersinkron Otomatis
                  </span>
                  <span className="text-slate-400 font-mono">Status: Connected</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 rounded-2xl p-5 border border-indigo-500/30 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-indigo-400 font-bold uppercase">
                    WhatsApp Business Cloud API
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                    Official Meta Verified
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Phone Number ID:</span>
                    <span className="font-mono text-white font-bold">109849201948291</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Quality Rating:</span>
                    <span className="font-mono text-emerald-400 font-bold">HIGH (Green)</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Centang Hijau Resmi:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified Brand
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 text-center font-mono">
                  Dukungan Broadcast Template pesan promosi terverifikasi Meta.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── PILLAR 2: Zero-Config Meta Conversions API (Visual Left, Text Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Visual Form Mockup (Left) */}
          <div className="lg:col-span-6 order-2 lg:order-1 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-xs font-bold text-white">Integrasi Server-Side Meta CAPI</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                Tanpa Google Tag Manager
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-mono text-[11px] block">Meta Pixel ID</label>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs">
                  849102948194012
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-mono text-[11px] block">Conversions API Access Token</label>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-400 font-mono text-xs truncate">
                  EAAG8402910d••••••••••••••••••••••••••••••••••
                </div>
              </div>

              <div className="p-3.5 bg-slate-950/80 border border-blue-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    <span>Daftar Event Server Otomatis:</span>
                  </span>
                  <span className="font-mono text-emerald-400 text-[10px] font-bold">EMQ: 9.8 / 10</span>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40">PageView</span>
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40">ViewContent</span>
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40">AddToCart</span>
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40">InitiateCheckout</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 font-bold">Purchase (Deduplicated)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCapiSimulated(true)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isCapiSimulated ? '✓ Event Purchase Berhasil Dikirim ke Meta!' : 'Uji Kirim Event Server-Side'}</span>
            </button>
          </div>

          {/* Text Content (Right) */}
          <div className="lg:col-span-6 order-1 lg:order-2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-500/30 text-blue-400 text-xs font-mono font-bold">
              <span>Pilar 2</span>
              <span>•</span>
              <span>Accurate Attribution</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              Zero-Config Meta CAPI: Selamatkan 40% Data Iklan yang Hilang
            </h3>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Pembaruan iOS 14.5+ dan ad blocker memblokir pelacakan browser tradisional. BoonTrack memulihkan akurasi iklan Anda dengan menembakkan sinyal langsung dari backend server Next.js.
            </p>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero-Code Setup:</strong> Anda hanya perlu menempelkan Pixel ID dan Access Token di dashboard. Sistem otomatis menangani payload JSON dan hashing data pembeli.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Kunci Deduplikasi Otomatis:</strong> Mencegah event ganda saat pembeli berpindah dari browser website ke ruang chat WhatsApp.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── PILLAR 3: Multi-Tier Affiliate Engine (Text Left, Visual Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/70 border border-indigo-500/30 text-indigo-400 text-xs font-mono font-bold">
              <span>Pilar 3</span>
              <span>•</span>
              <span>Growth Multiplication</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              Multi-Tier Affiliate Engine: Replikasi Pasukan Penjual Secara Otomatis
            </h3>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Tingkatkan omzet toko Anda tanpa menambah anggaran iklan berbayar. Ajak mitra dan reseller menjualkan produk dengan pembagian komisi presisi dan payout otomatis.
            </p>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Bagi Hasil 25% Mitra Langsung:</strong> Setiap transaksi melalui tautan referral mitra mencatat atribusi instan ke dashboard affiliate mereka.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>5% Affiliate Manager (AM) Override:</strong> Motivasi tim koordinator dengan bonus bertingkat otomatis dari seluruh penjualan grup mereka.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Pencairan Dana 1-Klik:</strong> Rekonsiliasi saldo dan penarikan instan via rekening bank lokal yang aman.
                </span>
              </div>
            </div>
          </div>

          {/* Tier Split Breakdown Card (Right) */}
          <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users2 className="w-4 h-4 text-indigo-400" />
                <span>Simulasi Alokasi Bagi Hasil (Nilai Order: Rp 100.000)</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-400 font-bold">Pencairan Otomatis</span>
            </div>

            <div className="space-y-3">
              {/* Merchant Gross */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Pendapatan Bersih Merchant</span>
                  <span className="text-[10px] text-slate-400 font-mono">70% Margin Toko</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-white text-base">Rp 70.000</span>
                  <span className="text-[10px] text-emerald-400 block font-mono">100% Milik Toko</span>
                </div>
              </div>

              {/* Mitra Direct Affiliate */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-indigo-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-300 block">Komisi Mitra Penjual (Direct Ref)</span>
                  <span className="text-[10px] text-slate-400 font-mono">25% Komisi Penjualan</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-indigo-300 text-base">Rp 25.000</span>
                  <span className="text-[10px] text-indigo-400 block font-mono">Masuk Saldo Mitra</span>
                </div>
              </div>

              {/* AM Override */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-amber-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-300 block">Bonus Affiliate Manager (AM Override)</span>
                  <span className="text-[10px] text-slate-400 font-mono">5% Team Leadership Bonus</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-amber-300 text-base">Rp 5.000</span>
                  <span className="text-[10px] text-amber-400 block font-mono">Masuk Saldo AM</span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 font-mono text-center">
              Seluruh komisi dihitung dengan rumus integer presisi tanpa selisih pembulatan desimal.
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
