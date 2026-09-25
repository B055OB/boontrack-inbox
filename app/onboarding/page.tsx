import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, Store, ShieldCheck, Zap, MessageSquare } from 'lucide-react';

export default function OnboardingHubPage() {
  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200/80 py-3.5 px-4 sm:px-6 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 bg-white shrink-0 group-hover:scale-105 transition-transform">
              <Image
                src="/icon-shop.png"
                alt="BoonTrack Shop"
                width={40}
                height={40}
                priority
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-black text-lg sm:text-xl tracking-tight text-slate-950">
                  BoonTrack
                </span>
                <span className="font-extrabold text-lg sm:text-xl text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Shop
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                COMMERCE ENGINE
              </span>
            </div>
          </Link>

          <Link
            href="/login"
            className="text-xs font-bold text-slate-600 hover:text-blue-600 px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition"
          >
            Sudah Punya Toko? Masuk
          </Link>
        </div>
      </header>

      {/* Main Hero & Onboarding Gate */}
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold mb-4">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>BoonTrack Shop Onboarding &bull; Coba Gratis 7 Hari</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight leading-tight">
          Inisialisasi Toko Online &amp; WhatsApp Commerce Anda
        </h1>
        <p className="text-sm sm:text-base text-slate-600 mt-3 max-w-lg leading-relaxed">
          Aktifkan etalase instan, integrasi bot kasir WhatsApp otomatis, dan pembayaran QRIS berizin resmi Bank Indonesia dalam kurang dari 2 menit.
        </p>

        <div className="mt-8 w-full max-w-md space-y-3">
          <Link
            href="/register"
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/25 active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <span>Mulai Buka Toko Baru Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/login"
            className="w-full py-3.5 px-6 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 shadow-xs transition flex items-center justify-center gap-2"
          >
            <Store className="w-4 h-4 text-slate-500" />
            <span>Masuk ke Dashboard Toko Terdaftar</span>
          </Link>
        </div>

        {/* Feature badges */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg text-left">
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <ShieldCheck className="w-5 h-5 text-emerald-600 mb-1.5" />
            <h4 className="text-xs font-black text-slate-900">QRIS Resmi Bank Indonesia</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Dana masuk langsung ke rekening bank pemilik toko.</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <MessageSquare className="w-5 h-5 text-blue-600 mb-1.5" />
            <h4 className="text-xs font-black text-slate-900">WhatsApp Commerce</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Notifikasi resi dan bot otomatis melayani pembeli 24 jam.</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
            <Zap className="w-5 h-5 text-amber-500 mb-1.5" />
            <h4 className="text-xs font-black text-slate-900">Meta &amp; TikTok CAPI</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Sinyal konversi server-side anti-adblocker iOS 14+.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200/80 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} PT BOONTRACK INOVASI DIGITAL &bull; Powered by BoonTrack Commerce Engine
      </footer>
    </div>
  );
}
