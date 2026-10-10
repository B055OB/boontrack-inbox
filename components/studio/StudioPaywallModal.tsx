'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Check,
  Crown,
  QrCode,
  ArrowRight,
  Flame,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  STUDIO_TOKEN_PACKAGES,
  StudioPackageId,
} from '@/lib/config/studio-pricing';

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
  const [selectedPlan, setSelectedPlan] = useState<StudioPackageId>('creator');
  const [loadingPlan, setLoadingPlan] = useState<StudioPackageId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loadingPlan) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, loadingPlan]);

  if (!isOpen) return null;

  const starterPkg = STUDIO_TOKEN_PACKAGES.starter;
  const creatorPkg = STUDIO_TOKEN_PACKAGES.creator;
  const proPkg = STUDIO_TOKEN_PACKAGES.pro_monthly;

  const handleCheckout = async (planKey: StudioPackageId) => {
    setLoadingPlan(planKey);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/studio/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: planKey,
          tenantSlug,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.invoice_url) {
        throw new Error(data.error || 'Gagal menerbitkan invoice pembayaran. Silakan coba lagi.');
      }

      // Redirect langsung ke URL checkout invoice Xendit resmi
      window.location.href = data.invoice_url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala koneksi ke payment gateway.';
      setErrorMessage(msg);
      setLoadingPlan(null);
    }
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
          disabled={loadingPlan !== null}
          className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-2 text-center sm:text-left pr-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>Kredit Render: {currentCredits} Sisa / Upgrade Studio</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Top-Up Kredit Render Video Studio
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            Pilih paket kredit fleksibel via QRIS instan atau berlangganan Studio Pro untuk render video HD tanpa batas.
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Modal Body: 2 Purchase Options */}
        <div className="space-y-4">
          {/* ── SECTION A: TOP-UP INSTAN VIA QRIS ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-violet-400" />
                <span>Opsi A: Top-Up Instan (Sekali Beli via QRIS / VA)</span>
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
                  <span className="text-xs font-bold text-white">{starterPkg.name}</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    {starterPkg.credits} Video HD
                  </span>
                </div>

                <div>
                  <div className="text-xl font-black text-white">{starterPkg.formattedPrice}</div>
                  <p className="text-[10px] text-slate-400">{starterPkg.description}</p>
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1">
                  {starterPkg.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={loadingPlan !== null}
                  onClick={e => {
                    e.stopPropagation();
                    handleCheckout('starter');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPlan === 'starter' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyiapkan Invoice...</span>
                    </>
                  ) : (
                    <>
                      <span>Beli Paket Starter</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
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
                {creatorPkg.badge && (
                  <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[9px] font-black uppercase tracking-wider shadow-md flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5" />
                    <span>{creatorPkg.badge}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{creatorPkg.name}</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                    {creatorPkg.credits} Video HD
                  </span>
                </div>

                <div>
                  <div className="text-xl font-black text-white">{creatorPkg.formattedPrice}</div>
                  <p className="text-[10px] text-slate-400">{creatorPkg.description}</p>
                </div>

                <ul className="text-[11px] text-slate-300 space-y-1">
                  {creatorPkg.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={loadingPlan !== null}
                  onClick={e => {
                    e.stopPropagation();
                    handleCheckout('creator');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPlan === 'creator' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyiapkan Invoice...</span>
                    </>
                  ) : (
                    <>
                      <span>Beli Paket Creator</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
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
              onClick={() => setSelectedPlan('pro_monthly')}
              className={`p-5 rounded-2xl border transition cursor-pointer relative space-y-4 ${
                selectedPlan === 'pro_monthly'
                  ? 'bg-gradient-to-r from-violet-950/50 via-purple-950/40 to-slate-900 border-violet-400 shadow-xl shadow-violet-500/15'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-white">{proPkg.name}</span>
                    {proPkg.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold">
                        {proPkg.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {proPkg.description}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-2xl font-black text-white">
                    {proPkg.formattedPrice} <span className="text-xs font-normal text-slate-400">{proPkg.periodLabel}</span>
                  </div>
                </div>
              </div>

              {/* Fitur Utama Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 pt-1 border-t border-white/5">
                {proPkg.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={loadingPlan !== null}
                onClick={e => {
                  e.stopPropagation();
                  handleCheckout('pro_monthly');
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPlan === 'pro_monthly' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan Pembayaran QRIS...</span>
                  </>
                ) : (
                  <span>Langganan Studio Pro ➔</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer: Close / Cancel */}
        <div className="border-t border-white/5 pt-3 text-center">
          <button
            type="button"
            onClick={onClose}
            disabled={loadingPlan !== null}
            className="text-xs text-slate-400 hover:text-white transition font-medium cursor-pointer disabled:opacity-40"
          >
            Batal / Kembali ke Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
