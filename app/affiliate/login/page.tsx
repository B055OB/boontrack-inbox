'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Smartphone,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  ChevronLeft,
  Sparkles,
  TrendingUp,
  MessageCircle,
} from 'lucide-react';

export default function AffiliateLoginPage() {
  const router = useRouter();

  // Form State: 1 = Phone Number, 2 = OTP Verification
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // UI / Status State
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Countdown timer for OTP Resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Clean and normalize Indonesian phone number
  const cleanPhoneNumber = (input: string): string => {
    let clean = input.replace(/\D/g, '');
    if (clean.startsWith('62')) {
      clean = '0' + clean.slice(2);
    } else if (clean.startsWith('8')) {
      clean = '0' + clean;
    }
    return clean;
  };

  // ── STEP 1: SEND OTP ──
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formattedPhone = cleanPhoneNumber(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      setErrorMessage('Silakan masukkan nomor WhatsApp yang valid (minimal 10 digit).');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        'https://boontrack-core-production.up.railway.app/api/v1/auth/affiliate/send-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formattedPhone }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok && data?.detail) {
        throw new Error(data.detail);
      }

      setStep(2);
      setCountdown(60);
      setCanResend(false);
      setSuccessMessage(`Kode OTP telah dikirimkan ke WhatsApp ${formattedPhone}`);
      setOtpValues(['', '', '', '', '', '']);

      // Focus first OTP input after entering step 2
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim kode OTP. Silakan coba lagi.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 2: VERIFY OTP ──
  const handleVerifyOtp = async (e?: React.FormEvent, fullOtp?: string) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const otpCode = fullOtp || otpValues.join('');
    if (otpCode.length !== 6) {
      setErrorMessage('Silakan masukkan 6 digit kode OTP yang lengkap.');
      return;
    }

    const formattedPhone = cleanPhoneNumber(phone);
    setLoading(true);

    try {
      const res = await fetch(
        'https://boontrack-core-production.up.railway.app/api/v1/auth/affiliate/verify-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formattedPhone,
            otp: otpCode,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.detail || 'Kode OTP salah atau telah kedaluwarsa. Silakan periksa kembali.');
      }

      // Extract Token & Affiliate Profile
      const token =
        json.access_token ||
        json.token ||
        json.data?.access_token ||
        json.data?.token ||
        `bt_aff_jwt_${Date.now()}`;

      const resolvedCode =
        json.affiliate?.referral_code ||
        json.data?.affiliate?.referral_code ||
        json.referral_code ||
        json.data?.referral_code ||
        `AFF-${formattedPhone.slice(-4)}`;

      const resolvedTenant =
        json.affiliate?.tenant_slug ||
        json.data?.affiliate?.tenant_slug ||
        json.tenant ||
        'cornvest';

      const resolvedName =
        json.affiliate?.name ||
        json.data?.affiliate?.name ||
        json.name ||
        `Affiliate ${formattedPhone.slice(-4)}`;

      const affiliateData = {
        id: json.affiliate?.id || json.data?.id || `aff_${Date.now()}`,
        phone: formattedPhone,
        referral_code: resolvedCode,
        tenant_slug: resolvedTenant,
        name: resolvedName,
        commission_rate: json.affiliate?.commission_rate || 20,
        authenticated_at: new Date().toISOString(),
        ...(typeof json.affiliate === 'object' ? json.affiliate : {}),
        ...(typeof json.data?.affiliate === 'object' ? json.data.affiliate : {}),
      };

      // 3. Save Session to localStorage & Secure Cookie
      localStorage.setItem('affiliate_token', token);
      document.cookie = `affiliate_token=${token}; path=/; max-age=604800; SameSite=Lax; Secure`;
      localStorage.setItem('affiliate_data', JSON.stringify(affiliateData));

      setSuccessMessage('Verifikasi berhasil! Mengalihkan ke Dashboard Affiliate...');

      // Redirect to Affiliate Dashboard
      setTimeout(() => {
        router.push('/affiliate/dashboard');
        // Fallback redirection
        setTimeout(() => {
          window.location.href = '/affiliate/dashboard';
        }, 300);
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verifikasi gagal. Pastikan kode OTP sesuai.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP digit input changes with auto-advance and paste support
  const handleOtpChange = (index: number, val: string) => {
    // Handle paste
    if (val.length > 1) {
      const pasted = val.replace(/\D/g, '').slice(0, 6);
      if (pasted) {
        const newArr = [...otpValues];
        for (let i = 0; i < 6; i++) {
          newArr[i] = pasted[i] || '';
        }
        setOtpValues(newArr);
        const nextIdx = Math.min(pasted.length, 5);
        otpInputRefs.current[nextIdx]?.focus();

        if (pasted.length === 6) {
          handleVerifyOtp(undefined, pasted);
        }
      }
      return;
    }

    const singleDigit = val.replace(/\D/g, '');
    const newArr = [...otpValues];
    newArr[index] = singleDigit;
    setOtpValues(newArr);

    // Auto-focus next input
    if (singleDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits are filled
    const allFilled = newArr.every((digit) => digit !== '');
    if (allFilled) {
      handleVerifyOtp(undefined, newArr.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-hidden selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Background Decorative Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Platform Affiliate • Whitelist Account Manager (AM)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight pt-1">
            Portal Affiliate shop.boontrack.com
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Khusus mitra partner resmi yang didaftarkan langsung oleh Account Manager (AM). Verifikasi instan menggunakan nomor WhatsApp yang terdaftar di whitelist.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          
          {/* Alerts Banner */}
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

          {/* ─────────────────────────────────────────────────────────────
              STEP 1: INPUT NOMOR WHATSAPP
          ───────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Nomor WhatsApp Terdaftar
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs font-bold text-slate-400 select-none border-r border-slate-800 pr-2.5">
                    <span className="text-sm">🇮🇩</span>
                    <span>+62</span>
                  </div>
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="812-3456-7890"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-20 pr-4 py-3.5 text-base sm:text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kode 6-digit OTP akan dikirim otomatis ke WhatsApp.</span>
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Mengirim Kode OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Kirim Kode OTP WhatsApp</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 2: INPUT 6-DIGIT OTP
          ───────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              
              {/* Back to Phone Number Editor */}
              <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-slate-400 hover:text-white inline-flex items-center gap-1 font-semibold transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Ubah Nomor</span>
                </button>

                <span className="font-mono text-emerald-400 font-bold">
                  {cleanPhoneNumber(phone)}
                </span>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block text-center">
                  Masukkan 6 Digit Kode OTP
                </label>

                <div className="grid grid-cols-6 gap-2 sm:gap-3 py-1">
                  {otpValues.map((val, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={val}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="w-full aspect-square text-center bg-slate-950 border border-slate-800 rounded-2xl text-xl font-mono font-black text-emerald-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                    />
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || otpValues.join('').length !== 6}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Memverifikasi Kode OTP...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verifikasi & Masuk Dashboard</span>
                  </>
                )}
              </button>

              {/* Resend OTP Section */}
              <div className="text-center pt-1">
                {canResend ? (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={loading}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition cursor-pointer"
                  >
                    Kirim Ulang Kode OTP
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    Kirim ulang kode dalam{' '}
                    <strong className="text-slate-300 font-mono">
                      {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                      {String(countdown % 60).padStart(2, '0')}
                    </strong>
                  </span>
                )}
              </div>

            </form>
          )}

          {/* Security Guarantee Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>Enkripsi TLS 1.3 & Proteksi Keamanan 2FA</span>
          </div>

        </div>

        {/* Whitelist Partner Only Notice */}
        <div className="text-center text-xs text-slate-400 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1">
          <p className="font-semibold text-slate-300">
            Akses Pendaftaran Eksklusif Account Manager (AM)
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Portal ini tertutup untuk pendaftaran publik mandiri. Hubungi Account Manager (AM) BoonTrack Anda jika nomor WhatsApp belum masuk ke whitelist partner.
          </p>
        </div>

      </div>

    </div>
  );
}
