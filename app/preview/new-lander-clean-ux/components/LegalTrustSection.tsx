'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, Scale, RotateCcw, Mail, ArrowUpRight } from 'lucide-react';

export default function LegalTrustSection() {
  return (
    <section id="kepatuhan" className="py-20 bg-white border-t border-slate-200 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl space-y-8">
          
          {/* Header & Sub-badge */}
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-blue-950/80 text-blue-300 border border-blue-500/30 rounded-full px-4 py-1 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Standar Kepatuhan Sistem Pembayaran &amp; Regulasi PMSE Kemendag RI</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Keamanan Transaksi &amp; Perlindungan Hukum Terjamin
            </h2>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">
              PT BOONTRACK INOVASI DIGITAL berkomitmen menerapkan transparansi perniagaan elektronik dan perlindungan privasi data pribadi pengguna sesuai UU No. 27 Tahun 2022 (UU PDP).
            </p>
          </div>

          {/* Grid 4 Kartu Mini */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* 1. Privacy Policy */}
            <Link
              href="/privacy"
              className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-cyan-500/50 rounded-xl p-5 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                    <Lock className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">
                  Privacy Policy
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Kebijakan privasi &amp; enkripsi perlindungan data pengguna sesuai regulasi UU PDP.
                </p>
              </div>
            </Link>

            {/* 2. Terms of Service */}
            <Link
              href="/terms"
              className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-blue-500/50 rounded-xl p-5 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <Scale className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">
                  Terms of Service
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hak &amp; kewajiban merchant pemegang akun platform SaaS demi keamanan bersama.
                </p>
              </div>
            </Link>

            {/* 3. Refund Policy */}
            <Link
              href="/refund"
              className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-sky-500/50 rounded-xl p-5 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">
                  Refund Policy
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Prosedur pengembalian dana &amp; resolusi penyelesaian sengketa transaksi.
                </p>
              </div>
            </Link>

            {/* 4. Hubungi Kami / Support */}
            <Link
              href="/contact"
              className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-teal-500/50 rounded-xl p-5 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
                    <Mail className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">
                  Hubungi Kami / Support
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Bantuan resmi: <span className="text-teal-300 font-medium">support@boontrack.com</span> dan tim teknis BoonTrack.
                </p>
              </div>
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
