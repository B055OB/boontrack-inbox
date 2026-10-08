'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Check,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Crown,
  QrCode,
  ArrowRight,
  Flame
} from 'lucide-react';

interface StudioPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug?: string;
  currentCredits?: number;
}

export default function StudioPaywallModal({
  isOpen,
  onClose,
  tenantSlug = 'studio',
  currentCredits = 0,
}: StudioPaywallModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'creator' | 'pro'>('creator');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCheckout = (planKey: 'starter' | 'creator' | 'pro') => {
    const waNumber = '6285181830080';
    let planName = 'Top-Up 50 Video (Paket Creator - Rp99.000)';
    if (planKey === 'starter') planName = 'Top-Up 25 Video (Paket Starter - Rp49.000)';
    if (planKey === 'pro') planName = 'Langganan Studio Pro Bulanan (Rp149.000/bln)';

    const message = `Halo Admin BoonTrack Studio! Saya ingin checkout ${planName} untuk workspace ${tenantSlug}. Mohon QRIS pembayarannya.`;
    const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    window.open(waLink, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-slate-950 border border-violet-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-violet-500/10 space-y-6 text-white my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
          title="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-2 text-center sm:text-left pr-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>Kredit Render Habis / Upgrade Studio</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Kredit Render Habis / Upgrade Studio
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            Pilih paket kredit fleksibel atau berlangganan Studio Pro untuk render video HD tanpa batas.
          </p>
        </div>

        {/* Modal Body: 2 Purchase Options */}
        <div className="space-y-4">
          {/* ── SECTION A: TOP-UP INSTAN VIA QRIS ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-violet-400" />
                <span>Opsi A: Top-Up Instan (Sekali Beli via QRIS)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Tanpa Langganan Otomatis</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Paket Starter (25 Video) */}
              <div
                onClick={() => setSelectedPlan('starter')}
                className={`p-4 rounded-2xl border transition cursor-pointer relative space-y-3 ${
                  selectedPlan === 'starter'
                    ? 'bg-violet-950/30 border-violet-400 shadow-lg shadow-violet-500/10'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Paket Starter</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    25 Video HD
                  </span>
                </div>

                <div>
                  <div className="text-xl font-black text-white">Rp49.000</div>
                  <p className="text-[10px] text-slate-400">Sekali beli via QRIS • No Watermark</p>
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>25 Render Credits Siap Pakai</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>Resolusi 1080p Full HD</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleCheckout('starter');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Beli Paket Kredit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Paket Creator (50 Video) */}
              <div
                onClick={() => setSelectedPlan('creator')}
                className={`p-4 rounded-2xl border transition cursor-pointer relative space-y-3 ${
                  selectedPlan === 'creator'
                    ? 'bg-violet-950/40 border-violet-400 shadow-lg shadow-violet-500/15'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                {/* Popular Badge */}
                <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[9px] font-black uppercase tracking-wider shadow-md flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5" />
                  <span>Paling Hemat</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Paket Creator</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                    50 Video HD
                  </span>
                </div>

                <div>
                  <div className="text-xl font-black text-white">Rp99.000</div>
                  <p className="text-[10px] text-slate-400">Sekali beli via QRIS • No Watermark</p>
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>50 Render Credits Siap Pakai</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>Antrean Render FFmpeg Prioritas</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleCheckout('creator');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/30 cursor-pointer"
                >
                  <span>Beli Paket Kredit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── SECTION B: STUDIO PRO (LANGGANAN BULANAN) ── */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Opsi B: Studio Pro (Langganan Bulanan)</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">Akses Unlimited Tools</span>
            </div>

            <div
              onClick={() => setSelectedPlan('pro')}
              className={`p-5 rounded-2xl border transition cursor-pointer relative space-y-4 ${
                selectedPlan === 'pro'
                  ? 'bg-gradient-to-r from-violet-950/50 via-purple-950/40 to-slate-900 border-violet-400 shadow-xl shadow-violet-500/15'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-white">Langganan Studio Pro</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold">
                      PRO PLAN
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Solusi lengkap untuk brand, merchant & kreator aktif
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-2xl font-black text-white">
                    Rp149.000 <span className="text-xs font-normal text-slate-400">/ bulan</span>
                  </div>
                </div>
              </div>

              {/* 4 Fitur Utama Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 pt-1 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>50 Video 1080p Full HD per bulan</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Antrean prioritas render FFmpeg</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Penyimpanan cloud prioritas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Komersial clean metadata (is_aigc: 1)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleCheckout('pro');
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <span>Langganan Studio Pro ➔</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer: Affiliate Program Link */}
        <div className="border-t border-white/5 pt-4 text-center">
          <a
            href="https://affiliate.boontrack.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 font-medium inline-flex items-center gap-1.5 transition hover:underline"
          >
            <span>Ingin dapat komisi 20-30%? Gabung Program Afiliasi BoonTrack ➔</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
