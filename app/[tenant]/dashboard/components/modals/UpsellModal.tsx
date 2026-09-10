'use client';

import React from 'react';
import {
  X,
  Sparkles,
  Bot,
  Zap,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (targetTier?: 'ads_performance' | 'team_scale') => void;
  featureName?: string;
  targetTier?: 'ads_performance' | 'team_scale';
}

export default function UpsellModal({
  isOpen,
  onClose,
  onUpgrade,
  featureName = 'AI Knowledge & Bot Closing Otomatis',
  targetTier = 'ads_performance',
}: UpsellModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden text-slate-900 animate-in zoom-in-95 duration-200">
        {/* HEADER GRADIENT ACCENT */}
        <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 p-6 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold tracking-wider uppercase text-blue-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                Fitur Eksklusif Ads Performance
              </span>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                {featureName}
              </h2>
            </div>
          </div>
        </div>

        {/* BODY BENEFIT LIST */}
        <div className="p-6 space-y-4">
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Fitur AI Knowledge & Auto-Reply Bot dirancang khusus untuk membalas calon pembeli 24/7 dan mengonversi lead menjadi pesanan secara instan dengan panduan produk akurat.
          </p>

          <div className="space-y-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Yang Anda Dapatkan di Paket Ads Performance:
            </h4>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>AI Sales Assistant 24/7</strong> — Auto-closing pelanggan dengan persona brand toko Anda.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Meta CAPI Server-Side Tracking</strong> — Sinyal akurat untuk optimasi performa Facebook & Instagram Ads.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Custom Strategy Respon</strong> — Pilihan mode Trust Builder, Balanced, hingga Hard Selling.
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Paket Anda saat ini belum memiliki akses ke modul AI Bot. Aktifkan sekarang mulai dari <strong>Rp 299.000/bulan</strong>.
            </p>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-6 pt-0 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            Nanti Saja
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onUpgrade(targetTier);
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-300" />
            <span>Upgrade ke Ads Performance</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
