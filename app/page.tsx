'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Zap, 
  Store, 
  ShieldCheck, 
  MessageSquareText, 
  Sparkles,
  Bot,
  ArrowRight
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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-600 selection:text-white pb-24 md:pb-16">
      
      {/* 1. TOP BANNER BIRU TERANG */}
      <div className="bg-blue-600 px-4 py-2 text-center text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-sm">
        <span>WhatsApp Commerce, QRIS Otomatis Terintegrasi.</span>
        <Link href="/register" className="underline hover:text-blue-100 ml-1">
          Coba Gratis Sekarang &rarr;
        </Link>
      </div>

      {/* 2. HEADER MINIMALIS PUTIH */}
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-sm">
            B
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            BoonTrack <span className="text-blue-600 font-medium text-sm">Shop</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/login" 
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg transition"
          >
            Masuk
          </Link>
          <Link 
            href="/register" 
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/20"
          >
            Daftar Sekarang
          </Link>
        </div>
      </header>

      {/* 3. HERO SECTION CLEAN WHITE */}
      <main className="max-w-4xl mx-auto px-4 pt-10 pb-8 text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Platform Penjualan & WhatsApp Tercepat di Indonesia</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          Tingkatkan Manajemen <br className="hidden sm:block" />
          <span className="text-blue-600">Order Otomatis.</span>
        </h1>

        <p className="text-slate-600 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
          Platform e-commerce berbasis web & WhatsApp untuk Anda: pelopor omset naik otomatis, QRIS dinamis 3 detik, dan asisten bot closing 24 jam.
        </p>

        {/* Input Form URL Toko */}
        <div className="max-w-md mx-auto pt-2">
          <form onSubmit={handleCreateStore} className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-xl shadow-slate-200/50 space-y-2">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus-within:border-blue-500 focus-within:bg-white transition">
              <span className="text-slate-400 font-mono select-none">boontrack.com/</span>
              <input
                type="text"
                placeholder="nama-toko-anda"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                className="bg-transparent text-slate-900 font-mono flex-1 focus:outline-none px-1 placeholder:text-slate-400 lowercase font-medium"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Store className="w-4 h-4" />
              <span>Buat Toko Anda Sekarang (3 Detik)</span>
            </button>
          </form>
          <span className="text-[11px] text-slate-500 mt-2 block font-medium">
            &bull; Domain Subdomain Gratis &bull;
          </span>
        </div>

        {/* 4. PERBANDINGAN FITUR (TABEL CLEAN WHITE & BLUE) */}
        <div className="pt-12 text-left space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900">Perbandingan Fitur Engine</h2>
            <p className="text-xs text-slate-500">Transparan, efisien, dan siap mengakselerasi skala transaksi Anda.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50 mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-4 w-2/5">Fitur</th>
                    <th className="px-4 py-4 text-center w-3/10 bg-slate-100/50">Solo Engine</th>
                    <th className="px-4 py-4 text-center w-3/10 bg-blue-50 text-blue-700 border-l border-blue-100">
                      Business Growth Engine
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>QRIS Dinamis</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-50/30 font-medium">
                      Cek Mutasi Otomatis
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-50/30 border-l border-blue-100 font-bold text-blue-700">
                      Cek Mutasi Otomatis
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                      <MessageSquareText className="w-4 h-4 text-blue-500" />
                      <span>Multi-Agent CS</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-50/30 font-medium">
                      Hingga 2 Agent Seats
                    </td>
                    <td className="px-4 py-4 text-center bg-blue-50/30 border-l border-blue-100 font-bold text-blue-700">
                      Hingga 10 Agent Seats
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-600" />
                      <span>AI Bot Closing 24 Jam</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-50/30 text-slate-400 font-medium">
                      &mdash;
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-50/30 border-l border-blue-100 font-bold text-emerald-600">
                      AI Assistant No-Fee Per Transaksi
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Sistem Komisi Affiliate</span>
                    </td>
                    <td className="px-4 py-3.5 text-center bg-slate-50/30 font-medium">
                      Satu Level Dasar
                    </td>
                    <td className="px-4 py-3.5 text-center bg-blue-50/30 border-l border-blue-100 font-bold text-blue-700">
                      Multi-Tier & AM Control Plane
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>

      {/* 5. STICKY BOTTOM BAR (MOBILE ONLY) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 backdrop-blur-md p-3 md:hidden z-50 shadow-lg">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <Link
            href="/register"
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center shadow-md shadow-blue-600/30 transition flex items-center justify-center gap-1.5"
          >
            <span>Buka Toko Sekarang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-300 transition"
          >
            Paket
          </Link>
        </div>
      </div>

    </div>
  );
}