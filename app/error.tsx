'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RootError] Unhandled route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800 antialiased">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/80 shadow-xs">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Terjadi Kendala Memuat Halaman
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Sistem mendeteksi kendala pada koneksi atau rendering tampilan. Silakan coba muat ulang halaman.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Ke Beranda</span>
          </Link>
        </div>

        {process.env.NODE_ENV !== 'production' && (
          <details className="text-left mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-rose-700 overflow-x-auto">
            <summary className="font-bold cursor-pointer select-none">Detail Error (Debug)</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono">{error.message}</pre>
          </details>
        )}
      </div>
    </div>
  );
}