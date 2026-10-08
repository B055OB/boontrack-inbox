'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Globe,
  Camera,
  MessageCircle,
  ShoppingBag,
  CreditCard,
  QrCode,
  Share2,
  CheckCircle2,
  Eye,
  RefreshCw,
  Link as LinkIcon,
  X,
  ChevronRight,
  Store
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

function TwitterIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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

export default function CreatorAdminPage() {
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [tenantDisplay, setTenantDisplay] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'socials' | 'qris' | 'links'>('profile');
  const [previewQrisModal, setPreviewQrisModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState('Suzie Ray');
  const [handle, setHandle] = useState('suzieray_');
  const [bio, setBio] = useState('Mam Ray | Spill Barang Unik & Murah ✨ Fashion & Home Living 🏡 Endorse by @bintangagency');
  const [avatarUrl, setAvatarUrl] = useState('/images/creator/suzieray.jpg');

  // Social Links
  const [socials, setSocials] = useState({
    instagram: 'suzieray_',
    tiktok: 'suzieray_',
    youtube: 'suzierayofficial',
    twitter: '',
  });

  // QRIS Config
  const [qrisConfig, setQrisConfig] = useState({
    enabled: true,
    qr_image_url: '',
    button_label: 'Traktir Kopi / Dukung Suzie Ray ☕',
    nmid: 'ID102003920199',
  });

  // Bio Links
  const [links, setLinks] = useState<BioLinkItem[]>([
    {
      id: '1',
      title: 'Spill Alat Rumah & Barang Unik Viral',
      subtitle: 'Buka Langsung di Shopee App (Bebas WebView)',
      url: 'https://shope.ee/direct-spill-suzie',
      category: 'shopee_direct',
      badge: 'Shopee Direct',
      is_active: true,
    },
    {
      id: '2',
      title: 'Rekomendasi Hijab & Outfit Daily Suzie',
      subtitle: 'Koleksi Pilihan & Diskon Spesial',
      url: 'https://shope.ee/outfit-suzieray',
      category: 'shopee_direct',
      badge: 'Shopee Video',
      is_active: true,
    },
    {
      id: '3',
      title: 'Tanya Rate Card & Jadwal Endorse',
      subtitle: 'Hubungi Manajemen via WhatsApp',
      url: 'https://wa.me/6281234567890?text=Halo%20Admin%20Suzie%20Ray',
      category: 'wa_endorse',
      badge: 'Fast Response',
      is_active: true,
    },
  ]);

  // Load tenant context & creator profile on mount
  useEffect(() => {
    try {
      const storedTenant =
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('bt_tenant') ||
        '';
      const cleanTenant = storedTenant.replace(/^["']|["']$/g, '').trim().toLowerCase();
      if (cleanTenant) {
        setTenantId(cleanTenant);
        setTenantDisplay(cleanTenant);
      }

      // Check query param or localStorage for custom handle from registration
      const urlParams = new URLSearchParams(window.location.search);
      const urlHandle = urlParams.get('handle') || localStorage.getItem('creator_handle');
      if (urlHandle) {
        setHandle(urlHandle.replace(/^@+/, '').trim().toLowerCase());
      }
      const urlName = localStorage.getItem('creator_display_name');
      if (urlName) {
        setDisplayName(urlName);
      }

      // Fetch existing profile from backend API
      const fetchProfile = async () => {
        try {
          const targetHandle = urlHandle || 'suzieray_';
          const res = await fetch(`/api/creator/profile?handle=${encodeURIComponent(targetHandle)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data) {
              const p = result.data;
              if (p.handle) setHandle(p.handle);
              if (p.bio) setBio(p.bio);
              if (p.social_links) {
                setSocials((prev) => ({ ...prev, ...p.social_links }));
              }
              if (p.theme_config) {
                const tc = p.theme_config;
                if (tc.display_name) setDisplayName(tc.display_name);
                if (tc.avatar_url) setAvatarUrl(tc.avatar_url);
                if (Array.isArray(tc.links) && tc.links.length > 0) {
                  setLinks(tc.links);
                }
                if (tc.qris_config) {
                  setQrisConfig((prev) => ({ ...prev, ...tc.qris_config }));
                }
              }
            }
          }
        } catch (fetchErr) {
          console.warn('[Creator Admin] Could not fetch saved profile:', fetchErr);
        }
      };

      fetchProfile();
    } catch {
      // Fallback
    }
  }, []);

  // CRUD Bio Links
  const addLink = () => {
    const newId = Date.now().toString();
    const newLink: BioLinkItem = {
      id: newId,
      title: 'Tautan Baru',
      subtitle: 'Deskripsi tautan',
      url: 'https://',
      category: 'shopee_direct',
      badge: 'Rekomendasi',
      is_active: true,
    };
    setLinks([...links, newLink]);
  };

  const removeLink = (id: string) => {
    setLinks(links.filter((l) => l.id !== id));
  };

  const updateLink = (id: string, field: keyof BioLinkItem, value: any) => {
    setLinks(
      links.map((l) => {
        if (l.id === id) {
          return { ...l, [field]: value };
        }
        return l;
      })
    );
  };

  const moveLink = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= links.length) return;
    const newLinks = [...links];
    const temp = newLinks[index];
    newLinks[index] = newLinks[targetIndex];
    newLinks[targetIndex] = temp;
    setLinks(newLinks);
  };

  // Save to public.creator_profiles via API
  const handleSave = async () => {
    setLoading(true);
    setSaveSuccess(false);

    try {
      const cleanHandle = handle.replace(/^@+/, '').trim().toLowerCase();
      const res = await fetch('/api/creator/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId || 'creator',
          handle: cleanHandle,
          display_name: displayName,
          bio,
          avatar_url: avatarUrl,
          social_links: socials,
          qris_config: qrisConfig,
          links,
          theme: 'clean_light',
          is_verified: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        localStorage.setItem('creator_handle', cleanHandle);
        localStorage.setItem('creator_display_name', displayName);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(data.message || 'Gagal menyimpan profil.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan koneksi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyPublicUrl = () => {
    const fullUrl = `https://creator.boontrack.com/@${handle.replace(/^@+/, '')}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 selection:bg-orange-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Soft Ambient Sunset Glow in Hero Background */}
      <div className="absolute top-0 left-1/3 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-orange-500/10 via-rose-500/5 to-transparent blur-[140px] pointer-events-none -z-10" />

      {/* ── TOP NAVBAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/90 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/creator"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-orange-600" />
              <span>Kembali</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-slate-900">boontrack</span>
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 bg-clip-text text-transparent uppercase">
                CREATOR ADMIN
              </span>
              <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
                (Kelola Bio Link & Etalase)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={copyPublicUrl}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-all cursor-pointer shadow-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Link Tersalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>creator.boontrack.com/@{handle}</span>
                </>
              )}
            </button>

            <button
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-bold text-xs tracking-wide shadow-md shadow-orange-500/25 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tersimpan!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan & Publikasikan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── SPLIT SCREEN WORKSPACE ─────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ── A. PANEL KIRI (FORM EDITOR KREATOR - COL-SPAN-7) ─── */}
          <div className="lg:col-span-7 space-y-6">
            {/* Editor Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-orange-50 text-orange-700 border border-orange-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                1. Identitas Profil
              </button>
              <button
                onClick={() => setActiveTab('socials')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'socials'
                    ? 'bg-orange-50 text-orange-700 border border-orange-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                2. Media Sosial
              </button>
              <button
                onClick={() => setActiveTab('qris')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'qris'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                3. QRIS Donasi (0% Fee)
              </button>
              <button
                onClick={() => setActiveTab('links')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'links'
                    ? 'bg-orange-50 text-orange-700 border border-orange-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                4. Kelola Kartu Bio ({links.length})
              </button>
            </div>

            {/* TAB 1: IDENTITAS PROFIL */}
            {activeTab === 'profile' && (
              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-extrabold text-slate-900">Identitas Profil Bio Link</h2>
                  <p className="text-xs text-slate-500">Atur nama, handle rujukan, dan deskripsi singkat yang memikat audiens.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., Suzie Ray"
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Handle Unik</label>
                    <div className="flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-400 focus-within:border-orange-500 focus-within:bg-white transition">
                      <span className="text-slate-400 select-none font-semibold">@</span>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                        placeholder="suzieray_"
                        className="w-full bg-transparent text-slate-900 font-bold focus:outline-none ml-1 text-xs font-sans"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">URL Foto Profil / Avatar</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="/images/creator/suzieray.jpg atau URL gambar HTTPS"
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('/images/creator/suzieray.jpg')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl whitespace-nowrap cursor-pointer"
                    >
                      Reset Default
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700">Bio Singkat</label>
                    <span className="text-slate-400 font-mono">{bio.length}/160</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={160}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Ceritakan persona, niche konten, atau ajakan kolaborasi..."
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition resize-none leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: MEDIA SOSIAL */}
            {activeTab === 'socials' && (
              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-extrabold text-slate-900">Tautan Media Sosial</h2>
                  <p className="text-xs text-slate-500">Ikon sosial akan ditampilkan di bagian atas profil bio link Anda.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center flex-shrink-0">
                      <InstagramIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Instagram Username</label>
                      <input
                        type="text"
                        value={socials.instagram}
                        onChange={(e) => setSocials({ ...socials, instagram: e.target.value })}
                        placeholder="e.g., suzieray_"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center flex-shrink-0">
                      <TikTokIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">TikTok Username</label>
                      <input
                        type="text"
                        value={socials.tiktok}
                        onChange={(e) => setSocials({ ...socials, tiktok: e.target.value })}
                        placeholder="e.g., suzieray_"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                      <YoutubeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">YouTube Channel / Handle</label>
                      <input
                        type="text"
                        value={socials.youtube}
                        onChange={(e) => setSocials({ ...socials, youtube: e.target.value })}
                        placeholder="e.g., suzierayofficial"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center flex-shrink-0">
                      <TwitterIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Twitter / X Username (Opsional)</label>
                      <input
                        type="text"
                        value={socials.twitter}
                        onChange={(e) => setSocials({ ...socials, twitter: e.target.value })}
                        placeholder="e.g., suzieray_"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: QRIS DONASI LANGSUNG (0% FEE) */}
            {activeTab === 'qris' && (
              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 animate-in fade-in duration-200">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-slate-900">Dukungan & Traktir QRIS</h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        0% Platform Fee
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Terima donasi, tip, dan traktir kopi langsung ke rekening / e-wallet kamu tanpa potongan penahanan platform.
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={qrisConfig.enabled}
                      onChange={(e) => setQrisConfig({ ...qrisConfig, enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                {qrisConfig.enabled ? (
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">Label Tombol Traktir</label>
                      <input
                        type="text"
                        value={qrisConfig.button_label}
                        onChange={(e) => setQrisConfig({ ...qrisConfig, button_label: e.target.value })}
                        placeholder="e.g., Traktir Kopi / Dukung Karya ☕"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">URL Gambar QRIS (Statis / Toko)</label>
                      <input
                        type="text"
                        value={qrisConfig.qr_image_url}
                        onChange={(e) => setQrisConfig({ ...qrisConfig, qr_image_url: e.target.value })}
                        placeholder="URL barcode QRIS JPG/PNG"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">NMID / Nama Merchant Terdaftar (Opsional)</label>
                      <input
                        type="text"
                        value={qrisConfig.nmid}
                        onChange={(e) => setQrisConfig({ ...qrisConfig, nmid: e.target.value })}
                        placeholder="e.g., ID102003920199 (Suzie Ray)"
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition"
                      />
                    </div>

                    <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-800 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        Saat audiens mengetuk tombol ini di ponsel, popup modal QRIS akan terbuka otomatis dengan panduan scan Gopay, OVO, Dana, ShopeePay, dan BCA.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                    Fitur traktir QRIS saat ini dinonaktifkan. Aktifkan sakelar di atas untuk memunculkan tombol dukungan di halaman bio.
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: KELOLA KARTU BIO */}
            {activeTab === 'links' && (
              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Kelola Kartu Tautan Bio</h2>
                    <p className="text-xs text-slate-500">Susun etalase produk rekomendasi, rate card endorse, dan link prioritas.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addLink}
                    className="px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Tautan</span>
                  </button>
                </div>

                {links.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                    Belum ada tautan ditambahkan. Klik tombol "+ Tambah Tautan" untuk mulai.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {links.map((link, idx) => (
                      <div
                        key={link.id}
                        className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 transition-all space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span>{link.title || 'Tautan Tanpa Judul'}</span>
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveLink(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLink(idx, 'down')}
                              disabled={idx === links.length - 1}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLink(link.id)}
                              className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Judul Tautan</label>
                            <input
                              type="text"
                              value={link.title}
                              onChange={(e) => updateLink(link.id, 'title', e.target.value)}
                              placeholder="e.g., Spill Alat Rumah Viral"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:border-orange-500 transition"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Kategori Tautan</label>
                            <select
                              value={link.category}
                              onChange={(e) => updateLink(link.id, 'category', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 transition"
                            >
                              <option value="shopee_direct">Shopee Direct (Anti WebView)</option>
                              <option value="tokopedia">Tokopedia App</option>
                              <option value="wa_endorse">WhatsApp Endorsement</option>
                              <option value="custom_web">Custom Website Link</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Subtitle / Keterangan</label>
                            <input
                              type="text"
                              value={link.subtitle}
                              onChange={(e) => updateLink(link.id, 'subtitle', e.target.value)}
                              placeholder="e.g., Buka di Shopee App (Bebas WebView)"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 transition"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">URL Tujuan</label>
                            <input
                              type="text"
                              value={link.url}
                              onChange={(e) => updateLink(link.id, 'url', e.target.value)}
                              placeholder="https://..."
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 transition font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── B. PANEL KANAN (LIVE SMARTPHONE PREVIEW - COL-SPAN-5) ─ */}
          <div className="lg:col-span-5 flex flex-col items-center sticky top-20">
            <div className="w-full max-w-sm mb-3 flex items-center justify-between px-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-orange-500" />
                <span>Live Smartphone Preview</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                REAL-TIME SYNC
              </span>
            </div>

            {/* Smartphone Outer Shell */}
            <div className="w-[300px] sm:w-[325px] rounded-[46px] p-3.5 bg-white border-4 border-slate-200/90 shadow-2xl shadow-slate-300/80">
              <div className="w-full h-full rounded-[36px] bg-gradient-to-b from-rose-50/70 via-orange-50/30 to-slate-50/90 overflow-hidden border border-rose-200/50 flex flex-col relative text-slate-800 min-h-[580px]">
                {/* Ambient Soft Mesh Glow behind avatar */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-40 bg-gradient-to-b from-rose-300/30 via-orange-200/20 to-transparent rounded-full blur-2xl pointer-events-none" />

                {/* Phone Notch & Status Bar */}
                <div className="pt-3 pb-2 px-6 flex justify-between items-center text-[10px] text-slate-400 font-mono relative z-10">
                  <span>9:41</span>
                  <div className="w-20 h-4 bg-slate-900 rounded-full" />
                  <span>5G 100%</span>
                </div>

                {/* Profile Header Inside Mockup */}
                <div className="p-4 pt-2 text-center space-y-2 relative z-10">
                  <div className="relative w-18 h-18 mx-auto rounded-full ring-2 ring-orange-400/60 p-0.5 shadow-md bg-gradient-to-tr from-orange-500 via-rose-500 to-pink-500">
                    <div className="w-full h-full rounded-full overflow-hidden bg-rose-100 border-2 border-white flex items-center justify-center">
                      <img
                        src={avatarUrl || '/images/creator/suzieray.jpg'}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/creator/suzieray.jpg';
                        }}
                      />
                    </div>
                    <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow">
                      ✓
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center justify-center gap-1.5">
                      <span>{displayName || 'Nama Kreator'}</span>
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-black shadow-xs">
                        ✓
                      </span>
                    </h3>
                    <p className="text-[11px] text-rose-600/90 font-mono font-medium">
                      creator.boontrack.com/@{handle || 'handle'}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 px-1.5 leading-relaxed font-normal">
                      {bio || 'Bio singkat belum diatur...'}
                    </p>
                  </div>

                  {/* Social Links Row */}
                  <div className="flex justify-center items-center gap-1.5 pt-1">
                    {socials.instagram && (
                      <span className="h-7 px-2.5 rounded-full bg-white/90 backdrop-blur-sm border border-rose-200/70 shadow-xs flex items-center gap-1 text-slate-700 text-[11px] font-semibold">
                        <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />
                        <span className="text-[10px] text-slate-600">@{socials.instagram}</span>
                      </span>
                    )}
                    {socials.tiktok && (
                      <span className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-800">
                        <TikTokIcon className="w-3.5 h-3.5 text-slate-900" />
                      </span>
                    )}
                    {socials.youtube && (
                      <span className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border border-red-200/80 shadow-xs flex items-center justify-center text-red-600">
                        <YoutubeIcon className="w-3.5 h-3.5 text-red-600" />
                      </span>
                    )}
                    <span className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border border-orange-200/80 shadow-xs flex items-center justify-center text-orange-600">
                      <ShopeeIcon className="w-3.5 h-3.5 text-orange-600" />
                    </span>
                  </div>

                  {/* QRIS Support Button (if enabled) */}
                  {qrisConfig.enabled && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setPreviewQrisModal(true)}
                        className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{qrisConfig.button_label}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Bio Links Cards Render */}
                <div className="p-3.5 pt-0 space-y-2.5 flex-1 pb-6 relative z-10 overflow-y-auto max-h-[320px]">
                  {links.map((link) => (
                    <div
                      key={link.id}
                      className="p-3 rounded-2xl bg-white/90 backdrop-blur-md border border-rose-200/60 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2.5 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            link.category === 'shopee_direct'
                              ? 'bg-rose-50 text-rose-600'
                              : link.category === 'wa_endorse'
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {link.category === 'shopee_direct' ? (
                            <ShoppingBag className="w-4 h-4 text-orange-500" />
                          ) : link.category === 'wa_endorse' ? (
                            <MessageCircle className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-amber-500" />
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
                              {link.badge || 'Tautan'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {link.title || 'Judul Tautan'}
                          </p>
                          <p className="text-[10px] text-slate-500 leading-tight">
                            {link.subtitle || link.url}
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500 transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── QRIS PREVIEW MODAL ─────────────────────────────────── */}
      {previewQrisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-orange-600">
                Preview Dukungan QRIS
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
            <div className="w-48 h-48 mx-auto p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner flex items-center justify-center">
              {qrisConfig.qr_image_url ? (
                <img
                  src={qrisConfig.qr_image_url}
                  alt="QRIS Barcode"
                  className="w-full h-full object-contain"
                />
              ) : (
                <QrCode className="w-32 h-32 text-slate-400" />
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Scan menggunakan <strong>Gopay, OVO, Dana, ShopeePay, atau Mobile Banking</strong> favorit Anda.
            </p>

            <button
              onClick={() => setPreviewQrisModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
            >
              Tutup Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
