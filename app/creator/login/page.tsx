'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Lock,
  User,
  AtSign,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

function CreatorLoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/admin';

  const [mode, setMode] = useState<'handle' | 'email'>('handle');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const identifier = mode === 'handle' ? handle.trim() : email.trim();
    const secret = mode === 'handle' ? pin.trim() : password.trim();

    if (!identifier) {
      setErrorMsg(mode === 'handle' ? 'Mohon masukkan handle bio link Anda (@nama_kamu).' : 'Mohon masukkan alamat email akun Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          pin: mode === 'handle' ? secret : undefined,
          password: mode === 'email' ? secret : undefined,
          email: mode === 'email' ? identifier : undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccessMsg(data.message || 'Login berhasil! Mengalihkan ke workspace...');

        if (typeof window !== 'undefined') {
          const resolvedHandle = data.data?.handle || handle.replace(/^@+/, '').trim();
          localStorage.setItem('creator_handle', resolvedHandle);
          if (data.data?.name || data.data?.display_name) {
            localStorage.setItem('creator_display_name', data.data.name || data.data.display_name);
          }
          document.cookie = `creator_handle=${encodeURIComponent(resolvedHandle)}; path=/; max-age=2592000; SameSite=Lax`;
          document.cookie = `creator_session=${encodeURIComponent(resolvedHandle)}; path=/; max-age=2592000; SameSite=Lax`;
        }

        const targetUrl = redirectTo.startsWith('/') ? redirectTo : '/admin';
        setTimeout(() => {
          router.push(targetUrl);
          setTimeout(() => {
            window.location.href = targetUrl;
          }, 300);
        }, 500);
      } else {
        setErrorMsg(data.message || 'Gagal masuk. Periksa kembali kredensial Anda.');
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg('Terjadi gangguan jaringan: ' + (err.message || 'Silakan ulangi.'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 selection:bg-orange-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col justify-between">
      {/* Ambient Sunset Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-orange-500/10 via-rose-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />

      {/* Top Navbar Minimal */}
      <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500 p-[1px] shadow-sm">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-slate-900 tracking-tight text-base">boontrack</span>
              <span className="text-[10px] font-black tracking-widest bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 bg-clip-text text-transparent uppercase">
                CREATOR
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </Link>
        </div>
      </header>

      {/* Main Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-9 shadow-xl shadow-slate-200/50 space-y-6">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/80 text-orange-700 text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
              <span>Autentikasi Terproteksi Server</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Masuk Creator Workspace
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Kelola etalase bio link, tautan Shopee anti-webview trap, QRIS donasi, dan komisi endorsement Anda.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1 text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => { setMode('handle'); setErrorMsg(''); }}
              className={`py-2 rounded-xl transition-all ${
                mode === 'handle'
                  ? 'bg-white text-slate-900 shadow-sm shadow-slate-200 font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              Handle Bio Link
            </button>
            <button
              type="button"
              onClick={() => { setMode('email'); setErrorMsg(''); }}
              className={`py-2 rounded-xl transition-all ${
                mode === 'email'
                  ? 'bg-white text-slate-900 shadow-sm shadow-slate-200 font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              Email & Supabase
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'handle' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Handle Bio Link</span>
                    <span className="text-[10px] text-slate-400 font-normal">Contoh: @suzieray</span>
                  </label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="suzieray"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>PIN / Password Akses</span>
                    <span className="text-[10px] text-slate-400 font-normal">Minimal 4 digit</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Masukkan PIN Anda"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Alamat Email Akun
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@boontrack.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showSecret ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akses...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Card */}
          <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-xs text-slate-500 text-center">
            <p>
              Belum punya bio link kreator?{' '}
              <Link href="/register" className="font-bold text-orange-600 hover:underline">
                Daftar Gratis
              </Link>
            </p>
            <p className="text-[11px] text-slate-400">
              Pintu masuk aman terisolasi untuk kreator & affiliate BoonTrack.
            </p>
          </div>
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="py-4 text-center text-[11px] text-slate-400 border-t border-slate-200/60">
        © 2026 PT BOONTRACK INOVASI DIGITAL • Creator & Affiliate Bio Link Platform
      </footer>
    </div>
  );
}

export default function CreatorLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAFAFC] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
          <span>Memuat pintu masuk Creator...</span>
        </div>
      </div>
    }>
      <CreatorLoginFormContent />
    </Suspense>
  );
}
