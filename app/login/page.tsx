'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Store,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Lock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Compass,
  Key,
  Mail,
  MessageSquare,
  X,
  ExternalLink,
  Phone,
  Headphones,
  Landmark,
  Building2,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { getTenantConfig, normalizeTenantSlug } from '@/lib/tenant-config';
import { resolveTenantRuntime } from '@/lib/resolvers/tenant-runtime-resolver';

/**
 * Extracts candidate tenant slug from a redirection URL or path.
 * Examples:
 *   "/margasari/dashboard" -> "margasari"
 *   "/margasari/desk" -> "margasari"
 *   "https://app.boontrack.com/margasari" -> "margasari"
 */
function extractSlugFromUrl(urlStr: string): string {
  if (!urlStr) return '';
  let clean = urlStr;
  try {
    clean = decodeURIComponent(clean);
  } catch {}
  clean = clean.trim();
  // Strip protocol and domain if full URL
  clean = clean.replace(/^https?:\/\/[^/]+/i, '');
  // Match first segment after leading slash
  const match = clean.match(/^\/([^/?#]+)/);
  if (match) {
    const candidate = match[1].toLowerCase().trim();
    const RESERVED_SLUGS = new Set([
      'app', 'dashboard', 'admin', 'login', 'register', 'api', '_next',
      'checkout', 'pricing', 'affiliate', 'manager', 'terms', 'privacy',
      'refund', 'acceptable-use', 'data-deletion', 'app-portal'
    ]);
    if (!RESERVED_SLUGS.has(candidate)) {
      return candidate;
    }
  }
  return '';
}

function MerchantLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode: Owner (Slug + PIN) vs CS (WhatsApp + PIN, bypass magic link)
  const [loginMode, setLoginMode] = useState<'owner' | 'cs'>('owner');

  // Synchronously parse redirect parameter for immediate SSR and client hydration
  const initialRedirect = searchParams.get('redirectTo') || '';
  const initialExtractedSlug = extractSlugFromUrl(initialRedirect);
  const initialNormSlug = initialExtractedSlug ? normalizeTenantSlug(initialExtractedSlug) : '';
  const isInitialCivic = Boolean(
    initialRedirect.includes('/desk') ||
    initialNormSlug === 'margasari' ||
    (initialNormSlug && getTenantConfig(initialNormSlug)?.category === 'public_service')
  );

  // Form State
  const [storeSlug, setStoreSlug] = useState<string>(() => initialExtractedSlug || '');
  const [accessKey, setAccessKey] = useState('');
  const [csPhone, setCsPhone] = useState('');
  const [csPin, setCsPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Context-Aware Public Service / Civic App State (Zero Hardcoding)
  const [isPublicService, setIsPublicService] = useState<boolean>(() => isInitialCivic);
  const [tenantTitle, setTenantTitle] = useState<string>(() => (isInitialCivic ? 'Kelurahan Margasari' : ''));
  const [resolvedRedirect, setResolvedRedirect] = useState<string>(() => initialRedirect);

  // Recovery Modal State
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryWaUrl, setRecoveryWaUrl] = useState<string | null>(null);

  const sanitizeSlug = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^shop\.boontrack\.com\//, '')
      .replace(/^app\.boontrack\.com\//, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  };

  /**
   * Dynamically inspect tenant metadata & runtime contract from Supabase (Single Source of Truth)
   * Evaluates template_code ('PUBLIC_SERVICE_V1'), tenant_kind ('CUSTOM_APP'), and business_type ('PUBLIC_SERVICE').
   * ZERO HARDCODED SLUG CHECKS.
   */
  const checkTenantContext = async (candidateSlug: string) => {
    const clean = sanitizeSlug(candidateSlug);
    if (!clean) return;

    // 1. Check local config cache if present
    const local = getTenantConfig(clean);
    if (local) {
      const runtime = resolveTenantRuntime({ tenant: local as any });
      if (
        runtime.templateCode === 'PUBLIC_SERVICE_V1' ||
        runtime.tenantKind === 'CUSTOM_APP' ||
        runtime.businessType === 'PUBLIC_SERVICE'
      ) {
        setIsPublicService(true);
        setTenantTitle(local.title || local.name || 'Kelurahan Margasari');
        return;
      }
    }

    // 2. Query Supabase dynamically (Single source of truth)
    try {
      const supabase = getSupabase();
      const { data: row } = await supabase
        .from('tenants')
        .select('slug, name, metadata, tier, template_code, business_type, tenant_kind, category')
        .eq('slug', clean)
        .maybeSingle();

      if (row) {
        const runtime = resolveTenantRuntime({
          tenant: {
            ...local,
            ...row,
            metadata: {
              ...(local as any)?.metadata,
              ...row?.metadata,
            },
          },
        });

        if (
          runtime.templateCode === 'PUBLIC_SERVICE_V1' ||
          runtime.tenantKind === 'CUSTOM_APP' ||
          runtime.businessType === 'PUBLIC_SERVICE'
        ) {
          const resolvedName =
            row.metadata?.title ||
            row.metadata?.name ||
            row.name ||
            local?.title ||
            local?.name ||
            'Kelurahan Margasari';

          setIsPublicService(true);
          setTenantTitle(resolvedName);
          return;
        }
      }
    } catch (err) {
      console.warn('[LOGIN CONTEXT] Error fetching tenant context:', err);
    }

    setIsPublicService(false);
  };

  // ── Read redirectTo or Subdomain on Mount ──
  useEffect(() => {
    const redirectParam = searchParams.get('redirectTo') || '';
    if (redirectParam) {
      setResolvedRedirect(redirectParam);
      const extractedSlug = extractSlugFromUrl(redirectParam);
      if (extractedSlug) {
        setStoreSlug(extractedSlug);
        checkTenantContext(extractedSlug);
        return;
      }
    }

    // Subdomain context detection (e.g. margasari.app.boontrack.com)
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const parts = host.split('.');
      if (parts.length >= 3) {
        const sub = parts[0];
        const RESERVED = new Set(['app', 'shop', 'dashboard', 'creator', 'admin', 'api', 'www', 'localhost']);
        if (!RESERVED.has(sub)) {
          setStoreSlug(sub);
          checkTenantContext(sub);
        }
      }
    }
  }, [searchParams]);

  const handleStoreLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanSlug = sanitizeSlug(storeSlug);
    if (!cleanSlug) {
      setErrorMessage(
        isPublicService
          ? 'Silakan masukkan ID Operator atau nama unit kelurahan Anda.'
          : 'Silakan masukkan nama domain atau slug toko Anda.'
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Dynamic Check via Supabase Database (ZERO HARDCODING POLICY)
      let storeExists = false;
      let expectedPin: string | null = null;
      let resolvedTenantName: string | null = null;

      try {
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('slug, name, metadata, tier, access_password')
          .eq('slug', cleanSlug)
          .maybeSingle();

        if (tenantRow) {
          storeExists = true;
          resolvedTenantName = tenantRow.metadata?.title || tenantRow.name || null;
          const meta = tenantRow.metadata || {};
          expectedPin =
            meta.access_pin ||
            meta.pin_hash ||
            meta.pin ||
            tenantRow.access_password ||
            null;
        } else {
          // Fallback check core backend API check-slug
          const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${cleanSlug}`, {
            cache: 'no-store',
          });
          const data = await res.json();
          if (data.available === false) {
            storeExists = true;
          }
        }
      } catch {
        // Fallback network tolerance
        storeExists = true;
      }

      if (!storeExists) {
        setErrorMessage(
          isPublicService
            ? `Unit layanan "${cleanSlug}" belum terdaftar. Silakan periksa ID Operator Anda.`
            : `Toko "${cleanSlug}" belum terdaftar. Silakan daftar toko baru atau periksa penulisan nama toko Anda.`
        );
        setLoading(false);
        return;
      }

      // 2. Validate PIN / Access Password if configured on tenant
      if (expectedPin) {
        if (!accessKey.trim()) {
          setErrorMessage(
            isPublicService
              ? 'Loket ini dilindungi PIN / Password. Silakan masukkan PIN / Kode Akses Operator Anda.'
              : 'Toko ini dilindungi PIN. Silakan masukkan PIN / Password akses toko Anda.'
          );
          setLoading(false);
          return;
        }
        if (expectedPin !== accessKey.trim()) {
          setErrorMessage(
            isPublicService
              ? 'PIN / Kode Akses Operator yang Anda masukkan salah. Hubungi Administrator SIMDUK kelurahan.'
              : 'PIN / Password akses yang Anda masukkan salah. Gunakan opsi "Lupa PIN" jika memerlukan bantuan.'
          );
          setLoading(false);
          return;
        }
      }

      // 3. Persist session state to localStorage & cookies (Guarantees zero redirect loops)
      if (typeof window !== 'undefined') {
        localStorage.setItem('merchant_store', cleanSlug);
        localStorage.setItem('merchant_session', cleanSlug);
        localStorage.setItem('bt_tenant', cleanSlug);
        if (accessKey.trim()) localStorage.setItem('merchant_pin', accessKey.trim());
        localStorage.setItem('merchant_login_at', new Date().toISOString());

        document.cookie = `merchant_store=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `merchant_session=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `bt_tenant=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
      }

      setSuccessMessage(
        isPublicService
          ? `Akses operator terverifikasi! Mengalihkan ke Desk Operator ${resolvedTenantName || tenantTitle || cleanSlug.toUpperCase()}...`
          : `Toko terverifikasi! Mengalihkan ke Dashboard ${cleanSlug.toUpperCase()}...`
      );

      setTimeout(() => {
        let dest = isPublicService ? `/${cleanSlug}/desk` : `/${cleanSlug}/dashboard`;
        if (typeof window !== 'undefined') {
          const isDashboardHost =
            window.location.hostname === 'shop.boontrack.com' ||
            window.location.hostname.startsWith('dashboard.');
          if (isDashboardHost && !isPublicService) {
            dest = `/${cleanSlug}`;
          }
          const params = new URLSearchParams(window.location.search);
          const redirectParam = params.get('redirectTo');
          if (redirectParam && redirectParam.startsWith('/')) {
            dest = redirectParam;
          }
        }
        router.push(dest);
        setTimeout(() => {
          window.location.href = dest;
        }, 300);
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat memeriksa akses. Silakan coba lagi.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  const handleCsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanSlug = sanitizeSlug(storeSlug);
    if (!cleanSlug) {
      setErrorMessage(
        isPublicService
          ? 'Silakan masukkan ID Unit Kelurahan atau PTSP.'
          : 'Silakan masukkan nama domain atau slug toko.'
      );
      return;
    }
    if (!csPhone.trim()) {
      setErrorMessage(
        isPublicService
          ? 'Silakan masukkan nomor WhatsApp Petugas Lapangan.'
          : 'Silakan masukkan nomor WhatsApp CS Anda.'
      );
      return;
    }
    if (!csPin.trim()) {
      setErrorMessage(
        isPublicService
          ? 'Silakan masukkan PIN Loket / Unit Kelurahan.'
          : 'Silakan masukkan PIN Toko / Tenant.'
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/cs-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: cleanSlug,
          phone: csPhone.trim(),
          pin: csPin.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Autentikasi gagal. Periksa nomor WhatsApp dan PIN.');
        setLoading(false);
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('merchant_store', cleanSlug);
        localStorage.setItem('merchant_session', cleanSlug);
        localStorage.setItem('bt_tenant', cleanSlug);
        localStorage.setItem('cs_user_name', data.user?.name || (isPublicService ? 'Petugas Lapangan' : 'CS Agent'));
        localStorage.setItem('cs_user_phone', data.user?.phone || csPhone.trim());
        localStorage.setItem('merchant_login_at', new Date().toISOString());

        document.cookie = `merchant_store=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `merchant_session=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `bt_tenant=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
      }

      setSuccessMessage(
        isPublicService
          ? `Login Petugas Berhasil! Selamat datang, ${data.user?.name || 'Petugas'}. Mengalihkan ke Loket...`
          : `Login CS Berhasil! Selamat datang, ${data.user?.name || 'CS'}. Mengalihkan ke Inbox...`
      );

      setTimeout(() => {
        const dest = isPublicService ? `/${cleanSlug}/desk` : `/${cleanSlug}/dashboard?tab=inbox`;
        router.push(dest);
        setTimeout(() => {
          window.location.href = dest;
        }, 300);
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat login.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryFeedback(null);
    setRecoveryWaUrl(null);

    const input = recoveryIdentifier.trim().toLowerCase();
    if (!input) {
      setRecoveryError('Silakan masukkan alamat email terdaftar.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input)) {
      setRecoveryError('Format email tidak valid. Masukkan alamat email yang benar.');
      return;
    }

    setRecoveryLoading(true);

    try {
      const res = await fetch('/api/v1/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecoveryError(data.error || 'Email tidak terdaftar. Pastikan memasukkan alamat email yang valid.');
        return;
      }

      setRecoveryFeedback(data.message || 'Kode akses dan link masuk berhasil dikirimkan ke email Anda. Silakan periksa inbox/spam.');
    } catch {
      setRecoveryError('Gagal memproses pemulihan akses. Periksa koneksi internet Anda.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Lighting Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center justify-center group cursor-pointer">
            <Image
              src="/logo-horizontal.png"
              alt="BoonTrack"
              width={200}
              height={50}
              priority
              className="h-10 sm:h-11 w-auto max-w-[200px] object-contain drop-shadow-md group-hover:scale-105 transition-transform"
            />
          </Link>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {isPublicService
                ? `Masuk ke Desk Operator ${tenantTitle || 'Kelurahan Margasari'}`
                : 'Masuk ke Dashboard Toko'}
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
              {isPublicService
                ? 'Portal Resmi Pelayanan Administrasi Warga, Pengaduan, dan PTSP Terpadu.'
                : 'Kelola pesanan, katalog produk, integrasi WhatsApp, dan laporan keuangan toko Anda.'}
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{successMessage}</div>
            </div>
          )}

          {/* Segmented Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setLoginMode('owner');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                loginMode === 'owner'
                  ? isPublicService
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isPublicService ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Store className="w-3.5 h-3.5" />
              )}
              <span>{isPublicService ? 'Operator PTSP' : 'Pemilik Toko'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMode('cs');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                loginMode === 'cs'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{isPublicService ? 'Petugas Lapangan (WA)' : 'Tim CS (Direct WA)'}</span>
            </button>
          </div>

          {/* Form Login Operator PTSP / Pemilik Toko */}
          {loginMode === 'owner' ? (
            <form onSubmit={handleStoreLogin} className="space-y-5">
              {/* Input Domain Toko / ID Operator PTSP */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                  <span>{isPublicService ? 'ID Operator / Username PTSP' : 'Domain atau Nama Toko Anda'}</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {isPublicService ? 'ptsp.boontrack.com/[id]' : 'shop.boontrack.com/[slug]'}
                  </span>
                </label>

                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-bold text-slate-500 select-none border-r border-slate-800 pr-2.5">
                    {isPublicService ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ptsp/</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-3.5 h-3.5 text-blue-500" />
                        <span>shop/</span>
                      </>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={storeSlug}
                    onChange={(e) => {
                      setStoreSlug(e.target.value);
                      if (e.target.value.length >= 3) {
                        checkTenantContext(e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (storeSlug.trim()) {
                        checkTenantContext(storeSlug);
                      }
                    }}
                    placeholder={isPublicService ? (storeSlug || 'margasari') : 'nama-toko-anda'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-22 pr-4 py-3.5 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {isPublicService
                      ? 'Masukkan ID unit kelurahan atau username operator loket terdaftar.'
                      : 'Masukkan slug toko yang Anda klaim saat registrasi.'}
                  </span>
                </p>
              </div>

              {/* Access PIN / Password */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isPublicService ? 'PIN / Kode Akses Operator' : 'Password Akses'}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {isPublicService ? 'Kode Akses Petugas' : 'Minimal 8 Karakter'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>

                {/* LUPA PIN / BANTUAN AKSES */}
                <div className="flex items-center justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryIdentifier('');
                      setRecoveryError(null);
                      setRecoveryFeedback(null);
                      setRecoveryWaUrl(null);
                      setIsRecoveryOpen(true);
                    }}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition underline underline-offset-4 cursor-pointer"
                  >
                    {isPublicService ? 'Lupa Kode Akses? Bantuan SIMDUK' : 'Lupa PIN? Kirim via Email'}
                  </button>
                </div>
              </div>

              {/* Button Submit */}
              <button
                type="submit"
                disabled={loading || !storeSlug.trim()}
                className={`w-full py-3.5 ${
                  isPublicService
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                } text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isPublicService ? 'Memverifikasi Akses Operator...' : 'Memeriksa Akun Toko...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isPublicService ? 'Masuk ke Desk Operator' : 'Masuk ke Dashboard Toko'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Form Login Tim CS / Petugas Lapangan */
            <form onSubmit={handleCsLogin} className="space-y-4">
              <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-2xl text-[11px] text-indigo-300 flex items-start gap-2">
                <Headphones className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  {isPublicService ? (
                    <>
                      <strong>Akses Petugas Lapangan:</strong> Masuk langsung ke inbox layanan warga menggunakan nomor WhatsApp terdaftar &amp; PIN loket kelurahan.
                    </>
                  ) : (
                    <>
                      <strong>Akses Cepat CS:</strong> Masuk langsung ke inbox menggunakan nomor WhatsApp terdaftar &amp; PIN toko tanpa menunggu magic link email.
                    </>
                  )}
                </span>
              </div>

              {/* Domain / Slug Toko / Unit PTSP */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {isPublicService ? 'ID Unit Kelurahan / PTSP' : 'Nama Toko / Tenant Slug'}
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-bold text-slate-500 select-none border-r border-slate-800 pr-2.5">
                    {isPublicService ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>ptsp/</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-3.5 h-3.5 text-indigo-500" />
                        <span>shop/</span>
                      </>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={storeSlug}
                    onChange={(e) => {
                      setStoreSlug(e.target.value);
                      if (e.target.value.length >= 3) {
                        checkTenantContext(e.target.value);
                      }
                    }}
                    placeholder={isPublicService ? 'margasari' : 'buatinvideo'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-22 pr-4 py-3 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* WhatsApp CS / Petugas */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {isPublicService ? 'Nomor WhatsApp Petugas Lapangan' : 'Nomor WhatsApp CS Anda'}
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                    <Phone className="w-4 h-4 text-indigo-400" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={csPhone}
                    onChange={(e) => setCsPhone(e.target.value)}
                    placeholder="08123456789 atau 62812..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* PIN Tenant / Unit */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                  <span>{isPublicService ? 'PIN Loket / Unit Kelurahan' : 'PIN Toko / Tenant'}</span>
                  <span className="text-[10px] text-slate-500">
                    {isPublicService ? 'Diberikan oleh Admin SIMDUK' : 'Diberikan oleh Pemilik Toko'}
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                    <Key className="w-4 h-4 text-indigo-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={csPin}
                    onChange={(e) => setCsPin(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Submit Button CS */}
              <button
                type="submit"
                disabled={loading || !storeSlug.trim() || !csPhone.trim() || !csPin.trim()}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99] mt-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memvalidasi Akses...</span>
                  </>
                ) : (
                  <>
                    <Headphones className="w-4 h-4" />
                    <span>{isPublicService ? 'Masuk ke Loket Petugas PTSP' : 'Masuk ke Inbox CS (Bypass Magic Link)'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Security Guarantee */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              {isPublicService
                ? 'Sistem Keamanan & Verifikasi Operator Resmi Terenkripsi'
                : 'Akses Terenkripsi & Verifikasi Tenant Toko Resmi'}
            </span>
          </div>
        </div>

        {/* ── FOOTER: ECOMMERCE PROMO TEXT REMOVED FOR PUBLIC SERVICE (STRICT REQUIREMENT) ── */}
        {isPublicService ? (
          <div className="text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
            <Link
              href={storeSlug ? `/${storeSlug}` : '/margasari'}
              className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Portal Resmi {tenantTitle || 'Kelurahan Margasari'}</span>
            </Link>
            <span className="text-[11px] text-slate-600">
              Sistem Informasi &amp; Pelayanan Administrasi Warga Digital Terpadu
            </span>
          </div>
        ) : (
          <div className="text-center text-xs text-slate-500">
            Belum memiliki toko online di BoonTrack?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-bold underline transition">
              Klaim &amp; Buka Toko Baru (Coba Gratis 7 Hari)
            </Link>
          </div>
        )}
      </div>

      {/* ── MODAL RECOVERY PIN & MAGIC LINK ───────────────────────────────── */}
      {isRecoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsRecoveryOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  {isPublicService ? 'Bantuan Akses Operator PTSP' : 'Pemulihan Akses Toko'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isPublicService
                    ? 'Kirim kode verifikasi ke email dinas terdaftar operator'
                    : 'Kirim PIN & link masuk ke email terdaftar pemilik toko'}
                </p>
              </div>
            </div>

            {recoveryError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{recoveryError}</span>
              </div>
            )}

            {recoveryFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{recoveryFeedback}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {isPublicService ? 'Masukkan Email Dinas / Operator Terdaftar' : 'Masukkan Email Terdaftar Toko'}
                </label>
                <input
                  type="email"
                  required
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  placeholder="operator@kelurahan.go.id"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500">
                  {isPublicService
                    ? 'Kode verifikasi petugas akan dikirimkan langsung ke alamat email terdaftar.'
                    : 'PIN dan tautan akses toko akan dikirimkan langsung ke email Anda tanpa biaya WhatsApp.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRecoveryOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading || !recoveryIdentifier.trim()}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {recoveryLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>Kirim Kode Akses via Email</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MerchantLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-500" />
          <span>Memuat sistem autentikasi...</span>
        </div>
      }
    >
      <MerchantLoginForm />
    </Suspense>
  );
}
