"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Store, ArrowRight, Sparkles, CheckCircle2, MessageSquare, Phone } from "lucide-react";

function RegisterForm() {
  const searchParams = useSearchParams();
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("retail");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storeParam = searchParams.get("store") || searchParams.get("slug");
    if (storeParam) {
      setStoreName(storeParam);
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Format nomor WhatsApp & slug
    const cleanSlug = storeName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    
    // Redirect ke toko baru atau dashboard toko
    setTimeout(() => {
      window.location.href = `/${cleanSlug}`;
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl mx-auto mb-4 shadow-md shadow-blue-500/20">
            B
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Buka Toko Online</h1>
          <p className="text-slate-500 text-sm mt-1">Aktifkan sistem kasir WhatsApp & QRIS otomatis</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Domain / Link Toko
            </label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-blue-600 focus-within:bg-white transition-all">
              <span className="text-xs text-slate-400 font-semibold select-none">shop.boontrack.com/</span>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="namatokomu"
                className="w-full bg-transparent text-sm font-bold text-slate-900 focus:outline-none pl-1"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Nomor WhatsApp Bisnis
            </label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-blue-600 focus-within:bg-white transition-all">
              <Phone className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 focus:outline-none"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Digunakan untuk kirim invoice & QRIS otomatis ke pembeli.</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Kategori Bisnis
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
            >
              <option value="retail">Retail / Fashion / Produk Fisik</option>
              <option value="digital">Kelas Online / Ebook / Edukasi</option>
              <option value="fnb">Kuliner / Resto / Cafe</option>
              <option value="services">Jasa & Reservasi</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 mt-6"
          >
            {isSubmitting ? "Menyiapkan Toko..." : "Aktifkan Toko Sekarang"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp Cloud API Resmi • Siap Transaksi
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Loading form...</div>}>
      <RegisterForm />
    </Suspense>
  );
}