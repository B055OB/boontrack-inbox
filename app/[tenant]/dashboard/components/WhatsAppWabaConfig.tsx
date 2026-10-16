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
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

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
  // Input Form States
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showAccessToken, setShowAccessToken] = useState(false);

  // Handshake & Verification States
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    verifiedName?: string;
    displayPhone?: string;
    qualityRating?: string;
    message?: string;
  } | null>(null);

  // Load existing credentials from Supabase on mount
  useEffect(() => {
    async function loadExistingConfig() {
      if (!tenantSlug) return;
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        // 1. Prioritaskan pembacaan dari whatsapp_connections
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('*')
          .or(`tenant_id.eq.${tenantSlug},tenant_slug.eq.${tenantSlug}`)
          .eq('provider', 'meta')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conn) {
          if (conn.phone_number_id) setPhoneNumberId(conn.phone_number_id);
          if (conn.waba_id) setWabaId(conn.waba_id);
          if (conn.api_key) setAccessToken(conn.api_key);

          if (conn.is_connected || conn.status === 'active' || conn.status === 'open') {
            setSuccessData({
              verifiedName: conn.metadata?.verified_name || String(displayName || '').toUpperCase(),
              displayPhone: conn.phone_number || (conn.phone_number_id ? `ID: ${conn.phone_number_id}` : undefined),
              qualityRating: conn.metadata?.quality_rating || 'GREEN',
              message: 'Akun Meta WABA sudah terverifikasi dan aktif.',
            });
          }
          return;
        }

        // 2. Fallback cek tenant_settings
        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('waba_config')
          .eq('tenant_slug', tenantSlug)
          .maybeSingle();

        if (settings?.waba_config) {
          const cfg = settings.waba_config;
          if (cfg.phone_number_id) setPhoneNumberId(cfg.phone_number_id);
          if (cfg.waba_id) setWabaId(cfg.waba_id);
          if (cfg.permanent_access_token) setAccessToken(cfg.permanent_access_token);

          if (cfg.status === 'CONNECTED') {
            setSuccessData({
              verifiedName: cfg.verified_name || String(displayName || '').toUpperCase(),
              displayPhone: cfg.display_phone_number || cfg.phone_number_id,
              qualityRating: cfg.quality_rating || 'GREEN',
              message: 'Akun Meta WABA sudah terhubung.',
            });
            return;
          }
        }

        // 3. Fallback baca langsung dari tenants table (metadata & direct columns)
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, metadata, waba_phone_number_id')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow) {
          const meta = tenantRow.metadata || {};
          const phoneId = tenantRow.waba_phone_number_id || meta.waba_phone_number_id || meta.whatsapp_phone_number_id || meta.waba_config?.phone_number_id;
          const accountId = meta.waba_account_id || meta.waba_config?.waba_id;
          const token = meta.waba_access_token || meta.waba_config?.permanent_access_token || meta.waba_config?.access_token;

          if (phoneId) setPhoneNumberId(phoneId);
          if (accountId) setWabaId(accountId);
          if (token) setAccessToken(token);

          if (meta.waba_configured === true || meta.waba_active === true || Boolean(phoneId) || meta.waba_config?.status === 'CONNECTED') {
            setSuccessData({
              verifiedName: meta.waba_config?.verified_name || String(displayName || '').toUpperCase(),
              displayPhone: meta.waba_config?.display_phone_number || (phoneId ? `ID: ${phoneId}` : undefined),
              qualityRating: meta.waba_config?.quality_rating || 'GREEN (HIGH QUALITY)',
              message: 'Akun Meta Cloud API (WABA) resmi aktif dan terkonfigurasi pada tenant ini.',
            });
          }
        }
      } catch (err) {
        console.warn('[WABA Config] Note loading existing config:', err);
      }
    }

    loadExistingConfig();
  }, [tenantSlug, displayName]);

  // Handle Form Submission: Simpan & Verifikasi Koneksi
  const handleConnectAndVerify = async (e: React.FormEvent) => {
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
      // Panggil endpoint proxy internal inbox (yang akan meneruskan ke Core Backend / Meta Graph API)
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

      // Handshake sukses!
      const resolvedVerifiedName = data.verified_name || String(displayName || '').toUpperCase();
      const resolvedDisplayPhone = data.display_phone_number || cleanPhoneId;
      const resolvedQualityRating = data.quality_rating || 'GREEN';

      setSuccessData({
        verifiedName: resolvedVerifiedName,
        displayPhone: resolvedDisplayPhone,
        qualityRating: resolvedQualityRating,
        message: data.message || `WABA berhasil terhubung dan terverifikasi untuk ${displayName}!`,
      });

      const successMsg = `✅ Akun WABA '${resolvedVerifiedName}' berhasil terhubung & terverifikasi!`;
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
    <div className="space-y-6">
      {/* ── HEADER CARD ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold border border-emerald-500/20 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm text-slate-900">
                Hubungkan WABA Resmi (Manual Setup)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                OFFICIAL META CLOUD
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Koneksi direct permanent system user access token untuk akun WhatsApp Business resmi centang hijau.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {successData && (
            <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Terhubung Aktif</span>
            </span>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── SUCCESS FEEDBACK CARD (NAMA AKUN WABA TERVERIFIKASI) ── */}
      {successData && (
        <div className="p-5 rounded-2xl bg-emerald-50/90 border-2 border-emerald-300 text-emerald-950 text-xs animate-in fade-in duration-200 space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-emerald-950 flex items-center gap-1.5">
                  <span>Akun WABA Resmi Terverifikasi!</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h4>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  {successData.message || 'Koneksi ke Meta Graph API aktif dan webhook tersinkronisasi.'}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-black text-[10px] border border-emerald-300 uppercase tracking-wider shrink-0">
              Verified
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-200/80 text-[11px]">
            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Nama Akun WABA</span>
              <strong className="text-slate-900 font-extrabold text-xs block truncate mt-0.5">
                {successData.verifiedName || String(displayName || '').toUpperCase()}
              </strong>
            </div>

            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Nomor WhatsApp</span>
              <strong className="text-slate-900 font-extrabold text-xs block truncate mt-0.5">
                {successData.displayPhone || phoneNumberId}
              </strong>
            </div>

            <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Quality Rating</span>
              <span className="inline-flex items-center gap-1 font-extrabold text-xs text-emerald-700 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {successData.qualityRating || 'GREEN (HIGH QUALITY)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR FEEDBACK ALERT ── */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs animate-in fade-in duration-150 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-extrabold text-xs text-rose-950">Gagal Memverifikasi Koneksi WABA</h4>
              <p className="text-[11px] text-rose-800 leading-relaxed">{errorMessage}</p>
              <p className="text-[10px] text-rose-600 pt-0.5">
                Tips: Pastikan System User di Meta Business Manager memiliki permission <code>whatsapp_business_management</code> dan <code>whatsapp_business_messaging</code> serta token berstatus Permanent (Never Expire).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CREDENTIALS FORM ── */}
      <form onSubmit={handleConnectAndVerify} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Phone Number ID */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Phone Number ID *</span>
            </label>
            <input
              type="text"
              required
              disabled={isVerifying}
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Contoh: 1419090974617162"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-600 transition disabled:opacity-60"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              ID Nomor Telepon spesifik yang terdaftar di Meta Developer Console.
            </p>
          </div>

          {/* 2. WABA ID */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-600" />
              <span>WhatsApp Business Account ID (WABA ID) *</span>
            </label>
            <input
              type="text"
              required
              disabled={isVerifying}
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="Contoh: 102938475610293"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-600 transition disabled:opacity-60"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              ID Akun WhatsApp Business di Meta Business Manager.
            </p>
          </div>
        </div>

        {/* 3. Meta Permanent Access Token */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-purple-600" />
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
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-12 py-3 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-600 transition disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowAccessToken(!showAccessToken)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              title={showAccessToken ? 'Sembunyikan Token' : 'Lihat Token'}
            >
              {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Token permanen System User (Never Expire) dengan permissions <code>whatsapp_business_management</code> dan <code>whatsapp_business_messaging</code>.
          </p>
        </div>

        {/* ── TOMBOL SIMPAN & VERIFIKASI KONEKSI ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Verifikasi otomatis via Meta Graph API handshake.</span>
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white text-xs font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menghubungkan &amp; Memverifikasi Handshake Meta...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Simpan &amp; Verifikasi Koneksi</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ── BANTUAN OPERASIONAL & PETUNJUK SETUP ── */}
      <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
        <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Panduan Setup Cepat Meta Business Manager:</p>
          <ul className="text-[11px] text-blue-800 list-disc list-inside space-y-0.5 leading-relaxed">
            <li>Buat <strong>System User</strong> di Meta Business Settings dengan role Admin/Employee.</li>
            <li>Assign aset App &amp; WhatsApp Account dengan toggle Full Control.</li>
            <li>Generate Token dengan expiration <strong>Never</strong> dan centang permission WhatsApp wajib.</li>
            <li>Sistem BoonTrack akan otomatis mendaftarkan webhook subscription ke WABA Anda.</li>
          </ul>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs">
      {content}
    </div>
  );
}
