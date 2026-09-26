'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface QuotaData {
  tier: string;
  base_quota: number;
  overage_quota: number;
  total_quota: number;
  used_sessions: number;
  remaining_sessions: number;
  percentage: number;
  is_low: boolean;
  is_depleted: boolean;
  fallback_mode: boolean;
}

interface AiSessionQuotaMeterProps {
  tenantSlug: string;
  tierName?: string;
}

export default function AiSessionQuotaMeter({
  tenantSlug,
  tierName,
}: AiSessionQuotaMeterProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<'topup_100' | 'topup_250'>('topup_100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topUpFeedback, setTopUpFeedback] = useState<string | null>(null);

  const fetchQuota = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/ai-quota`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setQuota(data);
        }
      }
    } catch (err) {
      console.error('Gagal mengambil data kuota AI:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  const handleTopUpSubmit = async () => {
    if (!tenantSlug) return;
    setIsSubmitting(true);
    setTopUpFeedback(null);

    const sessions = selectedPackage === 'topup_250' ? 250 : 100;
    const price = selectedPackage === 'topup_250' ? 99000 : 49000;

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/ai-quota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions,
          price,
          package_id: selectedPackage,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQuota(data);
        setTopUpFeedback(`🎉 Berhasil! +${sessions} Kuota Sesi AI telah aktif.`);
        setTimeout(() => {
          setIsTopUpOpen(false);
          setTopUpFeedback(null);
        }, 2000);
      } else {
        alert(data.error || 'Gagal memproses top-up kuota');
      }
    } catch {
      alert('Terjadi kesalahan koneksi saat top-up kuota');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayTier = tierName || quota?.tier || 'STARTER';
  const remaining = quota?.remaining_sessions ?? 150;
  const total = quota?.total_quota ?? 150;
  const percentage = quota?.percentage ?? 100;
  const isDepleted = quota?.is_depleted ?? false;
  const isLow = quota?.is_low ?? false;

  // Visual styling based on quota health
  const getProgressColor = () => {
    if (isDepleted) return 'bg-rose-500';
    if (isLow) return 'bg-gradient-to-r from-amber-500 to-orange-500';
    return 'bg-gradient-to-r from-emerald-500 to-teal-500';
  };

  return (
    <div className="w-full">
      {/* Visual Meter Box */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        isDepleted
          ? 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-2xs'
          : isLow
          ? 'bg-amber-50/70 border-amber-200 text-amber-950 shadow-2xs'
          : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Sisi Kiri: Status & Visual Bar */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isDepleted
                  ? 'bg-rose-100 text-rose-600'
                  : isLow
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-blue-50 text-blue-600'
              }`}>
                {isDepleted ? (
                  <ShieldAlert className="w-4 h-4" />
                ) : isLow ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-black tracking-tight">
                    Kuota Sesi Percakapan AI
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                    Paket {displayTier}
                  </span>
                  {isDepleted && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                      Fallback Assistant Mode
                    </span>
                  )}
                  {!isDepleted && isLow && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900">
                      Sisa Menipis
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isDepleted
                    ? 'Kuota sesi AI habis. Bot saat ini otomatis beroperasi dalam mode Menu Interaktif Statis (0-token).'
                    : `Digunakan untuk melayani calon pembeli secara proaktif & kontekstual via WhatsApp.`}
                </p>
              </div>
            </div>

            {/* Progress Bar & Numeric Indicator */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-800">
                  {isLoading ? 'Memuat...' : `${remaining.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} Sesi Tersedia`}
                </span>
                <span className="font-bold text-[11px] text-slate-500">
                  {isLoading ? '' : `${percentage}%`}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
                  style={{ width: `${Math.max(4, percentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Sisi Kanan: Action Button */}
          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
            <button
              type="button"
              onClick={() => setIsTopUpOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-xs hover:shadow-md cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-4 h-4 text-white" />
              <span>+ Top-Up Kuota</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top-Up Modal */}
      {isTopUpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Top-Up Kuota Sesi AI</h4>
                  <p className="text-[11px] text-slate-400">Tambahkan sesi interaksi bot WhatsApp secara instan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTopUpOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {topUpFeedback ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{topUpFeedback}</span>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-700">Pilih Paket Sesi:</p>

                  {/* Pilihan 1: 100 Sesi */}
                  <label
                    onClick={() => setSelectedPackage('topup_100')}
                    className={`block p-4 rounded-2xl border cursor-pointer transition ${
                      selectedPackage === 'topup_100'
                        ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-blue-600">
                          {selectedPackage === 'topup_100' && (
                            <div className="w-2 h-2 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">+100 Sesi AI</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800">
                              Paling Fleksibel
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Cukup untuk melayani ~100-200 prospek chat baru
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-blue-600">Rp 49.000</span>
                    </div>
                  </label>

                  {/* Pilihan 2: 250 Sesi */}
                  <label
                    onClick={() => setSelectedPackage('topup_250')}
                    className={`block p-4 rounded-2xl border cursor-pointer transition ${
                      selectedPackage === 'topup_250'
                        ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-blue-600">
                          {selectedPackage === 'topup_250' && (
                            <div className="w-2 h-2 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">+250 Sesi AI</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                              Hemat 20%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Pilihan terbaik untuk scale-up traffic iklan Meta/TikTok
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-blue-600">Rp 99.000</span>
                    </div>
                  </label>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                  <Layers className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <p>
                    Kuota top-up bersifat akumulatif, tidak pernah hangus di akhir bulan, dan otomatis digunakan setelah kuota dasar paket Anda habis.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsTopUpOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleTopUpSubmit}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Memproses...</span>
                      </>
                    ) : (
                      <>
                        <span>Konfirmasi &amp; Tambah Kuota</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
