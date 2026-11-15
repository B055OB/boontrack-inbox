import React from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - Halaman Tidak Ditemukan | BoonTrack',
  description: 'Halaman yang Anda tuju tidak ditemukan pada sistem BoonTrack.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function GlobalNotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-purple-500 selection:text-white font-sans antialiased relative overflow-hidden">
      <div className="max-w-md w-full bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            HTTP 404
          </span>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Halaman atau alamat URL yang Anda tuju tidak tersedia pada platform BoonTrack.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="https://boontrack.com"
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ke Halaman Utama (boontrack.com)</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-[11px] text-slate-600">
        &copy; {new Date().getFullYear()} BoonTrack Infrastructure
      </div>
    </div>
  );
}
