'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export default function BwmModernLandingPage() {
  // Interactive ROI Calculator State
  const [guardsCount, setGuardsCount] = useState<number>(25);
  const [pointsCount, setPointsCount] = useState<number>(12);
  const [hourlyAdminWage, setHourlyAdminWage] = useState<number>(35000);

  // Live Patrol Dashboard Interactive Mock State
  const [activeTab, setActiveTab] = useState<'feed' | 'radar' | 'incidents'>('feed');

  // Enterprise Lead Form State
  const [leadForm, setLeadForm] = useState({
    picName: '',
    companyName: '',
    whatsapp: '',
    guardsTier: '31-100',
    notes: '',
  });
  const [leadSubmitted, setLeadSubmitted] = useState<boolean>(false);

  // Calculations for ROI Calculator
  const roiCalculations = useMemo(() => {
    // Rata-rata waktu rekap manual per pos per hari: 6 menit (0.08 jam)
    const hoursSpentManualPerMonth = Math.round((guardsCount * pointsCount * 0.08 * 30) / 4);
    const monthlyAdminCostWasted = hoursSpentManualPerMonth * hourlyAdminWage;
    // Estimasi capex pembelian alat lama (Amano / Wand RFID @ Rp 2.5jt per pos)
    const traditionalCapexEstimate = pointsCount * 2500000;
    // Estimasi biaya BWM per bulan (Rp 30.000 per guard pass)
    const bwmMonthlyCost = guardsCount * 30000;
    // Penghematan bersih tahunan
    const annualNetSavings = monthlyAdminCostWasted * 12 + traditionalCapexEstimate * 0.4 - bwmMonthlyCost * 12;

    return {
      hoursSpentManualPerMonth,
      monthlyAdminCostWasted,
      traditionalCapexEstimate,
      bwmMonthlyCost,
      annualNetSavings: Math.max(annualNetSavings, 12000000),
    };
  }, [guardsCount, pointsCount, hourlyAdminWage]);

  // Live Mock Data for Interactive Hero Widget
  const mockFeed = [
    { id: 1, guard: 'Cindy Aurini', nip: '248.0112.28', post: 'Pos Barat Gerbang Utama', time: '12:14:02 WIB', status: 'VERIFIED', distance: '4 meter' },
    { id: 2, guard: 'Bambang Prakoso', nip: '248.0101.05', post: 'Patroli Tower Panel Listrik B', time: '12:11:45 WIB', status: 'VERIFIED', distance: '7 meter' },
    { id: 3, guard: 'Agus Sutrisno', nip: '248.0104.19', post: 'Gudang Logistik Sektor C', time: '12:08:20 WIB', status: 'VERIFIED', distance: '2 meter' },
    { id: 4, guard: 'Dedi Kurniawan', nip: '248.0107.33', post: 'Perimeter Pagar Belakang Soreang', time: '12:04:10 WIB', status: 'VERIFIED', distance: '11 meter' },
  ];

  const mockIncidents = [
    { id: 101, title: 'Lampu PJU Sektor 4 Padam', location: 'Pintu Gerbang Darurat Timur', time: '11:42 WIB', reporter: 'Cindy Aurini' },
    { id: 102, title: 'Palang Pintu Otomatis Macet', location: 'Drop-off Lobby Menara 1', time: '10:15 WIB', reporter: 'Bambang Prakoso' },
    { id: 103, title: 'Temuan Gembok Gudang Terbuka', location: 'Pintu Gudang Arsip Lt. Basement', time: '09:30 WIB', reporter: 'Agus Sutrisno' },
  ];

  function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadForm.picName || !leadForm.whatsapp) return;
    setLeadSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* ------------------------------------------------------------- */}
      {/* TOP NAVBAR (Modern Glassmorphic Sticky Header) */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Logo & Tagline */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-xl tracking-wider">
              {/* Shield SVG Icon */}
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">BWM</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  SATYA Enterprise
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">BoonTrack Workforce Management</p>
            </div>
          </div>

          {/* Center Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#masalah" className="hover:text-cyan-400 transition-colors">Kelemahan Alat Lama</a>
            <a href="#komparasi" className="hover:text-cyan-400 transition-colors">Tabel Perbandingan</a>
            <a href="#fitur" className="hover:text-cyan-400 transition-colors">Fitur Bento</a>
            <a href="#roi" className="hover:text-cyan-400 transition-colors">Kalkulator ROI</a>
            <a href="#rollover" className="hover:text-cyan-400 transition-colors">Credit Pass</a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 transition shadow-xs"
            >
              Masuk Portal
            </Link>
            <a
              href="#demo"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold transition shadow-lg shadow-cyan-500/20"
            >
              Uji Coba Staging
            </a>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* HERO SECTION */}
      {/* ------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-32">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-cyan-600/20 via-indigo-600/10 to-transparent blur-[120px] pointer-events-none -z-10 rounded-full" />
        <div className="absolute top-10 right-10 w-72 h-72 bg-emerald-600/10 blur-[90px] pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: Headline & Value Proposition */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              {/* Trust Pill */}
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700/80 text-xs font-medium text-slate-300">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Solusi Terverifikasi BUJP &amp; Korporat Indonesia</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-cyan-400 font-semibold">100% Anti-Fake GPS</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
                Patroli Tervalidasi.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">
                  Presensi Akurat.
                </span>{' '}
                Nol Pengadaan Alat Khusus.
              </h1>

              {/* Sub-headline */}
              <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Gantikan jam putar Amano kuno, tongkat RFID offline, dan grup WhatsApp yang berantakan. 
                Kelola ribuan pos patroli satpam dari smartphone petugas dengan barcode anti-print, 
                facial liveness geofencing, dan dispatch otomatis ke WhatsApp klien.
              </p>

              {/* CTAs */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-base transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center space-x-2"
                >
                  <span>Mulai Uji Coba Pilot (Staging)</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>

                <a
                  href="#roi"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 font-semibold text-base transition flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span>Hitung Penghematan (ROI)</span>
                </a>
              </div>

              {/* Key Highlights Metrics */}
              <div className="pt-6 border-t border-slate-900 grid grid-cols-3 gap-4 max-w-lg mx-auto lg:mx-0">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400">Rp 0</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Capex Perangkat Pos</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">&lt; 30 Detik</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Rotasi QR Anti-Print</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400">100%</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Rollover Saldo Abadi</div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Mock Live Patrol Dashboard Widget */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-2xl backdrop-blur-xl relative">
                
                {/* Header Widget */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Guard Radar Feed</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                      14 Guards Aktif
                    </span>
                  </div>
                </div>

                {/* Sub Tab Switcher */}
                <div className="flex items-center space-x-2 my-3 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-medium">
                  <button
                    onClick={() => setActiveTab('feed')}
                    className={`flex-1 py-1.5 rounded-lg transition ${activeTab === 'feed' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Checkpoint Feed
                  </button>
                  <button
                    onClick={() => setActiveTab('radar')}
                    className={`flex-1 py-1.5 rounded-lg transition ${activeTab === 'radar' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Radar Geofence
                  </button>
                  <button
                    onClick={() => setActiveTab('incidents')}
                    className={`flex-1 py-1.5 rounded-lg transition ${activeTab === 'incidents' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Atensi Insiden (3)
                  </button>
                </div>

                {/* Tab 1: Checkpoint Live Feed */}
                {activeTab === 'feed' && (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {mockFeed.map((item) => (
                      <div key={item.id} className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-cyan-500/30 transition flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white">{item.guard}</span>
                            <span className="text-[10px] font-mono text-slate-500">[{item.nip}]</span>
                          </div>
                          <p className="text-xs text-cyan-300 font-medium flex items-center space-x-1">
                            <svg className="w-3.5 h-3.5 text-cyan-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{item.post}</span>
                          </p>
                          <div className="text-[10px] text-slate-500 flex items-center space-x-2">
                            <span>Jarak GPS: <strong className="text-slate-300">{item.distance}</strong></span>
                            <span>&bull;</span>
                            <span>Akurasi Liveness: <strong className="text-emerald-400">99.8%</strong></span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono text-slate-400 block">{item.time}</span>
                          <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            VALID
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 2: Radar Geofencing Simulation */}
                {activeTab === 'radar' && (
                  <div className="h-[280px] rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center relative overflow-hidden p-4">
                    {/* Concentric radar circles */}
                    <div className="absolute w-56 h-56 rounded-full border border-cyan-500/20 animate-ping" />
                    <div className="absolute w-44 h-44 rounded-full border border-cyan-500/30" />
                    <div className="absolute w-28 h-28 rounded-full border border-cyan-500/40" />
                    <div className="absolute w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500 flex items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    </div>

                    {/* Guard Radar Blips */}
                    <div className="absolute top-14 left-16 flex items-center space-x-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono text-emerald-300 bg-slate-900/90 px-1 py-0.5 rounded">Cindy (Pos Barat)</span>
                    </div>
                    <div className="absolute bottom-16 right-14 flex items-center space-x-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono text-emerald-300 bg-slate-900/90 px-1 py-0.5 rounded">Bambang (Tower B)</span>
                    </div>
                    <div className="absolute top-20 right-20 flex items-center space-x-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono text-emerald-300 bg-slate-900/90 px-1 py-0.5 rounded">Agus (Gudang C)</span>
                    </div>

                    <div className="absolute bottom-3 left-4 text-[10px] text-slate-400">
                      Status Radius: <strong className="text-emerald-400">15 Meter (Strict Lockdown)</strong>
                    </div>
                  </div>
                )}

                {/* Tab 3: Incidents & WhatsApp Dispatch */}
                {activeTab === 'incidents' && (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {mockIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
                            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>{inc.title}</span>
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">{inc.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{inc.location}</p>
                        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Pelapor: <strong className="text-slate-300">{inc.reporter}</strong></span>
                          <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                            {/* WhatsApp Small Checkmark Icon */}
                            <svg className="w-3 h-3 inline text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.969.586 1.884.896 2.802.896 3.181 0 5.767-2.587 5.767-5.766.001-3.187-2.575-5.772-5.767-5.772zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.288.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.861.173.086.275.072.376-.043.101-.116.433-.506.549-.679.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z" />
                            </svg>
                            <span>WA Terkirim ke Manajemen</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interactive Status Footer */}
                <div className="mt-3 pt-2 text-center text-[10px] text-slate-500 border-t border-slate-800/80">
                  <span>Data tersinkronisasi live ke PostgreSQL Staging Cloud &bull; Latensi &lt; 250ms</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* PROBLEM CARDS (Ala 86Patrol: Menyorot 4 Kelemahan Alat Lama) */}
      {/* ------------------------------------------------------------- */}
      <section id="masalah" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-widest text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
              Kelemahan Alat Konvensional
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Mengapa Alat Patroli Lama Justru Merugikan Operasional Anda?
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              BUJP dan Manajemen Gedung kerap menghabiskan puluhan juta rupiah untuk membeli hardware khusus 
              yang rentan manipulasi, lambat ditindaklanjuti, dan sulit dipertanggungjawabkan saat terjadi insiden.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-14">
            {/* Card 1: Amano Watchman Clock */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-rose-500/40 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                01
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Amano Watchman Clock</h3>
              <p className="text-xs text-rose-300 font-semibold mb-3">Teknologi Kuno Era 1880-an</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kunci mekanik diputar di atas kertas karbon melingkar. Kertas sering robek, tinta buram, 
                dan hasil patroli baru diketahui 1 minggu kemudian saat kertas dibuka. Nol antisipasi real-time.
              </p>
            </div>

            {/* Card 2: Tongkat RFID Wand Offline */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                02
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Tongkat RFID Wand Reader</h3>
              <p className="text-xs text-amber-300 font-semibold mb-3">Offline &amp; Rekap Kabel USB</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Harus dicolok kabel USB ke komputer admin pos tiap pagi. Jika tongkat jatuh atau terbentur, 
                seluruh log seminggu hilang permanen. Rawan titip kunci RFID antar-petugas di pos jaga.
              </p>
            </div>

            {/* Card 3: Fingerprint Dinding */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                03
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Fingerprint Dinding Statis</h3>
              <p className="text-xs text-indigo-300 font-semibold mb-3">Hanya Absen Masuk &amp; Pulang</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hanya membuktikan satpam datang ke gerbang depan. Tidak ada bukti satpam benar-benar 
                berpatroli menyisir lantai 25, basement parkir, atau gudang belakang yang rawan pencurian.
              </p>
            </div>

            {/* Card 4: WhatsApp Group Berantakan */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                04
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Grup WhatsApp Berantakan</h3>
              <p className="text-xs text-cyan-300 font-semibold mb-3">Ratusan Foto Tanpa Metadata</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ratusan foto patroli menumpuk memenuhi memori HP satpam. Foto bisa diambil dari galeri lama 
                (fake timestamp) dan mustahil diekspor menjadi laporan rekap resmi untuk audit ISO/Klien.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* HEAD-TO-HEAD COMPARISON TABLE */}
      {/* ------------------------------------------------------------- */}
      <section id="komparasi" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
              Evaluasi Objektif
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Head-to-Head: Alat Tradisional vs BoonTrack Workforce (BWM)
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Bandingkan fitur keamanan, fleksibilitas pengeluaran, dan kecepatan pelaporan secara transparan.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 shadow-xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-900 text-slate-300 border-b border-slate-800 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-4 px-4 sm:px-6">Parameter Evaluasi</th>
                  <th className="py-4 px-4 text-slate-400">Amano Watchman</th>
                  <th className="py-4 px-4 text-slate-400">Tongkat RFID Wand</th>
                  <th className="py-4 px-4 text-slate-400">Fingerprint Wall</th>
                  <th className="py-4 px-4 sm:px-6 text-cyan-400 bg-cyan-950/40 border-l border-r border-cyan-800/40">
                    BWM (Satya Portal)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-300">
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Biaya Capex Awal</td>
                  <td className="py-4 px-4 text-rose-400">Rp 2.5jt - 4jt / Pos</td>
                  <td className="py-4 px-4 text-rose-400">Rp 1.5jt - 3jt / Pos</td>
                  <td className="py-4 px-4 text-amber-400">Rp 1.5jt / Mesin</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-emerald-400 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    Rp 0 (HP Android/iOS Petugas)
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Visibilitas Log Patroli</td>
                  <td className="py-4 px-4 text-slate-400">Manual (Mingguan)</td>
                  <td className="py-4 px-4 text-slate-400">Offline via Kabel USB</td>
                  <td className="py-4 px-4 text-slate-400">Hanya Jam Masuk/Pulang</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-cyan-300 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    Real-Time Detik ke Detik
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Pencegahan Fake GPS &amp; Manipulasi</td>
                  <td className="py-4 px-4 text-rose-400">Kunci Mudah Dititip</td>
                  <td className="py-4 px-4 text-rose-400">Tag RFID Bisa Dilepas</td>
                  <td className="py-4 px-4 text-slate-400">Tidak Melacak Lokasi</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-emerald-400 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    Anti-Fake GPS &amp; Anti-Print Barcode
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Waktu Rekapitulasi Laporan</td>
                  <td className="py-4 px-4 text-slate-400">3 - 7 Hari Kerja</td>
                  <td className="py-4 px-4 text-slate-400">1 - 2 Hari Kerja</td>
                  <td className="py-4 px-4 text-slate-400">1 Hari Kerja</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-cyan-300 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    Otomatis 1-Klik (PDF/Excel)
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Peringatan Pos Terlewat / SOS</td>
                  <td className="py-4 px-4 text-rose-400">Nol Notifikasi</td>
                  <td className="py-4 px-4 text-rose-400">Nol Notifikasi</td>
                  <td className="py-4 px-4 text-rose-400">Nol Notifikasi</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-emerald-400 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    WhatsApp Bot Otomatis ke Manajemen
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">White-Label Branding</td>
                  <td className="py-4 px-4 text-slate-500">Merek Pabrik</td>
                  <td className="py-4 px-4 text-slate-500">Merek Pabrik</td>
                  <td className="py-4 px-4 text-slate-500">Merek Pabrik</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-indigo-400 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    Domain &amp; Logo Sendiri (100% Kustom)
                  </td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="py-4 px-4 sm:px-6 font-semibold text-white">Skema Pembelian Lisensi</td>
                  <td className="py-4 px-4 text-slate-400">Beli Putus (Biaya Servis)</td>
                  <td className="py-4 px-4 text-slate-400">Beli Putus (Sparepart)</td>
                  <td className="py-4 px-4 text-slate-400">Beli Putus</td>
                  <td className="py-4 px-4 sm:px-6 font-bold text-amber-300 bg-cyan-950/20 border-l border-r border-cyan-800/40">
                    BWM Credit Pass (Rollover Abadi)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* BENTO GRID FEATURES (Ala Connecteam: Modern High-Impact Tech) */}
      {/* ------------------------------------------------------------- */}
      <section id="fitur" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Arsitektur Modern BWM
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              4 Pilar Fitur Anti-Fraud Lapangan
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Dibangun khusus untuk kondisi lapangan satuan pengamanan, cleaning service, dan teknisi pemeliharaan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
            
            {/* Bento Card 1: Dynamic Anti-Print Barcode (Span 7) */}
            <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col justify-between group hover:border-cyan-500/40 transition">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mb-6">
                  {/* QR SVG */}
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Dynamic Anti-Print QR Barcode</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                  Barcode pos berotasi secara kriptografis setiap 30 detik pada layar tablet pos atau e-paper sticker time-hash. 
                  Mustahil difoto oleh satpam lalu dicetak atau di-laminating untuk titip scan di pos ronda.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Rotasi Hash: SHA-256 Time-Synced</span>
                <span className="text-cyan-400 font-bold">Anti-Titip Scan</span>
              </div>
            </div>

            {/* Bento Card 2: Facial Liveness & GPS (Span 5) */}
            <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col justify-between group hover:border-emerald-500/40 transition">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-6">
                  {/* Camera Liveness SVG */}
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Facial Liveness &amp; Dual-Band GPS</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Verifikasi kedipan mata secara real-time saat scan checkpoint. Menolak emulator Android, 
                  aplikasi Fake GPS joystick, dan foto statis dari galeri.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Geofencing: 15 Meter Radius</span>
                <span className="text-emerald-400 font-bold">100% Genuine</span>
              </div>
            </div>

            {/* Bento Card 3: WhatsApp Dispatch Alert (Span 5) */}
            <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col justify-between group hover:border-emerald-500/40 transition">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-6">
                  {/* WhatsApp Message SVG */}
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.969.586 1.884.896 2.802.896 3.181 0 5.767-2.587 5.767-5.766.001-3.187-2.575-5.772-5.767-5.772zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.288.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.861.173.086.275.072.376-.043.101-.116.433-.506.549-.679.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z" />
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">WhatsApp Instant Dispatch</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Jika pos checkpoint terlewat &gt;15 menit dari jadwal SOP, sistem otomatis mengirim peringatan 
                  langsung ke grup WhatsApp pengawas dan manajemen. Insiden terpantau sebelum klien komplain.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Outbound: Baileys / WABA API</span>
                <span className="text-emerald-400 font-bold">Deteksi Cepat</span>
              </div>
            </div>

            {/* Bento Card 4: Full White-Label Portal (Span 7) */}
            <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex flex-col justify-between group hover:border-indigo-500/40 transition">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mb-6">
                  {/* Globe / White-label SVG */}
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Full White-Label Portal (RFC-BWM-014)</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                  Gunakan domain sendiri (contoh: <code>satya.workforce.boontrack.com</code>), logo vendor Anda, 
                  tema warna brand kustom, dan Progressive Web App (PWA) yang terinstal di HP satpam dengan nama BUJP Anda.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Multi-Tenant: Edge Domain Registry</span>
                <span className="text-indigo-400 font-bold">100% Brand Sendiri</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE ROI CALCULATOR */}
      {/* ------------------------------------------------------------- */}
      <section id="roi" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Interactive Sliders */}
            <div className="lg:col-span-6 space-y-8">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                  Simulasi Finansial
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-3">
                  Hitung Berapa Rupiah yang Anda Hemat Setiap Bulan
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                  Geser slider di bawah ini sesuai jumlah pos dan personel aktif di BUJP / Gedung Anda.
                </p>
              </div>

              {/* Slider 1: Jumlah Satpam */}
              <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Jumlah Personel Satpam Aktif</span>
                  <span className="text-lg font-extrabold text-cyan-400 font-mono">{guardsCount} Personel</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="150"
                  step="5"
                  value={guardsCount}
                  onChange={(e) => setGuardsCount(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>5 Orang</span>
                  <span>75 Orang</span>
                  <span>150 Orang</span>
                </div>
              </div>

              {/* Slider 2: Jumlah Titik Pos Patroli */}
              <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Jumlah Titik Pos Checkpoint</span>
                  <span className="text-lg font-extrabold text-indigo-400 font-mono">{pointsCount} Titik Pos</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="40"
                  step="1"
                  value={pointsCount}
                  onChange={(e) => setPointsCount(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>2 Titik</span>
                  <span>20 Titik</span>
                  <span>40 Titik</span>
                </div>
              </div>

              {/* Slider 3: Estimasi Biaya Lembur Admin Rekap */}
              <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Upah / Jam Kerja Admin Rekap</span>
                  <span className="text-lg font-extrabold text-emerald-400 font-mono">Rp {hourlyAdminWage.toLocaleString('id-ID')} / jam</span>
                </div>
                <input
                  type="range"
                  min="20000"
                  max="70000"
                  step="5000"
                  value={hourlyAdminWage}
                  onChange={(e) => setHourlyAdminWage(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>Rp 20.000</span>
                  <span>Rp 45.000</span>
                  <span>Rp 70.000</span>
                </div>
              </div>
            </div>

            {/* Right Column: Live Output Cards */}
            <div className="lg:col-span-6">
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-tr from-slate-900 via-slate-900/90 to-cyan-950/40 border border-cyan-500/30 shadow-2xl relative space-y-6">
                
                <div className="border-b border-slate-800 pb-4">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Hasil Proyeksi Efisiensi</span>
                  <div className="text-3xl sm:text-4xl font-black text-white mt-1">
                    Hemat Rp {roiCalculations.annualNetSavings.toLocaleString('id-ID')}
                    <span className="text-sm font-normal text-slate-400 block mt-0.5">per tahun dibanding sistem lama</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Waktu Admin Terbuang</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-rose-400 font-mono mt-1 block">
                      {roiCalculations.hoursSpentManualPerMonth} Jam
                    </span>
                    <span className="text-[10px] text-slate-500">per bulan untuk input manual</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Capex Alat Terhindar</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono mt-1 block">
                      Rp {roiCalculations.traditionalCapexEstimate.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[10px] text-slate-500">pengadaan hardware pos fisik</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-slate-300 space-y-1.5">
                  <div className="flex justify-between">
                    <span>Investasi BWM Pass bulanan ({guardsCount} guards):</span>
                    <strong className="text-cyan-400">Rp {roiCalculations.bwmMonthlyCost.toLocaleString('id-ID')} / bln</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Status saldo sisa pass:</span>
                    <strong className="text-emerald-400">100% Rollover (Tidak Hangus)</strong>
                  </div>
                </div>

                <a
                  href="#demo"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black text-center text-sm block transition shadow-lg shadow-cyan-500/20"
                >
                  Ambil Penawaran Pilot 30 Hari
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* ROLLOVER POOL EXPLAINER (Skema BWM Credit Pass) */}
      {/* ------------------------------------------------------------- */}
      <section id="rollover" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              Skema Lisensi Fleksibel
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              BWM Credit Pass: 1 Pass = 30 Hari Akses, Saldo Rollover Abadi
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Katakan selamat tinggal pada langganan SaaS kaku yang membebankan kursi kosong. 
              Di BWM, kredit yang Anda beli hanya berkurang saat personel aktif bertugas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold mb-4">
                1
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Beli Saldo Pool (Misal 25 Passes)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Anda membeli pool lisensi via transfer bank/QRIS di portal Master Reseller. 
                Seluruh kredit tersimpan aman dalam Credit Pool agensi tanpa tanggal kedaluwarsa sebelum dialokasikan.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold mb-4">
                2
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Aktifkan 14 Personel On-Duty</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Saat 14 satpam bertugas di Site Proyek A, 14 kredit ditarik secara FIFO untuk masa tugas 30 hari penuh. 
                Sisa 11 kredit tetap tersimpan di pool Anda tanpa dipotong sepeser pun.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold mb-4">
                3
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Rollover Otomatis untuk Bulan Depan</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Jika kontrak site selesai di hari ke-15 atau ada pengurangan personel, sisa kredit yang belum diaktifkan 
                langsung rollover ke bulan berikutnya atau dialokasikan untuk personel di lokasi lain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* ENTERPRISE LEAD INQUIRY FORM & CTA SECTION */}
      {/* ------------------------------------------------------------- */}
      <section id="demo" className="py-20 border-t border-slate-900 bg-slate-950 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-2xl relative">
            
            <div className="text-center space-y-3 mb-8">
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                Akses Terbatas Staging
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Ajukan Demo Staging &amp; Pilot Test Lapangan
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto">
                Dapatkan kredensial demo untuk menguji langsung portal supervisor dan aplikasi guard di pos Anda.
              </p>
            </div>

            {leadSubmitted ? (
              <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white">Permintaan Demo Berhasil Diterima</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Tim Deployment Engineer Satya akan menghubungi WhatsApp Anda (<strong>{leadForm.whatsapp}</strong>) 
                  dalam 1x24 jam untuk aktivasi akun staging demo.
                </p>
                <div className="pt-2">
                  <Link
                    href="/login"
                    className="inline-block px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
                  >
                    Buka Halaman Login Demo &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Penanggung Jawab (PIC)</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Hendra Setiawan"
                      value={leadForm.picName}
                      onChange={(e) => setLeadForm({ ...leadForm, picName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Perusahaan / BUJP</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: PT Satya Garda Perkasa"
                      value={leadForm.companyName}
                      onChange={(e) => setLeadForm({ ...leadForm, companyName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nomor WhatsApp Aktif</label>
                    <input
                      type="tel"
                      required
                      placeholder="Contoh: 081234567890"
                      value={leadForm.whatsapp}
                      onChange={(e) => setLeadForm({ ...leadForm, whatsapp: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Estimasi Personel Satpam</label>
                    <select
                      value={leadForm.guardsTier}
                      onChange={(e) => setLeadForm({ ...leadForm, guardsTier: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="10-30">10 - 30 Personel</option>
                      <option value="31-100">31 - 100 Personel</option>
                      <option value="101-300">101 - 300 Personel</option>
                      <option value=">300">&gt; 300 Personel (Enterprise)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Catatan Kebutuhan Spesifik (Opsional)</label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Butuh integrasi WhatsApp Dispatch untuk 3 site pabrik di Karawang..."
                    value={leadForm.notes}
                    onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black text-sm tracking-wide transition shadow-xl shadow-cyan-500/25"
                  >
                    Kirim Permintaan Demo Pilot Staging
                  </button>
                </div>
              </form>
            )}

            {/* Quick Staging Navigation */}
            <div className="mt-8 pt-6 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400">
                Sudah memiliki kredensial demo pengujian?{' '}
                <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold underline ml-1">
                  Masuk ke Portal Login Petugas &rarr;
                </Link>
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* FOOTER */}
      {/* ------------------------------------------------------------- */}
      <footer className="border-t border-slate-900 py-10 bg-slate-950 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-slate-300">BWM Platform</span>
            <span>&bull;</span>
            <span>BoonTrack Workforce Management System</span>
          </div>
          <div>
            <span>&copy; 2026 PT BoonTrack Teknologi Indonesia. Terisolasi Multi-Tenant.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
