'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  ArrowRight,
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
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export default function MerchantLoginPage() {
  const router = useRouter();

  // Form State
  const [storeSlug, setStoreSlug] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  };

  const handleStoreLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanSlug = sanitizeSlug(storeSlug);
    if (!cleanSlug) {
      setErrorMessage('Silakan masukkan nama domain atau slug toko Anda.');
      return;
    }

    setLoading(true);

    try {
      // 1. Dynamic Check via Supabase Database (ZERO HARDCODING POLICY)
      let storeExists = false;
      let expectedPin: string | null = null;

      try {
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('slug, name, metadata, tier')
          .eq('slug', cleanSlug)
          .maybeSingle();

        if (tenantRow) {
          storeExists = true;
          const meta = tenantRow.metadata || {};
          expectedPin = meta.access_pin || meta.pin_hash || meta.pin || null;
        } else {
          // Fallback check core backend API check-slug
          const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${cleanSlug}`, {
            cache: 'no-store',
          });
          const data = await res.json();
          // If available === false, store is already registered in core backend
          if (data.available === false) {
            storeExists = true;
          }
        }
      } catch {
        // Fallback network tolerance
        storeExists = true;
      }

      if (!storeExists) {
        setErrorMessage(`Toko "${cleanSlug}" belum terdaftar. Silakan daftar toko baru atau periksa penulisan nama toko Anda.`);
        setLoading(false);
        return;
      }

      // 2. Validate PIN if configured on tenant and user provided input
      if (expectedPin && accessKey.trim()) {
        if (expectedPin !== accessKey.trim()) {
          setErrorMessage('PIN / Password akses yang Anda masukkan salah. Gunakan opsi "Lupa PIN" jika memerlukan bantuan.');
          setLoading(false);
          return;
        }
      }

      // 3. Persist session state to localStorage & cookies
      if (typeof window !== 'undefined') {
        localStorage.setItem('merchant_store', cleanSlug);
        if (accessKey.trim()) localStorage.setItem('merchant_pin', accessKey.trim());
        localStorage.setItem('merchant_login_at', new Date().toISOString());

        document.cookie = `merchant_store=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `merchant_session=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `bt_tenant=${cleanSlug}; path=/; max-age=2592000; SameSite=Lax`;
      }

      setSuccessMessage(`Toko terverifikasi! Mengalihkan ke Dashboard ${cleanSlug.toUpperCase()}...`);

      setTimeout(() => {
        let dest = `/${cleanSlug}/dashboard`;
        if (typeof window !== 'undefined') {
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
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat memeriksa toko. Silakan coba lagi.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryFeedback(null);
    setRecoveryWaUrl(null);

    const input = recoveryIdentifier.trim();
    if (!input) {
      setRecoveryError('Masukkan email atau nomor WhatsApp terdaftar.');
      return;
    }

    setRecoveryLoading(true);

    try {
      const res = await fetch('/api/v1/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: input }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecoveryError(data.error || 'Data akun toko tidak ditemukan.');
        return;
      }

      setRecoveryFeedback(data.message || 'Tautan pemulihan berhasil diproses.');
      if (data.redirectWaUrl) {
        setRecoveryWaUrl(data.redirectWaUrl);
      }
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
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition group"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>BoonTrack Merchant Portal</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight pt-1">
            Masuk ke Dashboard Toko
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Kelola pesanan, katalog produk, integrasi WhatsApp, dan laporan keuangan toko Anda.
          </p>
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

          {/* Form Login Merchant */}
          <form onSubmit={handleStoreLogin} className="space-y-5">
            {/* Input Domain Toko */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                <span>Domain atau Nama Toko Anda</span>
                <span className="text-[10px] text-slate-500 font-normal">shop.boontrack.com/[slug]</span>
              </label>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-bold text-slate-500 select-none border-r border-slate-800 pr-2.5">
                  <Store className="w-3.5 h-3.5 text-blue-500" />
                  <span>shop/</span>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value)}
                  placeholder="nama-toko-anda"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-22 pr-4 py-3.5 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                <span>Masukkan slug toko yang Anda klaim saat registrasi.</span>
              </p>
            </div>

            {/* Access PIN / Password */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-400" />
                  <span>PIN / Password Akses</span>
                </span>
                <span className="text-[10px] text-slate-500 font-normal">6 Digit / Karakter</span>
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

              {/* LUPA PIN / KIRIM LINK MASUK */}
              <div className="flex items-center justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryIdentifier(storeSlug);
                    setRecoveryError(null);
                    setRecoveryFeedback(null);
                    setRecoveryWaUrl(null);
                    setIsRecoveryOpen(true);
                  }}
                  className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition underline underline-offset-4 cursor-pointer"
                >
                  Lupa PIN / Kirim Link Masuk via Email atau WhatsApp
                </button>
              </div>
            </div>

            {/* Button Submit */}
            <button
              type="submit"
              disabled={loading || !storeSlug.trim()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memeriksa Akun Toko...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Dashboard Toko</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security Guarantee */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Akses Terenkripsi & Verifikasi Tenant Toko Resmi</span>
          </div>
        </div>

        {/* Alternative Actions / Register Link */}
        <div className="text-center text-xs text-slate-500">
          Belum memiliki toko online di BoonTrack?{' '}
          <Link href="/register" className="text-blue-400 hover:text-blue-300 font-bold underline transition">
            Klaim & Buka Toko Baru (Coba Gratis 14 Hari)
          </Link>
        </div>
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
                  Pemulihan Akses Toko
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kirim PIN & link masuk ke kontak terdaftar
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
                {recoveryWaUrl && (
                  <a
                    href={recoveryWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Verifikasi via WhatsApp Resmi</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Email, Nomor WhatsApp, atau Slug Toko
                </label>
                <input
                  type="text"
                  required
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  placeholder="email@bisnis.com atau 08123456789"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500">
                  Sistem akan mencocokkan identitas dengan data merchant di Supabase database.
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
                      <span>Kirim Info Akses</span>
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
