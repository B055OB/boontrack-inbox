'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Check,
  QrCode,
  ArrowRight,
  Flame,
  Loader2,
  AlertCircle,
  Sparkles,
  Store,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import {
  getStudioTokenPackage,
  StudioPackageId,
} from '@/lib/config/studio-pricing';
import ShopUpgradeBanner from '@/components/studio/ShopUpgradeBanner';

interface StudioPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug?: string;
  currentCredits?: number;
  isShopMember?: boolean;
}

export default function StudioPaywallModal({
  isOpen,
  onClose,
  tenantSlug = 'studio',
  currentCredits = 0,
  isShopMember,
}: StudioPaywallModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<StudioPackageId>('creator');
  const [loadingPlan, setLoadingPlan] = useState<StudioPackageId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean>(Boolean(isShopMember));

  // Sync prop or dynamically fetch entitlement from database SSOT
  useEffect(() => {
    if (typeof isShopMember === 'boolean') {
      setIsMember(isShopMember);
      return;
    }

    if (!tenantSlug || tenantSlug === 'studio') {
      setIsMember(false);
      return;
    }

    let isMounted = true;
    async function checkMembership() {
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantSlug)}/entitlements`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.success && json.data) {
            setIsMember(Boolean(json.data.is_shop_member));
          }
        }
      } catch {
        // Fallback gracefully to public tier
      }
    }

    checkMembership();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, isShopMember]);

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

  // Resolve packages based on member status
  const ketenganPkg = getStudioTokenPackage('ketengan', isMember)!;
  const starterPkg = getStudioTokenPackage('starter', isMember)!;
  const creatorPkg = getStudioTokenPackage('creator', isMember)!;

  const packagesList = [ketenganPkg, starterPkg, creatorPkg];

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
        throw new Error(data.error || 'Gagal menerbitkan invoice pembayaran QRIS. Silakan coba lagi.');
      }

      // Redirect langsung ke URL checkout invoice QRIS Instan resmi
      window.location.href = data.invoice_url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala koneksi ke sistem pembayaran QRIS Instan.';
      setErrorMessage(msg);
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-slate-950 border border-violet-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-violet-500/10 space-y-6 text-white my-8"
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" />
              <span>Saldo Kredit: {currentCredits} Sisa</span>
            </div>

            {isMember ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Diskon Khusus Member Toko</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[10px] font-bold">
                <Calendar className="w-3.5 h-3.5" />
                <span>Masa aktif saldo kredit: 12 bulan</span>
              </div>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Top-Up Kredit Video Studio
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Beli kredit fleksibel via QRIS Instan. Kredit langsung masuk ke akun toko Anda tanpa masa tunggu dan aktif hingga 12 bulan.
          </p>
        </div>

        {/* Teaser Banner Penawaran Upgrade Toko untuk Akun Publik / Non-Member */}
        <ShopUpgradeBanner
          isShopMember={isMember}
          tenantSlug={tenantSlug}
          variant="compact"
        />

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-violet-400" />
            <span>Pilihan Paket Top-Up (Bayar via QRIS Instan)</span>
          </span>
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Masa aktif saldo kredit: 12 bulan</span>
          </span>
        </div>

        {/* Aturan Konversi Pemakaian Kredit Info Box */}
        <div className="flex items-center justify-center p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs font-semibold text-center tracking-wide">
          <span>ℹ️ 1 Video Otomatis Jadi = 3 Kredit | 1 Panduan Naskah Asli = 1 Kredit</span>
        </div>

        {/* 3 Top-Up Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packagesList.map(pkg => {
            const isSelected = selectedPlan === pkg.id;
            const isPopular = Boolean(pkg.isPopular);

            return (
              <div
                key={pkg.id}
                onClick={() => setSelectedPlan(pkg.id)}
                className={`p-5 rounded-2xl border transition cursor-pointer relative flex flex-col justify-between space-y-4 ${
                  isSelected
                    ? 'bg-violet-950/40 border-violet-400 shadow-xl shadow-violet-500/15'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                {/* Popular / Fast Trial Badge */}
                {pkg.badge && (
                  <div
                    className={`absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-md flex items-center gap-1 ${
                      isPopular
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isPopular && <Flame className="w-2.5 h-2.5" />}
                    <span>{pkg.badge}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-white">{pkg.name}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {pkg.credits} Kredit
                    </span>
                  </div>

                  <div>
                    <div className="text-2xl font-black text-white">{pkg.formattedPrice}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-medium text-emerald-400 font-mono">
                        {pkg.formattedPricePerCredit}
                      </span>
                      {isMember && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          Member
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{pkg.description}</p>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <ul className="text-xs text-slate-300 space-y-1.5">
                      {pkg.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span className="leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={loadingPlan !== null}
                    onClick={e => {
                      e.stopPropagation();
                      handleCheckout(pkg.id);
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPopular || isSelected
                        ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {loadingPlan === pkg.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyiapkan QRIS...</span>
                      </>
                    ) : (
                      <>
                        <span>Beli via QRIS Instan</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer: Keamanan & Info */}
        <div className="border-t border-white/5 pt-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Pembayaran diverifikasi otomatis via QRIS Instan. Saldo kredit berlaku 12 bulan.</span>
          </div>

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
