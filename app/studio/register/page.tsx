'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  User,
  Phone,
  QrCode,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  Film
} from 'lucide-react';

export default function StudioRegisterPage() {
  const router = useRouter();

  // Registration Form State (State 1)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Verification State (State 2)
  const [isVerifying, setIsVerifying] = useState(false);
  const [token, setToken] = useState('');
  const [waLink, setWaLink] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(900); // 15 mins
  const [copiedLink, setCopiedLink] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Success State (State 3)
  const [isSuccess, setIsSuccess] = useState(false);
  const [successSlug, setSuccessSlug] = useState('');

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Normalizing WA live preview
  const formattedWaPreview = whatsapp
    ? whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '62').replace(/^8/, '628')
    : '';

  // Countdown timer for 15 minutes TTL
  useEffect(() => {
    if (!isVerifying || !expiresAt || isSuccess) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setRemainingSeconds(diff);
      if (diff <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isVerifying, expiresAt, isSuccess]);

  // Polling registration status every 2.5 seconds
  useEffect(() => {
    if (!isVerifying || !token || isSuccess) return;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/studio/auth/registration-status?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.status === 'SUCCESS' && data.session) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setIsSuccess(true);
          const tenantSlug = data.session.slug || 'studio';
          setSuccessSlug(tenantSlug);

          // Save session locally
          if (typeof window !== 'undefined') {
            localStorage.setItem('merchant_store', tenantSlug);
            localStorage.setItem('merchant_session', tenantSlug);
            localStorage.setItem('bt_tenant', tenantSlug);
            localStorage.setItem('studio_session', JSON.stringify(data.session));
            document.cookie = `merchant_store=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
            document.cookie = `merchant_session=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
            document.cookie = `bt_tenant=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
          }

          // Instant redirect to studio.boontrack.com/desk
          setTimeout(() => {
            const isProd = window.location.hostname.endsWith('boontrack.com');
            if (isProd) {
              window.location.href = 'https://studio.boontrack.com/desk';
            } else {
              router.push('/desk');
            }
          }, 1500);
        } else if (data.status === 'EXPIRED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setErrorMsg(data.message || 'Token kedaluwarsa. Silakan lakukan registrasi ulang.');
        }
      } catch (err) {
        console.warn('[Studio Polling] Network error:', err);
      }
    };

    pollingRef.current = setInterval(pollStatus, 2500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isVerifying, token, isSuccess, router]);

  // Handle Form Submission (State 1 -> State 2)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (name.trim().length < 2) {
      setErrorMsg('Nama lengkap minimal 2 karakter.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Format email tidak valid.');
      return;
    }

    const cleanPhone = whatsapp.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
      setErrorMsg('Nomor WhatsApp minimal 8 digit.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Kata sandi minimal 8 karakter.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/studio/auth/register-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: cleanPhone,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memulai registrasi.');
      }

      setToken(data.token);
      setWaLink(data.wa_link);
      const expTime = new Date(data.expires_at).getTime();
      setExpiresAt(expTime);
      setRemainingSeconds(Math.max(0, Math.floor((expTime - Date.now()) / 1000)));
      setIsVerifying(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  // Simulate verification for testing without WhatsApp SIM
  const handleSimulateVerify = async () => {
    if (!token) return;
    setSimulating(true);
    try {
      const res = await fetch('/api/studio/auth/registration-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Gagal simulasi verifikasi.');
      }
    } catch (err: any) {
      alert('Gagal simulasi: ' + err.message);
    } finally {
      setSimulating(false);
    }
  };

  const copyWaText = () => {
    navigator.clipboard.writeText(`AKTIFKAN STUDIO ${token}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col justify-between">
      {/* Background Studio Glow Mesh */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-fuchsia-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />

      {/* ── TOP HEADER ────────────────────────────────────────── */}
      <header className="p-4 sm:p-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/studio" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-purple-600 p-0.5 shadow-md shadow-fuchsia-500/20">
            <div className="w-full h-full bg-[#0B0F17] rounded-[10px] flex items-center justify-center">
              <Film className="w-4 h-4 text-fuchsia-400" />
            </div>
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white">boontrack</span>
            <span className="ml-1 text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-400 bg-clip-text text-transparent uppercase">
              STUDIO
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="text-xs font-medium text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Beranda Studio
          </Link>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <main className="max-w-md mx-auto w-full px-4 py-8 flex-1 flex flex-col justify-center">
        {/* ======================================================== */}
        {/* STATE 3: REDIRECT SUKSES                                 */}
        {/* ======================================================== */}
        {isSuccess ? (
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-emerald-500/30 backdrop-blur-xl text-center shadow-2xl shadow-emerald-500/10 space-y-5 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto text-2xl shadow-lg shadow-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-white">Workspace Studio Aktif!</h2>
              <p className="text-xs text-slate-400">
                Nomor WhatsApp Anda telah terverifikasi secara resmi. Menyiapkan ruang kerja Studio Desk Anda...
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-black/40 border border-white/5 text-xs font-mono text-emerald-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Redirecting to studio.boontrack.com/desk</span>
            </div>
          </div>
        ) : isVerifying ? (
          /* ======================================================== */
          /* STATE 2: LAYAR TUNGGU VERIFIKASI (INBOUND WHATSAPP)      */
          /* ======================================================== */
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero-Cost Inbound Verification</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Verifikasi Nomor WhatsApp Anda
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Kirim pesan konfirmasi satu ketuk ke WhatsApp resmi BoonTrack untuk mengaktifkan workspace Studio Anda tanpa biaya pulsa/SMS.
              </p>
            </div>

            {/* Countdown Clock & Status Box */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="text-slate-300 font-medium">Menunggu pesan konfirmasi...</span>
              </div>
              <div className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg">
                {formatClock(remainingSeconds)}
              </div>
            </div>

            {/* Token Highlight Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-fuchsia-950/40 via-purple-950/40 to-slate-950 border border-fuchsia-500/30 text-center space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">
                Kode Token Aktivasi Anda
              </span>
              <div className="flex items-center justify-center gap-2 font-mono text-2xl font-black tracking-widest text-white">
                <span>{token}</span>
                <button
                  type="button"
                  onClick={copyWaText}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition cursor-pointer"
                  title="Salin Pesan"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Pesan: <strong className="text-slate-200">AKTIFKAN STUDIO {token}</strong>
              </p>
            </div>

            {/* Dual-Mode Responsive Action */}
            <div className="space-y-4">
              {/* Mobile CTA Button */}
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <span>Buka WhatsApp & Kirim Pesan Konfirmasi</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              {/* Desktop Dynamic QR Code Section */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 text-center space-y-3">
                <span className="text-[11px] font-bold text-slate-400 block">
                  Atau Scan QR Code Langsung dari HP Anda:
                </span>
                <div className="w-48 h-48 mx-auto p-2.5 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(waLink)}`}
                    alt="WhatsApp QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  Arahkan kamera ponsel Anda ke QR Code di atas untuk membuka aplikasi WhatsApp secara instan.
                </p>
              </div>
            </div>

            {/* Polling Spinner & Helper Info */}
            <div className="pt-1 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                <span>Mendeteksi pesan masuk dari {formattedWaPreview || 'WhatsApp Anda'}...</span>
              </div>

              {/* Dev Simulation Option */}
              <div className="pt-2 border-t border-white/5 w-full flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setIsVerifying(false)}
                  className="text-slate-500 hover:text-slate-300 font-medium transition cursor-pointer"
                >
                  ← Ubah Data Pendaftaran
                </button>
                <button
                  type="button"
                  onClick={handleSimulateVerify}
                  disabled={simulating}
                  className="text-fuchsia-400/80 hover:text-fuchsia-300 font-mono text-[10px] underline cursor-pointer"
                >
                  {simulating ? 'Mengaktifkan...' : '[Dev Mode: Simulasi Aktifkan]'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* STATE 1: FORM PENDAFTARAN                                */
          /* ======================================================== */
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pendaftaran Mandiri BoonTrack Studio</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Mulai Studio Workspace
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kelola script UGC, antrean render video otomatis, dan aset kreatif brand Anda dalam satu kontrol ruang terpadu.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Alldy Pratama"
                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                  />
                </div>
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Nomor WhatsApp Aktif</span>
                  <span className="text-[10px] text-fuchsia-400 font-mono">Format 62</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                  />
                </div>
                {formattedWaPreview && (
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    Nomor dinormalisasi: +{formattedWaPreview}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi (Minimal 8 Karakter)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 px-4 rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-purple-600 hover:from-fuchsia-600 hover:via-pink-600 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-fuchsia-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan Token Aktivasi...</span>
                  </>
                ) : (
                  <>
                    <span>Lanjut ke Verifikasi WhatsApp</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-xs text-slate-500">
              <span>Sudah memiliki akun Studio? </span>
              <Link href="/studio" className="text-fuchsia-400 font-bold hover:underline">
                Masuk ke Workspace
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5">
        <div className="flex items-center justify-center gap-2">
          <span>BoonTrack Studio Control Room</span>
          <span>•</span>
          <span className="text-slate-400">Zero-Cost WABA Activation</span>
        </div>
      </footer>
    </div>
  );
}
