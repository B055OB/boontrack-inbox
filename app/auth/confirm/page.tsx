'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Mail,
  Store,
  ExternalLink,
  ShieldCheck,
  Bot,
} from 'lucide-react';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Support various parameter naming conventions (token, token_hash, code)
  const token =
    searchParams.get('token') ||
    searchParams.get('token_hash') ||
    searchParams.get('code') ||
    '';
  const type = (searchParams.get('type') || 'merchant').toLowerCase();
  const slug = searchParams.get('slug') || '';
  const id = searchParams.get('id') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Boon Pilot sedang memverifikasi token aktivasi akun Anda...');
  const [storeName, setStoreName] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Tautan aktivasi tidak lengkap atau token tidak ditemukan.');
      return;
    }

    let isMounted = true;

    async function executeVerification() {
      try {
        const res = await fetch('/api/v1/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, type, slug, id }),
        });

        const data = await res.json().catch(() => ({}));

        if (!isMounted) return;

        if (res.ok && data.success) {
          setStatus('success');
          setMessage(data.message || 'Akun Anda berhasil diaktifkan!');
          if (data.store_name) setStoreName(data.store_name);

          const dest =
            data.redirect_url ||
            (type === 'affiliate' ? '/affiliate/dashboard' : `/${data.tenant_slug || slug || 'login'}`);
          setRedirectUrl(dest);

          // Auto-redirect after 4 seconds
          setTimeout(() => {
            router.push(dest);
          }, 4000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Tautan aktivasi tidak valid atau telah kedaluwarsa.');
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Gagal menghubungi server verifikasi.';
        setStatus('error');
        setMessage(msg);
      }
    }

    executeVerification();

    return () => {
      isMounted = false;
    };
  }, [token, type, slug, id, router]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;

    setIsResending(true);
    setResendSuccess('');
    setResendError('');

    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail, type, slug }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setResendSuccess('Email aktivasi baru berhasil dikirim oleh Boon Pilot! Silakan cek inbox Anda.');
      } else {
        setResendError(data.error || 'Gagal mengirim ulang email aktivasi.');
      }
    } catch {
      setResendError('Kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-emerald-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-teal-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
        {/* Header Persona Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-300 shadow-sm">
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
          <span>Boon Pilot Account Activation</span>
        </div>

        {/* ── STATE: VERIFYING ── */}
        {status === 'verifying' && (
          <div className="space-y-5 py-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-white">Memverifikasi Akun...</h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        )}

        {/* ── STATE: SUCCESS ── */}
        {status === 'success' && (
          <div className="space-y-5 py-4 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-white">
                Akun Berhasil Diaktifkan! 🚀
              </h2>
              {storeName && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-emerald-300">
                  <Store className="w-3.5 h-3.5" />
                  <span>{storeName}</span>
                </div>
              )}
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto pt-1">
                {message} Boon Pilot siap mendampingi kamu mengembangkan toko online dan mengotomatisasi penjualanmu.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 font-mono">
              <span>Mengarahkan otomatis ke dashboard dalam 4 detik...</span>
            </div>

            {redirectUrl && (
              <Link
                href={redirectUrl}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <span>Buka Dashboard Toko Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        )}

        {/* ── STATE: ERROR ── */}
        {status === 'error' && (
          <div className="space-y-5 py-2 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-white">
                Aktivasi Belum Berhasil
              </h2>
              <p className="text-xs text-rose-300/90 leading-relaxed max-w-xs mx-auto">
                {message}
              </p>
            </div>

            {/* Resend Form */}
            <div className="pt-2 border-t border-slate-800 space-y-3 text-left">
              <span className="text-[11px] font-bold text-slate-400 block text-center">
                Minta Boon Pilot kirim ulang email aktivasi:
              </span>

              {resendSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs text-center font-medium">
                  {resendSuccess}
                </div>
              )}

              {resendError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center font-medium">
                  {resendError}
                </div>
              )}

              <form onSubmit={handleResend} className="space-y-2">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="Masukkan email Anda..."
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="submit"
                  disabled={isResending || !resendEmail}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isResending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  <span>Kirim Ulang Email Aktivasi</span>
                </button>
              </form>
            </div>

            <div className="pt-2">
              <Link
                href="/login"
                className="text-xs text-slate-400 hover:text-white underline transition"
              >
                Kembali ke Halaman Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs text-slate-400">
          Memuat verifikasi akun...
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
