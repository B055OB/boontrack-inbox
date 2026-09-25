'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Menu, X, Sparkles } from 'lucide-react';

interface NavbarProps {
  referralCode?: string;
  onOpenDemo?: () => void;
}

export default function Navbar({ referralCode, onOpenDemo }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  return (
    <>
      {/* Top Sticky Bar */}
      <div className="bg-slate-900 text-slate-200 py-2.5 px-4 text-xs font-medium text-center tracking-wide sticky top-0 z-50 shadow-sm flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white">⚡ COBA GRATIS 7 HARI:</span>
          <span>Akses Penuh Meta CAPI Tracking &amp; Reader APK Otomatisasi Pembayaran.</span>
        </span>
      </div>

      {/* Main Header */}
      <header className="sticky top-[37px] z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo Resmi BoonTrack Shop */}
          <Link href="/" className="flex items-center gap-2.5 group cursor-pointer">
            <Image
              src="/icon-shop.png"
              alt="BoonTrack Shop"
              width={36}
              height={36}
              className="w-9 h-9 rounded-xl object-contain shadow-sm group-hover:scale-105 transition-transform"
              priority
            />
            <div>
              <span className="font-black text-lg tracking-tight text-slate-900 block leading-tight">
                BoonTrack <span className="text-blue-600 font-bold text-sm">Shop</span>
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                Commerce Engine
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-600">
            <a href="#vertikal" className="hover:text-blue-600 transition-colors">
              Model Bisnis
            </a>
            <a href="#komparasi" className="hover:text-blue-600 transition-colors">
              Komparasi
            </a>
            <a href="#pilar" className="hover:text-blue-600 transition-colors">
              Teknologi CAPI &amp; Reader
            </a>
            <a href="#kepatuhan" className="hover:text-blue-600 transition-colors">
              Kepatuhan
            </a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">
              FAQ
            </a>
            <button
              type="button"
              onClick={onOpenDemo}
              className="flex items-center gap-1.5 text-blue-600 hover:text-indigo-600 transition-colors cursor-pointer font-extrabold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Live Demo</span>
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-950 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
            >
              Masuk Dashboard
            </Link>
            <Link
              href={registerHref}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-xs shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Buka Toko Gratis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 bg-white/98 backdrop-blur-xl px-4 py-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col space-y-3 text-sm font-bold text-slate-700">
              <a
                href="#vertikal"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-blue-600 transition-colors"
              >
                Model Bisnis (6 Vertikal)
              </a>
              <a
                href="#komparasi"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-blue-600 transition-colors"
              >
                Komparasi Marketplace vs BoonTrack
              </a>
              <a
                href="#pilar"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-blue-600 transition-colors"
              >
                Teknologi CAPI &amp; Reader APK
              </a>
              <a
                href="#kepatuhan"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-blue-600 transition-colors"
              >
                Kepatuhan &amp; Regulasi
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-blue-600 transition-colors"
              >
                Pertanyaan Umum (FAQ)
              </a>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDemo?.();
                }}
                className="py-1 text-left text-blue-600 font-extrabold flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Buka Demo WhatsApp Assistant</span>
              </button>
            </nav>

            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
              <Link
                href={registerHref}
                className="w-full py-3 text-center rounded-xl bg-blue-600 text-white font-extrabold text-xs shadow-md shadow-blue-500/20"
              >
                Buka Toko Gratis Sekarang
              </Link>
              <Link
                href="/login"
                className="w-full py-2.5 text-center rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold"
              >
                Masuk ke Dashboard Toko
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
