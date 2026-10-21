'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Palette,
  Check,
  CheckCircle2,
  Lock,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Smartphone,
  Crown,
  ShoppingBag,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { ProductItem } from '@/lib/product-catalog';
import LivePhonePreview from '../preview/LivePhonePreview';
import {
  VISUAL_THEMES,
  VisualThemeType,
  VisualThemeOption,
  BioButton,
} from '../settings/StorefrontThemeCard';
import CustomDomainCard from '../settings/CustomDomainCard';

export interface ThemeTabProps {
  tenantSlug: string;
  displayName?: string;
  storeDisplayName?: string;
  storeBio?: string;
  storeLogoUrl?: string;
  storeWhatsapp?: string;
  products?: ProductItem[];
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isSubscriptionExpired?: boolean;
  currentVisualTheme?: VisualThemeType;
  initialButtons?: BioButton[];
  featuredProductIds?: string[];
  showProducts?: boolean;
  onThemeChange?: (themeId: VisualThemeType) => void;
  onShowProductsChange?: (show: boolean) => void;
  onUpgrade?: () => void;
  onSaved?: (msg: string) => void;
  customDomain?: string | null;
  isCheckoutLite?: boolean;
}

export default function ThemeTab({
  tenantSlug,
  displayName = '',
  storeDisplayName = '',
  storeBio = '',
  storeLogoUrl = '',
  storeWhatsapp = '',
  products = [],
  isTeamScale = false,
  isAdsPerformance = false,
  isSubscriptionExpired = false,
  currentVisualTheme = 'aurora_gradient',
  initialButtons = [],
  featuredProductIds = [],
  showProducts,
  onThemeChange,
  onShowProductsChange,
  onUpgrade,
  onSaved,
  customDomain,
  isCheckoutLite = false,
}: ThemeTabProps) {
  const [selectedTheme, setSelectedTheme] = useState<VisualThemeType>(currentVisualTheme);
  const [showProductsState, setShowProductsState] = useState<boolean>(() => {
    return showProducts !== undefined ? showProducts : true;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state if prop changes externally
  useEffect(() => {
    if (currentVisualTheme && currentVisualTheme !== selectedTheme) {
      setSelectedTheme(currentVisualTheme);
    }
  }, [currentVisualTheme]);

  useEffect(() => {
    if (showProducts !== undefined && showProducts !== showProductsState) {
      setShowProductsState(showProducts);
    }
  }, [showProducts]);

  // Load initial product visibility from Supabase if not provided
  useEffect(() => {
    async function loadVisibility() {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();
        const meta = tenantRow?.metadata || {};
        const isProdVisible =
          meta.show_products ??
          meta.display_catalog ??
          meta.theme?.show_products ??
          meta.theme_config?.show_products ??
          meta.microsite?.show_products ??
          meta.microsite_show_products ??
          true;
        setShowProductsState(Boolean(isProdVisible));
      } catch (err) {
        console.debug('[ThemeTab] Load visibility error:', err);
      }
    }
    if (showProducts === undefined) {
      loadVisibility();
    }
  }, [tenantSlug, showProducts]);

  const isThemeLocked = useCallback(
    (theme: VisualThemeOption) => {
      if (!theme.isLockedForSolo) return false;
      return !isTeamScale && !isAdsPerformance;
    },
    [isTeamScale, isAdsPerformance]
  );

  const handleSelectTheme = async (theme: VisualThemeOption) => {
    if (isThemeLocked(theme)) {
      setErrorMessage(`Tema "${theme.title}" eksklusif untuk paket Ads Performance & Team Scale.`);
      setTimeout(() => setErrorMessage(null), 4000);
      onUpgrade?.();
      return;
    }

    if (isSubscriptionExpired) {
      setErrorMessage('Masa aktif toko telah habis. Lakukan perpanjangan untuk mengubah tema visual.');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const previousTheme = selectedTheme;
    setSelectedTheme(theme.id);
    onThemeChange?.(theme.id);

    // Broadcast instant event for previews across the window
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storefront-theme-changed', {
          detail: { visual_theme: theme.id },
        })
      );
    }

    setIsSaving(true);
    setToastMessage(null);
    setErrorMessage(null);

    try {
      const supabase = getSupabase();
      let saveSuccess = false;

      // 1. Direct Supabase save if available
      if (supabase) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const currentMeta = tenantRow?.metadata || {};
        const updatedMeta = {
          ...currentMeta,
          visual_theme: theme.id,
          theme: {
            ...(currentMeta.theme || {}),
            visual_theme: theme.id,
          },
        };

        const { error: updateErr } = await supabase
          .from('tenants')
          .update({
            metadata: updatedMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('slug', tenantSlug);

        if (!updateErr) {
          saveSuccess = true;
        }
      }

      // Always sync to Theme API to guarantee Next.js ISR cache revalidation (Zero stale cache)
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visual_theme: theme.id,
            show_products: showProductsState,
          }),
        });
      } catch (apiErr) {
        console.warn('[ThemeTab] Theme API revalidate note:', apiErr);
      }

      const successNotice = `Tema visual berhasil diperbarui ke "${theme.title}"!`;
      setToastMessage(successNotice);
      onSaved?.(successNotice);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.warn('[ThemeTab] Gagal menyimpan tema:', err);
      setSelectedTheme(previousTheme);
      onThemeChange?.(previousTheme);
      setErrorMessage('Gagal menyimpan perubahan tema visual. Silakan coba kembali.');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleShowProducts = async (newVal: boolean) => {
    if (isSubscriptionExpired) {
      setErrorMessage('Masa aktif toko telah habis. Lakukan perpanjangan untuk mengubah pengaturan.');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const previousVal = showProductsState;
    setShowProductsState(newVal);
    onShowProductsChange?.(newVal);
    setIsSaving(true);
    setToastMessage(null);
    setErrorMessage(null);

    try {
      const supabase = getSupabase();
      let currentMeta: Record<string, any> = {};

      if (supabase) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        currentMeta = tenantRow?.metadata || {};
      }

      const updatedMeta = {
        ...currentMeta,
        show_products: newVal,
        display_catalog: newVal,
        microsite_show_products: newVal,
        theme: {
          ...(currentMeta.theme || {}),
          show_products: newVal,
        },
        theme_config: {
          ...(currentMeta.theme_config || {}),
          show_products: newVal,
        },
        microsite: {
          ...(currentMeta.microsite || {}),
          show_products: newVal,
        },
        sections: {
          ...(currentMeta.sections || {}),
          catalog: { is_active: newVal },
          products: { is_active: newVal },
        },
      };

      if (supabase) {
        await supabase
          .from('tenants')
          .update({
            metadata: updatedMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('slug', tenantSlug);
      }

      // Always trigger theme API to ensure Next.js ISR cache revalidation is called on server
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            show_products: newVal,
            display_catalog: newVal,
            visual_theme: selectedTheme,
          }),
        });
      } catch (apiErr) {
        console.warn('[ThemeTab] Theme API revalidate note:', apiErr);
      }

      const successNotice = newVal
        ? 'Etalase produk berhasil diaktifkan di halaman depan.'
        : 'Etalase produk berhasil disembunyikan dari halaman depan.';
      setToastMessage(successNotice);
      onSaved?.(successNotice);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.warn('[ThemeTab] Gagal mengubah visibilitas produk:', err);
      setShowProductsState(previousVal);
      onShowProductsChange?.(previousVal);
      setErrorMessage('Gagal menyimpan pengaturan visibilitas produk. Silakan coba kembali.');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const nameToShow = storeDisplayName || displayName || tenantSlug;

  return (
    <div className="w-full">
      {/* 2-Column Split Layout */}
      <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
        {/* Kolom Kiri: Grid Kartu Tema */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Header Kontrol Tema */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">
                    Pilihan Tema Visual Storefront
                  </h3>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
                    6 Pilihan Tema
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sesuaikan palet warna, kontras kartu, dan tata visual etalase publik toko Anda.
                </p>
              </div>
            </div>

            {isSaving && (
              <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-semibold flex items-center gap-2 shrink-0 border border-border">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                <span>Menyimpan pengaturan...</span>
              </span>
            )}
          </div>

          {/* Card Pengaturan Visibilitas Katalog Produk di Halaman Depan */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                  showProductsState
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">
                    Tampilkan Produk di Halaman Depan
                  </h3>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      showProductsState
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {showProductsState ? 'Aktif (Tampil)' : 'Sembunyi'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {showProductsState
                    ? 'Katalog produk & etalase toko ditampilkan di halaman publik toko Anda.'
                    : 'Katalog produk disembunyikan. Cocok jika Anda hanya ingin menampilkan bio link, profil, atau formulir.'}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showProductsState}
                disabled={isSaving || isSubscriptionExpired}
                onChange={(e) => handleToggleShowProducts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Feedback Banners */}
          {toastMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/80 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-semibold">{toastMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/80 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Grid Kartu Tema: 2 Kolom dengan gap-4 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {VISUAL_THEMES.map((theme) => {
              const isSelected = selectedTheme === theme.id;
              const locked = isThemeLocked(theme);

              return (
                <div
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme)}
                  className={`group relative rounded-xl p-4.5 transition-all cursor-pointer flex flex-col justify-between text-left border ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/20 shadow-md'
                      : locked
                      ? 'bg-card border-border opacity-75 hover:border-zinc-400 dark:hover:border-zinc-600'
                      : 'bg-card border-border hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Swatches & Tier Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted border border-border shrink-0">
                        <span
                          className="w-3.5 h-3.5 rounded-md border border-black/10 dark:border-white/20 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.swatches.bg }}
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-md border border-black/10 dark:border-white/20 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.swatches.card }}
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-md border border-black/10 dark:border-white/20 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.swatches.accent }}
                        />
                      </div>

                      {locked ? (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-md text-[10px] font-extrabold flex items-center gap-1 shrink-0">
                          <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Terkunci</span>
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            theme.isLockedForSolo
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                              : 'bg-card text-foreground border-border shadow-2xs'
                          }`}
                        >
                          {theme.badge}
                        </span>
                      )}
                    </div>

                    {/* Typography: Judul & Deskripsi */}
                    <div>
                      <h4 className="text-zinc-900 dark:text-zinc-100 font-bold text-sm tracking-tight flex items-center gap-1.5">
                        <span>{theme.title}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
                        )}
                      </h4>
                      <p className="text-zinc-500 dark:text-zinc-400 text-[11px] font-medium mt-0.5">
                        {theme.subtitle}
                      </p>
                      <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed mt-1">
                        {theme.description}
                      </p>
                    </div>
                  </div>

                  {/* Switch Toggle / Badge Status Aktif di Bagian Bawah */}
                  <div className="pt-3.5 mt-3.5 border-t border-border flex items-center justify-between gap-2">
                    <div className="truncate">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
                          <Check className="w-3.5 h-3.5" />
                          <span>Aktif Digunakan</span>
                        </span>
                      ) : locked ? (
                        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>Khusus Ads / Scale</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs font-medium">
                          Klik untuk Pilih
                        </span>
                      )}
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : locked
                          ? 'border-border bg-muted text-muted-foreground'
                          : 'border-border bg-card text-muted-foreground group-hover:border-zinc-400 dark:group-hover:border-zinc-500'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      ) : locked ? (
                        <Lock className="w-2.5 h-2.5" />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pengaturan Custom Domain Toko */}
          {!isCheckoutLite && (
            <CustomDomainCard
              tenantSlug={tenantSlug}
              isTeamScale={isTeamScale}
              initialDomain={customDomain || undefined}
            />
          )}
        </div>

        {/* Kolom Kanan: Live Phone Preview Desktop (Sticky top-6) */}
        <div className="w-full max-w-[380px] shrink-0 sticky top-6 self-start hidden lg:block">
          <LivePhonePreview
            tenantSlug={tenantSlug}
            displayName={nameToShow}
            storeBio={storeBio}
            storeLogoUrl={storeLogoUrl}
            storeWhatsapp={storeWhatsapp}
            visualTheme={selectedTheme}
            buttons={initialButtons}
            products={products}
            showProducts={showProductsState}
            featuredProductIds={featuredProductIds}
          />
        </div>
      </div>

      {/* Pratinjau Mobile (< lg) di Bagian Bawah */}
      <div className="lg:hidden w-full max-w-[380px] mx-auto mt-8 pt-8 border-t border-border flex flex-col items-center">
        <LivePhonePreview
          tenantSlug={tenantSlug}
          displayName={nameToShow}
          storeBio={storeBio}
          storeLogoUrl={storeLogoUrl}
          storeWhatsapp={storeWhatsapp}
          visualTheme={selectedTheme}
          buttons={initialButtons}
          products={products}
          showProducts={showProductsState}
          featuredProductIds={featuredProductIds}
        />
      </div>
    </div>
  );
}
