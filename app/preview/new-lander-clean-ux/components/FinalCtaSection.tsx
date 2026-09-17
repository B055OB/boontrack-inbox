'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Check, Store } from 'lucide-react';

interface FinalCtaSectionProps {
  referralCode?: string;
}

export default function FinalCtaSection({ referralCode }: FinalCtaSectionProps) {
  const router = useRouter();
  const [storeInput, setStoreInput] = useState('');

  const sanitizeSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleClaimStore = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = sanitizeSlug(storeInput);
    const params = new URLSearchParams();
    if (cleanSlug) {
      params.set('shop', cleanSlug);
      params.set('store', cleanSlug);
      params.set('claim', cleanSlug);
    }
    if (referralCode) {
      params.set('ref', referralCode);
    }
    const qs = params.toString();
    router.push(qs ? `/register?${qs}` : '/register');
  };

  return (
    <section className="py-20 bg-gradient-to-b from-white via-slate-50 to-slate-100 border-t border-slate-200 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl rounded-full pointer-events-none -z-10" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-black tracking-wide shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
          <span>Mulai Tanpa Biaya di Awal &bull; Coba Gratis 7 Hari</span>
        </div>

        <div className="space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight leading-tight">
            Dari Chat Sampai Order Beres.{' '}
            <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
              Klaim Toko Online Anda Sekarang.
            </span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Tinggalkan cara manual yang melelahkan. Dapatkan etalase instan, integrasi WhatsApp bot otomatis, verifikasi Reader APK dalam hitungan detik, dan Meta CAPI server-side dalam satu dashboard.
          </p>
        </div>

        {/* Claim Box */}
        <div className="max-w-xl mx-auto pt-2">
          <form
            onSubmit={handleClaimStore}
            className="bg-white border-2 border-blue-600/40 p-2.5 rounded-3xl shadow-2xl shadow-indigo-600/15 space-y-2.5 hover:border-blue-600 transition-all"
          >
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs sm:text-sm focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/20 transition-all">
              <span className="text-slate-400 font-mono select-none font-bold text-xs sm:text-sm shrink-0">
                shop.boontrack.com/
              </span>
              <input
                type="text"
                placeholder="nama-brand-anda"
                value={storeInput}
                onChange={(e) => setStoreInput(e.target.value)}
                className="bg-transparent text-slate-950 font-mono flex-1 focus:outline-none px-1.5 placeholder:text-slate-400 lowercase font-extrabold text-xs sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/25 cursor-pointer active:scale-98 hover:scale-[1.01]"
            >
              <span>Klaim Toko &amp; Mulai Coba Gratis 7 Hari</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-emerald-600 font-bold" /> Tanpa Kartu Kredit
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-emerald-600 font-bold" /> Setup Cepat 30 Detik
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-emerald-600 font-bold" /> Batal Kapan Saja
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
