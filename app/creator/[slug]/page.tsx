'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ShoppingBag,
  MessageCircle,
  QrCode,
  ExternalLink,
  Share2,
  Check,
  CheckCircle2,
  RefreshCw,
  Flame,
  ArrowRight,
  ChevronRight
} from 'lucide-react';

// ── Custom Social SVGs ───────────────────────────────────────────────
function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function TikTokIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

function YoutubeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
      <polygon points="10 15 15 12 10 9 10 15"/>
    </svg>
  );
}

function ShopeeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 6.5h-2.22A5.28 5.28 0 0 0 12 2a5.28 5.28 0 0 0-5.28 4.5H4.5A2.5 2.5 0 0 0 2 9v10.5A2.5 2.5 0 0 0 4.5 22h15a2.5 2.5 0 0 0 2.5-2.5V9a2.5 2.5 0 0 0-2.5-2.5zm-7.5-3a3.78 3.78 0 0 1 3.72 3h-7.44a3.78 3.78 0 0 1 3.72-3zm4.2 12.18c-.46 1.48-1.8 2.32-3.62 2.32-2.34 0-3.7-1.34-3.72-3.14h1.72c.06.94.8 1.62 2 1.62 1.12 0 1.86-.54 1.86-1.34 0-.8-.74-1.12-1.94-1.42-1.98-.5-3.48-1.1-3.48-2.92 0-1.6 1.34-2.8 3.32-2.8 1.94 0 3.32 1.14 3.42 2.76h-1.72c-.08-.76-.7-1.3-1.7-1.3-.98 0-1.62.54-1.62 1.26 0 .68.64.98 1.8 1.28 2.06.52 3.68 1.18 3.68 2.94z"/>
    </svg>
  );
}

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────────
interface BioLinkItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  category: 'shopee_direct' | 'tokopedia' | 'wa_endorse' | 'custom_web';
  badge?: string;
  is_active: boolean;
}

interface CreatorData {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_url?: string | null;
  social_links?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    twitter?: string;
    whatsapp?: string;
  };
  theme_config?: {
    avatar_url?: string;
    display_name?: string;
    links?: BioLinkItem[];
    qris_config?: {
      enabled?: boolean;
      qr_image_url?: string;
      button_label?: string;
      nmid?: string;
    };
  };
  is_verified?: boolean;
}

export default function CreatorPublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const [resolvedSlug, setResolvedSlug] = useState('');
  const [profile, setProfile] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundPage, setNotFoundPage] = useState(false);
  const [previewQrisModal, setPreviewQrisModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let isMounted = true;
    params.then(({ slug }) => {
      const clean = decodeURIComponent(slug).replace(/^@+/, '').trim().toLowerCase();
      setResolvedSlug(clean);

      fetch(`/api/creator/profile?handle=${encodeURIComponent(clean)}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.success && data.data) {
            setProfile(data.data);
          } else {
            setNotFoundPage(true);
          }
        })
        .catch(() => {
          if (isMounted) setNotFoundPage(true);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [params]);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFC] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500 mt-3 animate-pulse">Memuat bio link kreator...</p>
      </div>
    );
  }

  // Not Found State (Friendly Onboarding Claim Opportunity)
  if (notFoundPage || !profile) {
    return (
      <div className="min-h-screen bg-[#FAFAFC] flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-18 h-18 rounded-3xl bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500 p-0.5 shadow-xl shadow-orange-500/20 mb-6">
          <div className="w-full h-full bg-white rounded-[22px] flex items-center justify-center text-3xl">
            ✨
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Bio Link Belum Diklaim
        </h1>
        <p className="text-sm text-slate-600 max-w-sm mt-2 mb-8 leading-relaxed">
          Tautan <strong className="text-slate-900 font-mono">boontrack.com/@{resolvedSlug}</strong> masih tersedia untuk didaftarkan. Klaim halaman bio resmi Anda sekarang dalam 30 detik!
        </p>
        <Link
          href={`/register?handle=${encodeURIComponent(resolvedSlug)}`}
          className="px-8 py-3.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-2"
        >
          <span>Klaim @{resolvedSlug} Sekarang</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <div className="mt-8">
          <Link href="/creator" className="text-xs font-bold text-slate-400 hover:text-slate-600 transition">
            ← Kembali ke Beranda BoonTrack Creator
          </Link>
        </div>
      </div>
    );
  }

  // Extract config
  const tc = profile.theme_config || {};
  const displayName = profile.display_name || tc.display_name || 'Kreator BoonTrack';
  const avatarUrl = profile.avatar_url || tc.avatar_url || '/images/creator/suzieray.jpg';
  const bio = profile.bio || 'Selamat datang di etalase bio link resmi saya.';
  const socials = profile.social_links || {};
  const links: BioLinkItem[] = Array.isArray(tc.links) && tc.links.length > 0 ? tc.links : [
    {
      id: 'default-1',
      title: 'Spill Barang Unik & Rekomendasi Viral',
      subtitle: 'Buka Langsung di Shopee App (Bebas WebView)',
      url: 'https://shopee.co.id',
      category: 'shopee_direct',
      badge: 'Shopee Direct',
      is_active: true,
    }
  ];
  const qrisConfig = tc.qris_config || {
    enabled: true,
    button_label: `Dukung Karya / Traktir ${displayName} ☕`,
    qr_image_url: '',
    nmid: 'ID102003920199',
  };

  const copyPublicUrl = () => {
    const fullUrl = `https://boontrack.com/@${profile.handle.replace(/^@+/, '')}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 selection:bg-orange-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col justify-between">
      {/* Soft Ambient Sunset Glow in Hero Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-orange-500/12 via-rose-500/6 to-transparent blur-[140px] pointer-events-none -z-10" />

      {/* ── TOP FLOATING ACTION BAR ───────────────────────────── */}
      <div className="max-w-md mx-auto w-full px-4 pt-4 flex items-center justify-between z-20">
        <Link
          href="/creator"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/80 text-[11px] font-bold text-slate-600 hover:text-slate-900 shadow-xs transition"
        >
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span>boontrack</span>
        </Link>

        <button
          onClick={copyPublicUrl}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/90 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition cursor-pointer active:scale-95"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">Tersalin!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Bagikan</span>
            </>
          )}
        </button>
      </div>

      {/* ── MAIN CREATOR PROFILE CONTAINER (MOBILE-FIRST) ─────── */}
      <main className="max-w-md mx-auto w-full px-4 py-6 space-y-6 flex-1">
        
        {/* Profile Card Header */}
        <div className="text-center space-y-3 pt-2">
          {/* Avatar with Sunset Ring */}
          <div className="relative w-22 h-22 mx-auto rounded-full ring-2 ring-orange-400/60 p-0.5 shadow-lg bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500">
            <div className="w-full h-full rounded-full overflow-hidden bg-rose-50 border-2 border-white flex items-center justify-center">
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/creator/suzieray.jpg';
                }}
              />
            </div>
            <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow-md">
              ✓
            </span>
          </div>

          {/* Name & Handle */}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center justify-center gap-1.5">
              <span>{displayName}</span>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-black shadow-xs">
                ✓
              </span>
            </h1>
            <p className="text-xs font-mono font-bold bg-gradient-to-r from-orange-600 to-rose-600 bg-clip-text text-transparent mt-0.5">
              boontrack.com/@{profile.handle}
            </p>
            <p className="text-xs text-slate-600 mt-2 px-3 leading-relaxed max-w-sm mx-auto font-normal">
              {bio}
            </p>
          </div>

          {/* Social Media Links Row */}
          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
            {socials.instagram && (
              <a
                href={`https://instagram.com/${socials.instagram.replace(/^@+/, '')}`}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-3 rounded-full bg-white border border-rose-200/80 shadow-xs hover:shadow-md flex items-center gap-1.5 text-slate-700 text-xs font-semibold hover:scale-105 transition-all"
              >
                <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />
                <span>@{socials.instagram.replace(/^@+/, '')}</span>
              </a>
            )}

            {socials.tiktok && (
              <a
                href={`https://tiktok.com/@${socials.tiktok.replace(/^@+/, '')}`}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-xs hover:shadow-md flex items-center justify-center text-slate-800 hover:scale-105 transition-all"
              >
                <TikTokIcon className="w-3.5 h-3.5 text-slate-900" />
              </a>
            )}

            {socials.youtube && (
              <a
                href={`https://youtube.com/@${socials.youtube.replace(/^@+/, '')}`}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-white border border-red-200 shadow-xs hover:shadow-md flex items-center justify-center text-red-600 hover:scale-105 transition-all"
              >
                <YoutubeIcon className="w-3.5 h-3.5 text-red-600" />
              </a>
            )}

            {socials.whatsapp && (
              <a
                href={`https://wa.me/${socials.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-white border border-emerald-200 shadow-xs hover:shadow-md flex items-center justify-center text-emerald-600 hover:scale-105 transition-all"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600" />
              </a>
            )}
          </div>

          {/* QRIS Support Button (if enabled) */}
          {qrisConfig.enabled && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setPreviewQrisModal(true)}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-extrabold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
              >
                <QrCode className="w-4 h-4" />
                <span>{qrisConfig.button_label || 'Dukung Karya via QRIS (0% Fee)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── BIO LINK CARDS LIST ──────────────────────────────── */}
        <div className="space-y-3 pt-2">
          {links.filter((l) => l.is_active !== false).map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-orange-300 transition-all flex items-center justify-between gap-3 group active:scale-99 block"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    link.category === 'shopee_direct'
                      ? 'bg-rose-50 text-rose-600'
                      : link.category === 'wa_endorse'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {link.category === 'shopee_direct' ? (
                    <ShoppingBag className="w-5 h-5 text-orange-500" />
                  ) : link.category === 'wa_endorse' ? (
                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-wide ${
                        link.category === 'wa_endorse'
                          ? 'text-emerald-600'
                          : 'text-orange-600'
                      }`}
                    >
                      {link.badge || (link.category === 'shopee_direct' ? 'Shopee Direct' : 'Tautan')}
                    </span>
                    {link.category === 'shopee_direct' && (
                      <span className="text-[8px] font-bold px-1.5 py-0.2 bg-orange-100 text-orange-700 rounded-full">
                        Anti WebView
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug group-hover:text-orange-600 transition-colors">
                    {link.title || 'Judul Tautan'}
                  </p>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    {link.subtitle || link.url}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </a>
          ))}
        </div>
      </main>

      {/* ── FOOTER BRANDING ───────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-400">
        <Link
          href="/creator"
          className="inline-flex items-center gap-1.5 hover:text-slate-700 font-bold transition"
        >
          <span>Dibuat dengan</span>
          <span className="font-extrabold text-slate-900">boontrack</span>
          <span className="font-black bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">CREATOR</span>
        </Link>
      </footer>

      {/* ── QRIS SUPPORT MODAL ─────────────────────────────────── */}
      {previewQrisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-orange-600">
                Dukungan & Traktir QRIS (0% Fee)
              </span>
              <button
                onClick={() => setPreviewQrisModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">{displayName}</h3>
              <p className="text-xs text-slate-500 font-mono">{qrisConfig.nmid || 'NMID Terverifikasi'}</p>
            </div>

            {/* QR Code Frame */}
            <div className="w-52 h-52 mx-auto p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner flex items-center justify-center">
              {qrisConfig.qr_image_url ? (
                <img
                  src={qrisConfig.qr_image_url}
                  alt="QRIS Barcode"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                  <QrCode className="w-36 h-36 text-slate-700" />
                  <span className="text-[10px] font-mono font-bold text-slate-500">Scan via App Apapun</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Buka aplikasi <strong>Gopay, OVO, Dana, ShopeePay, atau BCA Mobile</strong>, lalu scan barcode di atas.
            </p>

            <button
              onClick={() => setPreviewQrisModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}