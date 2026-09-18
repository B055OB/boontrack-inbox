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
  Bot,
  Users,
  Radio,
  Globe,
  TrendingUp,
  CreditCard,
  ChevronRight,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1';

const UPGRADE_EXPIRE_SECONDS = 30 * 60; // 30 menit

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
  const normCurrentTier = String(currentTier || 'STARTER').toUpperCase();
  const isCurrentlyStarter =
    normCurrentTier.includes('STARTER') ||
    normCurrentTier.includes('SOLO') ||
    normCurrentTier.includes('TRIAL') ||
    normCurrentTier === 'FREE';

  // Selected plan state for payment view: 'pro_scale' (Rp 299.000) or 'team_scale' (Rp 499.000)
  const [selectedTier, setSelectedTier] = useState<'ads_performance' | 'team_scale'>(
    targetTier || 'ads_performance'
  );

  // Mode: 'cards' (pilihan komparasi 2 kartu) vs 'qris_direct' (tampilan QRIS langsung)
  const [viewMode, setViewMode] = useState<'cards' | 'qris_direct'>('cards');
  const [loadingCheckoutTier, setLoadingCheckoutTier] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isTeam = selectedTier === 'team_scale';
  const amount = isTeam ? 499000 : 299000;
  const tierName = isTeam ? 'Team Scale' : 'Ads Performance';

  const [timeLeft, setTimeLeft] = useState(UPGRADE_EXPIRE_SECONDS);
  const [pollStatus, setPollStatus] = useState<'polling' | 'paid' | 'expired'>('polling');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qrisValue = generateDynamicQRIS(STATIC_QRIS, amount);

  const stopAll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Sync targetTier jika berubah dari luar
  useEffect(() => {
    if (targetTier) {
      setSelectedTier(targetTier);
    }
  }, [targetTier]);

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
    `Halo Tim BoonTrack, saya ingin konfirmasi pembayaran upgrade toko "${displayName}" (${tenantSlug}) ke paket ${tierName} (Rp ${amount.toLocaleString('id-ID')}). Mohon aktivasi fiturnya.`
  );

  // Handler checkout subscription Xendit
  const handleCheckoutXendit = async (tier: 'ads_performance' | 'team_scale') => {
    setSelectedTier(tier);
    setLoadingCheckoutTier(tier);
    setCheckoutError(null);

    const canonicalPlanTier = tier === 'team_scale' ? 'ENTERPRISE' : 'PRO_SCALE';
    const planAmount = tier === 'team_scale' ? 499000 : 299000;

    try {
      // Panggil endpoint pembuatan subscription Xendit platform
      const res = await fetch('/api/v1/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          plan_tier: canonicalPlanTier,
          amount: planAmount,
          merchant_name: displayName,
        }),
      });

      const data = await res.json();
      if (data.invoice_url) {
        // Redirect ke link invoice resmi Xendit
        window.location.href = data.invoice_url;
        return;
      }

      // Fallback jika tidak ada direct invoice_url: arahkan ke tampilan QRIS in-modal
      setViewMode('qris_direct');
    } catch (err: unknown) {
      console.warn('[Upgrade Checkout Error]:', err);
      setCheckoutError('Gagal menghubungkan ke Xendit. Anda dapat melakukan pembayaran langsung via QRIS di bawah.');
      setViewMode('qris_direct');
    } finally {
      setLoadingCheckoutTier(null);
    }
  };

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
          /* TAMPILAN 2 KARTU PILIHAN UPGRADE SEKALIGUS (STARTER/SOLO) */
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
                className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 border transition-all duration-200 ${
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
                      Spesialisasi optimasi Facebook/TikTok Ads & konversi tinggi.
                    </p>
                  </div>

                  {/* Nominal Harga */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-white font-mono">
                      Rp 299.000
                    </span>
                    <span className="text-xs text-slate-400 font-medium">/ bulan</span>
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
                    onClick={() => handleCheckoutXendit('ads_performance')}
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
                        <span>Upgrade ke Ads Performance</span>
                        <ArrowRight className="w-4 h-4 opacity-70" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* KARTU 2: TEAM SCALE (ENTERPRISE) */}
              <div
                className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 border transition-all duration-200 ${
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

                  {/* Nominal Harga */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-white font-mono">
                      Rp 499.000
                    </span>
                    <span className="text-xs text-slate-400 font-medium">/ bulan</span>
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
                    onClick={() => handleCheckoutXendit('team_scale')}
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
                        <span>Upgrade ke Team Scale</span>
                        <ArrowRight className="w-4 h-4 opacity-70" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Alternatif Pembayaran: Bayar Langsung via QRIS / WhatsApp */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
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
                  Ads (299k)
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
                  Team (499k)
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

            {/* Nominal Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Tagihan:</span>
              <span className="text-base font-black text-emerald-400 font-mono">
                Rp {amount.toLocaleString('id-ID')}
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
