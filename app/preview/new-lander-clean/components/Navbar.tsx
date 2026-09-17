'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X, Sparkles, Zap } from 'lucide-react';

interface NavbarProps {
  referralCode?: string;
  onOpenDemo?: () => void;
}

export default function Navbar({ referralCode, onOpenDemo }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/90 backdrop-blur-md transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <Link href="/preview/new-lander-clean" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-indigo-600 p-[1.5px] shadow-sm group-hover:shadow-md transition">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight text-zinc-900 leading-none">
                  BoonTrack
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                  Clean Light
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono block tracking-wider leading-none mt-0.5">
                Commerce Engine
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-zinc-600">
          <a href="#vertikal" className="hover:text-zinc-900 transition-colors">
            Model Bisnis
          </a>
          <a href="#komparasi" className="hover:text-zinc-900 transition-colors">
            Komparasi
          </a>
          <a href="#pilar" className="hover:text-zinc-900 transition-colors">
            Teknologi Inti
          </a>
          <button
            type="button"
            onClick={onOpenDemo}
            className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer font-bold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Live Demo</span>
          </button>
        </nav>

        {/* Action CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Masuk
          </Link>
          <Link
            href={registerHref}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-bold text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Buka Toko Gratis</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-200 bg-white/98 backdrop-blur-xl px-4 py-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-3 text-sm font-semibold text-zinc-700">
            <a
              href="#vertikal"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-zinc-900 transition-colors"
            >
              Model Bisnis (6 Vertikal)
            </a>
            <a
              href="#komparasi"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-zinc-900 transition-colors"
            >
              Komparasi Marketplace vs BoonTrack
            </a>
            <a
              href="#pilar"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-zinc-900 transition-colors"
            >
              Teknologi Dual-Engine & Meta CAPI
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDemo?.();
              }}
              className="py-1 text-left text-emerald-600 font-bold flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Buka Demo WhatsApp Assistant</span>
            </button>
          </nav>

          <div className="pt-3 border-t border-zinc-200 flex flex-col gap-2">
            <Link
              href={registerHref}
              className="w-full py-3 text-center rounded-xl bg-zinc-900 text-white font-bold text-xs shadow-sm"
            >
              Buka Toko Gratis Sekarang
            </Link>
            <Link
              href="/login"
              className="w-full py-2.5 text-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-semibold"
            >
              Masuk ke Dashboard Toko
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
