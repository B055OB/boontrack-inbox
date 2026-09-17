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
  waProvider?: 'EVOLUTION' | 'WABA';
  waConnectionMode?: 'SHARED' | 'DEDICATED';
  handleConnectGrowthSession: (isReload?: boolean) => Promise<void>;
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
  waProvider,
  waConnectionMode,
  handleConnectGrowthSession,
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

      {/* GROWTH PLAN PANEL */}
      {waMode === 'qr' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">BoonTrack Direct Connect</h3>
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${
                  waStatus === 'CONNECTED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {waStatus === 'CONNECTED'
                    ? (waConnectionMode === 'SHARED' ? '● Shared Gateway Active' : '● Dedicated Engine Connected')
                    : 'BoonTrack WhatsApp Engine'}
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
                  onClick={() => handleConnectGrowthSession()}
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
                    <span>Arahkan kamera HP Anda ke QR Code di sebelah kanan.</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleConnectGrowthSession(true)}
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
                        <span>Muat Ulang Sesi &amp; QR Code</span>
                      </>
                    )}
                  </button>
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
            <div className="p-6 bg-emerald-50/90 border-2 border-emerald-300 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xs">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-emerald-950">WhatsApp Terhubung Aktif</h4>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {waConnectionMode === 'SHARED' ? 'Shared Gateway Active' : 'Dedicated Gateway Active'}
                    </span>
                    {waProvider && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-white text-emerald-700 border border-emerald-200">
                        {waProvider}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-800 mt-1 font-medium">
                    Nomor: <strong className="font-mono text-emerald-950">+{connectedPhone || '6281237450222'}</strong> • Mode: <strong className="text-emerald-900">{waConnectionMode === 'SHARED' ? 'Shared Gateway Active' : 'Dedicated Instance'}</strong>
                  </p>
                  {waConnectionMode === 'SHARED' && (
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Toko Anda terhubung otomatis ke BoonTrack Shared WhatsApp Engine. Siap menerima pesan &amp; notifikasi order real-time.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWaStatus('DISCONNECTED');
                  setQrCodeUrl(null);
                }}
                className="px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer self-start sm:self-auto shadow-xs"
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
