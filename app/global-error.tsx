'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError] Fatal application error:', error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800 antialiased font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/80 shadow-xs text-xl font-bold">
            ⚠️
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Sistem Sedang Memulihkan Tampilan
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Terjadi inkonsistensi rendering pada browser. Silakan muat ulang halaman untuk melanjutkan.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
            >
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}