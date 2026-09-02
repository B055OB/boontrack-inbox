'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Check, 
  ArrowRight, 
  Zap, 
  Store, 
  ShieldCheck, 
  MessageSquareText, 
  Sparkles,
  Bot
} from 'lucide-react';

export default function ShopLandingPage() {
  const router = useRouter();
  const [storeSlug, setStoreSlug] = useState('');

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug.trim()) return;
    const cleanSlug = storeSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    router.push(`/register?slug=${cleanSlug}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white pb-24 md:pb-12">
      
      {/* 1. TOP BANNER RINGKAS */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-2 text-center text-xs font-medium text-white flex items-center justify-center gap-1.5 shadow-sm">
        <span>⚡ WhatsApp Commerce & QRIS Otomatis Terintegrasi.</span>
        <Link href="/register" className="underline font-bold hover:text-blue-100 ml-1">
          Coba Gratis Sekarang &rarr;
        </Link>
      </div>

      {/* 2. HEADER MINIMALIS */}
      <header className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-600/30">
            B
          </div>
          <span className="font-extrabold text-lg tracking-tight text-white">
            BoonTrack <span className="text-blue-500 font-medium text-sm">Shop</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/login" 
            className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg transition"
          >
            Masuk
          </Link>
          <Link 
            href="/register" 
            className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl transition shadow-md shadow-blue-600/20"
          >
            Daftar
          </Link>
        </div>
      </header>

      {/* 3. HERO SECTION FOKUS INPUT SLUG */}
      <main className="max-w-4xl mx-auto px-4 pt-10 pb-12 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Platform Penjualan & WhatsApp Tercepat</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight md:leading-tight">
          Tingkatkan Manajemen <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400">
            Order Otomatis
          </span>
        </h1>

        <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
          Toko online berbasis Web & WhatsApp untuk Anda: konversi instan, QRIS dinamis real-time, dan asisten bot closing 24 jam.
        </p>

        {/* Input Form URL Toko */}
        <div className="max-w-md mx-auto pt-2">
          <form onSubmit={handleCreateStore} className="bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-xl space-y-2">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-slate-500 font-mono select-none">boontrack.com/</span>
              <input
                type="text"
                placeholder="nama-toko-anda"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                className="bg-transparent text-white font-mono flex-1 focus:outline-none px-1 placeholder:text-slate-600 lowercase"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Store className="w-4 h-4" />
              <span>Buat Toko Anda Sekarang (3 Detik)</span>
            </button>
          </form>
          <span className="text-[11px] text-slate-500 mt-2 block">
            Domain subdomain gratis &bull; Tanpa biaya setup awal
          </span>
        </div>

        {/* 4. PERBANDINGAN FITUR LENGKAP (TABEL RINGKAS) */}
        <div className="pt-12 text-left space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-white">Pilihan Engine Sesuai Skala Bisnis</h2>
            <p className="text-xs text-slate-400">Pilih paket yang paling pas untuk akselerasi transaksi Anda.</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-4 w-2/5">Fitur Unggulan</th>
                    <th className="px-4 py-4 text-center w-3/10 bg-slate-900/50">Solo Engine</th>
                    <th className="px-4 py-4 text-center w-3/10 bg-blue-950/30 text-blue-400 border-l border-slate-800">
                      Business Growth
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr className="hover:bg-slate-800/20">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>QRIS Real-time Dinamis</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-900/50 font-semibold text-white">
                      Cek Otomatis
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-950/20 border-l border-slate-800 font-semibold text-emerald-400">
                      Cek Otomatis
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/20">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2">
                      <MessageSquareText className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Multi-Agent CS WhatsApp</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-900/50">
                      Hingga 2 Seat
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-950/20 border-l border-slate-800 font-bold text-white">
                      Hingga 10 Seat
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/20">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                      <span>AI Assistant Auto-Closing 24 Jam</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-900/50 text-slate-500">
                      &mdash;
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-950/20 border-l border-slate-800 font-bold text-blue-400">
                      Included (No-Fee)
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/20">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sistem Komisi Affiliate</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-900/50 text-slate-500">
                      Dasar
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-950/20 border-l border-slate-800 font-bold text-emerald-400">
                      Multi-Tier & Manager
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>

      {/* 5. STICKY BOTTOM BAR (AKSES CEPAT MOBILE) */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-950/90 border-t border-slate-800 backdrop-blur-md p-3 md:hidden z-50">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <Link
            href="/register"
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold text-center shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-1.5"
          >
            <span>Buka Toko Gratis</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
          >
            Lihat Paket
          </Link>
        </div>
      </div>

    </div>
  );
}