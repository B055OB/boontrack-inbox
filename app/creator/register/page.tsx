'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Check,
  CheckCircle2,
  Lock,
  Phone,
  User,
  AtSign,
  QrCode,
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pre-fill from query param if available
  useEffect(() => {
    const handleParam = searchParams.get('handle') || searchParams.get('ref');
    if (handleParam) {
      const clean = handleParam.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
      setHandle(clean);
      if (!displayName && clean) {
        // Auto capitalise handle as initial display name
        const autoName = clean.charAt(0).toUpperCase() + clean.slice(1);
        setDisplayName(autoName);
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanHandle = handle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase();
    const cleanName = displayName.trim();
    const cleanWa = whatsapp.trim().replace(/[^0-9+]/g, '');
    const cleanPin = pin.trim();

    if (!cleanHandle || cleanHandle.length < 3) {
      setErrorMsg('Handle bio link minimal 3 karakter (huruf, angka, titik, atau underscore).');
      return;
    }

    if (!cleanName) {
      setErrorMsg('Mohon isi nama tampilan kreator Anda.');
      return;
    }

    if (!cleanWa || cleanWa.length < 8) {
      setErrorMsg('Nomor WhatsApp aktif diperlukan untuk notifikasi & order endorsement.');
      return;
    }

    if (!cleanPin || cleanPin.length < 4) {
      setErrorMsg('PIN / Password minimal 4 digit untuk keamanan akun Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/creator/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'creator',
          handle: cleanHandle,
          display_name: cleanName,
          whatsapp: cleanWa,
          pin: cleanPin,
          social_links: {
            whatsapp: cleanWa,
            instagram: cleanHandle,
          },
          bio: `Mam / Creator ${cleanName} ✨ Spill Rekomendasi & Produk Unik. Hubungi saya via WhatsApp 📩`,
          avatar_url: '/images/creator/suzieray.jpg',
          is_verified: true,
          theme: 'clean_light',
          links: [
            {
              id: '1',
              title: 'Spill Barang Unik & Rekomendasi Viral',
              subtitle: 'Buka Langsung di Shopee App (Bebas WebView)',
              url: 'https://shopee.co.id',
              category: 'shopee_direct',
              badge: 'Shopee Direct',
              is_active: true,
            },
            {
              id: '2',
              title: 'Hubungi Manajemen / Tanya Rate Card Endorse',
              subtitle: `Chat WhatsApp ke ${cleanWa}`,
              url: `https://wa.me/${cleanWa.replace(/^\+/, '').replace(/^0/, '62')}`,
              category: 'wa_endorse',
              badge: 'Fast Response',
              is_active: true,
            },
          ],
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Persist session locally
        if (typeof window !== 'undefined') {
          localStorage.setItem('creator_handle', cleanHandle);
          localStorage.setItem('creator_display_name', cleanName);
          localStorage.setItem('creator_whatsapp', cleanWa);
          // Set cookie for creator session persistence
          document.cookie = `creator_handle=${encodeURIComponent(cleanHandle)}; path=/; max-age=2592000; SameSite=Lax`;
        }

        // Redirect directly to creator admin workspace
        router.push(`/admin?handle=${encodeURIComponent(cleanHandle)}`);
      } else {
        setErrorMsg(data.message || 'Gagal mengaktifkan bio link. Silakan coba lagi.');
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg('Terjadi gangguan jaringan: ' + (err.message || 'Silakan ulangi.'));
      setLoading(false);
    }
  };

  const previewHandle = handle ? handle.replace(/^@+/, '').trim().toLowerCase() : 'nama_kamu';
  const previewName = displayName.trim() || 'Nama Kreator Anda';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start max-w-6xl mx-auto">
      {/* ── LEFT: FORM INPUT BENTO (COL 7) ─────────────────────── */}
      <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-200/50 space-y-7">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/80 text-orange-700 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span>Pendaftaran Kreator & Affiliate — Gratis 100%</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
            Klaim Bio Link & Etalase Kreator Anda
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
            Dapatkan URL pendek <span className="font-semibold text-slate-900 font-mono">boontrack.com/@nama_kamu</span>, anti WebView trap Shopee, dan QRIS instan 0% fee.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
            <span className="text-rose-500 font-bold">⚠️</span>
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Input 1: Handle Bio Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-slate-700">
                1. Handle Bio Link Anda
              </label>
              <span className="text-[11px] text-slate-400 font-mono">Gratis Selamanya</span>
            </div>
            <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-2xl px-3.5 py-3 text-xs sm:text-sm focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
              <span className="text-slate-400 select-none font-mono font-bold text-xs sm:text-sm">
                boontrack.com/@
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                placeholder="suzieray_"
                className="w-full bg-transparent text-slate-900 font-bold focus:outline-none placeholder-slate-400 ml-1 font-sans"
                required
              />
              {handle.length >= 3 && (
                <span className="text-emerald-600 flex items-center gap-1 text-[11px] font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Check className="w-3 h-3" /> Tersedia
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Gunakan nama panggilan, brand, atau handle Instagram/TikTok kamu.
            </p>
          </div>

          {/* Input 2: Nama Tampilan */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-700">
              2. Nama Tampilan (Display Name)
            </label>
            <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-2xl px-3.5 py-3 text-xs sm:text-sm focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
              <User className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Suzie Ray"
                className="w-full bg-transparent text-slate-900 font-bold focus:outline-none placeholder-slate-400 font-sans"
                required
              />
            </div>
          </div>

          {/* Input 3: WhatsApp Aktif */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-700">
              3. WhatsApp Aktif (Untuk Kolaborasi & Endorse)
            </label>
            <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-2xl px-3.5 py-3 text-xs sm:text-sm focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
              <Phone className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="e.g., 08123456789 atau 628123456789"
                className="w-full bg-transparent text-slate-900 font-bold focus:outline-none placeholder-slate-400 font-mono"
                required
              />
            </div>
          </div>

          {/* Input 4: PIN / Password Akses */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-slate-700">
                4. PIN / Password Akses Admin
              </label>
              <span className="text-[11px] text-slate-400">Minimal 4 Digit</span>
            </div>
            <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-2xl px-3.5 py-3 text-xs sm:text-sm focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
              <Lock className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Buat 4-6 angka PIN keamanan"
                className="w-full bg-transparent text-slate-900 font-bold focus:outline-none placeholder-slate-400 font-mono tracking-wider"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-extrabold text-sm sm:text-base tracking-wide shadow-xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 mt-6"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Mengaktifkan Bio Link...</span>
              </>
            ) : (
              <>
                <span>Aktifkan Bio Link & Masuk ke Admin</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Sudah memiliki akun bio link?</span>
          <Link
            href="/admin"
            className="font-bold text-orange-600 hover:text-orange-700 transition-colors"
          >
            Masuk ke Creator Admin ➔
          </Link>
        </div>
      </div>

      {/* ── RIGHT: LIVE CARD PREVIEW BENTO (COL 5) ─────────────── */}
      <div className="lg:col-span-5 flex flex-col items-center sticky top-24 space-y-4">
        <div className="w-full text-center lg:text-left px-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Preview Tampilan Bio Link Anda
          </span>
        </div>

        {/* Smartphone Bento Shell */}
        <div className="w-[300px] sm:w-[325px] rounded-[44px] p-3.5 bg-white border-4 border-slate-200/90 shadow-2xl shadow-slate-300/80">
          <div className="w-full h-full rounded-[34px] bg-gradient-to-b from-rose-50/70 via-orange-50/30 to-slate-50/90 overflow-hidden border border-rose-200/50 flex flex-col relative text-slate-800 p-4 pt-3">
            {/* Phone Notch */}
            <div className="pb-3 flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>9:41</span>
              <div className="w-16 h-3 bg-slate-900 rounded-full" />
              <span>100%</span>
            </div>

            {/* Avatar & Header */}
            <div className="text-center space-y-2 py-2">
              <div className="relative w-16 h-16 mx-auto rounded-full ring-2 ring-orange-400/60 p-0.5 shadow-md bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500">
                <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center font-black text-lg bg-gradient-to-tr from-orange-500 to-rose-500 text-white">
                  {previewName.charAt(0).toUpperCase()}
                </div>
                <span className="absolute bottom-0 right-0 w-4.5 h-4.5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-black">
                  ✓
                </span>
              </div>

              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center justify-center gap-1.5">
                  <span>{previewName}</span>
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-black">
                    ✓
                  </span>
                </h3>
                <p className="text-[11px] text-rose-600 font-mono font-medium">
                  boontrack.com/@{previewHandle}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 px-2 line-clamp-2">
                  Spill Rekomendasi Barang Unik & Endorsement Collab.
                </p>
              </div>
            </div>

            {/* Sample Bio Link Cards */}
            <div className="space-y-2 pt-2">
              <div className="p-2.5 rounded-xl bg-white/95 border border-rose-200/60 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <div>
                    <span className="text-[8px] font-extrabold uppercase text-orange-600 block">
                      Shopee Direct
                    </span>
                    <span className="text-[11px] font-bold text-slate-900 block leading-tight">
                      Spill Produk Viral Terbaru
                    </span>
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </div>

              <div className="p-2.5 rounded-xl bg-white/95 border border-emerald-200/60 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-[8px] font-extrabold uppercase text-emerald-600 block">
                      Endorsement
                    </span>
                    <span className="text-[11px] font-bold text-slate-900 block leading-tight">
                      Hubungi Manajemen via WA
                    </span>
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </div>

              <div className="pt-1">
                <div className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold text-[10px] flex items-center justify-center gap-1.5 shadow-sm">
                  <QrCode className="w-3 h-3" />
                  <span>Traktir Kopi / Dukung QRIS (0% Fee)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="w-full max-w-sm grid grid-cols-3 gap-2 text-center text-[10px] text-slate-600 font-semibold px-2">
          <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Zap className="w-3.5 h-3.5 text-orange-500 mx-auto mb-1" />
            <span>Aktif &lt;30 Detik</span>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mx-auto mb-1" />
            <span>100% Gratis</span>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-rose-500 mx-auto mb-1" />
            <span>0% Fee Payout</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreatorRegisterPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 selection:bg-orange-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Soft Sunset Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-orange-500/10 via-rose-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />

      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/90 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/creator" className="flex items-center gap-3 group">
            <div className="relative w-8 h-8 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500 shadow-md shadow-orange-500/15 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center overflow-hidden">
                <img
                  src="/branding/creator/icon.png"
                  alt="BoonTrack Creator Logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900">boontrack</span>
              <span className="text-[11px] font-black tracking-widest bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 bg-clip-text text-transparent uppercase">
                CREATOR
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Sudah Ada Akun? Masuk ke Admin
            </Link>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mr-2" />
            <span className="text-sm font-semibold">Memuat formulir pendaftaran...</span>
          </div>
        }>
          <RegisterFormContent />
        </Suspense>
      </main>
    </div>
  );
}
