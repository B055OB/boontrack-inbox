'use client';

import React from 'react';
import { ShieldCheck, Lock, Building2, Globe } from 'lucide-react';

export default function TrustBar() {
  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                Infrastruktur QRIS Standar Bank Indonesia &amp; Payment Gateway Nasional Terlisensi
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Transaksi diproses aman melalui jaringan interkoneksi resmi QRIS nasional dan perbankan Indonesia.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-slate-500 text-xs font-bold shrink-0">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Lock className="w-4 h-4 text-blue-600" />
              <span>Enkripsi SSL 256-Bit</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5 text-slate-700">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Interkoneksi Bank Nasional</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5 text-slate-700">
              <Globe className="w-4 h-4 text-purple-600" />
              <span>Server Cloud 99.9% SLA</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
