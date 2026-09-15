'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Palette,
  CheckCircle2,
  Lock,
  Sparkles,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Crown,
  ArrowRight,
  X,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export type VisualThemeType =
  | 'clean_minimal'
  | 'aurora_gradient'
  | 'midnight_luxe'
  | 'warm_terra'
  | 'bold_performance';

export interface VisualThemeOption {
  id: VisualThemeType;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  isLockedForSolo: boolean;
  swatches: {
    bg: string;
    card: string;
    accent: string;
  };
}

export const VISUAL_THEMES: VisualThemeOption[] = [
  {
    id: 'clean_minimal',
    title: 'Clean Minimalist',
    subtitle: 'Putih Bersih & Elegan',
    description: 'Tata letak putih modern dengan kontras tinggi, navigasi ringan, dan fokus konversi checkout.',
    badge: 'GRATIS (Semua Tier)',
    isLockedForSolo: false,
    swatches: {
      bg: '#FFFFFF',
      card: '#F8FAFC',
      accent: '#2563EB',
    },
  },
  {
    id: 'aurora_gradient',
    title: 'Aurora Vibrant Gradient',
    subtitle: 'Gradasi Dinamis & Estetik',
    description: 'Kombinasi warna ungu-biru modern yang hidup. Sangat cocok untuk produk kecantikan, fashion, & lifestyle.',
    badge: 'PREMIUM (Eksklusif)',
    isLockedForSolo: true,
    swatches: {
      bg: '#FAF5FF',
      card: '#FFFFFF',
      accent: '#9333EA',
    },
  },
  {
    id: 'midnight_luxe',
    title: 'Midnight Dark Luxe',
    subtitle: 'Dark Mode Maskulin & Mewah',
    description: 'Tampilan gelap elegan berkelas premium. Ideal untuk brand gadget, otomotif, jam tangan, & clothing streetwear.',
    badge: 'PREMIUM (Eksklusif)',
    isLockedForSolo: true,
    swatches: {
      bg: '#0F172A',
      card: '#1E293B',
      accent: '#38BDF8',
    },
  },
  {
    id: 'warm_terra',
    title: 'Warm Terracotta Organic',
    subtitle: 'Nuansa Hangat & Alami',
    description: 'Palet warna earth-tone hangat ramah mata. Sangat pas untuk kuliner (FnB), kafe, kopi, dan produk artisan kriya.',
    badge: 'PREMIUM (Eksklusif)',
    isLockedForSolo: true,
    swatches: {
      bg: '#FFFBEB',
      card: '#FFFFFF',
      accent: '#D97706',
    },
  },
  {
    id: 'bold_performance',
    title: 'Bold Ads Performance',
    subtitle: 'Kontras Maksimal Konversi Iklan',
    description: 'Warna berani dengan tombol CTA mencolok. Didesain khusus menaikkan ROI iklan Meta Ads & TikTok Ads.',
    badge: 'PREMIUM (Eksklusif)',
    isLockedForSolo: true,
    swatches: {
      bg: '#F0FDF4',
      card: '#FFFFFF',
      accent: '#059669',
    },
  },
];

interface StorefrontThemeCardProps {
  tenantSlug: string;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  onThemeChange?: (themeId: VisualThemeType) => void;
  currentVisualTheme?: VisualThemeType;
}

export default function StorefrontThemeCard({
  tenantSlug,
  isTeamScale = false,
  isAdsPerformance = false,
  onThemeChange,
  currentVisualTheme,
}: StorefrontThemeCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<VisualThemeType>(
    currentVisualTheme || 'clean_minimal'
  );
  const [chatEnabled, setChatEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [targetUpgradeTheme, setTargetUpgradeTheme] = useState<VisualThemeOption | null>(null);

  // Sync prop jika ada perubahan dari parent
  useEffect(() => {
    if (currentVisualTheme) {
      setSelectedTheme(currentVisualTheme);
    }
  }, [currentVisualTheme]);

  // Flag ref agar fetch tema HANYA dieksekusi 1 kali saat komponen mount
  const hasFetchedRef = useRef(false);

  // 1. Fetch initial theme config dari database & API (Aman tanpa infinite loop)
  useEffect(() => {
    if (!tenantSlug || hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    let isMounted = true;
    async function loadTheme() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
          cache: 'no-store',
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          if (data?.theme) {
            const resolvedTheme: VisualThemeType =
              data.theme.visual_theme ||
              (data.theme.template === 'microsite' ? 'aurora_gradient' : 'clean_minimal');
            setSelectedTheme(resolvedTheme);
            setChatEnabled(data.theme.chat_enabled !== false);
            // CATATAN: JANGAN memanggil onThemeChange di sini agar tidak memicu re-render/re-fetch loop di parent
          }
        }
      } catch (err) {
        console.warn('[StorefrontThemeCard] Fetch theme error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadTheme();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  // 2. Save theme change persistently to database & settings API
  const saveThemeConfig = async (newThemeId: VisualThemeType, newChatEnabled: boolean) => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      // Step A: Panggil endpoint theme API
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visual_theme: newThemeId,
          template: newThemeId === 'clean_minimal' ? 'default' : 'microsite',
          chat_enabled: newChatEnabled,
          chat_position: 'bottom-right',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan tema visual toko.');
      }

      // Step B: Sinkronkan via endpoint settings API profil/metadata tenant
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theme: {
              visual_theme: newThemeId,
              template: newThemeId === 'clean_minimal' ? 'default' : 'microsite',
              chat_enabled: newChatEnabled,
              chat_position: 'bottom-right',
            },
          }),
        });
      } catch (settingsErr) {
        console.warn('[StorefrontThemeCard] Settings API sync note:', settingsErr);
      }

      // Step C: Update langsung ke Supabase DB tenants.metadata (Double Safety Net)
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (tenantRow) {
            const updatedMeta = {
              ...(tenantRow.metadata || {}),
              visual_theme: newThemeId,
              theme: {
                ...(tenantRow.metadata?.theme || {}),
                visual_theme: newThemeId,
                template: newThemeId === 'clean_minimal' ? 'default' : 'microsite',
                chat_enabled: newChatEnabled,
                chat_position: 'bottom-right',
              },
            };
            await supabase
              .from('tenants')
              .update({ metadata: updatedMeta })
              .eq('slug', tenantSlug);
          }
        }
      } catch (sbErr) {
        console.warn('[StorefrontThemeCard] Direct Supabase update note:', sbErr);
      }

      setToastMessage('✅ Tema visual berhasil diubah!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan tema toko';
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const isThemeLocked = (theme: VisualThemeOption) => {
    if (!theme.isLockedForSolo) return false;
    // Buka penuh untuk Ads Performance & Team Scale
    return !isAdsPerformance && !isTeamScale;
  };

  const handleSelectTheme = (theme: VisualThemeOption) => {
    if (isThemeLocked(theme)) {
      setTargetUpgradeTheme(theme);
      setShowUpgradeModal(true);
      return;
    }

    // 1. Optimistic update: Langsung perbarui state lokal & LivePhonePreview seketika
    setSelectedTheme(theme.id);
    if (onThemeChange) {
      onThemeChange(theme.id);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storefront-theme-changed', {
          detail: { visual_theme: theme.id, chat_enabled: chatEnabled },
        })
      );
    }

    // 2. Eksekusi simpan ke database secara terisolasi di background tanpa fetch GET ulang
    saveThemeConfig(theme.id, chatEnabled);
  };

  const handleToggleChat = () => {
    const nextVal = !chatEnabled;
    setSelectedTheme(selectedTheme);
    setChatEnabled(nextVal);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storefront-theme-changed', {
          detail: { visual_theme: selectedTheme, chat_enabled: nextVal },
        })
      );
    }
    saveThemeConfig(selectedTheme, nextVal);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-xs relative">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900">Pilihan Tema Visual Storefront</h3>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                5 Pilihan Tema
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuaikan palet warna, gradien, dan gaya kartu etalase publik toko Anda.
            </p>
          </div>
        </div>

        {isSaving && (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shrink-0">
            <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
            <span>Menyimpan...</span>
          </span>
        )}
      </div>

      {/* Notifications */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Memuat preferensi tema visual toko...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 5 Theme Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {VISUAL_THEMES.map((theme) => {
              const isSelected = selectedTheme === theme.id;
              const locked = isThemeLocked(theme);

              return (
                <div
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme)}
                  className={`relative rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left border ${
                    isSelected
                      ? 'bg-indigo-50/40 border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm'
                      : locked
                      ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/40 shadow-2xs'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top row: Swatches & Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
                        <span className={`w-4 h-4 rounded-md ${theme.swatches.bg} border border-black/10`} />
                        <span className={`w-4 h-4 rounded-md ${theme.swatches.card} border border-black/10`} />
                        <span className={`w-4 h-4 rounded-md ${theme.swatches.accent} border border-black/10`} />
                      </div>

                      {locked ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-extrabold flex items-center gap-1 shrink-0">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Terkunci</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {theme.badge}
                        </span>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{theme.title}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600" />
                        )}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                        {theme.subtitle}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                        {theme.description}
                      </p>
                    </div>
                  </div>

                  {/* Radio Indicator at bottom */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">
                      {isSelected ? 'Sedang Digunakan' : locked ? 'Khusus Ads / Scale' : 'Klik untuk Pilih'}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600'
                          : locked
                          ? 'border-slate-300 bg-slate-100'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      ) : locked ? (
                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Switch Toggle: Aktifkan Webchat di Storefront */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/70">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="toggle-webchat"
                    className="text-xs font-black text-slate-800 cursor-pointer"
                  >
                    Aktifkan Webchat di Storefront
                  </label>
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                      chatEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {chatEnabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Tampilkan widget floating chat asisten AI &amp; tombol chat langsung di storefront pengunjung.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="toggle-webchat"
              role="switch"
              aria-checked={chatEnabled}
              disabled={isSaving}
              onClick={handleToggleChat}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                chatEnabled ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span className="sr-only">Toggle Webchat</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  chatEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Paywall Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 relative">
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Crown className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                  Fitur Ads Performance &amp; Team Scale
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900">
                Buka Tema {targetUpgradeTheme?.title || 'Visual Premium'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Pilihan tema visual <strong>{targetUpgradeTheme?.title}</strong> dirancang untuk memperkuat identitas brand dan konversi. Tersedia di paket <strong>Ads Performance (Rp 299k)</strong> atau <strong>Team Scale (Rp 499k)</strong>.
              </p>
            </div>

            <div className="p-3.5 bg-purple-50/60 rounded-2xl border border-purple-100 text-xs text-slate-700 space-y-2">
              <p className="font-bold text-purple-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Benefit Paket Ads Performance &amp; Scale:
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1 pl-1">
                <li>&bull; Bebas pilih semua 5 tema visual storefront &amp; bio-link</li>
                <li>&bull; Multi-CS Live Chat Inbox WhatsApp</li>
                <li>&bull; Meta CAPI Tracking &amp; analitik konversi iklan</li>
                <li>&bull; Custom Domain mandiri dengan SSL Cloudflare otomatis</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Nanti Saja
              </button>
              <a
                href="https://wa.me/6281234567890?text=Halo%20BoonTrack,%20saya%20ingin%20upgrade%20paket%20untuk%20membuka%20tema%20storefront"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>Upgrade Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
