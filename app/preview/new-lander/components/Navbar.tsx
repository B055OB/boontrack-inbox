'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X, Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface NavbarProps {
  referralCode?: string;
  onOpenDemo?: () => void;
}

export default function Navbar({ referralCode, onOpenDemo }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <Link href="/preview/new-lander" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-emerald-500 p-[1.5px] shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight text-white leading-none">
                  BoonTrack
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  OS
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block tracking-wider leading-none mt-0.5">
                Commerce Engine
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-300">
          <a href="#vertikal" className="hover:text-white transition-colors">
            Model Bisnis
          </a>
          <a href="#komparasi" className="hover:text-white transition-colors">
            Komparasi
          </a>
          <a href="#pilar" className="hover:text-white transition-colors">
            Teknologi Inti
          </a>
          <button
            type="button"
            onClick={onOpenDemo}
            className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Live Demo</span>
          </button>
        </nav>

        {/* Action CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            Masuk
          </Link>
          <Link
            href={registerHref}
            className="relative group px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5"
          >
            <span>Buka Toko Gratis</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950/95 backdrop-blur-2xl px-4 py-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-slate-300">
            <a
              href="#vertikal"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-white transition-colors"
            >
              Model Bisnis (6 Vertikal)
            </a>
            <a
              href="#komparasi"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-white transition-colors"
            >
              Komparasi Marketplace vs BoonTrack
            </a>
            <a
              href="#pilar"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-white transition-colors"
            >
              Teknologi Dual-Engine & Meta CAPI
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDemo?.();
              }}
              className="py-1 text-left text-emerald-400 flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Buka Demo WhatsApp Assistant</span>
            </button>
          </nav>

          <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
            <Link
              href={registerHref}
              className="w-full py-3 text-center rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 text-white font-bold text-xs shadow-md shadow-indigo-600/20"
            >
              Buka Toko Gratis Sekarang
            </Link>
            <Link
              href="/login"
              className="w-full py-2.5 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold"
            >
              Masuk ke Dashboard Toko
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
