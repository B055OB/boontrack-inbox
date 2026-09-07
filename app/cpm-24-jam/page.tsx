'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  MessageCircle,
  FileText,
  Layers,
  Lock,
  Gift,
  Star,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  QrCode,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Sliders,
  Award,
  Users
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

function LandingPageContent() {
  const searchParams = useSearchParams();

  // Active OnlineBoost WhatsApp bot number (default: 6281224456454 from OnlineBoost Tenant Config)
  const queryWa = searchParams.get('wa');
  const [waNumber, setWaNumber] = useState<string>(
    queryWa ? queryWa.replace(/\D/g, '') : '6281224456454'
  );

  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPresenterToolbar, setShowPresenterToolbar] = useState(false);
  const [customWaInput, setCustomWaInput] = useState(waNumber);
  const [expandedModule, setExpandedModule] = useState<number | null>(1);

  // Live countdown timer for the demo session urgency
  const [timeLeft, setTimeLeft] = useState({ minutes: 23, seconds: 45 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { minutes: prev.minutes - 1, seconds: 59 };
        }
        return { minutes: 30, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const messageText =
    'Halo min, saya tertarik materi Modul Praktis CPM 24 Jam seharga Rp1.000';
  const waTargetUrl = useMemo(() => {
    const cleanNum = waNumber.replace(/\D/g, '') || '6281224456454';
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(messageText)}`;
  }, [waNumber, messageText]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(waTargetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleApplyWa = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customWaInput.replace(/\D/g, '');
    if (clean) {
      setWaNumber(clean);
      setShowPresenterToolbar(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-teal-500/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-[35%] -left-40 w-[500px] h-[500px] bg-blue-600/10 blur-3xl rounded-full" />
        <div className="absolute top-[65%] -right-40 w-[500px] h-[500px] bg-emerald-600/10 blur-3xl rounded-full" />
      </div>

      {/* Top Banner: Sesi Live Demo */}
      <div className="relative z-20 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white text-xs sm:text-sm font-medium py-2.5 px-4 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="font-bold tracking-wide uppercase">
              SESI PENGUJIAN LIVE DEMO ONLINEBOOST
            </span>
            <span className="hidden sm:inline text-emerald-100">•</span>
            <span className="hidden sm:inline text-emerald-100">
              Akses Khusus Pengujian Rp1.000
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs">
              <Clock className="w-3.5 h-3.5 text-emerald-200" />
              <span>
                Sisa Waktu Demo:{' '}
                <strong className="font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, '0')}:
                  {String(timeLeft.seconds).padStart(2, '0')}
                </strong>
              </span>
            </div>

            {/* Presenter Mode Trigger */}
            <button
              onClick={() => setShowPresenterToolbar(!showPresenterToolbar)}
              title="Pengaturan Nomor WhatsApp Demo"
              className="text-xs bg-white/15 hover:bg-white/25 px-2 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span className="hidden md:inline">Opsi Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Presenter Live Controls (Collapsible for Speaker) */}
      {showPresenterToolbar && (
        <div className="relative z-30 bg-slate-900/95 border-b border-slate-800 p-4 shadow-xl backdrop-blur-md">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>
                <strong>Presenter Control:</strong> Ganti nomor bot WA tujuan secara langsung selama demo panggung.
              </span>
            </div>
            <form onSubmit={handleApplyWa} className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={customWaInput}
                onChange={(e) => setCustomWaInput(e.target.value)}
                placeholder="Contoh: 6281224456454"
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-mono w-44"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded transition"
              >
                Terapkan
              </button>
              <button
                type="button"
                onClick={() => {
                  setWaNumber('6281224456454');
                  setCustomWaInput('6281224456454');
                }}
                className="text-slate-400 hover:text-white px-2 py-1.5"
              >
                Reset Default
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Navigation / Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/20">
              OB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">
                  OnlineBoost ID
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Official Live Demo
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Digital Traffic & Monetization Hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowQrModal(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scan QR Demo</span>
            </button>

            <a
              href={waTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-emerald-600/30 transition-all duration-200"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Ambil Rp1.000</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="pt-10 pb-16 px-4 max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-medium mb-6 backdrop-blur-md shadow-sm">
            <Flame className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Materi Uji Coba: Modul Praktis CPM 24 Jam</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15] mb-6">
            Panduan Praktis Setup Traffic CPM:{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              Tembus Impresi Pertama dalam 24 Jam
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-slate-300 text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            Stop bakar budget sia-sia. Kuasai formula taktis integrasi Meta Ads &amp; Conversions API (CAPI) untuk mengalirkan traffic CPM terukur ke funnel Anda tanpa risiko restrict.
          </p>

          {/* Fast Highlights Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 mb-10 text-xs sm:text-sm text-slate-300">
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Impresi Perdana &lt; 24 Jam</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Tracking CAPI 100% Valid</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Formula Anti-Restrict</span>
            </div>
          </div>

          {/* Primary CTA Box in Hero */}
          <div className="bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 max-w-xl mx-auto shadow-2xl shadow-emerald-950/50 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 block">
                  Biaya Uji Coba Demo
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl sm:text-4xl font-black text-white">
                    Rp 1.000
                  </span>
                  <span className="text-xs sm:text-sm text-slate-500 line-through">
                    Rp 149.000
                  </span>
                </div>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1 rounded-full">
                Diskon 99% Sesi Demo
              </span>
            </div>

            <a
              href={waTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full group flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-base sm:text-lg py-4 px-6 rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="w-6 h-6 fill-slate-950" />
              <span>Ambil Akses Rp1.000 via WhatsApp</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Garansi akses materi instan via WhatsApp bot
              </span>
              <button
                onClick={handleCopyLink}
                className="text-slate-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Link WA Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Link Demo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Problem & Agitation Section */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950/80">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 text-xs font-semibold mb-3">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>The Problem &amp; Frustration</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Kenapa 90% Advertiser Boncos Saat Mencari Traffic CPM?
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Bakar uang ratusan ribu per hari bukan jaminan traffic mengalir lancar jika 3 lubang bocor ini tidak segera Anda tambal:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1 */}
              <div className="bg-slate-900/60 border border-red-500/20 hover:border-red-500/40 rounded-2xl p-6 transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
                  <Flame className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  1. Boncos Karena Struktur Campaign Salah
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Menumpuk terlalu banyak audiens dalam 1 ad set atau salah memilih objektif kampanye. Budget Anda terkuras dalam hitungan jam tanpa menghasilkan impresi berkualitas tinggi.
                </p>
              </div>

              {/* Card 2 */}
              <div className="bg-slate-900/60 border border-amber-500/20 hover:border-amber-500/40 rounded-2xl p-6 transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  2. Pixel &amp; CAPI Tidak Terbaca
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Event tracking drop akibat browser privacy blocker atau salah token server-side CAPI. Algoritma Meta menjadi buta dan gagal mengirim audiens yang benar-benar siap konversi.
                </p>
              </div>

              {/* Card 3 */}
              <div className="bg-slate-900/60 border border-rose-500/20 hover:border-rose-500/40 rounded-2xl p-6 transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  3. Akun Iklan Kena Restrict Tiba-Tiba
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Melanggar policy tak kasat mata saat setup pertama kali, domain belum di-verifikasi, atau pola spending yang mencurigakan sehingga akun kena suspended permanen.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Solution Section */}
        <section className="py-16 px-4 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 border-t border-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>The Battle-Tested Solution</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Solusi Taktis: 3 Langkah Optimasi Traffic Instan
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Bypass seluruh teori rumit. Ikuti 3 langkah praktis ini untuk menembus impresi pertama Anda dalam 24 jam ke depan:
              </p>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xl shrink-0">
                  01
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      Langkah Pertama
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">Fondasi Tracking</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-white">
                    Setup Campaign &amp; Event Tracking CAPI Anti-Loss
                  </h4>
                  <p className="text-slate-300 text-xs sm:text-sm mt-1">
                    Hubungkan Meta Pixel bersama Conversions API (CAPI) dengan event deduplication akurat. Data tracking 100% terekam tanpa blind spot, siap menuntun machine learning Meta.
                  </p>
                </div>
                <div className="shrink-0 text-emerald-400 hidden sm:block">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 font-black text-xl shrink-0">
                  02
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                      Langkah Kedua
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">Struktur &amp; Budgeting</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-white">
                    Struktur Ad Set &amp; Strategi Budgeting CBO vs ABO Presisi
                  </h4>
                  <p className="text-slate-300 text-xs sm:text-sm mt-1">
                    Pahami kapan tepatnya memanfaatkan Advantage Campaign Budget (CBO) dan kapan harus mengisolasi ad set dengan ABO. Maksimalkan jangkauan CPM tanpa kebocoran anggaran.
                  </p>
                </div>
                <div className="shrink-0 text-teal-400 hidden sm:block">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-xl shrink-0">
                  03
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      Langkah Ketiga
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">Konversi &amp; Delivery</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-white">
                    Funnel Sederhana &amp; Optimasi Konversi Cepat
                  </h4>
                  <p className="text-slate-300 text-xs sm:text-sm mt-1">
                    Arahkan traffic ke alur landing page super gesit dan WhatsApp bot responsif. Lead langsung masuk ke sistem dalam hitungan detik tanpa hambatan teknis.
                  </p>
                </div>
                <div className="shrink-0 text-cyan-400 hidden sm:block">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Breakdown Modul Section */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold mb-3">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kurikulum Materi</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Breakdown 3 Modul Praktis CPM 24 Jam
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Materi dirancang to the point, siap dieksekusi langkah demi langkah:
              </p>
            </div>

            <div className="space-y-4">
              {/* Modul 1 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden transition-all">
                <button
                  onClick={() => setExpandedModule(expandedModule === 1 ? null : 1)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm">
                      M-1
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                        Modul 1
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        Setup Campaign &amp; Event Tracking CAPI
                      </h3>
                    </div>
                  </div>
                  <div className="text-slate-400">
                    {expandedModule === 1 ? (
                      <ChevronUp className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {expandedModule === 1 && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 bg-slate-950/40 text-xs sm:text-sm text-slate-300 space-y-3">
                    <p className="text-slate-400">
                      Pelajari fondasi teknis yang menjamin setiap impresi dan klik tercatat sempurna di dashboard iklan Anda.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>Koneksi Meta Pixel + Conversions API (CAPI) dengan Server Access Token aktif.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>Validasi Event Deduplication di Meta Events Manager (zero drop data).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>Verifikasi domain bisnis &amp; konfigurasi Aggregated Event Measurement.</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Modul 2 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden transition-all">
                <button
                  onClick={() => setExpandedModule(expandedModule === 2 ? null : 2)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold text-sm">
                      M-2
                    </div>
                    <div>
                      <span className="text-xs font-bold text-teal-400 uppercase tracking-wider block">
                        Modul 2
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        Struktur Ad Set &amp; Strategi Budgeting CBO vs ABO
                      </h3>
                    </div>
                  </div>
                  <div className="text-slate-400">
                    {expandedModule === 2 ? (
                      <ChevronUp className="w-5 h-5 text-teal-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {expandedModule === 2 && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 bg-slate-950/40 text-xs sm:text-sm text-slate-300 space-y-3">
                    <p className="text-slate-400">
                      Kuasai alokasi dana iklan yang tepat agar budget Anda tidak terbakar percuma di ad set yang salah.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <span>Kapan wajib pakai Advantage Campaign Budget (CBO) dan kapan harus ABO.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <span>Formula budget testing hemat Rp25.000 - Rp50.000/hari dengan jangkauan CPM optimal.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <span>Struktur segmentasi audiens cold &amp; warm exclusion agar tidak saling tumpang tindih.</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Modul 3 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden transition-all">
                <button
                  onClick={() => setExpandedModule(expandedModule === 3 ? null : 3)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-sm">
                      M-3
                    </div>
                    <div>
                      <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">
                        Modul 3
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        Funnel Sederhana &amp; Optimasi Konversi Cepat
                      </h3>
                    </div>
                  </div>
                  <div className="text-slate-400">
                    {expandedModule === 3 ? (
                      <ChevronUp className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {expandedModule === 3 && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 bg-slate-950/40 text-xs sm:text-sm text-slate-300 space-y-3">
                    <p className="text-slate-400">
                      Cara mengubah ribuan impresi CPM murah menjadi konversi nyata dan lead WhatsApp siap closing.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>Blueprint Single Landing Page ultra-cepat (load time &lt; 1.5 detik).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>Integrasi One-Click WhatsApp CTA dengan pre-filled order message.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>SOP evaluasi 24 jam: Kapan harus scale-up dan kapan harus matikan ad set.</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof Section (2 Testimoni Singkat) */}
        <section className="py-16 px-4 bg-slate-900/40 border-t border-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
                <Star className="w-3.5 h-3.5 fill-emerald-400" />
                <span>Verified Social Proof</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Bukti Nyata Peserta yang Berhasil Setup Traffic Perdana
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Hasil langsung setelah menerapkan checklist praktis tanpa trial-error:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Testimonial 1 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex text-amber-400 gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400" />
                      ))}
                    </div>
                    <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
                      12K+ Impresi dlm 14 Jam
                    </span>
                  </div>
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed italic mb-6">
                    &ldquo;Awalnya pixel CAPI saya selalu merah &amp; ad set boncos. Setelah ikuti checklist modul ini, dalam 14 jam impresi tembus 12.000+ CPM stabil di angka murah! Panduannya bener-bener to the point tanpa basa-basi.&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-800/80">
                  <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-300 text-sm">
                    FR
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">Fajar R.</h5>
                    <p className="text-xs text-slate-400">Media Buyer &amp; Solo Marketer</p>
                  </div>
                </div>
              </div>

              {/* Testimonial 2 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex text-amber-400 gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400" />
                      ))}
                    </div>
                    <span className="text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-medium">
                      Zero Restrict • Lead Perdana
                    </span>
                  </div>
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed italic mb-6">
                    &ldquo;Struktur CBO vs ABO-nya gampang dipahami. Nggak pake teori bertele-tele, akun tetap aman bebas restrict dan langsung dapat lead perdana di hari pertama setup! Recommended banget buat yang mau cepet jalan.&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-800/80">
                  <div className="w-10 h-10 rounded-full bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-300 text-sm">
                    DP
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">Dian P.</h5>
                    <p className="text-xs text-slate-400">Digital Marketer &amp; Store Owner</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Offer & Guarantee Section (Main Pricing Box) */}
        <section id="offer" className="py-20 px-4 border-t border-slate-900 bg-slate-950 relative">
          <div className="max-w-3xl mx-auto">
            <div className="relative rounded-3xl p-8 sm:p-10 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-2 border-emerald-500/50 shadow-2xl shadow-emerald-500/10 backdrop-blur-2xl">
              {/* Floating Top Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs uppercase px-4 py-1 rounded-full shadow-lg tracking-wider">
                PENAWARAN EKSKLUSIF LIVE DEMO
              </div>

              <div className="text-center mb-8 pt-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                  Dapatkan Akses Penuh Modul Praktis CPM 24 Jam
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm">
                  Khusus peserta uji coba live demo OnlineBoost hari ini.
                </p>

                <div className="mt-6 inline-flex items-baseline gap-3">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    Rp 1.000
                  </span>
                  <span className="text-base sm:text-lg text-slate-500 line-through">
                    Rp 149.000
                  </span>
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1">
                  Hemat Rp148.000 (Akses Instan dikirim via WhatsApp)
                </div>
              </div>

              {/* What You Get Checklist */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 mb-8 text-xs sm:text-sm space-y-3">
                <div className="font-bold text-white text-xs uppercase tracking-wider text-slate-400 mb-2">
                  Yang Anda Dapatkan di Paket Ini:
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 1:</strong> Setup Campaign &amp; Event Tracking CAPI Anti-Loss
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 2:</strong> Struktur Ad Set &amp; Strategi Budgeting CBO vs ABO
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 3:</strong> Funnel Sederhana &amp; Optimasi Konversi Cepat
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Bonus Demo:</strong> Checklist Verifikasi Event Meta &amp; Anti-Restrict SOP
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Pengiriman Cepat:</strong> File materi &amp; link akses dikirim otomatis oleh bot WA
                  </span>
                </div>
              </div>

              {/* Big CTA Button */}
              <a
                href={waTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full group flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-lg sm:text-xl py-4 px-6 rounded-2xl shadow-xl shadow-emerald-500/25 transition-all duration-200 transform hover:-translate-y-1 active:translate-y-0"
              >
                <MessageCircle className="w-6 h-6 fill-slate-950" />
                <span>Ambil Akses Rp1.000 via WhatsApp</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
              </a>

              {/* Guarantee Reassurance */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-white">
                    Garansi Akses Materi Instan via WhatsApp
                  </h5>
                  <p className="text-xs text-slate-400">
                    Begitu Anda mengirim pesan ke WhatsApp bot OnlineBoost, tautan modul materi langsung aktif dan bisa dipelajari saat itu juga.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Pertanyaan yang Sering Diajukan (FAQ)
              </h2>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Berapa lama akses modul materi ini berlaku?
                </h4>
                <p className="text-slate-400">
                  Akses modul ini berlaku seumur hidup (lifetime). Anda bebas mempelajari dan mengakses materi kapan saja melalui tautan yang dikirimkan ke WhatsApp Anda.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Apakah materi ini cocok untuk pemula yang belum pernah beriklan?
                </h4>
                <p className="text-slate-400">
                  Ya! Materi ini disusun step-by-step tanpa jargon rumit. Anda akan dipandu mulai dari setup pixel dasar, struktur campaign awal, hingga testing budget minimal.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Bagaimana cara konfirmasi pembayaran Rp1.000 selama live demo?
                </h4>
                <p className="text-slate-400">
                  Cukup klik tombol &quot;Ambil Akses Rp1.000 via WhatsApp&quot;. Sistem bot OnlineBoost akan langsung merespons dengan panduan singkat dan menyerahkan link akses secara otomatis.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-8 px-4 text-center text-xs text-slate-500 relative z-10 pb-24 sm:pb-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">OnlineBoost ID</span>
            <span>•</span>
            <span>Modul Praktis CPM 24 Jam</span>
          </div>
          <div>
            Powered by BoonTrack Omnichannel Inbox &amp; Traffic Engine
          </div>
        </div>
      </footer>

      {/* Floating Sticky Bottom Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-slate-950/95 border-t border-emerald-500/30 p-3 backdrop-blur-xl shadow-2xl safe-pb">
        <div className="flex items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-[10px] text-emerald-400 font-semibold uppercase block">
              Sesi Live Demo
            </span>
            <span className="text-lg font-black text-white">Rp 1.000</span>
          </div>
          <a
            href={waTargetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition"
          >
            <MessageCircle className="w-4 h-4 fill-slate-950" />
            <span>Ambil via WhatsApp</span>
          </a>
        </div>
      </div>

      {/* QR Code Presentation Modal (For Stage Presentation Scanning) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center relative shadow-2xl">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
            >
              ✕
            </button>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold mb-3">
              Scan Kamera HP Anda
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              Live Demo: WhatsApp Bot OnlineBoost
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Arahkan kamera smartphone audiens ke kode QR ini untuk langsung membuka chat WhatsApp Rp1.000.
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mb-4">
              <QRCodeSVG
                value={waTargetUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800 break-all mb-4">
              {waNumber ? `Nomor Bot: +${waNumber}` : 'OnlineBoost Bot'}
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Tersalin!' : 'Salin URL WhatsApp'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CPM24JamLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-medium text-sm">
          Memuat halaman materi demo...
        </div>
      }
    >
      <LandingPageContent />
    </Suspense>
  );
}
