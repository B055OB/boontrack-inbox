'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  MessageSquare,
  Zap,
  Radio,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Check,
  Loader2,
  Calculator,
  Info,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1';

const UPGRADE_EXPIRE_SECONDS = 30 * 60; // 30 menit

export interface UpgradePreviewData {
  current_tier: string;
  target_tier: string;
  is_trial: boolean;
  days_remaining: number;
  total_cycle_days: number;
  old_tier_price: number;
  new_tier_price: number;
  credit_amount: number;
  final_upgrade_amount: number;
  renewal_date?: string;
  summary_message?: string;
}

export interface UpgradePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  displayName: string;
  currentTier?: string;
  targetTier?: 'ads_performance' | 'team_scale';
  onSuccess?: () => void;
}

export default function UpgradePaymentModal({
  isOpen,
  onClose,
  tenantSlug,
  displayName,
  currentTier = 'STARTER',
  targetTier = 'ads_performance',
  onSuccess,
}: UpgradePaymentModalProps) {
  // Selected plan state for payment view: 'ads_performance' (PRO_SCALE) vs 'team_scale' (ENTERPRISE)
  const [selectedTier, setSelectedTier] = useState<'ads_performance' | 'team_scale'>(
    targetTier || 'ads_performance'
  );

  // Mode: 'cards' (pilihan komparasi 2 kartu) vs 'qris_direct' (tampilan QRIS langsung)
  const [viewMode, setViewMode] = useState<'cards' | 'qris_direct'>('cards');
  const [loadingCheckoutTier, setLoadingCheckoutTier] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // State Preview Prorata dari Backend
  const [previewData, setPreviewData] = useState<UpgradePreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const isTeam = selectedTier === 'team_scale';
  const tierName = isTeam ? 'Team Scale' : 'Ads Performance';

  // Nominal final tagihan: prioritaskan kalkulasi prorata dari backend
  const activeAmount = previewData?.final_upgrade_amount ?? (isTeam ? 499000 : 299000);

  const [timeLeft, setTimeLeft] = useState(UPGRADE_EXPIRE_SECONDS);
  const [pollStatus, setPollStatus] = useState<'polling' | 'paid' | 'expired'>('polling');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qrisValue = generateDynamicQRIS(STATIC_QRIS, activeAmount);

  const stopAll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Sync targetTier jika berubah dari props luar
  useEffect(() => {
    if (targetTier) {
      setSelectedTier(targetTier);
    }
  }, [targetTier]);

  // Fetch Preview Prorata saat modal dibuka atau saat kartu paket dipilih
  const fetchPreviewUpgrade = useCallback(async (tier: 'ads_performance' | 'team_scale') => {
    if (!tenantSlug) return;
    setIsLoadingPreview(true);
    try {
      const canonicalTarget = tier === 'team_scale' ? 'ENTERPRISE' : 'PRO_SCALE';
      const res = await fetch(
        `/api/v1/subscription/preview-upgrade?target_tier=${encodeURIComponent(canonicalTarget)}&slug=${encodeURIComponent(tenantSlug)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch (err) {
      console.warn('[Upgrade Modal] Error fetching upgrade preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (isOpen) {
      fetchPreviewUpgrade(selectedTier);
    }
  }, [isOpen, selectedTier, fetchPreviewUpgrade]);

  // Countdown timer saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;
    setTimeLeft(UPGRADE_EXPIRE_SECONDS);
    setPollStatus('polling');
    setCheckoutError(null);
    setLoadingCheckoutTier(null);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopAll();
          setPollStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, stopAll]);

  // Polling status aktivasi ke Core API setiap 3 detik
  useEffect(() => {
    if (!isOpen || pollStatus !== 'polling') return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `https://api.boontrack.com/api/v1/shop/subscriptions/status/${encodeURIComponent(tenantSlug)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;

        const json = await res.json();
        const statusVal: string =
          json?.status || json?.payment_status || json?.tier || '';
        const upper = statusVal.toUpperCase();

        if (
          upper === 'PAID' ||
          upper === 'SETTLED' ||
          upper === 'ACTIVE' ||
          upper === 'ADS_PERFORMANCE' ||
          upper === 'TEAM_SCALE' ||
          upper === 'PRO_SCALE' ||
          upper === 'ENTERPRISE'
        ) {
          stopAll();
          setPollStatus('paid');
          setTimeout(() => {
            if (onSuccess) onSuccess();
            else window.location.reload();
          }, 2000);
        } else if (upper === 'EXPIRED' || upper === 'FAILED') {
          stopAll();
          setPollStatus('expired');
        }
      } catch {
        // Toleransi error jaringan saat polling
      }
    };

    intervalRef.current = setInterval(checkStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, pollStatus, tenantSlug, stopAll, onSuccess]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const waConfirmText = encodeURIComponent(
    `Halo Tim BoonTrack, saya ingin konfirmasi pembayaran upgrade toko "${displayName}" (${tenantSlug}) ke paket ${tierName} (Rp ${activeAmount.toLocaleString('id-ID')}). Mohon aktivasi fiturnya.`
  );

  // Handler checkout subscription Xendit dengan nominal prorata dari backend
  const handleCheckoutXendit = async (tier: 'ads_performance' | 'team_scale') => {
    setSelectedTier(tier);
    setLoadingCheckoutTier(tier);
    setCheckoutError(null);

    const canonicalPlanTier = tier === 'team_scale' ? 'ENTERPRISE' : 'PRO_SCALE';
    // Gunakan nominal prorata jika tier yang dicheckout cocok dengan previewData
    const finalAmount =
      (previewData?.target_tier === canonicalPlanTier && previewData?.final_upgrade_amount)
        ? previewData.final_upgrade_amount
        : tier === 'team_scale'
        ? 499000
        : 299000;

    try {
      const res = await fetch('/api/v1/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          plan_tier: canonicalPlanTier,
          amount: finalAmount,
          merchant_name: displayName,
        }),
      });

      const data = await res.json();
      if (data.invoice_url) {
        window.location.href = data.invoice_url;
        return;
      }

      setViewMode('qris_direct');
    } catch (err: unknown) {
      console.warn('[Upgrade Checkout Error]:', err);
      setCheckoutError('Gagal menghubungkan ke Xendit. Anda dapat melakukan pembayaran langsung via QRIS di bawah.');
      setViewMode('qris_direct');
    } finally {
      setLoadingCheckoutTier(null);
    }
  };

  const hasProrataCredit = Boolean(previewData && previewData.credit_amount > 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`relative w-full ${viewMode === 'cards' ? 'max-w-4xl' : 'max-w-md'} bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 text-slate-100 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto transition-all`}>
        {/* Tombol Tutup */}
        <button
          type="button"
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer z-10"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        {/* State Sukses Terbayar */}
        {pollStatus === 'paid' ? (
          <div className="text-center py-10 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Pembayaran Berhasil Dikonfirmasi!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Paket toko <span className="font-bold text-emerald-400">{tenantSlug}</span> telah aktif di tier{' '}
                <span className="font-bold text-white">{tierName}</span>.
              </p>
            </div>
            <p className="text-[11px] text-slate-500">Memperbarui fitur dashboard Anda...</p>
          </div>
        ) : viewMode === 'cards' ? (
          /* ======================================================== */
          /* TAMPILAN 2 KARTU PILIHAN UPGRADE SEKALIGUS (KOMPARATIF)  */
          /* ======================================================== */
          <div className="space-y-6">
            {/* Header Modal */}
            <div className="text-center space-y-1.5 max-w-xl mx-auto pr-6 sm:pr-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span>Pilihan Paket Upgrade Resmi &bull; Pembayaran Aman Xendit</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Tingkatkan Kapasitas Toko Anda
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pilih paket langganan yang tepat untuk mengakselerasi traffic iklan, automasi closing WhatsApp, dan kolaborasi multi-admin CS.
              </p>
            </div>

            {checkoutError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Grid 2 Pilihan Kartu Upgrade Sekaligus */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-1">
              {/* KARTU 1: ADS PERFORMANCE (PRO_SCALE) */}
              <div
                onClick={() => {
                  setSelectedTier('ads_performance');
                }}
                className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 border transition-all duration-200 cursor-pointer ${
                  selectedTier === 'ads_performance'
                    ? 'bg-gradient-to-b from-blue-950/40 via-slate-900 to-slate-900 border-blue-500/50 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/30'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-4">
                  {/* Badge Header */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      PALING POPULER &bull; ADVERTISER
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">PRO_SCALE</span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      <span>Ads Performance</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Spesialisasi optimasi Facebook/TikTok Ads &amp; konversi tinggi.
                    </p>
                  </div>

                  {/* Nominal Harga & Label Prorata */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl sm:text-2xl font-black text-white font-mono">
                          {selectedTier === 'ads_performance' && previewData?.final_upgrade_amount !== undefined
                            ? `Rp ${previewData.final_upgrade_amount.toLocaleString('id-ID')}`
                            : 'Rp 299.000'}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedTier === 'ads_performance' && hasProrataCredit ? '(Tagihan Prorata)' : '/ bulan'}
                        </span>
                      </div>
                      {selectedTier === 'ads_performance' && hasProrataCredit && (
                        <span className="text-[10px] text-slate-500 line-through font-mono">
                          Rp 299.000
                        </span>
                      )}
                    </div>

                    {selectedTier === 'ads_performance' && isLoadingPreview && (
                      <div className="text-[10px] text-blue-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Menghitung kalkulasi prorata...</span>
                      </div>
                    )}
                  </div>

                  {/* Kelebihan Resmi */}
                  <div className="space-y-2.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Kelebihan Utama:
                    </span>
                    <ul className="space-y-2 text-xs text-slate-300">
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Meta &amp; TikTok CAPI Server-Side</strong> (Tracking akurat anti iOS block)
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>God Button Tracking</strong> Konversi Otomatis
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>2 Seats CS Inbox</strong> (Multi-Admin Rotasi Otomatis)
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Advanced Funnel Analytics</strong> &amp; Real-Time Tracking
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Tombol CTA Upgrade Xendit */}
                <div className="pt-6">
                  <button
                    type="button"
                    disabled={loadingCheckoutTier !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckoutXendit('ads_performance');
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-600/20 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loadingCheckoutTier === 'ads_performance' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menghubungkan Xendit...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-yellow-300" />
                        <span>Upgrade Sekarang (Ads Performance)</span>
                        <ArrowRight className="w-4 h-4 opacity-70" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* KARTU 2: TEAM SCALE (ENTERPRISE) */}
              <div
                onClick={() => {
                  setSelectedTier('team_scale');
                }}
                className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 border transition-all duration-200 cursor-pointer ${
                  selectedTier === 'team_scale'
                    ? 'bg-gradient-to-b from-purple-950/40 via-slate-900 to-slate-900 border-purple-500/50 shadow-xl shadow-purple-500/10 ring-1 ring-purple-500/30'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-4">
                  {/* Badge Header */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      SKALA BESAR &bull; OFFICIAL WABA
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">ENTERPRISE</span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-purple-400" />
                      <span>Team Scale</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Infrastruktur resmi WABA bebas blokir &amp; broadcast massal.
                    </p>
                  </div>

                  {/* Nominal Harga & Label Prorata */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl sm:text-2xl font-black text-white font-mono">
                          {selectedTier === 'team_scale' && previewData?.final_upgrade_amount !== undefined
                            ? `Rp ${previewData.final_upgrade_amount.toLocaleString('id-ID')}`
                            : 'Rp 499.000'}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedTier === 'team_scale' && hasProrataCredit ? '(Tagihan Prorata)' : '/ bulan'}
                        </span>
                      </div>
                      {selectedTier === 'team_scale' && hasProrataCredit && (
                        <span className="text-[10px] text-slate-500 line-through font-mono">
                          Rp 499.000
                        </span>
                      )}
                    </div>

                    {selectedTier === 'team_scale' && isLoadingPreview && (
                      <div className="text-[10px] text-purple-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Menghitung kalkulasi prorata...</span>
                      </div>
                    )}
                  </div>

                  {/* Kelebihan Resmi */}
                  <div className="space-y-2.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Kelebihan Utama:
                    </span>
                    <ul className="space-y-2 text-xs text-slate-300">
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Official Meta Cloud API</strong> (WABA Centang Hijau Resmi Bebas Blokir)
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Unlimited CS Seats</strong> (Bebas Tambah Admin CS Tanpa Batas)
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>WhatsApp Broadcast</strong> Mesin Promosi Massal
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Custom Domain Toko Pribadi</strong> + Free SSL Certificate
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Tombol CTA Upgrade Xendit */}
                <div className="pt-6">
                  <button
                    type="button"
                    disabled={loadingCheckoutTier !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckoutXendit('team_scale');
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-purple-600/20 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loadingCheckoutTier === 'team_scale' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menghubungkan Xendit...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-yellow-300" />
                        <span>Upgrade Sekarang (Team Scale)</span>
                        <ArrowRight className="w-4 h-4 opacity-70" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* BOX RINCIAN KALKULASI TRANSPARAN (PRORATA ATAU TRIAL)   */}
            {/* ======================================================== */}
            {previewData && (
              <div className="rounded-2xl border p-4 transition-all duration-200 bg-slate-950/70 border-slate-800">
                {hasProrataCredit ? (
                  /* Case 1: Upgrade Prorata (credit_amount > 0) */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                        <Calculator className="w-4 h-4 text-indigo-400" />
                        <span>Rincian Tagihan Prorata Transparan</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        Paket: {previewData.target_tier}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">• Sisa Periode Aktif:</span>
                        <span className="font-mono font-bold text-white">
                          {previewData.days_remaining} Hari
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">• Kredit Paket Lama:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          -Rp {previewData.credit_amount.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 text-sm font-black">
                        <span className="text-white">• Total Biaya Upgrade:</span>
                        <span className="font-mono text-emerald-400 text-base">
                          Rp {previewData.final_upgrade_amount.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                      *Formula: <code>(sisa_hari / 30) × (harga_baru - harga_lama)</code>. Tanggal perpanjangan siklus Anda tetap berlaku pada {previewData.renewal_date ? new Date(previewData.renewal_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}.
                    </p>
                  </div>
                ) : (
                  /* Case 2: Masih Masa Trial / Harga Normal 30 Hari */
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-slate-200 font-bold block">
                          Periode Langganan Penuh 30 Hari
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {previewData.is_trial
                            ? 'Masa Trial aktif. Mengupgrade sekarang akan mengaktifkan paket penuh 30 hari resmi.'
                            : `Harga normal 30 hari untuk paket ${previewData.target_tier}.`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-400 font-mono">
                        Rp {previewData.final_upgrade_amount.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-slate-400 block">/ 30 hari</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Alternatif Pembayaran: Bayar Langsung via QRIS / WhatsApp */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setViewMode('qris_direct')}
                className="hover:text-blue-400 underline underline-offset-4 flex items-center gap-1.5 transition cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-400" />
                <span>Atau scan QRIS langsung di sini (M-Banking / E-Wallet)</span>
              </button>

              <a
                href={`https://wa.me/${getPlatformWhatsApp()}?text=${waConfirmText}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Bantuan CS WhatsApp</span>
              </a>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* TAMPILAN QRIS DIRECT & SCAN INSTAN (FALLBACK / ALTERNATIF) */
          /* ======================================================== */
          <>
            {/* Header QRIS View */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 pr-6">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold cursor-pointer"
              >
                <span>&larr; Kembali ke Pilihan Paket</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTier('ads_performance')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                    !isTeam
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  Ads ({previewData?.target_tier === 'PRO_SCALE' && hasProrataCredit ? `Rp ${activeAmount.toLocaleString('id-ID')}` : '299k'})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTier('team_scale')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                    isTeam
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  Team ({previewData?.target_tier === 'ENTERPRISE' && hasProrataCredit ? `Rp ${activeAmount.toLocaleString('id-ID')}` : '499k'})
                </button>
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-lg font-black text-white">
                Scan QRIS Upgrade ke {tierName}
              </h2>
              <p className="text-xs text-slate-400">
                Mendukung GoPay, OVO, Dana, ShopeePay, BCA, Mandiri &amp; Seluruh M-Banking.
              </p>
            </div>

            {/* Nominal Box (Menggunakan Kalkulasi Prorata) */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">Total Tagihan:</span>
                {hasProrataCredit && (
                  <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                    Prorata
                  </span>
                )}
              </div>
              <span className="text-base font-black text-emerald-400 font-mono">
                Rp {activeAmount.toLocaleString('id-ID')}
              </span>
            </div>

            {/* Card QRIS Dynamic */}
            <div className="bg-white rounded-2xl p-4 text-center space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-[11px]">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>Scan QRIS untuk Bayar</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-rose-600">
                  <Clock className="w-3 h-3" />
                  <span>{formattedTime}</span>
                </div>
              </div>

              {/* QR Render */}
              <div className="flex justify-center p-1 bg-white rounded-xl">
                <QRCodeSVG
                  value={qrisValue}
                  size={190}
                  level="M"
                  includeMargin={true}
                  className="rounded-lg shadow-xs"
                />
              </div>

              <div className="text-[10px] text-slate-500 leading-tight">
                QRIS otomatis tersinkronisasi. Sistem akan memverifikasi dalam 3-5 detik.
              </div>
            </div>

            {/* Polling Indicator */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-800/40 py-2 rounded-xl border border-slate-800/60">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>Menunggu pembayaran... Sistem mengecek otomatis</span>
            </div>

            {/* Aksi Checkout Xendit Eksternal atau WhatsApp */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
              <button
                type="button"
                disabled={loadingCheckoutTier !== null}
                onClick={() => handleCheckoutXendit(selectedTier)}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Bayar via Halaman Checkout Xendit Platform</span>
              </button>

              <a
                href={`https://wa.me/${getPlatformWhatsApp()}?text=${waConfirmText}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-2 transition text-center"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Konfirmasi via WhatsApp Resmi</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
