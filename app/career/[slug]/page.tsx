'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase,
  CheckCircle2,
  Download,
  Mail,
  Share2,
  ExternalLink,
  Sparkles,
  Award,
  Code2,
  Bot,
  ArrowRight,
  ShieldCheck,
  Building,
} from 'lucide-react';

function formatSlugToName(slug: string): string {
  if (!slug || slug === 'cv') return 'Curriculum Vitae / ATS Profile';
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function CareerProfilePage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string) || 'kandidat';
  const candidateName = formatSlugToName(slug);
  const isGenericCv = slug.toLowerCase() === 'cv';

  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      alert(`CV resume ${candidateName} berhasil di-generate dalam format PDF standar ATS.`);
    }, 1200);
  };

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 antialiased selection:bg-indigo-600 selection:text-white flex flex-col">
      {/* Top Banner */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3.5 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-extrabold tracking-tight text-white flex items-center gap-1.5">
                BOONTRACK <span className="text-indigo-400">CAREER AI</span>
              </span>
              <p className="text-[10px] text-slate-400">Verified Talent & ATS Resume Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copied ? 'Link Disalin!' : 'Bagikan Profil'}</span>
            </button>

            <Link
              href="/career"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Konsultasi AI</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Profile Content */}
      <div className="max-w-5xl mx-auto w-full p-4 md:p-8 flex-1 space-y-6">
        {/* Header Hero Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center font-black text-2xl md:text-3xl text-white shadow-xl shadow-indigo-500/20 ring-4 ring-slate-800">
                {candidateName.charAt(0)}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
                    {candidateName}
                  </h1>
                  <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>ATS Verified (Score 94/100)</span>
                  </span>
                </div>

                <p className="text-sm font-medium text-indigo-300">
                  {isGenericCv
                    ? 'Verified Candidate Profile & AI Powered Curriculum Vitae'
                    : 'Fullstack Systems Architect & AI Engineering Specialist'}
                </p>

                <p className="text-xs text-slate-400 flex items-center gap-3 pt-1">
                  <span>📍 Indonesia (Remote / Hybrid)</span>
                  <span>💼 Siap Wawancara Segera</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4 text-indigo-400" />
                <span>{downloading ? 'Menyiapkan PDF...' : 'Download Resume ATS'}</span>
              </button>

              <a
                href="mailto:contact@boontrack.com"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Undang Interview</span>
              </a>
            </div>
          </div>
        </div>

        {/* Two Columns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 Cols): Experience, Projects & Summary */}
          <div className="lg:col-span-8 space-y-6">
            {/* Professional Summary */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Ringkasan Profesional</span>
              </h2>
              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                Profesional berpengalaman dengan keahlian mendalam dalam membangun arsitektur perangkat lunak scalable,
                integrasi multi-channel real-time (WhatsApp Gateway, Telegram Bot, Webchat), dan penerapan sistem kecerdasan
                buatan (LLM Context Reasoning) untuk efisiensi bisnis. Terbiasa memimpin tim teknis dan berkolaborasi erat
                dengan stakeholder produk.
              </p>
            </div>

            {/* Work Experience */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-400" />
                <span>Pengalaman Kerja & Portofolio</span>
              </h2>

              <div className="space-y-4">
                <div className="border-l-2 border-indigo-500/40 pl-4 space-y-1 relative">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 absolute -left-[5px] top-1.5" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs md:text-sm font-bold text-white">Lead Systems & AI Engineer</h3>
                    <span className="text-[10px] font-mono text-slate-400">2023 - Sekarang</span>
                  </div>
                  <p className="text-xs text-indigo-300">BoonTrack Technology Ecosystem</p>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    Merancang dan mengembangkan arsitektur multi-tenant omni-channel inbox, otomatisasi pembayaran QRIS,
                    serta integrasi controller IoT barrier gate untuk fasilitas modern.
                  </p>
                </div>

                <div className="border-l-2 border-slate-800 pl-4 space-y-1 relative">
                  <div className="w-2 h-2 rounded-full bg-slate-600 absolute -left-[5px] top-1.5" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs md:text-sm font-bold text-white">Senior Fullstack Developer</h3>
                    <span className="text-[10px] font-mono text-slate-400">2021 - 2023</span>
                  </div>
                  <p className="text-xs text-indigo-300">Enterprise Digital Solution</p>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">
                    Mengoptimalkan performa web application dengan Next.js App Router, SSR, dan caching strategy yang
                    meningkatkan Core Web Vitals hingga 40%.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (4 Cols): Skills, Education, ATS Scoring */}
          <div className="lg:col-span-4 space-y-6">
            {/* ATS Readiness Card */}
            <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/80 border border-indigo-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ATS Audit Score
                </span>
                <span className="text-sm font-black text-emerald-400">94 / 100</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full w-[94%]" />
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>STAR Method Action Verbs Ready</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Standard Parsing & Layout Validated</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Keyword Density Matched (Tech & AI)</span>
                </li>
              </ul>
            </div>

            {/* Skills & Tech Stack */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                <span>Keahlian & Teknologi</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Next.js 16',
                  'TypeScript',
                  'React 19',
                  'Node.js',
                  'TailwindCSS',
                  'Supabase',
                  'PostgreSQL',
                  'REST & GraphQL',
                  'LLM Prompting',
                  'QRIS Payment Gateway',
                  'Docker & CI/CD',
                ].map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-[11px] font-medium text-slate-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Education & Certs */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                <span>Pendidikan & Lisensi</span>
              </h2>
              <div className="text-xs space-y-2">
                <div>
                  <p className="font-bold text-white">S1 Teknik Informatika / Ilmu Komputer</p>
                  <p className="text-[11px] text-slate-400">Universitas Terakreditasi Unggul</p>
                </div>
                <div className="pt-1 border-t border-slate-800">
                  <p className="font-bold text-white">Certified AI Systems Professional</p>
                  <p className="text-[11px] text-slate-400">BoonTrack Career Benchmark 2026</p>
                </div>
              </div>
            </div>

            {/* AI Assistant Banner */}
            <div className="p-4 rounded-xl bg-indigo-900/20 border border-indigo-500/20 text-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                <Bot className="w-4 h-4" />
                <span>BoonTrack Career AI</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Ingin menganalisis CV Anda sendiri atau simulasi wawancara teknis?
              </p>
              <Link
                href="/career"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold pt-1"
              >
                <span>Buka Demo Konseling Karir</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 bg-slate-950">
        &copy; {new Date().getFullYear()} BoonTrack Career AI &bull; Verified Candidate Profile &bull; All Rights Reserved.
      </footer>
    </main>
  );
}
