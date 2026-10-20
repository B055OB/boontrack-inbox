'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Phone,
  Key,
  QrCode,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  Film,
  MessageCircle,
  ArrowLeft
} from 'lucide-react';

function StudioRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Primary Bot Activation Form State
  const [whatsapp, setWhatsapp] = useState('');
  const [token, setToken] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Flow State
  const [loading, setLoading] = useState(false);
  const [requestingToken, setRequestingToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Bot WA Link State
  const [waLink, setWaLink] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isWaitingBot, setIsWaitingBot] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Read URL query params on mount (token, phone, ref)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlToken = searchParams.get('token') || searchParams.get('t');
      const urlPhone = searchParams.get('phone') || searchParams.get('wa');
      const urlRef = searchParams.get('ref') || searchParams.get('r');

      if (urlToken) {
        const cleanT = urlToken.toUpperCase().trim();
        setToken(cleanT);
        setWaLink(`https://wa.me/6285181830080?text=AKTIFKAN%20STUDIO%20${encodeURIComponent(cleanT)}`);
        setWaMessage(`AKTIFKAN STUDIO ${cleanT}`);
        setIsWaitingBot(true);
      }

      if (urlPhone) {
        setWhatsapp(urlPhone.replace(/[^0-9]/g, ''));
      }

      // Referral resolution
      const cookieMatch = document.cookie.match(/(?:^|;\s*)(?:ref|boontrack_referral_code)=([^;]+)/);
      const cookieRef = cookieMatch ? decodeURIComponent(cookieMatch[1]).trim().toLowerCase() : '';
      const localRef = (localStorage.getItem('boontrack_referral_code') || '').trim().toLowerCase();
      const resolvedRef = (urlRef || cookieRef || localRef).trim().toLowerCase();

      if (resolvedRef && resolvedRef !== '1' && resolvedRef !== 'null') {
        setReferralCode(resolvedRef);
      }
    }
  }, [searchParams]);

  // Live polling when token is active (auto-redirect when bot receives WhatsApp message)
  useEffect(() => {
    if (!token || !isWaitingBot) return;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/studio/auth/registration-status?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.status === 'SUCCESS' && data.session) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setSuccessMsg('🎉 Pesan verifikasi bot terdeteksi! Workspace Studio Anda telah aktif.');
          const tenantSlug = data.session.slug || 'studio';

          if (typeof window !== 'undefined') {
            localStorage.setItem('merchant_store', tenantSlug);
            localStorage.setItem('merchant_session', tenantSlug);
            localStorage.setItem('bt_tenant', tenantSlug);
            localStorage.setItem('studio_session', JSON.stringify(data.session));
            document.cookie = `merchant_store=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
            document.cookie = `merchant_session=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
            document.cookie = `bt_tenant=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
            document.cookie = `studio_session=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
          }

          setTimeout(() => {
            router.push('/desk');
            setTimeout(() => {
              window.location.href = '/desk';
            }, 300);
          }, 1200);
        }
      } catch (pollErr) {
        console.warn('[Studio Register Polling] Note:', pollErr);
      }
    };

    pollingRef.current = setInterval(pollStatus, 2500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [token, isWaitingBot, router]);

  // Request new token via WhatsApp bot helper
  const handleRequestToken = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    const cleanPhone = whatsapp.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMsg('Masukkan nomor WhatsApp aktif Anda terlebih dahulu untuk meminta kode aktivasi.');
      return;
    }

    setRequestingToken(true);

    try {
      const res = await fetch('/api/studio/auth/register-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: cleanPhone,
          referral_code: referralCode || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal membuat kode aktivasi.');
      }

      if (data.already_active) {
        setSuccessMsg('Nomor WhatsApp Anda sudah memiliki workspace Studio aktif! Mengalihkan ke workspace...');
        setTimeout(() => {
          router.push('/desk');
        }, 1200);
        return;
      }

      setToken(data.token);
      setWaLink(data.wa_link);
      setWaMessage(data.wa_message);
      setIsWaitingBot(true);

      // Open WhatsApp automatically in new tab
      if (data.wa_link && typeof window !== 'undefined') {
        window.open(data.wa_link, '_blank');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi gangguan saat memproses kode.');
    } finally {
      setRequestingToken(false);
    }
  };

  // Submit WhatsApp + Token for direct verification & activation
  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanPhone = whatsapp.replace(/[^0-9]/g, '');
    const cleanToken = token.trim().toUpperCase();

    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMsg('Mohon isi nomor WhatsApp aktif Anda.');
      return;
    }

    if (!cleanToken) {
      setErrorMsg('Mohon isi Kode / Token Aktivasi Bot (contoh: ACTXKPH).');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/studio/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: cleanPhone,
          token: cleanToken,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Kode aktivasi tidak valid.');
      }

      setSuccessMsg(data.message || 'Workspace berhasil diaktifkan!');
      const tenantSlug = data.slug || 'studio';

      if (typeof window !== 'undefined') {
        localStorage.setItem('merchant_store', tenantSlug);
        localStorage.setItem('merchant_session', tenantSlug);
        localStorage.setItem('bt_tenant', tenantSlug);
        if (data.session) {
          localStorage.setItem('studio_session', JSON.stringify(data.session));
        }
        document.cookie = `merchant_store=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
        document.cookie = `merchant_session=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
        document.cookie = `bt_tenant=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
        document.cookie = `studio_session=${encodeURIComponent(tenantSlug)}; path=/; max-age=2592000`;
      }

      setTimeout(() => {
        router.push('/desk');
        setTimeout(() => {
          window.location.href = '/desk';
        }, 300);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memverifikasi kode aktivasi.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col justify-between">
      {/* Background Studio Glow Meshes */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/20 via-fuchsia-600/15 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* Header Minimal */}
      <header className="border-b border-white/10 bg-[#0B0F17]/85 backdrop-blur-xl sticky top-0 z-40 py-4 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 to-indigo-600 shadow-lg shadow-fuchsia-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center">
                <Film className="w-4 h-4 text-fuchsia-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-white">boontrack</span>
              <span className="text-[10px] font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent uppercase">
                STUDIO
              </span>
            </div>
          </Link>

          <Link
            href="/desk"
            className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Studio Desk</span>
          </Link>
        </div>
      </header>

      {/* Main Activation Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="max-w-lg w-full bg-[#111624]/90 backdrop-blur-2xl border border-white/10 hover:border-fuchsia-500/30 rounded-3xl p-6 sm:p-9 shadow-2xl shadow-purple-950/50 space-y-7 relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-36 h-36 bg-fuchsia-600/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />

          {/* Heading */}
          <div className="text-center space-y-2 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Aktivasi Bot WhatsApp Otomatis</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Aktivasi Akun Studio
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Sama seperti BoonTrack Shop, akun Anda diaktifkan langsung melalui nomor WhatsApp resmi bot tanpa perlu registrasi email konvensional.
            </p>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Primary Form: Only WhatsApp and Activation Code */}
          <form onSubmit={handleActivateSubmit} className="space-y-4 relative z-10">
            {/* 1. Input Nomor WhatsApp */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Nomor WhatsApp Aktif</span>
                <span className="text-[10px] text-zinc-500 font-normal">Contoh: 081234567890</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="081234567890"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 transition"
                />
              </div>
            </div>

            {/* 2. Input Kode/Token Aktivasi */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Kode / Token Aktivasi Bot</span>
                <span className="text-[10px] text-fuchsia-400 font-mono font-semibold">Format: ACTXXXX</span>
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="Contoh: ACTXKPH"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm font-mono font-bold tracking-wider text-white uppercase focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 transition"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || requestingToken}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-purple-600 to-indigo-600 hover:from-fuchsia-600 hover:to-indigo-700 text-white font-black text-xs sm:text-sm shadow-xl shadow-fuchsia-500/25 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Token Studio...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                  <span>Verifikasi & Aktifkan Studio Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Bot Token Generator Helper Card */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3 text-left relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Belum Punya Kode Aktivasi?</h4>
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    Minta kode aktivasi resmi instan via WhatsApp Bot (085181830080).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRequestToken}
                disabled={requestingToken || loading}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
              >
                {requestingToken ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Membuat...</span>
                  </>
                ) : (
                  <>
                    <span>Dapatkan Kode</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* WA Deep Link Action if Token Generated */}
            {waLink && (
              <div className="pt-2 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-300">
                  <span>Pesan Bot: <strong className="text-emerald-400 font-mono">{waMessage}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(waMessage);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Tersalin' : 'Salin Pesan'}</span>
                  </button>
                </div>

                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kirim Pesan ke Bot WhatsApp Resmi</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                {isWaitingBot && (
                  <p className="text-[10px] text-zinc-400 flex items-center justify-center gap-1.5 pt-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-fuchsia-400" />
                    <span>Menunggu verifikasi pesan bot... Layar ini akan otomatis beralih ke Workspace.</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer Guarantee */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>1 Free Trial Render Credit otomatis dialokasikan</span>
            </span>
            <Link href="/desk" className="hover:text-zinc-300 transition">
              Buka Desk
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Minimal */}
      <footer className="border-t border-white/10 py-4 text-center text-xs text-zinc-500">
        <p>© 2026 PT BOONTRACK INOVASI DIGITAL • Studio Konten & Naskah Manusiawi</p>
      </footer>
    </div>
  );
}

export default function StudioRegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B0F17] text-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin text-fuchsia-400" />
          <span>Memuat halaman aktivasi Studio...</span>
        </div>
      </div>
    }>
      <StudioRegisterContent />
    </Suspense>
  );
}
