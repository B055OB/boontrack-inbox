'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  TrendingUp, 
  Zap, 
  ShieldCheck, 
  QrCode, 
  MessageCircle,
  Smartphone,
  Send, 
  Check
} from 'lucide-react';

interface HeroSectionProps {
  referralCode?: string;
}

export default function HeroSection({ referralCode }: HeroSectionProps) {
  const router = useRouter();
  const [storeInput, setStoreInput] = useState('');
  const [activeProof, setActiveProof] = useState<number>(0);

  // Phone WhatsApp Interactive simulation state
  const [hasPaidDemo, setHasPaidDemo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const sanitizeSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleClaimStore = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = sanitizeSlug(storeInput);
    if (!cleanSlug) return;
    const params = new URLSearchParams();
    params.set('shop', cleanSlug);
    params.set('store', cleanSlug);
    params.set('claim', cleanSlug);
    if (referralCode) {
      params.set('ref', referralCode);
    }
    router.push(`/register?${params.toString()}`);
  };

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
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-16 md:pb-24 bg-gradient-to-b from-white via-slate-50 to-white">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Hook & Interactive Claim Box */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          {/* Sub-badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold tracking-wide shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>Infrastruktur Commerce Generasi Baru</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 leading-[1.12]">
            Dari Chat Sampai Order Beres.{' '}
            <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
              Semuanya Otomatis.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="text-slate-600 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed font-normal">
            Infrastruktur etalase instan, pembayaran QRIS otomatis berlisensi Bank Indonesia, manajemen chat tim CS, dan pelacakan iklan Meta &amp; TikTok CAPI dalam satu dashboard terpadu.
          </p>

          {/* Interactive Domain Claim Box */}
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
                <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Tanpa Kartu Kredit
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Setup 30 Detik
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Batal Kapan Saja
              </span>
            </div>
          </div>
        </div>

        {/* Floating Visual Proof Cards (3 Kartu Mengambang Interaktif) */}
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
                <span className="text-[10px] text-emerald-600 font-black font-mono">Hitungan Detik</span>
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

        {/* Hero Dual Visual Mockup (Dashboard Kiri & WhatsApp Simulator Kanan) */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Kiri: Card UI Mini Dashboard Toko (7 cols on desktop) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span className="text-xs font-mono text-slate-500 ml-2 font-bold">
                    shop.boontrack.com/tokoberkah/dashboard
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Gateway Online 24/7
                </span>
              </div>

              {/* Stat Widgets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-5">
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block">Omzet Hari Ini</span>
                  <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Rp 14.850.000
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> +28.4% vs kemarin
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block">Total Transaksi</span>
                  <div className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    84 Order
                  </div>
                  <span className="text-[10px] text-blue-600 font-bold">
                    0% Biaya Marketplace
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-emerald-800 font-medium">QRIS Standar</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-200/80 text-emerald-800 rounded font-mono">
                      0% MDR
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight">
                    Langsung Cair
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    Ke rekening toko detik itu juga
                  </span>
                </div>
              </div>

              {/* Live Order Activity Feed */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Aktivitas Terkini (Real-time Stream)</span>
                  <span className="font-mono text-[10px] text-indigo-600 font-bold">Meta CAPI: EMQ 9.6/10</span>
                </div>

                <div className="space-y-2">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-bold">Pesanan #1084 - Paket Bundling Pro</div>
                        <div className="text-[10px] text-slate-500">WhatsApp: 0812-****-8819 • Lunas via QRIS Instan</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600">Rp 185.000</div>
                      <div className="text-[10px] text-slate-400 font-mono">10 detik lalu</div>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-bold">Meta CAPI Server-Side Sync</div>
                        <div className="text-[10px] text-slate-500">Event: Purchase • Deduplication Key Validated</div>
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

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero Hardcode • 100% Dynamic Multi-Tenant</span>
              </span>
              <span className="font-mono text-emerald-600 font-bold hidden sm:inline">
                SLA Uptime 99.9%
              </span>
            </div>
          </div>

          {/* Kanan: Mockup Smartphone WhatsApp Interaktif */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
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
                Simulasi Live
              </span>
            </div>

            {/* WhatsApp Chat Area */}
            <div className="my-3 space-y-3 px-2 py-3 rounded-2xl bg-[#EFEAE2] border border-slate-200">
              {/* Buyer Message */}
              <div className="flex justify-end">
                <div className="bg-white text-slate-800 rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-[85%] shadow-xs">
                  <p>Halo, mau pesan Paket Bundling Pro 1 pcs kak.</p>
                  <div className="text-[9px] text-slate-400 text-right mt-1 font-mono">10:42</div>
                </div>
              </div>

              {/* Bot Response */}
              <div className="flex justify-start">
                <div className="bg-[#D9FDD3] text-slate-800 rounded-2xl rounded-tl-none p-3.5 text-xs max-w-[92%] shadow-xs space-y-2 border border-emerald-200/60">
                  <p className="leading-snug">
                    Halo kak! Pesanan <strong>Paket Bundling Pro (Rp 185.000)</strong> telah dicatat.
                  </p>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Order ID:</span>
                      <span className="text-slate-900 font-bold">ORD-8819</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
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
                        className="w-full py-2.5 bg-[#008069] hover:bg-[#00705c] active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isProcessing ? 'Reader APK Mendeteksi...' : 'Simulasi Bayar QRIS Instan'}</span>
                      </button>
                      <p className="text-[9px] text-slate-500 text-center mt-1.5 font-mono">
                        (Klik tombol di atas untuk melihat verifikasi otomatis dalam hitungan detik)
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white border border-emerald-300 rounded-xl space-y-1 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Pembayaran Rp 185.000 Terverifikasi! (Hitungan Detik)</span>
                      </div>
                      <p className="text-[10px] text-slate-600">
                        Mutasi bank terdeteksi oleh Reader APK. Resi &amp; event Meta CAPI Purchase otomatis terkirim.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetDemo}
                        className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-800"
                      >
                        Ulangi Simulasi Chat
                      </button>
                    </div>
                  )}

                  <div className="text-[9px] text-slate-400 text-right font-mono">10:42 • Bot Otomatis</div>
                </div>
              </div>
            </div>

            {/* WhatsApp Bottom Input Box */}
            <div className="bg-slate-100 rounded-2xl p-2 flex items-center gap-2 border border-slate-200">
              <div className="flex-1 bg-white rounded-xl px-3 py-1.5 text-slate-400 text-xs font-mono truncate border border-slate-200">
                Ketik pesan atau klik opsi bot...
              </div>
              <div className="w-7 h-7 rounded-full bg-[#008069] flex items-center justify-center text-white">
                <Send className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Social Proof & FinTech Ecosystem Bar (Clean Standard QRIS & Bank Indonesia) */}
        <div className="mt-14 pt-8 border-t border-slate-200">
          <p className="text-center text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-5">
            Dipercaya &amp; Terhubung Ekosistem Resmi Perbankan dan API Nasional
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 opacity-90">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Meta Conversions API</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>WhatsApp Business API</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              <span>Payment Gateway Nasional Terlisensi</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <span>QRIS Standar Bank Indonesia</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
