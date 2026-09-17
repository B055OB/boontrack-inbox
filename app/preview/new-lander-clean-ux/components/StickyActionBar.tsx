'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, X } from 'lucide-react';

interface StickyActionBarProps {
  referralCode?: string;
}

export default function StickyActionBar({ referralCode }: StickyActionBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 500) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible || isDismissed) return null;

  return (
    <aside aria-label="Aksi Cepat" className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 pointer-events-none animate-in slide-in-from-bottom-5 duration-300">
      <div className="max-w-4xl mx-auto bg-white/95 border border-slate-200 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md pointer-events-auto flex items-center justify-between gap-3 text-slate-900">
        {/* Left Value Prop */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-[1.5px] shrink-0 shadow-xs">
            <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600 fill-blue-600" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-black text-xs sm:text-sm text-slate-950 tracking-tight truncate">
                Mulai Toko Online &amp; Otomasi WhatsApp Anda
              </h4>
              <span className="hidden md:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                Coba Gratis 7 Hari
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">
              Aktifkan etalase instan, pembayaran QRIS otomatis, dan Meta CAPI server-side.
            </p>
          </div>
        </div>

        {/* Right CTA Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={registerHref}
            className="px-4 sm:px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Buka Toko Sekarang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            title="Tutup banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
