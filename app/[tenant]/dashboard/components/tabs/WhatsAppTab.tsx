'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Smartphone,
  Lock,
  ShieldCheck,
  Sparkles,
  Loader2,
  CheckCircle2,
  QrCode,
  AlertTriangle,
  RefreshCw,
  PhoneCall,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import WhatsAppWabaConfig from '../WhatsAppWabaConfig';

interface WhatsAppTabProps {
  tenantSlug: string;
  displayName: string;
  waMode: 'qr' | 'meta';
  setWaMode: (mode: 'qr' | 'meta') => void;
  waStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  setWaStatus: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED') => void;
  qrCodeUrl: string | null;
  setQrCodeUrl: (url: string | null) => void;
  isQrLoading: boolean;
  waErrorMessage: string | null;
  connectedPhone: string | null;
  setConnectedPhone: (phone: string | null) => void;
  pairingPhone: string;
  setPairingPhone: (phone: string) => void;
  pairingCodeResult: string | null;
  isPairingLoading: boolean;
  handleConnectGrowthSession: () => Promise<void>;
  handleRequestPairingCode: (e: React.FormEvent) => Promise<void>;
  botStrategy?: 'trust_builder' | 'balanced' | 'hard_selling';
  setBotStrategy?: (strategy: 'trust_builder' | 'balanced' | 'hard_selling') => void;
  handleSaveBotStrategy?: (strategyOverride?: 'trust_builder' | 'balanced' | 'hard_selling') => Promise<void>;
  isSavingStrategy?: boolean;
  isLoadingAi?: boolean;
  strategyFeedback?: string | null;
  isProScale: boolean;
  renderLockedFeatureCard: (props: {
    title: string;
    badge: string;
    description: string;
    targetTier: 'ads_performance' | 'team_scale';
    targetTierLabel: string;
  }) => React.ReactNode;
  setSaveFeedback: (msg: string | null) => void;
}

export default function WhatsAppTab({
  tenantSlug,
  displayName,
  waMode,
  setWaMode,
  waStatus,
  setWaStatus,
  qrCodeUrl,
  setQrCodeUrl,
  isQrLoading,
  waErrorMessage,
  connectedPhone,
  setConnectedPhone,
  pairingPhone,
  setPairingPhone,
  pairingCodeResult,
  isPairingLoading,
  handleConnectGrowthSession,
  handleRequestPairingCode,
  botStrategy,
  setBotStrategy,
  handleSaveBotStrategy,
  isSavingStrategy,
  isLoadingAi,
  strategyFeedback,
  isProScale,
  renderLockedFeatureCard,
  setSaveFeedback,
}: WhatsAppTabProps) {
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code to clipboard', err);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <span>Pengaturan Gateway WhatsApp Bot</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pilih metode koneksi bot sesuai dengan kebutuhan dan paket langganan Anda.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200 self-start sm:self-auto items-center">
          <button
            type="button"
            onClick={() => setWaMode('qr')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              waMode === 'qr'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>BoonTrack Direct Connect</span>
          </button>
          <button
            type="button"
            onClick={() => setWaMode('meta')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              waMode === 'meta'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {!isProScale ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span>Meta Cloud API (WABA)</span>
            {!isProScale && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                PROSCALE
              </span>
            )}
          </button>
        </div>
      </div>

      {/* GROWTH PLAN PANEL */}
      {waMode === 'qr' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">BoonTrack Direct Connect</h3>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                  BoonTrack WhatsApp Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xl">
                Koneksi mandiri via BoonTrack WhatsApp Engine untuk menghasilkan sesi perangkat QR aktif dan sinkronisasi chat real-time.
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <QrCode className="w-5 h-5" />
            </div>
          </div>

          {waStatus === 'DEGRADED' && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-900">BoonTrack WhatsApp Engine Belum Terjangkau</h4>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    {waErrorMessage || 'Layanan BoonTrack WhatsApp Engine sedang offline. QR Code tidak dapat dimuat sampai engine diaktifkan.'}
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <button
                  onClick={handleConnectGrowthSession}
                  disabled={isQrLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer"
                >
                  {isQrLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Cek Ulang Koneksi Engine</span>
                </button>
              </div>
            </div>
          )}

          {waStatus !== 'CONNECTED' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <span>Buka aplikasi <strong>WhatsApp</strong> di HP Anda.</span>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <span>Ketuk menu titik tiga (Android) atau <strong>Pengaturan</strong> (iPhone) &gt; pilih <strong>Perangkat Tertaut</strong>.</span>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-slate-700 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <span>Arahkan kamera HP Anda ke QR Code atau gunakan opsi nomor telepon di bawah.</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleConnectGrowthSession}
                    disabled={isQrLoading}
                    className="px-5 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    {isQrLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menghubungkan ke BoonTrack WhatsApp Engine...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Muat Ulang Sesi & QR Code</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                    <PhoneCall className="w-4 h-4 text-blue-600" />
                    <span>Atau Tautkan dengan Nomor WhatsApp Saja</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Solusi jika kamera HP bermasalah saat scan QR. Masukkan nomor WhatsApp aktif Anda (awali 62):
                  </p>

                  <form onSubmit={handleRequestPairingCode} className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      placeholder="628xxxxxxxxxx"
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isPairingLoading}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
                    >
                      {isPairingLoading ? 'Memproses...' : 'Dapatkan Kode'}
                    </button>
                  </form>

                  {pairingCodeResult && (
                    <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-center space-y-3 mt-3 shadow-xs">
                      <div>
                        <span className="inline-block px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-full mb-1">
                          Kode Pairing WhatsApp Resmi
                        </span>
                        <p className="text-xs text-emerald-900 font-medium">
                          Masukkan 8 digit kode ini di WhatsApp HP Anda:
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <div className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-emerald-900 bg-white py-2.5 px-5 rounded-xl border border-emerald-300 shadow-sm select-all">
                          {pairingCodeResult}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(pairingCodeResult)}
                          className="flex items-center gap-1.5 px-3 py-2.5 bg-white hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-300 transition shadow-sm cursor-pointer"
                          title="Salin Kode Pairing"
                        >
                          {hasCopied ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-600" />
                              <span className="text-emerald-700">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 text-emerald-600" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-600 bg-emerald-100/60 p-2.5 rounded-xl text-left space-y-1 border border-emerald-200/60">
                        <p className="font-semibold text-emerald-900">Cara tautkan di HP:</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-slate-700 pl-1 text-[11px]">
                          <li>Buka WhatsApp di HP Anda</li>
                          <li>Buka <strong>Pengaturan</strong> atau Menu (titik tiga) &gt; <strong>Perangkat Tertaut</strong></li>
                          <li>Pilih <strong>Tautkan Perangkat</strong> lalu ketuk <strong>Tautkan dengan nomor telepon saja</strong></li>
                          <li>Ketikkan 8 karakter kode di atas</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-6 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                {isQrLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-xs text-slate-500 font-medium">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <span>Mengambil token autentikasi dari proxy server...</span>
                  </div>
                ) : qrCodeUrl ? (
                  <div className="flex flex-col items-center justify-center text-center space-y-3">
                    <img
                      src={qrCodeUrl}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 object-contain"
                    />
                    <p className="text-[11px] font-bold text-slate-400 font-mono">
                      SESI TENANT: {tenantSlug.toUpperCase()}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <Smartphone className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-400">
                      Disediakan WhatsApp
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {waStatus === 'CONNECTED' && (
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-emerald-900">WhatsApp Nomor Pribadi / Toko Terhubung Aktif</h4>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Nomor: <strong>+{connectedPhone || '-'}</strong> • Status: <strong>CONNECTED</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setWaStatus('DISCONNECTED');
                  setQrCodeUrl(null);
                }}
                className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Putuskan Sesi
              </button>
            </div>
          )}
        </div>
      )}

      {/* PRO SCALE PANEL */}
      {waMode === 'meta' && (
        !isProScale ? (
          renderLockedFeatureCard({
            title: 'Koneksi Resmi Meta Cloud API (Official WABA)',
            badge: 'Fitur Eksklusif Team Scale',
            description: 'Integrasikan nomor WhatsApp bisnis resmi dengan Meta Cloud API (Official WABA) centang hijau, webhook instan berkecepatan tinggi, dan proteksi anti-banned.',
            targetTier: 'team_scale',
            targetTierLabel: 'Team Scale',
          })
        ) : (
          <div className="space-y-4">
            <WhatsAppWabaConfig
              tenantSlug={tenantSlug}
              displayName={displayName}
              onSuccess={(data) => {
                setConnectedPhone(data.phone_number || 'Official WABA');
                setWaStatus('CONNECTED');
                setSaveFeedback('✅ Kredensial Resmi WABA berhasil diaktifkan!');
                setTimeout(() => setSaveFeedback(null), 4000);
              }}
              onSaved={(msg) => {
                setSaveFeedback(msg);
                setTimeout(() => setSaveFeedback(null), 4000);
              }}
            />
          </div>
        )
      )}
    </div>
  );
}
