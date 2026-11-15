import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - Halaman Tidak Ditemukan | BoonTrack App Portal',
  description: 'Rute atau aplikasi yang Anda tuju tidak ditemukan pada domain app.boontrack.com.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AppPortalNotFoundPage() {
  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-orange-500 selection:text-white font-sans antialiased relative overflow-hidden">
      {/* Background Ornamen Blob */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-orange-950/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-slate-900/40 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-md w-full bg-[#0B0F19] rounded-3xl border border-slate-800/80 shadow-2xl p-6 sm:p-8 text-center space-y-6 animate-fadeIn">
        {/* Visual Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-orange-950/40 border border-orange-500/30 flex items-center justify-center text-orange-400 relative">
          <Layers className="w-10 h-10" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-orange-950/60 text-orange-400 border border-orange-500/30">
            HTTP 404 &bull; App Hub
          </span>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Aplikasi Tidak Ditemukan
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Rute atau aplikasi yang Anda tuju tidak tersedia pada domain <span className="font-mono text-orange-400 font-semibold">app.boontrack.com</span>.
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-left space-y-2 text-xs text-slate-400">
          <div className="font-bold text-slate-200">Panduan Akses Platform:</div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pl-1">
            <li>Katalog Toko &amp; Storefront: <span className="font-mono text-slate-300">shop.boontrack.com</span></li>
            <li>Dashboard Merchant: <span className="font-mono text-slate-300">dashboard.boontrack.com</span></li>
            <li>BoonTrack Studio: <span className="font-mono text-slate-300">studio.boontrack.com</span></li>
            <li>BoonTrack Creator: <span className="font-mono text-slate-300">creator.boontrack.com</span></li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Link
            href="/"
            className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke App Portal</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-[11px] text-slate-500">
        &copy; {new Date().getFullYear()} BoonTrack &bull; Custom Business Solutions Hub
      </div>
    </div>
  );
}
