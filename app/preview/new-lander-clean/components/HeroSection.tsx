'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  TrendingUp, 
  Zap, 
  ShieldCheck, 
  QrCode, 
  MessageSquare, 
  Send, 
  Check
} from 'lucide-react';

interface HeroSectionProps {
  referralCode?: string;
  onOpenDemo?: () => void;
}

export default function HeroSection({ referralCode, onOpenDemo }: HeroSectionProps) {
  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';
  
  // Interactive mock state for the phone demo on the right
  const [hasPaidDemo, setHasPaidDemo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSimulatePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setHasPaidDemo(true);
    }, 900);
  };

  const handleResetDemo = () => {
    setHasPaidDemo(false);
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-18 md:pb-26 bg-gradient-to-b from-white via-zinc-50/50 to-white">
      {/* Background Subtle Gradient Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-emerald-100/40 via-teal-50/20 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Text & Dual CTAs */}
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Badge: Pill kapsul lembut */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
            </span>
            <span className="tracking-wide">New: Dual-Engine WhatsApp (Zero Token & WABA Resmi)</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-zinc-900 leading-[1.14]">
            Satu Sistem Operasi WhatsApp & Toko Online Otomatis untuk Bisnis Anda.
          </h1>

          {/* Sub-headline */}
          <p className="text-sm sm:text-base md:text-lg text-zinc-600 max-w-2xl mx-auto leading-relaxed font-normal">
            Otomatiskan pesanan, terima pembayaran QRIS 0% MDR, dan lacak Meta CAPI otomatis tanpa potongan komisi marketplace.
          </p>

          {/* Dual CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link
              href={registerHref}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-black text-sm tracking-wide shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <span>Buka Toko Gratis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={onOpenDemo}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs hover:shadow"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Lihat Live Demo</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-500 pt-1 font-mono">
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> 0% Potongan Komisi
            </span>
            <span className="text-zinc-300">•</span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Pairing Code 8-Digit
            </span>
            <span className="text-zinc-300">•</span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Server CAPI Siap
            </span>
          </div>
        </div>

        {/* Hero Dual Visual (Side-by-Side Clean Mockup) */}
        <div className="mt-12 lg:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Kiri: Card UI Mini Dashboard Toko (7 cols on desktop - Clean Light Card) */}
          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-3xl p-5 sm:p-7 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            {/* Dashboard Header Bar */}
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  <span className="text-xs font-mono text-zinc-500 ml-2 font-semibold">
                    boontrack.com/tokosaya/dashboard
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Gateway Online 24/7
                </span>
              </div>

              {/* Stat Widgets (Clean Light Panels) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-5">
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-medium block">Omzet Hari Ini</span>
                  <div className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                    Rp 14.850.000
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> +28.4% vs kemarin
                  </span>
                </div>

                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-medium block">Total Transaksi</span>
                  <div className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                    84 Order
                  </div>
                  <span className="text-[10px] text-indigo-600 font-semibold">
                    0% Biaya Marketplace
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-800 font-medium">QRIS Standar</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-200/60 text-emerald-800 rounded font-mono">
                      0% MDR
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight">
                    Langsung Cair
                  </div>
                  <span className="text-[10px] text-zinc-500 block truncate">
                    Ke rekening toko detik itu juga
                  </span>
                </div>
              </div>

              {/* Live Order Activity Feed */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Aktivitas Terkini (Real-time Stream)</span>
                  <span className="font-mono text-[10px] text-indigo-600 font-bold">Meta CAPI: EMQ 9.6/10</span>
                </div>

                <div className="space-y-2">
                  <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-zinc-900 font-bold">Pesanan #1084 - Paket Bundling Pro</div>
                        <div className="text-[10px] text-zinc-500">WhatsApp: 0812-****-8819 • Lunas via QRIS Instan</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600">Rp 185.000</div>
                      <div className="text-[10px] text-zinc-400 font-mono">10 detik lalu</div>
                    </div>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-zinc-900 font-bold">Meta CAPI Server-Side Sync</div>
                        <div className="text-[10px] text-zinc-500">Event: Purchase • Deduplication Key Validated</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[10px] font-bold">
                        Sent (200 OK)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Dashboard Perks */}
            <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero Hardcode • 100% Dynamic Multi-Tenant</span>
              </span>
              <span className="font-mono text-emerald-600 font-bold hidden sm:inline">
                SLA Uptime 99.9%
              </span>
            </div>
          </div>

          {/* Kanan: Mockup Smartphone WhatsApp Interaktif (Light WhatsApp Visual) */}
          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-3xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            {/* Phone Bezel Header (WhatsApp Green Header) */}
            <div className="w-full bg-[#008069] rounded-2xl p-3 flex items-center justify-between text-white shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white text-[#008069] flex items-center justify-center font-black text-xs shadow-xs">
                  BT
                </div>
                <div>
                  <div className="text-xs font-bold flex items-center gap-1 text-white">
                    <span>Toko Mandiri Bot</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white text-[#008069]" />
                  </div>
                  <div className="text-[10px] text-emerald-100 font-mono">online • Asisten 24 Jam</div>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white font-semibold">
                Interactive
              </span>
            </div>

            {/* WhatsApp Chat Area (Clean WhatsApp Light Background: #EFEAE2) */}
            <div className="my-3 space-y-3 px-1.5 py-3 rounded-2xl bg-[#EFEAE2] border border-zinc-200/80">
              {/* Buyer Message (White Bubble) */}
              <div className="flex justify-end">
                <div className="bg-white text-zinc-800 rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-[85%] shadow-xs">
                  <p>Halo, mau pesan Paket Bundling Pro 1 pcs kak.</p>
                  <div className="text-[9px] text-zinc-400 text-right mt-1 font-mono">10:42</div>
                </div>
              </div>

              {/* Bot Response (WhatsApp Soft Green Bubble: #D9FDD3) */}
              <div className="flex justify-start">
                <div className="bg-[#D9FDD3] text-zinc-800 rounded-2xl rounded-tl-none p-3.5 text-xs max-w-[92%] shadow-xs space-y-2 border border-emerald-200/60">
                  <p className="leading-snug">
                    Halo kak! Pesanan <strong>Paket Bundling Pro (Rp 185.000)</strong> telah dicatat.
                  </p>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-zinc-500">
                      <span>Order ID:</span>
                      <span className="text-zinc-900 font-bold">ORD-8819</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Total Bayar:</span>
                      <span className="text-emerald-700 font-bold">Rp 185.000</span>
                    </div>
                  </div>

                  {/* Payment Button or Verified Badge */}
                  {!hasPaidDemo ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleSimulatePayment}
                        disabled={isProcessing}
                        className="w-full py-2 bg-[#008069] hover:bg-[#00705c] active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isProcessing ? 'Memverifikasi...' : 'Simulasi Bayar QRIS Instan'}</span>
                      </button>
                      <p className="text-[9px] text-zinc-500 text-center mt-1.5 font-mono">
                        (Klik untuk melihat konfirmasi lunas otomatis)
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white border border-emerald-300 rounded-xl space-y-1 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Pembayaran Sukses Terverifikasi!</span>
                      </div>
                      <p className="text-[10px] text-zinc-600">
                        Akses materi & resi otomatis terbit. Notifikasi Meta CAPI terkirim.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetDemo}
                        className="text-[10px] text-emerald-700 underline font-semibold hover:text-emerald-800"
                      >
                        Ulangi Simulasi Chat
                      </button>
                    </div>
                  )}

                  <div className="text-[9px] text-zinc-400 text-right font-mono">10:42 • Bot Otomatis</div>
                </div>
              </div>
            </div>

            {/* WhatsApp Bottom Input Box */}
            <div className="bg-zinc-100 rounded-2xl p-2 flex items-center gap-2 border border-zinc-200">
              <div className="flex-1 bg-white rounded-xl px-3 py-1.5 text-zinc-400 text-xs font-mono truncate border border-zinc-200/80">
                Ketik pesan atau klik opsi bot...
              </div>
              <div className="w-7 h-7 rounded-full bg-[#008069] flex items-center justify-center text-white">
                <Send className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

        </div>

        {/* Social Proof & FinTech Ecosystem Bar (Clean Light Gray) */}
        <div className="mt-12 pt-8 border-t border-zinc-200/80">
          <p className="text-center text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-5">
            Dipercaya & Terhubung Ekosistem FinTech dan API Resmi
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 opacity-80">
            <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Meta Conversions API</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>WhatsApp Business API</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Xendit Payment Gateway</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <span>QRIS Standar Bank Indonesia</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
