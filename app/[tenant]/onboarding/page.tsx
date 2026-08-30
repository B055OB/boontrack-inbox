"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  PlusCircle, 
  QrCode, 
  MessageSquare, 
  ArrowRight,
  Sparkles,
  Store
} from "lucide-react";

export default function TenantOnboardingPage() {
  const params = useParams();
  const rawTenant = (params?.tenant as string) || "toko-anda";
  const tenantSlug = rawTenant.toLowerCase();
  
  const [copied, setCopied] = useState(false);
  const storeUrl = `https://shop.boontrack.com/${tenantSlug}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col justify-between">
      
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
              B
            </div>
            <span className="font-extrabold text-slate-900 tracking-tight">
              BoonTrack <span className="text-blue-600">Merchant</span>
            </span>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Toko Aktif
          </span>
        </div>
      </header>

      {/* Main Wizard Container */}
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full">
        {/* Welcome Celebration Card */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-sm">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            Selamat! Toko <span className="text-blue-600 capitalize">{tenantSlug.replace(/-/g, " ")}</span> Berhasil Dibuat
          </h1>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
            Sistem pembayaran QRIS dan bot kasir WhatsApp Anda sudah siap. Berikut langkah awal untuk mulai jualan:
          </p>
        </div>

        {/* 1. Link Toko Box */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Link Etalase Toko Anda
          </label>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <input 
              type="text" 
              readOnly 
              value={storeUrl} 
              className="bg-transparent text-sm font-bold text-slate-800 flex-1 outline-none select-all"
            />
            <button 
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 rounded-lg flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Salin Link
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Pasang link ini di Bio Instagram, TikTok, atau tombol iklan Meta Ads Anda.
          </p>
        </div>

        {/* 2. Checklist Langkah Awal */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-2">
            Langkah Selanjutnya
          </h3>

          <div className="flex items-start gap-4 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-blue-50/50 hover:border-blue-100 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-sm">
              1
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-900">Tambah Produk & Harga</h4>
              <p className="text-xs text-slate-500 mt-0.5">Upload katalog barang jualan Anda agar pembeli bisa langsung order di etalase.</p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-emerald-50/50 hover:border-emerald-100 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-sm">
              2
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-900">Coba Checkout QRIS</h4>
              <p className="text-xs text-slate-500 mt-0.5">Buka etalase toko dan tes kirim pesan untuk melihat simulasi invoice QRIS otomatis.</p>
            </div>
          </div>
        </div>

        {/* 3. Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={`/${tenantSlug}/dashboard`}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all text-sm active:scale-95"
          >
            Buka Dashboard Toko <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href={`/${tenantSlug}`}
            target="_blank"
            rel="noreferrer"
            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 border border-slate-200 shadow-sm transition-all text-sm active:scale-95"
          >
            Lihat Tampilan Toko <ExternalLink className="w-4 h-4 text-slate-400" />
          </a>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="py-6 text-center text-xs text-slate-400 border-t border-slate-100 bg-white">
        © 2026 BoonTrack Commerce. All rights reserved.
      </footer>

    </div>
  );
}