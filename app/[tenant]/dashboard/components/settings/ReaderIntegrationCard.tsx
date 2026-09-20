'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Download,
  X,
  Radio,
  Clock,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export interface DeviceInfo {
  is_connected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED';
  device_name: string | null;
  device_id?: string | null;
  paired_at?: string | null;
  last_active_at?: string | null;
}

export interface ReaderIntegrationCardProps {
  tenantSlug: string;
  tenantId?: string;
  onSavedFeedback?: (msg: string) => void;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Belum ada aktivitas';
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 30) return 'Baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    if (diffMin < 60) return `${diffMin} menit lalu`;
    if (diffHour < 24) return `${diffHour} jam lalu`;
    return `${diffDay} hari lalu`;
  } catch {
    return dateStr;
  }
}

export default function ReaderIntegrationCard({
  tenantSlug,
  tenantId,
  onSavedFeedback,
}: ReaderIntegrationCardProps) {
  // Device Status State
  const [device, setDevice] = useState<DeviceInfo>({
    is_connected: false,
    status: 'DISCONNECTED',
    device_name: null,
    paired_at: null,
    last_active_at: null,
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);

  // Pairing Modal State
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [isGeneratingPairing, setIsGeneratingPairing] = useState(false);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);
  const [isPairingSuccess, setIsPairingSuccess] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Guide Modal State
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── 1. Fetch Current Device Status ──────────────────────────────────────────
  const fetchDeviceStatus = useCallback(async () => {
    if (!tenantSlug && !tenantId) return;
    try {
      const q = new URLSearchParams();
      if (tenantId) q.set('tenant_id', tenantId);
      if (tenantSlug) q.set('tenant_slug', tenantSlug);

      const res = await fetch(`/api/v1/reader/device/status?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.device) {
          setDevice(data.device);
          return data.device;
        }
      }
    } catch (err) {
      console.warn('[ReaderIntegrationCard] Status error:', err);
    } finally {
      setIsLoadingStatus(false);
    }
    return null;
  }, [tenantSlug, tenantId]);

  useEffect(() => {
    fetchDeviceStatus();
  }, [fetchDeviceStatus]);

  // ── 2. Create Pairing Session (One-Time Token TTL 5 Min) ────────────────────
  const generatePairingSession = useCallback(async () => {
    setIsGeneratingPairing(true);
    setPairingError(null);
    setIsPairingSuccess(false);

    try {
      const res = await fetch('/api/v1/reader/pairing/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_slug: tenantSlug,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.pairing_token) {
        setPairingToken(data.pairing_token);
        setQrUri(data.qr_uri || `btreader://pair?token=${data.pairing_token}`);
        setExpiresAt(data.expires_at);

        // Hitung sisa detik dari expires_at
        const diffSec = Math.max(
          0,
          Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000)
        );
        setSecondsLeft(diffSec > 0 ? diffSec : 300);
      } else {
        throw new Error(data.error || 'Gagal membuat sesi pairing dari server');
      }
    } catch (err: any) {
      setPairingError(err.message || 'Koneksi gagal. Silakan coba lagi.');
    } finally {
      setIsGeneratingPairing(false);
    }
  }, [tenantId, tenantSlug]);

  // Open Pairing Modal
  const handleOpenPairingModal = () => {
    setIsPairingModalOpen(true);
    generatePairingSession();
  };

  // Close Pairing Modal
  const handleClosePairingModal = () => {
    setIsPairingModalOpen(false);
    setPairingToken(null);
    setQrUri(null);
    setIsPairingSuccess(false);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  };

  // ── 3. Countdown Timer (5 Menit) ────────────────────────────────────────────
  useEffect(() => {
    if (!isPairingModalOpen || !expiresAt) return;

    countdownTimerRef.current = setInterval(() => {
      const diffSec = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (diffSec <= 0) {
        setSecondsLeft(0);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      } else {
        setSecondsLeft(diffSec);
      }
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isPairingModalOpen, expiresAt]);

  // ── 4. Live Poller saat Modal Pairing Terbuka ────────────────────────────────
  useEffect(() => {
    if (!isPairingModalOpen || secondsLeft <= 0 || isPairingSuccess) return;

    pollIntervalRef.current = setInterval(async () => {
      const currentDev = await fetchDeviceStatus();
      if (currentDev && currentDev.is_connected) {
        setIsPairingSuccess(true);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        if (onSavedFeedback) {
          onSavedFeedback('🎉 HP Reader berhasil terhubung!');
        }

        setTimeout(() => {
          handleClosePairingModal();
        }, 1800);
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isPairingModalOpen, secondsLeft, isPairingSuccess, fetchDeviceStatus, onSavedFeedback]);

  // ── 5. Revoke Device Connection ─────────────────────────────────────────────
  const handleRevokeDevice = async () => {
    if (
      !window.confirm(
        'Apakah Anda yakin ingin memutuskan hubungan HP Reader ini? Notifikasi pembayaran otomatis akan dihentikan sampai perangkat dihubungkan kembali.'
      )
    ) {
      return;
    }

    setIsRevoking(true);
    try {
      const res = await fetch('/api/v1/reader/device/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_slug: tenantSlug,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDevice({
          is_connected: false,
          status: 'DISCONNECTED',
          device_name: null,
          paired_at: null,
          last_active_at: null,
        });
        if (onSavedFeedback) {
          onSavedFeedback('Akses HP Reader berhasil diputuskan.');
        }
      } else {
        alert(data.error || 'Gagal memutuskan akses perangkat');
      }
    } catch (err: any) {
      alert(err.message || 'Koneksi gagal saat memutuskan perangkat');
    } finally {
      setIsRevoking(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const copyTokenToClipboard = () => {
    if (!pairingToken) return;
    navigator.clipboard.writeText(pairingToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* ── HEADER KARTU ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Integrasi HP Reader (Automasi Mutasi)
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                0% MDR • Bebas Potongan
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifikasi pembayaran QRIS &amp; transfer bank otomatis dalam hitungan detik via aplikasi Android BoonTrack Reader.
            </p>
          </div>
        </div>

        {/* Action Button: Hubungkan / Status Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {!device.is_connected ? (
            <button
              type="button"
              onClick={handleOpenPairingModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Hubungkan HP Reader</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenPairingModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Pairing Ulang Perangkat</span>
            </button>
          )}
        </div>
      </div>

      {/* ── KARTU STATUS PERANGKAT TERHUBUNG (DEVICE STATUS CARD) ─────────────── */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          device.is_connected
            ? 'bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white border-emerald-200'
            : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                device.is_connected
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200/70 text-slate-500'
              }`}
            >
              {device.is_connected ? (
                <Radio className="w-5 h-5 text-emerald-600 animate-pulse" />
              ) : (
                <Smartphone className="w-5 h-5 text-slate-400" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500">Status Gateway Reader:</span>
                {isLoadingStatus ? (
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa status...
                  </span>
                ) : device.is_connected ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>Terhubung (Online)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>Terputus / Belum Ditautkan</span>
                  </span>
                )}
              </div>

              {device.is_connected ? (
                <div className="pt-0.5 space-y-0.5">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>📱 {device.device_name || 'BoonTrack Reader Android'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Aktif: <strong className="text-slate-700">{formatRelativeTime(device.last_active_at)}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Ditautkan: <strong className="text-slate-700">{formatRelativeTime(device.paired_at)}</strong>
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Belum ada smartphone Android toko yang terhubung. Hubungkan HP Anda menggunakan tombol &quot;Hubungkan HP Reader&quot; di atas untuk mengaktifkan verifikasi mutasi real-time.
                </p>
              )}
            </div>
          </div>

          {/* Action Row: Revoke / Refresh */}
          {device.is_connected && (
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={handleRevokeDevice}
                disabled={isRevoking}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isRevoking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>Putuskan Hubungan / Revoke</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── FITUR & BENEFIT HIGHLIGHT ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-start gap-2.5">
          <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900">Verifikasi 1–3 Detik</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Order lunas otomatis seketika saat SMS / push notifikasi bank terdeteksi di HP toko.
            </p>
          </div>
        </div>

        <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900">Dukung Semua QRIS Populer</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Kompatibel dengan DANA Bisnis, BCA Mobile/myBCA, GoPay Usaha, Livin Mandiri &amp; BRImo.
            </p>
          </div>
        </div>

        <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900">Anti Bukti Transfer Palsu</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Sistem mencocokkan nominal pasti + kode unik langsung dari mutasi riil, bukan screenshot struk.
            </p>
          </div>
        </div>
      </div>

      {/* ── PANDUAN RINGKAS 3 LANGKAH PEMAKAIAN ───────────────────────────── */}
      <div className="p-4 bg-slate-50/90 border border-slate-200/90 rounded-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <span>🚀</span>
            <span>Panduan 3 Langkah Menghubungkan BoonTrack Reader</span>
          </span>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Setup Sekali • Otomatis Selamanya
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shrink-0">1</span>
              <p className="font-bold text-slate-900">Unduh &amp; Pasang APK</p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Unduh dan pasang aplikasi BoonTrack Reader di HP Android kasir / DANA toko Anda.
            </p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shrink-0">2</span>
              <p className="font-bold text-slate-900">Izinkan Notifikasi</p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Aktifkan izin akses notifikasi untuk BoonTrack Reader di menu pengaturan Android Anda.
            </p>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shrink-0">3</span>
              <p className="font-bold text-slate-900">Scan QR Pairing</p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Buka aplikasi, klik <strong>&quot;Hubungkan ke Toko&quot;</strong>, lalu scan QR Pairing di atas.
            </p>
          </div>
        </div>

        {/* Download & Action Buttons */}
        <div className="pt-1 flex flex-wrap items-center gap-2.5">
          <a
            href="https://assets.boontrack.com/apps/boontrack-reader.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download BoonTrack Reader (APK Android)</span>
            <ExternalLink className="w-3 h-3 text-emerald-200" />
          </a>

          <button
            type="button"
            onClick={() => setIsGuideModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <span>Buka Detail Petunjuk Instalasi</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ── MODAL PAIRING QR CODE (ONE-TIME TOKEN TTL 5 MENIT) ───────────────── */}
      {/* ===================================================================== */}
      {isPairingModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 relative">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 font-bold">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Hubungkan HP Reader Toko
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Scan QR dengan aplikasi BoonTrack Reader di Android
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePairingModal}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            {isPairingSuccess ? (
              /* Success State */
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-90 duration-200">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">
                    HP Reader Berhasil Ditautkan!
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Gateway pembayaran mutasi otomatis toko Anda sudah aktif 100%.
                  </p>
                </div>
              </div>
            ) : isGeneratingPairing ? (
              /* Loading State */
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-xs font-bold text-slate-700">
                  Membuat Sesi Pairing Aman (One-Time Token)...
                </p>
              </div>
            ) : pairingError ? (
              /* Error State */
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-500" />
                <p className="text-xs font-bold text-slate-800">{pairingError}</p>
                <button
                  type="button"
                  onClick={generatePairingSession}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Coba Lagi
                </button>
              </div>
            ) : (
              /* Normal Pairing QR & Timer State */
              <div className="space-y-4">
                {/* Security Tag */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-bold">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>One-Time Pairing Token (TTL 5 Menit)</span>
                  </span>
                  <span className="font-mono text-emerald-900 bg-white px-2 py-0.5 rounded-md border border-emerald-100">
                    {secondsLeft > 0 ? formatTimer(secondsLeft) : 'EXPIRED'}
                  </span>
                </div>

                {/* QR Code Container with Blur on Expiry */}
                <div className="relative flex flex-col items-center justify-center p-5 bg-white border border-slate-200 rounded-2xl shadow-inner min-h-[260px]">
                  {qrUri && (
                    <div
                      className={`transition-all duration-300 ${
                        secondsLeft <= 0 ? 'blur-md opacity-30 select-none' : ''
                      }`}
                    >
                      <QRCodeSVG
                        value={qrUri}
                        size={210}
                        level="H"
                        includeMargin
                        className="rounded-lg"
                      />
                    </div>
                  )}

                  {/* Expired Overlay */}
                  {secondsLeft <= 0 && (
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center p-4 text-center space-y-2.5 animate-in fade-in">
                      <Clock className="w-8 h-8 text-amber-400" />
                      <div>
                        <p className="text-xs font-black text-white">QR Code Kadaluarsa</p>
                        <p className="text-[11px] text-slate-200 mt-0.5">
                          Batas waktu pairing 5 menit telah habis.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={generatePairingSession}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Generate Ulang QR</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Countdown Progress & Live Poller Indicator */}
                {secondsLeft > 0 && (
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Menunggu pemindaian dari HP...</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Arahkan kamera aplikasi Reader ke QR code di atas sebelum waktu habis ({formatTimer(secondsLeft)}).
                    </p>
                  </div>
                )}

                {/* 3 Step Instruction */}
                <div className="space-y-1.5 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-black text-[9px] flex items-center justify-center shrink-0">1</span>
                    <span>Buka aplikasi <strong>BoonTrack Reader</strong> di HP Android toko.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-black text-[9px] flex items-center justify-center shrink-0">2</span>
                    <span>Tekan menu <strong>Pairing Perangkat / Scan QR</strong>.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-black text-[9px] flex items-center justify-center shrink-0">3</span>
                    <span>Arahkan kamera ke QR di atas untuk mengaktifkan otomasi.</span>
                  </div>
                </div>

                {/* Manual Token Fallback */}
                {pairingToken && (
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-100/70 rounded-xl text-[10px] text-slate-500">
                    <span className="font-mono truncate max-w-[240px]">Token: {pairingToken}</span>
                    <button
                      type="button"
                      onClick={copyTokenToClipboard}
                      className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedToken ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Token</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ── MODAL PANDUAN INSTALASI BOONTRACK READER APK ────────────────────── */}
      {/* ===================================================================== */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 font-bold">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Panduan &amp; Pasang BoonTrack Reader
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verifikasi mutasi QRIS otomatis 100% tanpa biaya perantara (0% MDR)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <p className="font-bold text-slate-900">Unduh &amp; Pasang Aplikasi</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Unduh dan pasang aplikasi BoonTrack Reader di HP Android kasir / DANA toko Anda melalui tombol download di bawah.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <p className="font-bold text-slate-900">Aktifkan Izin Akses Notifikasi</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Buka Pengaturan Android &gt; Notifikasi &gt; Akses Notifikasi (Notification Access), lalu aktifkan izin untuk BoonTrack Reader agar aplikasi dapat membaca mutasi pembayaran masuk secara instan.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div>
                  <p className="font-bold text-slate-900">Hubungkan via Scan QR Pairing</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Buka aplikasi BoonTrack Reader, tekan tombol <strong>&quot;Hubungkan ke Toko&quot;</strong>, lalu scan QR Pairing yang ada di dashboard ini. Perangkat Anda akan langsung online dan siap menerima verifikasi otomatis!
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <a
                href="https://assets.boontrack.com/apps/boontrack-reader.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>Download BoonTrack Reader (APK Android)</span>
              </a>
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="w-full sm:w-auto px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
