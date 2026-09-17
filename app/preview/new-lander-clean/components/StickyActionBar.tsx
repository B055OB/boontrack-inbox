'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Zap, X } from 'lucide-react';

interface StickyActionBarProps {
  referralCode?: string;
}

export default function StickyActionBar({ referralCode }: StickyActionBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 480) {
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
      <div className="max-w-4xl mx-auto bg-white/95 border border-zinc-200/90 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-xl backdrop-blur-md pointer-events-auto flex items-center justify-between gap-3 text-zinc-900">
        
        {/* Left Value Prop */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-[1.5px] shrink-0 shadow-xs">
            <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-600 fill-emerald-600" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-black text-xs sm:text-sm text-zinc-900 tracking-tight truncate">
                Mulai Toko Online & Otomasi WhatsApp Anda
              </h4>
              <span className="hidden md:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                0% Komisi Marketplace
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 truncate hidden sm:block">
              Aktifkan katalog digital, checkout QRIS instan, dan bot WhatsApp 24 jam gratis.
            </p>
          </div>
        </div>

        {/* Right CTA Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={registerHref}
            className="px-4 sm:px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Buka Toko Sekarang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition"
            title="Tutup banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      </div>
    </aside>
  );
}
