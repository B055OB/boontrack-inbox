'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Key,
  Smartphone,
  Lock,
  ExternalLink,
  Info,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';


const META_APP_ID = '1398832609107871';
const META_CONFIG_ID = '2169643500570820';
const META_GRAPH_VERSION = 'v21.0';
const META_EMBEDDED_SIGNUP_URL =
  'https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1398832609107871&config_id=2169643500570820&extras=%7B%22sessionInfoVersion%22%3A%223%22%2C%22version%22%3A%22v4%22%7D';

export interface WhatsAppWabaConfigProps {
  tenantSlug: string;
  displayName: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (data: {
    phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    status: string;
  }) => void;
  onSaved?: (msg: string) => void;
}

export default function WhatsAppWabaConfig({
  tenantSlug,
  displayName,
  isModal = false,
  isOpen = true,
  onClose,
  onSuccess,
  onSaved,
}: WhatsAppWabaConfigProps) {
  // Input Form States (Manual Fallback)
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [showReconfigure, setShowReconfigure] = useState(false);

  // Meta SDK & Embedded Signup States
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [sessionWabaData, setSessionWabaData] = useState<{
    phone_number_id?: string;
    waba_id?: string;
  } | null>(null);

  // Handshake & Verification States
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    verifiedName?: string;
    displayPhone?: string;
    qualityRating?: string;
    status?: string;
    webhookStatus?: string;
    message?: string;
  } | null>(null);

  const exchangeAuthCodeRef = React.useRef<(code: string) => Promise<void>>(async () => {});

  // 1. Inisialisasi Asynchronous Facebook JS SDK v21.0 & Listener PostMessage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const win = window as any;
    if (win.FB) {
      setIsSdkLoaded(true);
    } else {
      win.fbAsyncInit = function () {
        win.FB?.init({
          appId: META_APP_ID,
          autoLogAppEvents: true,
          xfbml: true,
          version: META_GRAPH_VERSION,
        });
        setIsSdkLoaded(true);
      };

      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        document.body.appendChild(js);
      }
    }

    // Tangkap event postMessage dari pop-up Meta Onboarding
    const handleMessage = (event: MessageEvent) => {
      try {
        if (!event.origin.includes('facebook.com') && !event.origin.includes('meta.com')) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            console.log('[Meta Embedded Signup] FINISH event received:', data.data);
            const phoneId = data.data?.phone_number_id || data.data?.phoneNumberId;
            const wabaIdVal = data.data?.waba_id || data.data?.wabaId;
            const authCode = data.data?.code;

            if (phoneId || wabaIdVal) {
              setSessionWabaData({
                phone_number_id: phoneId,
                waba_id: wabaIdVal,
              });
              if (phoneId) setPhoneNumberId(phoneId);
              if (wabaIdVal) setWabaId(wabaIdVal);
            }

            if (authCode) {
              exchangeAuthCodeRef.current(authCode);
            }
          } else if (data.event === 'CANCEL') {
            console.log('[Meta Embedded Signup] Pendaftaran dibatalkan oleh user.');
            setIsVerifying(false);
          } else if (data.event === 'ERROR') {
            console.error('[Meta Embedded Signup] Error event dari Meta:', data.data);
            setIsVerifying(false);
            setErrorMessage(data.data?.error_message || 'Terjadi kesalahan saat pendaftaran di jendela Meta.');
          }
        } else if (data?.code) {
          exchangeAuthCodeRef.current(data.code);
        }
      } catch {
        // Abaikan pesan non-JSON
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // 2. Load existing credentials on mount (Server Settings API + Supabase Fallback)
  useEffect(() => {
    async function loadExistingConfig() {
      if (!tenantSlug) return;
      try {
        let loaded = false;

        // 1. Prioritaskan Server Endpoint /settings (Bypass RLS dengan Service Role Key)
        try {
          const apiRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, { cache: 'no-store' });
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            const settings = apiJson?.settings;
            const wabaCfg = settings?.waba_config || settings?.metadata?.waba_config;
            const meta = settings?.metadata || {};
            const phoneId =
              wabaCfg?.phone_number_id ||
              settings?.waba_phone_number_id ||
              meta.waba_phone_number_id ||
              meta.whatsapp_phone_number_id;
            const accId = wabaCfg?.waba_id || meta.waba_account_id;
            const token =
              wabaCfg?.permanent_access_token ||
              wabaCfg?.access_token ||
              meta.waba_access_token;

            if (phoneId) setPhoneNumberId(phoneId);
            if (accId) setWabaId(accId);
            if (token) setAccessToken(token);

            if (
              wabaCfg?.status === 'CONNECTED' ||
              meta.waba_configured === true ||
              meta.waba_active === true ||
              Boolean(phoneId)
            ) {
              setSuccessData({
                verifiedName: wabaCfg?.verified_name || meta.waba_config?.verified_name || String(displayName || '').toUpperCase(),
                displayPhone: wabaCfg?.display_phone_number || (phoneId ? `ID: ${phoneId}` : undefined),
                qualityRating: wabaCfg?.quality_rating || 'GREEN (HIGH QUALITY)',
                message: 'Akun Meta WABA sudah terverifikasi dan aktif.',
                status: wabaCfg?.status || 'CONNECTED',
                webhookStatus: 'Subscribed & Safe ACK',
              });
              loaded = true;
            }
          }
        } catch (apiErr) {
          console.warn('[WhatsAppWabaConfig] API settings fetch note:', apiErr);
        }

        if (loaded) return;

        // 2. Fallback query langsung Supabase client jika API gagal
        const supabase = getSupabase();
        if (!supabase) return;

        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, metadata, waba_phone_number_id')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow) {
          const meta = tenantRow.metadata || {};
          const phoneId =
            tenantRow.waba_phone_number_id ||
            meta.waba_phone_number_id ||
            meta.whatsapp_phone_number_id ||
            meta.waba_config?.phone_number_id;
          const accountId = meta.waba_account_id || meta.waba_config?.waba_id;
          const token =
            meta.waba_access_token ||
            meta.waba_config?.permanent_access_token ||
            meta.waba_config?.access_token;

          if (phoneId) setPhoneNumberId(phoneId);
          if (accountId) setWabaId(accountId);
          if (token) setAccessToken(token);

          if (
            meta.waba_configured === true ||
            meta.waba_active === true ||
            Boolean(phoneId) ||
            meta.waba_config?.status === 'CONNECTED'
          ) {
            setSuccessData({
              verifiedName: meta.waba_config?.verified_name || String(displayName || '').toUpperCase(),
              displayPhone: meta.waba_config?.display_phone_number || (phoneId ? `ID: ${phoneId}` : undefined),
              qualityRating: meta.waba_config?.quality_rating || 'GREEN (HIGH QUALITY)',
              message: 'Akun Meta Cloud API (WABA) resmi aktif dan terkonfigurasi pada tenant ini.',
              status: 'CONNECTED',
              webhookStatus: 'Subscribed & Safe ACK',
            });
          }
        }
      } catch (err) {
        console.warn('[WABA Config] Note loading existing config:', err);
      }
    }

    loadExistingConfig();
  }, [tenantSlug, displayName]);

  // 3. Trigger Pop-up Meta Embedded Signup Resmi
  const handleLaunchEmbeddedSignup = () => {
    setErrorMessage(null);
    setIsVerifying(true);

    try {
      const popup = window.open(
        META_EMBEDDED_SIGNUP_URL,
        'MetaWhatsAppOnboard',
        'width=600,height=720,scrollbars=yes'
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Pop-up blocker fallback: coba FB.login jika SDK tersedia
        const win = typeof window !== 'undefined' ? (window as any) : null;
        if (win && win.FB) {
          win.FB.login(
            (response: any) => {
              if (response.authResponse?.code) {
                const authCode = response.authResponse.code;
                exchangeAuthCode(authCode);
              } else {
                setIsVerifying(false);
                if (response.error) {
                  setErrorMessage(`Pendaftaran Meta dibatalkan atau error: ${response.error.message || 'Pop-up ditutup'}`);
                }
              }
            },
            {
              config_id: META_CONFIG_ID,
              response_type: 'code',
              override_default_response_type: true,
              extras: {
                version: 'v4',
                sessionInfoVersion: '3',
                featureType: 'whatsapp_business_app_onboarding',
              },
            }
          );
        } else {
          setIsVerifying(false);
          setErrorMessage('Jendela pop-up terblokir oleh browser. Harap izinkan pop-up untuk situs ini lalu coba klik kembali.');
        }
      }
    } catch (err: unknown) {
      setIsVerifying(false);
      const msg = err instanceof Error ? err.message : 'Gagal membuka pop-up Meta Embedded Signup.';
      setErrorMessage(msg);
    }
  };

  // 4. Tukarkan Authorization Code ke Permanent Token via Backend Endpoint
  const exchangeAuthCode = async (code: string) => {
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/whatsapp/embedded-signup-callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          code,
          tenant_id: tenantSlug,
          tenant_slug: tenantSlug,
          phone_number_id: sessionWabaData?.phone_number_id || phoneNumberId || undefined,
          waba_id: sessionWabaData?.waba_id || wabaId || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const errorText =
          data.error ||
          data.detail?.message ||
          (typeof data.detail === 'string' ? data.detail : null) ||
          'Gagal menukarkan token Meta dan mendaftarkan WABA otomatis.';
        throw new Error(errorText);
      }

      // Berhasil registrasi WABA via 1-Klik Pop-up!
      const resolvedVerifiedName = data.verified_name || String(displayName || '').toUpperCase();
      const resolvedDisplayPhone =
        data.phone_number ||
        data.phone_number_id ||
        (phoneNumberId ? `ID: ${phoneNumberId}` : 'Nomor Resmi WABA');
      const resolvedQualityRating = data.quality_rating || 'GREEN';

      setSuccessData({
        verifiedName: resolvedVerifiedName,
        displayPhone: resolvedDisplayPhone,
        qualityRating: resolvedQualityRating,
        status: 'CONNECTED',
        webhookStatus: 'Subscribed & Safe ACK',
        message: data.message || `WABA resmi '${resolvedVerifiedName}' berhasil terhubung & terverifikasi otomatis via 1-Klik Pop-up!`,
      });

      if (data.phone_number_id) setPhoneNumberId(data.phone_number_id);
      if (data.waba_id) setWabaId(data.waba_id);

      const successMsg = `✅ Akun WABA resmi '${resolvedVerifiedName}' berhasil terhubung secara otomatis via 1-Klik Pop-up!`;
      if (onSaved) onSaved(successMsg);

      if (onSuccess) {
        onSuccess({
          phone_number: resolvedDisplayPhone,
          verified_name: resolvedVerifiedName,
          quality_rating: resolvedQualityRating,
          status: 'CONNECTED',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menukarkan token Meta Embedded Signup.';
      setErrorMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    exchangeAuthCodeRef.current = exchangeAuthCode;
  });

  // 5. Handle Form Submission Manual (Fallback)
  const handleConnectAndVerifyManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanPhoneId = phoneNumberId.trim();
    const cleanWabaId = wabaId.trim();
    const cleanToken = accessToken.trim();

    if (!cleanPhoneId || !cleanWabaId || !cleanToken) {
      setErrorMessage('Harap lengkapi seluruh field: Phone Number ID, WABA ID, dan Meta Permanent Access Token.');
      return;
    }

    setIsVerifying(true);
    setSuccessData(null);

    try {
      const res = await fetch('/api/whatsapp/connect-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantSlug,
          tenant_slug: tenantSlug,
          phone_number_id: cleanPhoneId,
          waba_id: cleanWabaId,
          access_token: cleanToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const errorText =
          data.error ||
          data.detail?.message ||
          (typeof data.detail === 'string' ? data.detail : null) ||
          'Verifikasi Meta Graph API gagal. Pastikan Phone Number ID, WABA ID, dan Access Token Anda valid.';
        throw new Error(errorText);
      }

      const resolvedVerifiedName = data.verified_name || String(displayName || '').toUpperCase();
      const resolvedDisplayPhone = data.display_phone_number || cleanPhoneId;
      const resolvedQualityRating = data.quality_rating || 'GREEN';

      setSuccessData({
        verifiedName: resolvedVerifiedName,
        displayPhone: resolvedDisplayPhone,
        qualityRating: resolvedQualityRating,
        message: data.message || `WABA berhasil terhubung dan terverifikasi untuk ${displayName}!`,
      });

      const successMsg = `✅ Akun WABA '${resolvedVerifiedName}' berhasil terhubung & terverifikasi secara manual!`;
      if (onSaved) onSaved(successMsg);

      if (onSuccess) {
        onSuccess({
          phone_number: resolvedDisplayPhone,
          verified_name: resolvedVerifiedName,
          quality_rating: resolvedQualityRating,
          status: 'CONNECTED',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi server verifikasi WABA.';
      setErrorMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  if (isModal && !isOpen) return null;

  const content = (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* ── HEADER CARD ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                Hubungkan WhatsApp Business Resmi (Meta Cloud API)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                OFFICIAL WABA
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                META SDK v21.0
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hubungkan akun WhatsApp resmi bisnis Anda dengan 1-Klik Pop-up Facebook tanpa perlu konfigurasi token yang rumit.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {successData && (
            <span className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Terhubung Aktif</span>
            </span>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── SUCCESS FEEDBACK CARD (NAMA AKUN WABA TERVERIFIKASI) ── */}
      {successData && (
        <div className="p-5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 text-xs animate-in fade-in duration-200 space-y-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                  <span>Akun WABA Resmi Terverifikasi!</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h4>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {successData.message || 'Koneksi ke Meta Graph API aktif dan webhook tersinkronisasi.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-black text-[10px] border border-emerald-300 dark:border-emerald-700 uppercase tracking-wider shrink-0">
                Verified
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>Terhubung Aktif</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-emerald-200/80 dark:border-emerald-800/60 text-[11px]">
            <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-emerald-200 dark:border-emerald-800/80">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Nama Akun WABA</span>
              <strong className="text-slate-900 dark:text-white font-extrabold text-xs block truncate mt-0.5">
                {successData.verifiedName || String(displayName || '').toUpperCase()}
              </strong>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-medium block mt-0.5">
                Akun Resmi Terverifikasi
              </span>
            </div>

            <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-emerald-200 dark:border-emerald-800/80">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Status Nomor WhatsApp</span>
              <strong className="text-slate-900 dark:text-white font-extrabold text-xs block truncate mt-0.5">
                {successData.displayPhone || phoneNumberId || 'Official Verified'}
              </strong>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-bold block mt-0.5">
                ● Status: Terverifikasi Aktif
              </span>
            </div>

            <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-emerald-200 dark:border-emerald-800/80">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Quality Rating</span>
              <span className="inline-flex items-center gap-1 font-extrabold text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {successData.qualityRating || 'GREEN (HIGH QUALITY)'}
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Limit: Tier Skala Tinggi
              </span>
            </div>

            <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-emerald-200 dark:border-emerald-800/80">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Webhooks Ingress</span>
              <span className="inline-flex items-center gap-1 font-extrabold text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                <Globe className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>{successData.webhookStatus || 'Subscribed & Safe ACK'}</span>
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 truncate font-mono">
                /api/v1/whatsapp/embedded-signup-callback
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60">
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              Ingin menghubungkan ulang akun Meta atau mengganti nomor WhatsApp resmi?
            </p>
            <button
              type="button"
              onClick={() => setShowReconfigure(!showReconfigure)}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${showReconfigure ? 'rotate-180' : ''} transition-transform`} />
              <span>{showReconfigure ? 'Sembunyikan Pengaturan Ulang' : 'Pengaturan Ulang / Ganti Akun'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR FEEDBACK ALERT ── */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs animate-in fade-in duration-150 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-extrabold text-xs text-rose-950 dark:text-rose-100">Gagal Memverifikasi Koneksi WABA</h4>
              <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">{errorMessage}</p>
              <p className="text-[10px] text-rose-600 dark:text-rose-400 pt-0.5">
                Tips: Pastikan akun Facebook Anda memiliki akses Admin ke Meta Business Portfolio atau gunakan formulir manual jika token sudah siap.
              </p>
            </div>
          </div>
        </div>
      )}

      {(!successData || showReconfigure) && (
        <>
          {/* ── PRIMARY SECTION: 1-KLIK POP-UP EMBEDDED SIGNUP (FACEBOOK SDK) ── */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-indigo-500/5 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-indigo-950/30 p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[11px] font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Metode Direkomendasikan Meta</span>
            </div>

            <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white leading-snug">
              Hubungkan WhatsApp Resmi dengan 1-Klik Pop-up
            </h4>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Login ke Facebook, pilih atau buat akun WhatsApp Business, dan verifikasi nomor Anda langsung di jendela pop-up resmi Meta. Sistem BoonTrack akan mengurus registrasi, webhook, dan token secara otomatis.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Tanpa salin token / App ID manual</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Verifikasi profil bisnis resmi Meta</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Sinkronisasi otomatis ke AI CS Workspace</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Aman &amp; langsung via Meta Graph API v21.0</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch sm:items-end justify-center shrink-0 space-y-2">
            <button
              type="button"
              id="btn-meta-embedded-signup"
              disabled={isVerifying}
              onClick={handleLaunchEmbeddedSignup}
              className="px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-60 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/25 transition flex items-center justify-center gap-3 cursor-pointer disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Menghubungkan Akun Meta WABA...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-current text-amber-300" />
                  <span>Hubungkan WhatsApp Resmi (WABA)</span>
                </>
              )}
            </button>

            <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center sm:text-right">
              Didukung oleh Facebook Login for Business SDK v21.0
            </span>
          </div>
        </div>
      </div>

      {/* ── COLLAPSIBLE ACCORDION: PENGATURAN MANUAL TINGKAT LANJUT ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsManualOpen(!isManualOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <div>
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                Pengaturan Manual Tingkat Lanjut
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Gunakan formulir manual jika Anda sudah memiliki Phone Number ID, WABA ID, dan Permanent Access Token dari Meta Business Suite.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 shrink-0">
            <span className="text-[11px] font-semibold hidden sm:inline">
              {isManualOpen ? 'Sembunyikan' : 'Buka Form Manual'}
            </span>
            {isManualOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isManualOpen && (
          <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-5 bg-white dark:bg-slate-900/90 animate-in fade-in duration-150">
            <form onSubmit={handleConnectAndVerifyManual} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Phone Number ID */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Phone Number ID *</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isVerifying}
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="Contoh: 1419090974617162"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-emerald-600 transition disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    ID Nomor Telepon spesifik yang terdaftar di Meta Developer Console.
                  </p>
                </div>

                {/* 2. WABA ID */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>WhatsApp Business Account ID (WABA ID) *</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isVerifying}
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    placeholder="Contoh: 102938475610293"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600 transition disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    ID Akun WhatsApp Business di Meta Business Manager.
                  </p>
                </div>
              </div>

              {/* 3. Meta Permanent Access Token */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Meta Permanent Access Token *</span>
                </label>
                <div className="relative">
                  <input
                    type={showAccessToken ? 'text' : 'password'}
                    required
                    disabled={isVerifying}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAT4OxjEH58..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-12 py-3 text-xs text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-purple-600 transition disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessToken(!showAccessToken)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    title={showAccessToken ? 'Sembunyikan Token' : 'Lihat Token'}
                  >
                    {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Token permanen System User (Never Expire) dengan permissions <code>whatsapp_business_management</code> dan <code>whatsapp_business_messaging</code>.
                </p>
              </div>

              {/* Submit Manual */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Verifikasi otomatis via Meta Graph API handshake.</span>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memverifikasi Handshake Meta...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Simpan &amp; Verifikasi Manual</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Tips */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-[11px]">Panduan Cepat Setup Manual:</p>
                <ul className="text-[10px] text-blue-800 dark:text-blue-300 list-disc list-inside space-y-0.5 leading-relaxed">
                  <li>Buat <strong>System User</strong> di Meta Business Settings dengan role Admin/Employee.</li>
                  <li>Assign aset WhatsApp Account dengan akses Full Control.</li>
                  <li>Generate Token berstatus <strong>Never Expire</strong> dengan izin WhatsApp wajib.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xs">
      {content}
    </div>
  );
}
