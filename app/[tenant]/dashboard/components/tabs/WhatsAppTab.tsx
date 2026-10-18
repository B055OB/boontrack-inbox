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
  Radio,
  Key,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import WhatsAppWabaConfig from '../WhatsAppWabaConfig';
import FeatureLockedTeaser from '@/components/shared/FeatureLockedTeaser';
import { getSupabase } from '@/lib/supabaseClient';

interface WhatsAppTabProps {
  tenantSlug: string;
  displayName: string;
  waMode: 'qr' | 'meta';
  setWaMode: (mode: 'qr' | 'meta') => void;
  waStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  setWaStatus: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED') => void;
  qrCodeUrl: string | null;
  setQrCodeUrl: (url: string | null) => void;
  qrImgError?: boolean;
  setQrImgError?: (err: boolean) => void;
  isQrLoading: boolean;
  waLoadingMessage?: string | null;
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
  isTeamScale?: boolean;
  renderLockedFeatureCard: (props: {
    title: string;
    badge: string;
    description: string;
    targetTier: 'ads_performance' | 'team_scale';
    targetTierLabel: string;
  }) => React.ReactNode;
  onUpgradeTier?: (targetTier: 'ads_performance' | 'team_scale') => void;
  setSaveFeedback: (msg: string | null) => void;
  greetingMessage?: string;
  setGreetingMessage?: (msg: string) => void;
  handleSaveGreetingMessage?: (msg?: string) => Promise<void>;
  isSavingGreeting?: boolean;
}


function isPlatformWaba(phoneOrId?: string | null): boolean {
  if (!phoneOrId) return false;
  const clean = String(phoneOrId).replace(/\D/g, '');
  return (
    clean === '6285181830080' ||
    clean === '085181830080' ||
    clean === '6285179555449' ||
    clean === '6285139555449' ||
    clean === '085179555449' ||
    clean === '085139555449' ||
    clean.includes('85181830080') ||
    clean.includes('85179555449')
  );
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
  qrImgError: qrImgErrorProp,
  setQrImgError: setQrImgErrorProp,
  isQrLoading,
  waLoadingMessage,
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
  isTeamScale: isTeamScaleProp = false,
  renderLockedFeatureCard,
  onUpgradeTier,
  setSaveFeedback,
  greetingMessage,
  setGreetingMessage,
  handleSaveGreetingMessage,
  isSavingGreeting,
}: WhatsAppTabProps) {
  const [runtimeMode, setRuntimeMode] = useState<'dedicated' | 'coexistence'>('dedicated');
  // Track QR image decode/render errors untuk fallback UI
  const [localQrImgError, setLocalQrImgError] = useState(false);
  const activeQrImgError = qrImgErrorProp !== undefined ? qrImgErrorProp : localQrImgError;
  const handleSetQrImgError = (err: boolean) => {
    setLocalQrImgError(err);
    if (setQrImgErrorProp) setQrImgErrorProp(err);
  };
  // Modal State untuk Hubungkan WABA Resmi (Manual Setup)
  const [isManualWabaModalOpen, setIsManualWabaModalOpen] = useState(false);
  // Check if official Meta WABA credentials are fully configured on this tenant
  const [hasWabaCredentials, setHasWabaCredentials] = useState<boolean>(false);
  const [isDbTeamScale, setIsDbTeamScale] = useState<boolean>(false);
  const isTeamScale = Boolean(isTeamScaleProp || isDbTeamScale);
  const [isInstanceDbActive, setIsInstanceDbActive] = useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;
    async function checkTenantCredentials() {
      if (!tenantSlug) return;
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        // 1. Check Meta WABA credentials in tenants table & tenant_whatsapp_channels & whatsapp_connections
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, metadata, waba_phone_number_id, plan_tier, subscription_plan')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const meta = tenantData?.metadata || {};
        const hasMetaCreds = Boolean(
          meta.waba_configured === true ||
          meta.waba_active === true ||
          Boolean(meta.waba_phone_number_id) ||
          Boolean(meta.whatsapp_phone_number_id) ||
          Boolean(tenantData?.waba_phone_number_id) ||
          (meta.waba_config?.phone_number_id &&
            (meta.waba_config?.permanent_access_token || meta.waba_config?.access_token)) ||
          (meta.whatsapp_credentials?.phone_number_id &&
            meta.whatsapp_credentials?.access_token)
        );

        let wabaActive = hasMetaCreds;
        if (!wabaActive && tenantData?.id) {
          const { data: channels } = await supabase
            .from('tenant_whatsapp_channels')
            .select('id, status')
            .eq('tenant_id', tenantData.id)
            .eq('status', 'ACTIVE')
            .limit(1);
          if (channels && channels.length > 0) {
            wabaActive = true;
          }
        }

        if (!wabaActive) {
          const { data: wabaConn } = await supabase
            .from('whatsapp_connections')
            .select('id, status, is_connected')
            .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}`)
            .eq('provider', 'meta')
            .limit(1)
            .maybeSingle();
          if (wabaConn && (wabaConn.is_connected || wabaConn.status === 'active' || wabaConn.status === 'open')) {
            wabaActive = true;
          }
        }

        // 2. Check active Evolution/Baileys instance recorded in database (tenant_whatsapp_channels & whatsapp_connections)
        let channelActive = false;
        if (tenantData?.id) {
          const { data: chList } = await supabase
            .from('tenant_whatsapp_channels')
            .select('id, status')
            .eq('tenant_id', tenantData.id)
            .eq('status', 'ACTIVE')
            .limit(1);
          if (chList && chList.length > 0) {
            channelActive = true;
          }
        }

        const { data: connData } = await supabase
          .from('whatsapp_connections')
          .select('status, is_connected, provider')
          .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}`)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const dbActive = Boolean(
          channelActive || (
            connData &&
            (connData.status?.toLowerCase() === 'open' || connData.status?.toLowerCase() === 'connected' || connData.status?.toLowerCase() === 'active') &&
            (connData.is_connected === true || connData.status?.toLowerCase() === 'connected' || connData.status?.toLowerCase() === 'open')
          )
        );

        if (isMounted) {
          setHasWabaCredentials(wabaActive);
          setIsInstanceDbActive(dbActive);
          // If in meta mode without credentials, fallback to qr mode
          if (waMode === 'meta' && !wabaActive) {
            setWaMode('qr');
          } else if (wabaActive && meta.whatsapp_gateway_type === 'waba' && waMode === 'qr') {
            setWaMode('meta');
          }
        }
      } catch (err) {
        console.debug('[WhatsAppTab] Check credentials error:', err);
      }
    }

    checkTenantCredentials();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, waMode, setWaMode]);

  // FIX: Hanya tampilkan CONNECTED jika waStatus CONNECTED, terdaftar aktif di DB atau nomor terdeteksi, dan bukan nomor platform
  const isMerchantConnected =
    waStatus === 'CONNECTED' &&
    (isInstanceDbActive || Boolean(connectedPhone)) &&
    !isPlatformWaba(connectedPhone) &&
    waConnectionMode !== 'SHARED';

  // AUTO-FETCH: Panggil handleConnectGrowthSession saat mount jika tenant belum connected dan qrCodeUrl masih kosong (hanya 1x jika di mode Direct Connect QR)
  const hasAttemptedAutoFetch = React.useRef(false);
  React.useEffect(() => {
    if (waMode === 'qr' && !isMerchantConnected && !qrCodeUrl && !hasAttemptedAutoFetch.current) {
      hasAttemptedAutoFetch.current = true;
      handleConnectGrowthSession();
    }
  }, [tenantSlug, isMerchantConnected, qrCodeUrl, handleConnectGrowthSession, waMode]);
  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Pengaturan Gateway WhatsApp Bot</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Pilih metode koneksi bot sesuai dengan kebutuhan dan paket langganan Anda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsManualWabaModalOpen(true)}
            className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Hubungkan WABA Resmi (Manual Setup)</span>
          </button>

          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto items-center">
            <button
              type="button"
              onClick={() => setWaMode('qr')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                waMode === 'qr'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>BoonTrack Direct Connect</span>
            </button>
            <button
              type="button"
              disabled={!isTeamScale && !hasWabaCredentials}
              onClick={() => {
                if (isTeamScale || hasWabaCredentials) {
                  setWaMode('meta');
                }
              }}
              title={
                !isTeamScale && !hasWabaCredentials
                  ? 'Setup WABA Required: Kredensial Meta resmi (Phone Number ID & Access Token) belum terkonfigurasi pada tenant ini.'
                  : undefined
              }
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                !isTeamScale && !hasWabaCredentials
                  ? 'opacity-50 cursor-not-allowed text-slate-400 bg-slate-100/60 border border-slate-200'
                  : waMode === 'meta'
                  ? 'bg-white text-emerald-600 shadow-xs cursor-pointer'
                  : 'text-slate-600 hover:text-slate-900 cursor-pointer'
              }`}
            >
              {!isTeamScale && !hasWabaCredentials ? (
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              <span>Meta Cloud API (WABA)</span>
              {hasWabaCredentials ? (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                  ACTIVE
                </span>
              ) : isTeamScale ? (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                  TEAM SCALE
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-200 text-slate-600 shrink-0">
                  SETUP REQUIRED
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* GROWTH PLAN PANEL */}
      {waMode === 'qr' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">BoonTrack Direct Connect</h3>
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${
                  waStatus === 'CONNECTED'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                }`}>
                  {waStatus === 'CONNECTED'
                    ? (waConnectionMode === 'SHARED' ? '● Shared Gateway Active' : '● Dedicated Engine Connected')
                    : 'BoonTrack WhatsApp Engine'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xl">
                Koneksi mandiri via BoonTrack WhatsApp Engine untuk menghasilkan sesi perangkat QR aktif dan sinkronisasi chat real-time.
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40">
              <QrCode className="w-5 h-5" />
            </div>
          </div>

          {waStatus === 'DEGRADED' && (
            <div className="p-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-900 dark:text-amber-200">BoonTrack WhatsApp Engine Belum Terjangkau</h4>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
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

          {/* WHATSAPP RUNTIME NUMBER & COEXISTENCE SELECTION (§4.2, §8.4, §9.8) */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">WhatsApp Runtime Number</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Gunakan nomor khusus untuk WhatsApp Bot agar operasional AI tidak bercampur dengan WhatsApp pribadi Owner.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Opsi Dedicated */}
              <div
                onClick={() => setRuntimeMode('dedicated')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  runtimeMode === 'dedicated'
                    ? 'bg-white dark:bg-slate-900 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      runtimeMode === 'dedicated' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {runtimeMode === 'dedicated' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Recommended: Dedicated Bot Number</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                    SOP RESMI
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  (Nomor ini digunakan oleh BoonTrack Runtime untuk menerima pesan pelanggan dan menjalankan AI Sales Representative.)
                </p>
              </div>

              {/* Opsi Coexistence */}
              <div
                onClick={() => setRuntimeMode('coexistence')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  runtimeMode === 'coexistence'
                    ? 'bg-white dark:bg-slate-900 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      runtimeMode === 'coexistence' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {runtimeMode === 'coexistence' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Advanced: Gunakan nomor yang sama dengan WhatsApp pribadi Owner (Enable Coexistence Mode)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                    COEXISTENCE
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Mode ini membutuhkan mekanisme identity filtering tambahan (Layer 2 Self-Echo Protection) agar pesan fisik Owner tidak memicu auto-reply berulang.
                </p>
              </div>
            </div>
          </div>

          {!isMerchantConnected && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <span>Buka aplikasi <strong>WhatsApp</strong> di HP Anda.</span>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <span>Ketuk menu titik tiga (Android) atau <strong>Pengaturan</strong> (iPhone) &gt; pilih <strong>Perangkat Tertaut</strong>.</span>
                  </div>
                  <div className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <span>Arahkan kamera HP Anda ke QR Code di sebelah kanan.</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleConnectGrowthSession(true)}
                    disabled={isQrLoading}
                    className="px-5 py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer border border-transparent dark:border-slate-700"
                  >
                    {isQrLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{waLoadingMessage || 'Sedang menyiapkan sesi aman...'}</span>
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

              <div className="md:col-span-6 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                {isQrLoading && !qrCodeUrl ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>{waLoadingMessage || 'Sedang menyiapkan sesi aman...'}</span>
                  </div>
                ) : qrCodeUrl ? (
                  <div className="flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in duration-200">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 inline-block">
                      <img
                        key={qrCodeUrl}
                        src={qrCodeUrl.startsWith('data:') ? qrCodeUrl : `data:image/png;base64,${qrCodeUrl}`}
                        alt="QR Code WhatsApp"
                        className="w-64 h-64 mx-auto object-contain block"
                        onLoad={() => handleSetQrImgError(false)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        Dedicated Instance: {tenantSlug.toLowerCase()}
                      </span>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-3">
                    {waErrorMessage ? (
                      <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
                    ) : (
                      <Smartphone className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {waErrorMessage ? 'Gagal Memuat QR Code' : 'Disediakan WhatsApp'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                        {waErrorMessage
                          ? waErrorMessage
                          : 'Klik tombol di bawah untuk memuat QR Code otentikasi WhatsApp.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleSetQrImgError(false);
                        handleConnectGrowthSession(true);
                      }}
                      disabled={isQrLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition cursor-pointer inline-flex items-center gap-2 shadow-xs"
                    >
                      {isQrLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{waLoadingMessage || 'Sedang menyiapkan sesi aman...'}</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Coba Lagi / Generate Ulang QR</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isMerchantConnected && (
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
                      Dedicated Gateway Active
                    </span>
                    {waProvider && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-white text-emerald-700 border border-emerald-200">
                        {waProvider}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-800 mt-1 font-medium">
                    Nomor: <strong className="font-mono text-emerald-950">+{connectedPhone}</strong> • Mode: <strong className="text-emerald-900">Dedicated Store Instance</strong>
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Toko Anda terhubung langsung ke WhatsApp milik toko sendiri. Siap menerima pesan &amp; notifikasi order real-time.
                  </p>
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
        (!isTeamScale && !isProScale) ? (
          <div className="py-2 flex flex-col items-center justify-center space-y-4">
            <FeatureLockedTeaser
              featureTitle="WhatsApp Business API (Official WABA)"
              badgeTier="Team Scale"
              headline="Broadcast Skala Besar & Automasi Resmi Meta Tanpa Risiko Terblokir"
              comparison={{
                problemTitle: 'Tantangan Saat Ini',
                problem: 'Broadcast manual dari nomor pribadi rentan terblokir (banned) seketika oleh WhatsApp dan membatasi skala pertumbuhan bisnis.',
                solutionTitle: 'Solusi BoonTrack',
                solution: 'Jalur resmi Meta Cloud API dengan centang hijau, proteksi anti-banned mutlak, dan kecepatan kirim ribuan pesan per menit.',
              }}
              bullets={[
                'Broadcast Massal Resmi: Kirim promosi serentak ke ribuan kontak pelanggan tanpa rasa was-was akun terblokir.',
                'Centang Hijau Resmi (OBA): Bangun kredibilitas instan dengan verified business badge di profil WhatsApp.',
                'Template Interaktif Meta: Kirim penawaran dengan tombol Quick Reply & CTA link langsung ke pembayaran.',
              ]}
              ctaText="Upgrade ke Team Scale (Official WABA)"
              featureIcon={<Radio className="w-7 h-7 text-emerald-400" />}
              tenantSlug={tenantSlug}
              onUpgrade={() => onUpgradeTier?.('team_scale')}
            />
            <button
              type="button"
              onClick={() => setIsManualWabaModalOpen(true)}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Sudah Memiliki Akun Meta WABA? Hubungkan WhatsApp Resmi (1-Klik Pop-up / Manual)</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <WhatsAppWabaConfig
              tenantSlug={tenantSlug}
              displayName={displayName}
              onSuccess={(data) => {
                setConnectedPhone(data.phone_number || 'Official WABA');
                setWaStatus('CONNECTED');
                setSaveFeedback(`✅ Akun WABA '${data.verified_name || displayName}' berhasil diaktifkan!`);
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

      {/* ── MODAL HUBUNGKAN WABA RESMI (MANUAL SETUP) ── */}
      {isManualWabaModalOpen && (
        <WhatsAppWabaConfig
          tenantSlug={tenantSlug}
          displayName={displayName}
          isModal={true}
          isOpen={isManualWabaModalOpen}
          onClose={() => setIsManualWabaModalOpen(false)}
          onSuccess={(data) => {
            setConnectedPhone(data.phone_number || 'Official WABA');
            setWaStatus('CONNECTED');
            setWaMode('meta');
            setSaveFeedback(`✅ Akun WABA '${data.verified_name || displayName}' berhasil terhubung & terverifikasi!`);
            setTimeout(() => setSaveFeedback(null), 4000);
            setIsManualWabaModalOpen(false);
          }}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 4000);
          }}
        />
      )}

    </div>
  );
}
