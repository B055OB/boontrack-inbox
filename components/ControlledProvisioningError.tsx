'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert, Terminal, RefreshCw, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ControlledProvisioningErrorProps {
  templateCode?: string;
  tenantSlug?: string;
  errorMessage?: string;
}

export function ControlledProvisioningError({
  templateCode = 'UNKNOWN_TEMPLATE',
  tenantSlug,
  errorMessage,
}: ControlledProvisioningErrorProps) {
  return (
    <div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center p-4 antialiased selection:bg-rose-500 selection:text-white">
      <div className="max-w-xl w-full">
        {/* Top Glow & Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-semibold tracking-wide shadow-lg shadow-rose-950/50 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            CONTROLLED CONFIGURATION BOUNDARY
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Template Belum Terkonfigurasi
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                Arsitektur runtime BoonTrack mencegah fallback diam-diam (<span className="text-rose-300 font-mono">No Silent Fallback</span>) untuk melindungi integritas katalog dan modul tenant.
              </p>
            </div>
          </div>

          {/* Diagnostic Console Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300 space-y-2 mb-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-rose-400" />
                RUNTIME_DIAGNOSTICS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 font-bold text-[10px]">
                STATUS: 422_UNPROCESSABLE
              </span>
            </div>
            <div className="space-y-1 text-slate-400">
              <div>
                <span className="text-slate-500">Requested Template:</span>{' '}
                <span className="text-rose-400 font-bold">{templateCode}</span>
              </div>
              {tenantSlug && (
                <div>
                  <span className="text-slate-500">Tenant Slug:</span>{' '}
                  <span className="text-blue-400 font-semibold">{tenantSlug}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Policy:</span>{' '}
                <span className="text-emerald-400">STRICT_CONTRACT_ENFORCEMENT</span>
              </div>
              {errorMessage && (
                <div className="text-rose-300/90 pt-1 text-[11px] leading-relaxed">
                  {errorMessage}
                </div>
              )}
            </div>
          </div>

          {/* Next Steps Info */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 space-y-1 mb-6">
            <span className="font-bold text-slate-200 block text-[11px]">
              Tindakan Administrator:
            </span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Pastikan <code className="text-blue-300 font-mono">template_code</code> di database Supabase (tabel <code className="text-blue-300 font-mono">tenants</code>) disetel ke salah satu template kanonikal: <code className="text-emerald-300 font-mono">DROP_V1</code>, <code className="text-emerald-300 font-mono">SHOP_V1</code>, <code className="text-emerald-300 font-mono">PUBLIC_SERVICE_V1</code>, atau <code className="text-emerald-300 font-mono">CORPORATE_V1</code>.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 transition text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang Halaman</span>
            </button>
            <Link
              href="/"
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 transition text-slate-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 text-center"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Beranda</span>
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-600 mt-6 font-mono">
          BoonTrack Multi-Tenant Gateway • Canonical Boundary Active
        </p>
      </div>
    </div>
  );
}

export const UnknownTemplateError = ControlledProvisioningError;
export default ControlledProvisioningError;
