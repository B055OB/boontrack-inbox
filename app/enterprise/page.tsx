'use client';

import React from 'react';
import Link from 'next/link';
import {
  Cpu,
  Building2,
  ArrowRight,
  Mail,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function EnterprisePage() {
  const waEnterpriseUrl =
    'https://wa.me/6281298877665?text=' +
    encodeURIComponent(
      'Halo Tim BoonTrack Enterprise, saya tertarik mendiskusikan integrasi sistem khusus (Hardware/IoT Barrier Gate / Sistem Pemerintahan / Custom Omnichannel). Mohon informasi konsultasi lebih lanjut.'
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-white text-lg">
                B
              </div>
              <div>
                <span className="font-extrabold text-base text-white tracking-tight">
                  BoonTrack <span className="text-blue-400">Enterprise</span>
                </span>
                <p className="text-xs text-slate-400">Custom IoT, Municipal & Enterprise Solutions</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pilot-onboarding"
              className="text-xs text-slate-400 hover:text-slate-200 transition hidden sm:inline-block"
            >
              Merchant Self-Onboarding
            </Link>
            <a
              href="mailto:enterprise@boontrack.com"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-2"
            >
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              <span>Email Tim Enterprise</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto w-full px-6 pt-12 pb-8 text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Tailored Architecture & Mission-Critical Reliability</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight max-w-3xl mx-auto leading-tight">
          Solusi Enterprise Khusus untuk <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400">Hardware, IoT & Pemerintahan</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          BoonTrack Enterprise merancang integrasi controller fisik, otomasi birokrasi pemerintahan kota/kabupaten,
          serta ekosistem omnichannel skala besar dengan SLA uptime terjamin.
        </p>

        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href={waEnterpriseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-extrabold text-xs shadow-xl shadow-blue-500/25 flex items-center gap-2.5 transition transform hover:scale-[1.02]"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Konsultasi Proyek via WhatsApp</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <a
            href="mailto:enterprise@boontrack.com"
            className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center gap-2"
          >
            <Mail className="w-4 h-4 text-slate-400" />
            <span>enterprise@boontrack.com</span>
          </a>
        </div>
      </section>

      {/* 3 Enterprise Pillars */}
      <section className="max-w-6xl mx-auto w-full px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pillar 1: Hardware & IoT Barrier Gates */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 hover:border-slate-700 transition">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
            <Cpu className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Hardware & IoT Controller</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Integrasi langsung controller barrier gate ESP32, scanner kartu NFC/RFID, turnstile gym, dan sensor parkir
            dengan sinkronisasi data membership real-time.
          </p>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800/80">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sinkronisasi gerbang dalam 250ms</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Offline-first local cache controller</span>
            </li>
          </ul>
        </div>

        {/* Pillar 2: Municipal & Public Governance */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 hover:border-slate-700 transition">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Sistem Pemerintahan Digital</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Layanan pengajuan surat pengantar RT/RW, kecamatan, sistem aduan warga berbasis WhatsApp, dan arsip dokumen
            resmi yang tervalidasi tanda tangan digital.
          </p>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800/80">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Formulir surat otomatis via WhatsApp</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Dashboard verifikasi lurah/staf</span>
            </li>
          </ul>
        </div>

        {/* Pillar 3: Custom Enterprise Omnichannel */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 hover:border-slate-700 transition">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Custom API & SLA Khusus</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Koneksi ke backend ERP internal, webhook perbankan, load-balancing multi-node, dan dedikasi private AI model
            dengan isolasi keamanan data per tenant.
          </p>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800/80">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Dedicated 99.95% SLA agreement</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Custom webhook & database connector</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Bottom CTA Card */}
      <section className="max-w-4xl mx-auto w-full px-6 py-12">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/50 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <h3 className="text-xl sm:text-2xl font-extrabold text-white">
            Siap Membangun Solusi Khusus Bersama Arsitek BoonTrack?
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Tim teknis dan arsitek sistem kami siap membantu analisis kebutuhan infrastruktur Anda dari konsep hingga tahap deployment.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <a
              href={waEnterpriseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
            >
              <span>Jadwalkan Diskusi Teknis</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 text-center text-xs text-slate-500 bg-slate-950">
        &copy; {new Date().getFullYear()} BoonTrack Technology &bull; Enterprise Systems &bull; enterprise@boontrack.com
      </footer>
    </div>
  );
}
