'use client';

import React, { useState } from 'react';
import { 
  Key, 
  Zap, 
  ShieldCheck, 
  CheckCircle2, 
  Activity, 
  Users2, 
  Cpu
} from 'lucide-react';

export default function CorePillars() {
  // State for Pillar 1 toggle (Pairing Code vs WABA)
  const [activeEngine, setActiveEngine] = useState<'pairing' | 'waba'>('pairing');

  // State for Pillar 2 interactive mock test
  const [isCapiSimulated, setIsCapiSimulated] = useState(false);

  return (
    <section id="pilar" className="py-20 bg-zinc-50/70 border-t border-zinc-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-bold">
            <Cpu className="w-3.5 h-3.5" />
            <span>Arsitektur SaaS Berstandar Enterprise</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 tracking-tight">
            3 Pilar Teknologi yang Menggerakkan Bisnis Anda
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
            Infrastruktur otomatisasi backend modern yang menggabungkan perpesanan real-time, pelacakan iklan server-side, dan ekosistem afiliasi tanpa ribet.
          </p>
        </div>

        {/* ── PILLAR 1: Dual-Engine WhatsApp Gateway (Text Left, Visual Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold">
              <span>Pilar 1</span>
              <span>•</span>
              <span>Connectivity Freedom</span>
            </div>
            
            <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 leading-tight">
              Dual-Engine WhatsApp Gateway: Zero-Token Pairing vs WABA Resmi
            </h3>
            
            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              Pilihan arsitektur fleksibel sesuai skala operasional bisnis Anda. Mulai secara instan tanpa biaya token percakapan atau tingkatkan ke Cloud API resmi Meta untuk skala siaran massal.
            </p>

            <div className="space-y-3 text-xs text-zinc-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine A (Zero-Token Gateway):</strong> Hubungkan nomor WhatsApp toko hanya dengan memasukkan <strong>8-Digit Pairing Code</strong>. Bebas biaya token Meta, cocok untuk UMKM & brand mandiri.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine B (Official WABA Cloud API):</strong> Integrasi Meta Business Cloud resmi dengan centang hijau (Green Tick), anti-banned, dan kapasitas broadcast massal berkecepatan tinggi.
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Dual-Engine Switcher Mockup */}
          <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs">
            {/* Engine Toggle Pills */}
            <div className="flex items-center bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200 gap-1.5 mb-6">
              <button
                type="button"
                onClick={() => setActiveEngine('pairing')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeEngine === 'pairing'
                    ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-emerald-600" />
                <span>Engine A: Pairing Code (0 Biaya)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveEngine('waba')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeEngine === 'waba'
                    ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Engine B: WABA Resmi Meta</span>
              </button>
            </div>

            {/* Dynamic Engine Card Preview */}
            {activeEngine === 'pairing' ? (
              <div className="bg-zinc-50 rounded-2xl p-5 border border-emerald-300 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-800 font-bold uppercase">
                    Tautkan Perangkat via Nomor HP
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                    Zero Token Cost
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] text-zinc-500 block">Kode Pairing 8-Digit Anda:</span>
                  <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-center gap-3 font-mono text-xl sm:text-2xl font-black text-emerald-600 tracking-widest shadow-xs">
                    <span>8492</span>
                    <span className="text-zinc-300">-</span>
                    <span>7104</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 text-center">
                    Buka WhatsApp di HP -&gt; Perangkat Tertaut -&gt; Tautkan dengan Nomor Telepon.
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sesi Tersinkron Otomatis
                  </span>
                  <span className="text-zinc-500 font-mono">Status: Connected</span>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-50 rounded-2xl p-5 border border-indigo-200 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-indigo-700 font-bold uppercase">
                    WhatsApp Business Cloud API
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold">
                    Official Meta Verified
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-zinc-200 shadow-xs">
                    <span className="text-zinc-500">Phone Number ID:</span>
                    <span className="font-mono text-zinc-900 font-bold">109849201948291</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-zinc-200 shadow-xs">
                    <span className="text-zinc-500">Quality Rating:</span>
                    <span className="font-mono text-emerald-700 font-bold">HIGH (Green)</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-zinc-200 shadow-xs">
                    <span className="text-zinc-500">Centang Hijau Resmi:</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified Brand
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200 text-[10px] text-zinc-500 text-center font-mono">
                  Dukungan Broadcast Template pesan promosi terverifikasi Meta.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── PILLAR 2: Zero-Config Meta Conversions API (Visual Left, Text Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Visual Form Mockup (Left) */}
          <div className="lg:col-span-6 order-2 lg:order-1 bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span className="text-xs font-bold text-zinc-900">Integrasi Server-Side Meta CAPI</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                Tanpa Google Tag Manager
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-500 font-mono text-[11px] block">Meta Pixel ID</label>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-zinc-900 font-mono text-xs">
                  849102948194012
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-500 font-mono text-[11px] block">Conversions API Access Token</label>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-zinc-400 font-mono text-xs truncate">
                  EAAG8402910d••••••••••••••••••••••••••••••••••
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/40 border border-blue-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-800 font-bold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    <span>Daftar Event Server Otomatis:</span>
                  </span>
                  <span className="font-mono text-emerald-700 text-[10px] font-bold">EMQ: 9.8 / 10</span>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200 shadow-xs">PageView</span>
                  <span className="px-2 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200 shadow-xs">ViewContent</span>
                  <span className="px-2 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200 shadow-xs">AddToCart</span>
                  <span className="px-2 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200 shadow-xs">InitiateCheckout</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">Purchase (Deduplicated)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCapiSimulated(true)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isCapiSimulated ? '✓ Event Purchase Berhasil Dikirim ke Meta!' : 'Uji Kirim Event Server-Side'}</span>
            </button>
          </div>

          {/* Text Content (Right) */}
          <div className="lg:col-span-6 order-1 lg:order-2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-800 text-xs font-mono font-bold">
              <span>Pilar 2</span>
              <span>•</span>
              <span>Accurate Attribution</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 leading-tight">
              Zero-Config Meta CAPI: Selamatkan 40% Data Iklan yang Hilang
            </h3>

            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              Pembaruan iOS 14.5+ dan ad blocker memblokir pelacakan browser tradisional. BoonTrack memulihkan akurasi iklan Anda dengan menembakkan sinyal langsung dari backend server Next.js.
            </p>

            <div className="space-y-3 text-xs text-zinc-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero-Code Setup:</strong> Anda hanya perlu menempelkan Pixel ID dan Access Token di dashboard. Sistem otomatis menangani payload JSON dan hashing data pembeli.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-mono font-bold">
              <span>Pilar 3</span>
              <span>•</span>
              <span>Growth Multiplication</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 leading-tight">
              Multi-Tier Affiliate Engine: Replikasi Pasukan Penjual Secara Otomatis
            </h3>

            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              Tingkatkan omzet toko Anda tanpa menambah anggaran iklan berbayar. Ajak mitra dan reseller menjualkan produk dengan pembagian komisi presisi dan payout otomatis.
            </p>

            <div className="space-y-3 text-xs text-zinc-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Bagi Hasil 25% Mitra Langsung:</strong> Setiap transaksi melalui tautan referral mitra mencatat atribusi instan ke dashboard affiliate mereka.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>5% Affiliate Manager (AM) Override:</strong> Motivasi tim koordinator dengan bonus bertingkat otomatis dari seluruh penjualan grup mereka.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Pencairan Dana 1-Klik:</strong> Rekonsiliasi saldo dan penarikan instan via rekening bank lokal yang aman.
                </span>
              </div>
            </div>
          </div>

          {/* Tier Split Breakdown Card (Right) */}
          <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Users2 className="w-4 h-4 text-indigo-600" />
                <span>Simulasi Alokasi Bagi Hasil (Nilai Order: Rp 100.000)</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-700 font-bold">Pencairan Otomatis</span>
            </div>

            <div className="space-y-3">
              {/* Merchant Gross */}
              <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 block">Pendapatan Bersih Merchant</span>
                  <span className="text-[10px] text-zinc-500 font-mono">70% Margin Toko</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-zinc-900 text-base">Rp 70.000</span>
                  <span className="text-[10px] text-emerald-700 block font-mono">100% Milik Toko</span>
                </div>
              </div>

              {/* Mitra Direct Affiliate */}
              <div className="bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-900 block">Komisi Mitra Penjual (Direct Ref)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">25% Komisi Penjualan</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-indigo-900 text-base">Rp 25.000</span>
                  <span className="text-[10px] text-indigo-700 block font-mono">Masuk Saldo Mitra</span>
                </div>
              </div>

              {/* AM Override */}
              <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">Bonus Affiliate Manager (AM Override)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">5% Team Leadership Bonus</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-amber-900 text-base">Rp 5.000</span>
                  <span className="text-[10px] text-amber-700 block font-mono">Masuk Saldo AM</span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-zinc-500 font-mono text-center">
              Seluruh komisi dihitung dengan rumus integer presisi tanpa selisih pembulatan desimal.
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
