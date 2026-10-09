'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Layers, RefreshCcw, Home } from 'lucide-react';

export default function TenantErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      '[TenantRuntime] Error boundary caught error:',
      error,
      error?.digest ? `(Digest: ${error.digest})` : ''
    );
  }, [error]);

  const handleReset = () => {
    if (error?.digest) {
      console.info('[TenantRuntime] Resetting error boundary for digest:', error.digest);
    }
    reset();
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
          <Layers className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">Kendala Memuat Halaman Layanan</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Terjadi gangguan sementara saat memproses data portal layanan. Silakan coba muat ulang beberapa saat lagi.
          </p>
        </div>

        {/* Expose Error Details for Debugging */}
        <pre className="text-xs text-red-600 bg-red-50 p-3 rounded mt-4 max-w-md overflow-auto text-left whitespace-pre-wrap break-all font-mono">
          {error?.message || "Unknown error"}
          {error?.digest ? `\nDigest: ${error.digest}` : ""}
          {error?.stack && `\n\n${error.stack.slice(0, 500)}`}
        </pre>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={handleReset}
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

        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          BoonTrack Platform · Layanan Multi-Tenant Terverifikasi
        </div>
      </div>
    </div>
  );
}
