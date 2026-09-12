'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Store, RefreshCcw, Home } from 'lucide-react';

export default function TenantErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TenantStorefront] Error boundary caught error:', error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-100">
          <Store className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">Kendala Memuat Halaman Toko</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Terjadi kendala saat menyinkronkan data katalog toko. Silakan coba muat ulang halaman.
          </p>
        </div>

        {/* Expose Error Details for Live Debugging */}
        <pre className="text-xs text-red-600 bg-red-50 p-3 rounded mt-4 max-w-md overflow-auto text-left whitespace-pre-wrap break-all font-mono">
          {error?.message || "Unknown error"}
          {error?.digest ? `\nDigest: ${error.digest}` : ""}
          {error?.stack && `\n\n${error.stack.slice(0, 500)}`}
        </pre>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>Muat Ulang Halaman</span>
          </button>

          <Link
            href="/"
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Beranda</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
