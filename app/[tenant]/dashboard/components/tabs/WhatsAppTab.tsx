'use client';

import React from 'react';
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
  botStrategy: 'trust_builder' | 'balanced' | 'hard_selling';
  setBotStrategy: (strategy: 'trust_builder' | 'balanced' | 'hard_selling') => void;
  handleSaveBotStrategy: (strategyOverride?: 'trust_builder' | 'balanced' | 'hard_selling') => Promise<void>;
  isSavingStrategy: boolean;
  isLoadingAi: boolean;
  strategyFeedback: string | null;
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

      {/* KARTU PENGATURAN STRATEGI RESPON & PERSONA BOT WHATSAPP */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                Strategi Respon &amp; Persona Bot WhatsApp
              </h3>
              {isSavingStrategy ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Menyimpan...
                </span>
              ) : strategyFeedback ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Tersimpan otomatis
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {botStrategy === 'trust_builder' && 'Mode Toko Baru'}
                  {botStrategy === 'balanced' && 'Mode Seimbang'}
                  {botStrategy === 'hard_selling' && 'Mode Penjualan Cepat'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Klik mode yang sesuai — tersimpan otomatis tanpa tombol Simpan.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            onClick={() => {
              setBotStrategy('trust_builder');
              handleSaveBotStrategy('trust_builder');
            }}
            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
              botStrategy === 'trust_builder'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Rekomendasi Toko Baru
                </span>
                {botStrategy === 'trust_builder' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                )}
              </div>
              <h4 className="text-xs font-black text-slate-900">Mode Toko Baru (Konsultatif)</h4>
              <p className="text-[11px] text-slate-600 leading-snug">
                Menjawab ramah & empati, edukasi calon pembeli, serta tegaskan garansi tanpa buru-buru menyodorkan link pembayaran.
              </p>
            </div>
          </div>

          <div
            onClick={() => {
              setBotStrategy('balanced');
              handleSaveBotStrategy('balanced');
            }}
            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
              botStrategy === 'balanced'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Default
                </span>
                {botStrategy === 'balanced' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                )}
              </div>
              <h4 className="text-xs font-black text-slate-900">Mode Seimbang (Tanya Jawab)</h4>
              <p className="text-[11px] text-slate-600 leading-snug">
                Menjawab dalam 2-3 kalimat ringkas, jelaskan manfaat utama, lalu tawarkan konfirmasi untuk mengamankan stok produk.
              </p>
            </div>
          </div>

          <div
            onClick={() => {
              setBotStrategy('hard_selling');
              handleSaveBotStrategy('hard_selling');
            }}
            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
              botStrategy === 'hard_selling'
                ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Cocok Iklan Berbayar
                </span>
                {botStrategy === 'hard_selling' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                )}
              </div>
              <h4 className="text-xs font-black text-slate-900">Mode Penjualan Cepat (Hard Selling)</h4>
              <p className="text-[11px] text-slate-600 leading-snug">
                Respon 1-2 kalimat, konfirmasi stok ready, dan langsung berikan tautan checkout/QRIS instan untuk pangkas drop-off.
              </p>
            </div>
          </div>
        </div>

        {/* Nudge: Langkah selanjutnya → Scan QR */}
        {waMode === 'qr' && waStatus !== 'CONNECTED' && (
          <div className="mt-2 flex items-center justify-between gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <QrCode className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs font-black text-blue-900">Langkah Selanjutnya: Aktifkan Bot CS 24/7</p>
                <p className="text-[11px] text-blue-700">Scan QR di kartu "BoonTrack Direct Connect" di bawah agar bot langsung aktif melayani pembeli.</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
        )}
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

          {waStatus !== 'CONNECTED' && waStatus !== 'DEGRADED' && (
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
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1 mt-2">
                      <p className="text-[11px] text-emerald-800 font-medium">Masukkan kode 8-digit ini di WhatsApp HP Anda:</p>
                      <div className="text-lg font-black font-mono tracking-widest text-emerald-700 bg-white py-1 px-3 rounded-lg border border-emerald-200 inline-block">
                        {pairingCodeResult}
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
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-md text-center space-y-3">
                    <img
                      src={qrCodeUrl}
                      alt="Backend WhatsApp QR Code"
                      className="w-44 h-44 mx-auto rounded-lg object-contain"
                    />
                    <p className="text-[11px] font-bold text-slate-400 font-mono">
                      SESI TENANT: {tenantSlug.toUpperCase()}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <Smartphone className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-400">
                      Sesi belum diinisialisasi
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
