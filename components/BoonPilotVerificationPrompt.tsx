'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface BoonPilotVerificationPromptProps {
  email: string;
  name?: string;
  type?: 'merchant' | 'affiliate';
  slug?: string;
  storeName?: string;
  onBack?: () => void;
}

export default function BoonPilotVerificationPrompt({
  email,
  name,
  type = 'merchant',
  slug,
  storeName,
  onBack,
}: BoonPilotVerificationPromptProps) {
  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Timer cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setResendStatus(null);

    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          type,
          slug,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setResendStatus({
          type: 'success',
          message: 'Boon Pilot berhasil mengirimkan tautan aktivasi baru ke inbox email Anda!',
        });
        setCooldown(60);
      } else {
        setResendStatus({
          type: 'error',
          message: data.error || 'Gagal mengirim ulang email aktivasi. Silakan coba lagi.',
        });
      }
    } catch {
      setResendStatus({
        type: 'error',
        message: 'Terjadi gangguan jaringan saat memanggil server aktivasi.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const getEmailProviderUrl = (emailAddress: string) => {
    const domain = emailAddress.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail') || domain.includes('googlemail')) {
      return 'https://mail.google.com';
    }
    if (domain.includes('yahoo')) {
      return 'https://mail.yahoo.com';
    }
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
      return 'https://outlook.live.com';
    }
    return `https://${domain}`;
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-9 shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Ambience glow */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Tag */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-300">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Boon Pilot Digital Assistant</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500">Aktivasi Akun Wajib</span>
      </div>

      {/* Icon and Title */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
          <Mail className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-black text-white tracking-tight">
            Cek Email Kamu Sekarang! 📬
          </h2>
          <p className="text-xs text-slate-400">
            Tautan konfirmasi akun telah dikirim oleh <strong className="text-slate-300">Boon Pilot &lt;pilot@boontrack.com&gt;</strong>
          </p>
        </div>
      </div>

      {/* Target Email Box */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 text-center space-y-1">
        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
          Email Tujuan Konfirmasi:
        </span>
        <div className="text-base font-bold text-emerald-400 font-mono break-all">
          {email}
        </div>
      </div>

      {/* Boon Pilot Friendly Message */}
      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
        <p className="text-xs text-slate-300 leading-relaxed">
          &ldquo;Halo{name ? ` ${name}` : ''}! Aku <strong>Boon Pilot</strong>, asisten digital yang bakal nemenin kamu ngembangin {type === 'affiliate' ? 'jaringan affiliate' : storeName ? `toko ${storeName}` : 'toko'}. Satu langkah kecil lagi! Buka emailmu dan klik <strong>&lsquo;Aktifkan Akun Saya&rsquo;</strong> untuk mengamankan akun dan membuka akses penuh ke dashboard.&rdquo;
        </p>
      </div>

      {/* Steps List */}
      <div className="space-y-2 text-xs text-slate-300 bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80">
        <div className="font-bold text-white text-[11px] uppercase tracking-wider mb-1">
          Langkah Mudah Aktivasi:
        </div>
        <div className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-slate-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
          <span>Buka kotak masuk (Inbox) atau folder <em>Spam/Promosi</em> pada email kamu.</span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-slate-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
          <span>Cari email dari <strong>Boon Pilot</strong> dengan subjek <em>&ldquo;Konfirmasi Akun BoonTrack Kamu 🚀&rdquo;</em>.</span>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-slate-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
          <span>Tekan tombol hijau <strong>&ldquo;Aktifkan Akun Saya&rdquo;</strong> untuk masuk ke dashboard tokomu.</span>
        </div>
      </div>

      {/* Status Feedback */}
      {resendStatus && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
            resendStatus.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          {resendStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{resendStatus.message}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        <a
          href={getEmailProviderUrl(email)}
          target="_blank"
          rel="noreferrer"
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
        >
          <span>Buka Aplikasi / Web Email</span>
          <ExternalLink className="w-4 h-4" />
        </a>

        <div className="flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className={`font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              cooldown > 0 || isResending
                ? 'text-slate-500 cursor-not-allowed'
                : 'text-emerald-400 hover:text-emerald-300 underline'
            }`}
          >
            {isResending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            <span>
              {cooldown > 0
                ? `Kirim ulang email (${cooldown}d)`
                : 'Kirim ulang email aktivasi'}
            </span>
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-slate-400 hover:text-white transition underline cursor-pointer"
            >
              Ubah Email / Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
