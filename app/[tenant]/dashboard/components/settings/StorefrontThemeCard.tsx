'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Palette,
  LayoutGrid,
  UserCheck,
  Smartphone,
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

export type TemplateType = 'default' | 'personal' | 'microsite';

interface StorefrontThemeCardProps {
  tenantSlug: string;
  isTeamScale: boolean;
}

interface TemplateOption {
  id: TemplateType;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  isPremium: boolean;
  accentColor: string;
  tagline: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'default',
    title: 'Default (Katalog Commerce)',
    subtitle: 'Ritel, F&B & Toko Fisik',
    description:
      'Layout e-commerce modern, produk di kiri dan chat asisten di kanan. Cocok untuk toko ritel & produk fisik.',
    icon: LayoutGrid,
    isPremium: false,
    accentColor: 'blue',
    tagline: 'Standar & Praktis',
  },
  {
    id: 'personal',
    title: 'Personal (Authority / Brand)',
    subtitle: 'Mentor, Public Figure & Konsultan',
    description:
      'Landing page elegan berbasis trust, profil mentor/konsultan, showcase portofolio, dan ulasan/testimoni.',
    icon: UserCheck,
    isPremium: true,
    accentColor: 'purple',
    tagline: 'High-Trust Authority',
  },
  {
    id: 'microsite',
    title: 'Microsite (Bio-Funnel)',
    subtitle: 'Kuliner, F&B & Kreator',
    description:
      'Bio-link praktis mobile-first untuk kuliner & kreator. Arahkan traffic medsos ke GoFood, GrabFood, ShopeeFood, atau WA.',
    icon: Smartphone,
    isPremium: true,
    accentColor: 'emerald',
    tagline: 'Mobile Bio Link',
  },
];

export default function StorefrontThemeCard({
  tenantSlug,
  isTeamScale,
}: StorefrontThemeCardProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(
    tenantSlug === 'ombudi' ? 'personal' : 'default'
  );
  const [chatEnabled, setChatEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 1. Fetch initial theme config
  const fetchTheme = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.theme) {
          setSelectedTemplate(data.theme.template || (tenantSlug === 'ombudi' ? 'personal' : 'default'));
          setChatEnabled(data.theme.chat_enabled !== false);
        }
      }
    } catch (err) {
      console.warn('[StorefrontThemeCard] Fetch theme error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  // 2. Save theme change
  const saveThemeConfig = async (newTemplate: TemplateType, newChatEnabled: boolean) => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: newTemplate,
          chat_enabled: newChatEnabled,
          chat_position: 'bottom-right',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan template tampilan toko.');
      }

      setToastMessage('Template tampilan toko berhasil disimpan.');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat menyimpan tema.';
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectTemplate = (tmpl: TemplateOption) => {
    // Paywall check jika template premium tapi plan masih Solo
    if (tmpl.isPremium && !isTeamScale) {
      setShowUpgradeModal(true);
      return;
    }

    if (tmpl.id === selectedTemplate) return;

    setSelectedTemplate(tmpl.id);
    saveThemeConfig(tmpl.id, chatEnabled);
  };

  const handleToggleChat = () => {
    const nextVal = !chatEnabled;
    setChatEnabled(nextVal);
    saveThemeConfig(selectedTemplate, nextVal);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-xs relative">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900">Template Tampilan Toko</h3>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Storefront Style
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Pilih gaya tata letak storefront yang paling sesuai dengan model bisnis dan persona Anda.
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
          <span>Memuat preferensi template toko...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Template Selection Radio Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TEMPLATE_OPTIONS.map((tmpl) => {
              const Icon = tmpl.icon;
              const isSelected = selectedTemplate === tmpl.id;
              const isLocked = tmpl.isPremium && !isTeamScale;

              return (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`relative rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left border ${
                    isSelected
                      ? 'bg-indigo-50/40 border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm'
                      : isLocked
                      ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300 opacity-90'
                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/40 shadow-2xs'
                  }`}
                >
                  {/* Top Bar Card */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : isLocked
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-1">
                        {tmpl.isPremium ? (
                          <span
                            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                              isLocked
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}
                          >
                            {isLocked ? (
                              <>
                                <Lock className="w-2.5 h-2.5 text-amber-700" />
                                Team / Scale
                              </>
                            ) : (
                              <>
                                <Crown className="w-2.5 h-2.5 text-purple-600" />
                                Team / Scale
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            Semua Paket
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Tagline */}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-black text-slate-900 leading-snug">
                          {tmpl.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 block mt-0.5">
                        {tmpl.subtitle}
                      </span>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
                        {tmpl.description}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Radio Check Indicator */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {isLocked ? 'Klik untuk upgrade' : isSelected ? 'Tema Aktif' : 'Pilih Template'}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600'
                          : isLocked
                          ? 'border-slate-300 bg-slate-100'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      ) : isLocked ? (
                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Switch Toggle: Aktifkan Webchat di Storefront */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/70">
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
                  Paket Team / Scale
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900">
                Fitur Eksklusif Team &amp; Scale
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Template <strong>Personal (Authority Brand)</strong> dan <strong>Microsite (Bio-Funnel)</strong> dirancang khusus untuk merchant dengan paket Team Scale ke atas.
              </p>
            </div>

            <div className="p-3.5 bg-purple-50/60 rounded-2xl border border-purple-100 text-xs text-slate-700 space-y-2">
              <p className="font-bold text-purple-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Benefit Paket Team Scale (499k/bln):
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1 pl-1">
                <li>&bull; Akses semua template: Personal Authority &amp; Microsite Bio-Funnel</li>
                <li>&bull; Custom Domain mandiri dengan Cloudflare SSL gratis</li>
                <li>&bull; Multi-CS Inbox (hingga 5+ kursi CS)</li>
                <li>&bull; WhatsApp Broadcast Engine &amp; Meta CAPI Tracking</li>
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
                href="https://wa.me/6281234567890?text=Halo%20BoonTrack,%20saya%20ingin%20upgrade%20ke%20paket%20Team%20Scale"
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
