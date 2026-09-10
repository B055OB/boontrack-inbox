'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Lock,
  Zap,
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Target,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

const STATIC_QRIS =
  process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS ||
  '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1';

const UPGRADE_EXPIRE_SECONDS = 30 * 60; // 30 menit

interface UpgradePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  displayName: string;
  targetTier?: 'ads_performance' | 'team_scale';
  onSuccess?: () => void;
}

export default function UpgradePaymentModal({
  isOpen,
  onClose,
  tenantSlug,
  displayName,
  targetTier = 'ads_performance',
  onSuccess,
}: UpgradePaymentModalProps) {
  const isTeam = targetTier === 'team_scale';
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

  // Countdown timer
  useEffect(() => {
    if (!isOpen) return;
    setTimeLeft(UPGRADE_EXPIRE_SECONDS);
    setPollStatus('polling');

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
          upper === 'TEAM_SCALE'
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
        // Toleransi error jaringan polling
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

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 text-slate-100 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        {/* Tombol Tutup */}
        <button
          type="button"
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* State Sukses */}
        {pollStatus === 'paid' ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Pembayaran Dikonfirmasi!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Paket toko <span className="font-bold text-emerald-400">{tenantSlug}</span> berhasil di-upgrade ke <span className="font-bold text-white">{tierName}</span>.
              </p>
            </div>
            <p className="text-[11px] text-slate-500">Memperbarui dashboard Anda...</p>
          </div>
        ) : (
          <>
            {/* Header Modal */}
            <div className="text-center space-y-1 pr-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span>Upgrade Langsung &bull; QRIS Resmi</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                Upgrade ke {tierName}
              </h2>
              <p className="text-xs text-slate-400">
                Buka akses penuh Server-Side CAPI, Ads Tracking & AI Assistant
              </p>
            </div>

            {/* Nominal Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Tagihan Upgrade:</span>
              <span className="text-base font-black text-emerald-400">
                Rp {amount.toLocaleString('id-ID')}
              </span>
            </div>

            {/* Card QRIS Dynamic Ready-to-scan */}
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
                Mendukung GoPay, OVO, Dana, ShopeePay, BCA, Mandiri & Seluruh M-Banking.
              </div>
            </div>

            {/* Polling Indicator */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-800/40 py-2 rounded-xl border border-slate-800/60">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>Menunggu pembayaran... Sistem mengecek otomatis</span>
            </div>

            {/* Benefit List Singkat */}
            <div className="space-y-1.5 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Integrasi Meta CAPI Server-Side & ROAS Tracking riil</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Pelacakan Multi-Pixel tanpa blokir adblocker iOS 14+</span>
              </div>
            </div>

            {/* Alternatif Konfirmasi WhatsApp */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
              <a
                href={`https://wa.me/${getPlatformWhatsApp()}?text=${waConfirmText}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Konfirmasi via WhatsApp Resmi</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  stopAll();
                  onClose();
                }}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition py-1 text-center"
              >
                Tutup & Lanjutkan di Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
