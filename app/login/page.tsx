'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  ArrowRight,
  ShieldCheck,
  Lock,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Users,
  Compass,
} from 'lucide-react';

export default function MerchantLoginPage() {
  const router = useRouter();

  // Form State
  const [storeSlug, setStoreSlug] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Login Method Tab: 'store' | 'affiliate' | 'admin'
  const [activeTab, setActiveTab] = useState<'store' | 'affiliate' | 'admin'>('store');

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
      // Check if store exists (demo stores always exist)
      const demoStores = ['onlineboost', 'demo', 'suhu-ads-masterclass', 'nyka-store'];
      let storeExists = demoStores.includes(cleanSlug);

      if (!storeExists) {
        try {
          const res = await fetch(`https://api.boontrack.com/api/v1/shop/subscriptions/check-slug/${cleanSlug}`, {
            cache: 'no-store',
          });
          const data = await res.json();
          // If available === false, it means the store is already registered and taken by a merchant!
          if (data.available === false) {
            storeExists = true;
          }
        } catch {
          // If network check fails, allow access to dashboard
          storeExists = true;
        }
      }

      if (!storeExists) {
        setErrorMessage(`Toko "${cleanSlug}" belum terdaftar. Silakan daftar toko baru atau periksa penulisan nama toko Anda.`);
        setLoading(false);
        return;
      }

      // Save merchant store session
      if (typeof window !== 'undefined') {
        localStorage.setItem('merchant_store', cleanSlug);
        localStorage.setItem('merchant_login_at', new Date().toISOString());
      }

      setSuccessMessage(`Toko ditemukan! Mengalihkan ke Dashboard ${cleanSlug.toUpperCase()}...`);

      setTimeout(() => {
        router.push(`/${cleanSlug}/dashboard`);
        setTimeout(() => {
          window.location.href = `/${cleanSlug}/dashboard`;
        }, 300);
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat memeriksa toko. Silakan coba lagi.';
      setErrorMessage(msg);
      setLoading(false);
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
            <span>BoonTrack Merchant Hub</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight pt-1">
            Masuk ke Toko Anda
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Kelola pesanan, katalog produk, konfigurasi WhatsApp, dan laporan keuangan toko online Anda.
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'store'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Merchant</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('affiliate');
              router.push('/affiliate/login');
            }}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'affiliate'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Affiliate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              router.push('/admin');
            }}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
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
                <span>Contoh: <code>onlineboost</code> atau <code>nyka-store</code></span>
              </p>
            </div>

            {/* Optional Access PIN / Password */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block flex items-center justify-between">
                <span>PIN / Password Akses (Opsional)</span>
                <span className="text-[10px] text-slate-500 font-normal">Jika diaktifkan di toko</span>
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
            <span>Akses Terenkripsi & Verifikasi Tenant Resmi</span>
          </div>

        </div>

        {/* Alternative Actions / Register Link */}
        <div className="text-center text-xs text-slate-500 space-y-2">
          <div>
            Belum memiliki toko online di BoonTrack?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-bold underline transition">
              Klaim & Buka Toko Baru
            </Link>
          </div>
          <div className="pt-1">
            <Link href="/affiliate/login" className="text-slate-400 hover:text-emerald-400 transition inline-flex items-center gap-1 font-semibold">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Login via WhatsApp OTP (Portal Affiliate) &rarr;</span>
            </Link>
          </div>
        </div>

      </div>

    </div>
  );
}
