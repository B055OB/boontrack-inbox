'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Save,
  ShoppingBag,
  Package,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Video,
  MapPin,
  Phone,
  Search,
  Link as LinkIcon,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { ProductItem } from '@/lib/product-catalog';

export type VisualThemeType =
  | 'clean_minimal'
  | 'aurora_gradient'
  | 'midnight_luxe'
  | 'warm_terra'
  | 'bold_performance'
  | 'slate_monochrome';

export interface BioButton {
  id: string;
  label: string;
  url: string;
  icon: 'whatsapp' | 'instagram' | 'tiktok' | 'maps' | 'phone' | 'link';
  is_active: boolean;
}

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
  {
    id: 'slate_monochrome',
    title: 'Minimalist Slate Monochrome',
    subtitle: 'Monokrom Modern & Netral',
    description: 'Palet warna slate monokrom elegan dengan estetika industrial minimalis. Sempurna untuk portofolio, studio, & brand modern.',
    badge: 'PREMIUM (Eksklusif)',
    isLockedForSolo: true,
    swatches: {
      bg: '#F8FAFC',
      card: '#FFFFFF',
      accent: '#334155',
    },
  },
];

function InstagramIconSvg({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

const BIO_ICON_OPTIONS: { id: BioButton['icon']; label: string; icon: React.ElementType }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'link', label: 'Web / Link', icon: LinkIcon },
  { id: 'instagram', label: 'Instagram', icon: InstagramIconSvg },
  { id: 'tiktok', label: 'TikTok', icon: Video },
  { id: 'maps', label: 'Lokasi Maps', icon: MapPin },
  { id: 'phone', label: 'Telepon', icon: Phone },
];

export function getDefaultStarterButtons(slug: string, waNumber?: string): BioButton[] {
  const cleanWa = waNumber?.replace(/\D/g, '') || '6285181830080';
  return [
    {
      id: 'btn-wa',
      label: 'Chat WhatsApp CS',
      url: `https://wa.me/${cleanWa}`,
      icon: 'whatsapp',
      is_active: true,
    },
    {
      id: 'btn-catalog',
      label: 'Katalog Produk & Promo',
      url: `/${slug}`,
      icon: 'link',
      is_active: true,
    },
    {
      id: 'btn-ig',
      label: 'Instagram Resmi Toko',
      url: 'https://instagram.com',
      icon: 'instagram',
      is_active: true,
    },
  ];
}

interface StorefrontThemeCardProps {
  tenantSlug: string;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  onThemeChange?: (themeId: VisualThemeType) => void;
  currentVisualTheme?: VisualThemeType;
  products?: ProductItem[];
  onFeaturedProductsChange?: (productIds: string[]) => void;
  initialButtons?: BioButton[];
  storeWhatsapp?: string;
  onButtonsChange?: (buttons: BioButton[]) => void;
  onSaved?: (msg: string) => void;
}

export default function StorefrontThemeCard({
  tenantSlug,
  isTeamScale = false,
  isAdsPerformance = false,
  onThemeChange,
  currentVisualTheme,
  products = [],
  onFeaturedProductsChange,
  initialButtons,
  storeWhatsapp,
  onButtonsChange,
  onSaved,
}: StorefrontThemeCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<VisualThemeType>(
    currentVisualTheme || 'clean_minimal'
  );
  const [chatEnabled, setChatEnabled] = useState(true);
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([]);
  const [availableProducts, setAvailableProducts] = useState<ProductItem[]>(products);
  const [buttons, setButtons] = useState<BioButton[]>(() => {
    if (initialButtons && initialButtons.length > 0) return initialButtons;
    return getDefaultStarterButtons(tenantSlug, storeWhatsapp);
  });
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [targetUpgradeTheme, setTargetUpgradeTheme] = useState<VisualThemeOption | null>(null);

  // Search Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedProductsRef = useRef(false);

  const onButtonsChangeRef = useRef(onButtonsChange);
  onButtonsChangeRef.current = onButtonsChange;
  const onFeaturedProductsChangeRef = useRef(onFeaturedProductsChange);
  onFeaturedProductsChangeRef.current = onFeaturedProductsChange;

  // Tutup dropdown pencarian saat klik di luar area
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sync prop jika ada perubahan dari parent
  useEffect(() => {
    if (currentVisualTheme) {
      setSelectedTheme(currentVisualTheme);
    }
  }, [currentVisualTheme]);

  useEffect(() => {
    if (initialButtons && initialButtons.length > 0) {
      setButtons(initialButtons);
    }
  }, [initialButtons]);

  const notifyButtonsChange = useCallback((newButtons: BioButton[]) => {
    setButtons(newButtons);
    if (onButtonsChange) {
      onButtonsChange(newButtons);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storefront-buttons-changed', {
          detail: { buttons: newButtons },
        })
      );
    }
  }, [onButtonsChange]);

  const handleAddButton = () => {
    const newBtn: BioButton = {
      id: `btn-${Date.now()}`,
      label: 'Tombol Baru',
      url: 'https://',
      icon: 'link',
      is_active: true,
    };
    const next = [...buttons, newBtn];
    notifyButtonsChange(next);
  };

  const handleUpdateButton = (id: string, updates: Partial<BioButton>) => {
    const next = buttons.map((b) => (b.id === id ? { ...b, ...updates } : b));
    notifyButtonsChange(next);
  };

  const handleDeleteButton = (id: string) => {
    const next = buttons.filter((b) => b.id !== id);
    notifyButtonsChange(next);
  };

  const handleMoveButton = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= buttons.length) return;
    const copy = [...buttons];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    notifyButtonsChange(copy);
  };

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

  // Sync prop jika parent menyediakan daftar produk aktif
  useEffect(() => {
    if (Array.isArray(products) && products.length > 0) {
      setAvailableProducts(products.filter((p) => p && p.is_active !== false));
      setIsLoadingProducts(false);
    }
  }, [products]);

  // Load produk aktif, buttons & ID unggulan dari Supabase & API
  useEffect(() => {
    if (!tenantSlug || hasLoadedProductsRef.current) return;
    hasLoadedProductsRef.current = true;

    let isMounted = true;
    async function loadFeaturedAndProducts() {
      try {
        setIsLoadingProducts(true);
        const supabase = getSupabase();
        if (!supabase || !tenantSlug) {
          if (isMounted) setIsLoadingProducts(false);
          return;
        }

        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow && isMounted) {
          const meta = tenantRow.metadata || {};

          // Hydrate buttons
          const rawButtons = meta.microsite?.buttons || meta.buttons;
          if (Array.isArray(rawButtons) && rawButtons.length > 0) {
            setButtons(rawButtons);
            onButtonsChangeRef.current?.(rawButtons);
          } else if (!initialButtons || initialButtons.length === 0) {
            const starters = getDefaultStarterButtons(tenantSlug, meta.whatsapp_number || storeWhatsapp);
            setButtons(starters);
            onButtonsChangeRef.current?.(starters);
          }

          const rawFeat =
            meta.featured_product_ids ||
            meta.microsite?.featured_product_ids ||
            meta.microsite_featured_product_ids;
          const featList = Array.isArray(rawFeat) ? rawFeat.map(String).slice(0, 5) : [];
          setFeaturedProductIds(featList);
          onFeaturedProductsChangeRef.current?.(featList);

          // Ambil daftar produk aktif dari database Supabase (products) milik tenant
          let dbProdsList: ProductItem[] = [];
          if (tenantRow.id) {
            try {
              const { data: dbProds } = await supabase
                .from('products')
                .select('*')
                .eq('tenant_id', tenantRow.id)
                .order('created_at', { ascending: false });

              if (Array.isArray(dbProds) && dbProds.length > 0) {
                dbProdsList = dbProds
                  .filter((p: any) => p.is_active !== false)
                  .map((p: any) => ({
                    id: String(p.id),
                    name: p.title || p.name || 'Produk',
                    price: Number(p.price) || 0,
                    promo_price: p.promo_price ? Number(p.promo_price) : 0,
                    category: p.category || 'Digital',
                    image: p.image || p.image_url || '',
                    description: p.description || '',
                    stock: p.stock !== undefined ? Number(p.stock) : 999999,
                    is_active: p.is_active !== false,
                  }));
              }
            } catch (pDbErr) {
              console.warn('[StorefrontThemeCard] SQL products fetch note:', pDbErr);
            }
          }

          if (dbProdsList.length === 0 && Array.isArray(meta.products) && meta.products.length > 0) {
            dbProdsList = meta.products
              .filter((p: any) => p && p.is_active !== false)
              .map((p: any) => ({
                id: String(p.id),
                name: p.name || p.title || 'Produk',
                price: Number(p.price) || 0,
                promo_price: p.promo_price ? Number(p.promo_price) : 0,
                category: p.category || 'Digital',
                image: p.image || p.image_url || '',
                description: p.description || '',
                stock: p.stock !== undefined ? Number(p.stock) : 999999,
                is_active: p.is_active !== false,
              }));
          }

          // Fallback: API endpoint /api/v1/tenants/[slug]/products
          if (dbProdsList.length === 0) {
            try {
              const apiRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, { cache: 'no-store' });
              if (apiRes.ok) {
                const apiData = await apiRes.json();
                const apiProds = Array.isArray(apiData?.products) ? apiData.products : [];
                if (apiProds.length > 0) {
                  dbProdsList = apiProds
                    .filter((p: any) => p && p.is_active !== false)
                    .map((p: any) => ({
                      id: String(p.id),
                      name: p.name || p.title || 'Produk',
                      price: Number(p.price) || 0,
                      promo_price: p.promo_price ? Number(p.promo_price) : 0,
                      category: p.category || 'Digital',
                      image: p.image || p.image_url || '',
                      description: p.description || '',
                      stock: p.stock !== undefined ? Number(p.stock) : 999999,
                      is_active: p.is_active !== false,
                    }));
                }
              }
            } catch (apiErr) {
              console.warn('[StorefrontThemeCard] API products fetch note:', apiErr);
            }
          }

          if (dbProdsList.length > 0 && isMounted) {
            setAvailableProducts(dbProdsList);
          }
        }
      } catch (err) {
        console.warn('[StorefrontThemeCard] Gagal memuat produk aktif:', err);
      } finally {
        if (isMounted) setIsLoadingProducts(false);
      }
    }

    loadFeaturedAndProducts();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  // Helper sinkronisasi produk unggulan ke API, Supabase, dan Live Preview
  const persistFeaturedProducts = async (nextIds: string[]) => {
    // 1. Update live phone preview & parent callback secara instan
    onFeaturedProductsChangeRef.current?.(nextIds);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storefront-featured-products-changed', {
          detail: { featured_product_ids: nextIds },
        })
      );
    }

    // 2. Simpan secara paralel ke backend settings API & Supabase
    try {
      fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featured_product_ids: nextIds,
          microsite: {
            featured_product_ids: nextIds,
          },
          theme: {
            featured_product_ids: nextIds,
          },
        }),
      }).catch((apiErr) => {
        console.warn('[StorefrontThemeCard] Settings API sync note:', apiErr);
      });

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
            featured_product_ids: nextIds,
            microsite_featured_product_ids: nextIds,
            microsite: {
              ...(tenantRow.metadata?.microsite || {}),
              featured_product_ids: nextIds,
            },
            theme: {
              ...(tenantRow.metadata?.theme || {}),
              featured_product_ids: nextIds,
            },
          };
          await supabase
            .from('tenants')
            .update({ metadata: updatedMeta })
            .eq('slug', tenantSlug);
        }
      }
    } catch (saveErr) {
      console.warn('[StorefrontThemeCard] Persist featured products error:', saveErr);
    }
  };

  // Handler penambahan produk dari search autocomplete
  const handleAddFeaturedProduct = (prodId: string) => {
    if (featuredProductIds.length >= 5) {
      setToastMessage('⚠️ Maksimal 5 produk unggulan telah tercapai.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }
    if (featuredProductIds.includes(prodId)) return;
    const nextIds = [...featuredProductIds, prodId];
    setFeaturedProductIds(nextIds);
    setSearchQuery('');
    setIsSearchOpen(false);
    persistFeaturedProducts(nextIds);
    setToastMessage('✅ Produk berhasil ditambahkan ke produk unggulan.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Handler penghapusan produk unggulan via tombol X
  const handleRemoveFeaturedProduct = (prodId: string) => {
    const nextIds = featuredProductIds.filter((id) => id !== prodId);
    setFeaturedProductIds(nextIds);
    persistFeaturedProducts(nextIds);
    setToastMessage('Produk dihapus dari unggulan.');
    setTimeout(() => setToastMessage(null), 2000);
  };

  // Filter produk untuk autocomplete real-time
  const filteredSearchProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return availableProducts
      .filter((p) => !featuredProductIds.includes(String(p.id)))
      .filter((p) => {
        const name = (p.name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      })
      .slice(0, 10);
  }, [availableProducts, featuredProductIds, searchQuery]);

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
          buttons: buttons,
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
            buttons: buttons,
            microsite: {
              buttons: buttons,
              featured_product_ids: featuredProductIds,
            },
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
              featured_product_ids: featuredProductIds,
              microsite_featured_product_ids: featuredProductIds,
              buttons: buttons,
              microsite: {
                ...(tenantRow.metadata?.microsite || {}),
                buttons: buttons,
                featured_product_ids: featuredProductIds,
              },
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

      setToastMessage('✅ Perubahan tampilan toko berhasil disimpan!');
      if (onSaved) {
        onSaved('✅ Perubahan tampilan toko berhasil disimpan!');
      }
      setTimeout(() => setToastMessage(null), 3500);
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
                6 Pilihan Tema
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

      {/* 6 Theme Options Grid (3 x 2) */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <span
                          className="w-4 h-4 rounded-md border border-black/10 shadow-2xs"
                          style={{ backgroundColor: theme.swatches.bg }}
                        />
                        <span
                          className="w-4 h-4 rounded-md border border-black/10 shadow-2xs"
                          style={{ backgroundColor: theme.swatches.card }}
                        />
                        <span
                          className="w-4 h-4 rounded-md border border-black/10 shadow-2xs"
                          style={{ backgroundColor: theme.swatches.accent }}
                        />
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

          {/* KONTROL: FORM MANAJEMEN TOMBOL BIO LINKS (BIO LINKS EDITOR) */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0 border border-indigo-100">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-black text-slate-900">
                      Kelola Tombol Bio Link Toko ({buttons.length})
                    </h4>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
                      Live Preview Interaktif
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Atur tombol navigasi utama (WhatsApp, Katalog, Instagram, Maps, dll.) yang tampil di bio storefront Anda.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddButton}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95 self-start sm:self-auto shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Tombol</span>
              </button>
            </div>

            {buttons.length === 0 ? (
              <div className="p-6 border border-dashed border-slate-200 rounded-2xl text-center space-y-2 text-slate-400 bg-white">
                <Sparkles className="w-5 h-5 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">Belum ada tombol link di bio storefront Anda.</p>
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  + Tambah tombol link pertama
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {buttons.map((btn, idx) => {
                  const activeIconOpt = BIO_ICON_OPTIONS.find((o) => o.id === btn.icon) || BIO_ICON_OPTIONS[1];
                  const IconComp = activeIconOpt.icon;

                  return (
                    <div
                      key={btn.id}
                      className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
                        btn.is_active
                          ? 'bg-white border-slate-200 shadow-2xs'
                          : 'bg-slate-100/60 border-slate-200 opacity-60'
                      }`}
                    >
                      {/* Top Bar: Reorder, Icon preview, Title, Toggle, Delete */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-600 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 shrink-0">
                            <IconComp className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {btn.label || 'Tanpa Label'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveButton(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition cursor-pointer"
                            title="Pindah ke Atas"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveButton(idx, 'down')}
                            disabled={idx === buttons.length - 1}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition cursor-pointer"
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Switch Active */}
                          <label className="relative inline-flex items-center cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={btn.is_active}
                              onChange={(e) => handleUpdateButton(btn.id, { is_active: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleDeleteButton(btn.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ml-0.5"
                            title="Hapus Tombol"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inputs: Label & URL */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Label Tombol
                          </label>
                          <input
                            type="text"
                            value={btn.label}
                            onChange={(e) => handleUpdateButton(btn.id, { label: e.target.value })}
                            placeholder="Contoh: Chat WhatsApp CS"
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            URL Tujuan
                          </label>
                          <input
                            type="text"
                            value={btn.url}
                            onChange={(e) => handleUpdateButton(btn.id, { url: e.target.value })}
                            placeholder="https://wa.me/... atau /slug"
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono text-[11px] focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                          />
                        </div>
                      </div>

                      {/* Icon Selector Chips */}
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 mb-1.5">
                          Pilihan Ikon:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {BIO_ICON_OPTIONS.map((opt) => {
                            const ChipIcon = opt.icon;
                            const isIconSelected = btn.icon === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleUpdateButton(btn.id, { icon: opt.id })}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                                  isIconSelected
                                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                                }`}
                              >
                                <ChipIcon className="w-3 h-3" />
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* KONTROL: PILIH PRODUK UNGGULAN DISPLAY (SEARCH AUTOCOMPLETE & CHIPS) */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0 border border-emerald-100">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-black text-slate-900">
                      Produk Unggulan di Bio Storefront
                    </h4>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      featuredProductIds.length === 5
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {featuredProductIds.length}/5 Terpilih
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pilih hingga 5 produk aktif dari etalase untuk disorot langsung pada kartu cuplikan bio storefront.
                  </p>
                </div>
              </div>

              {featuredProductIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFeaturedProductIds([]);
                    persistFeaturedProducts([]);
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Reset Semua Pilihan
                </button>
              )}
            </div>

            {/* FORM INPUT PENCARIAN & DROPDOWN AUTOCOMPLETE */}
            <div ref={searchContainerRef} className="relative space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  disabled={featuredProductIds.length >= 5}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) setIsSearchOpen(true);
                  }}
                  placeholder={
                    featuredProductIds.length >= 5
                      ? "Maksimal 5 produk unggulan telah tercapai"
                      : "Ketik nama produk untuk menambahkan..."
                  }
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs font-medium transition ${
                    featuredProductIds.length >= 5
                      ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs"
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Info batas maksimal 5 produk */}
              {featuredProductIds.length >= 5 && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Maksimal 5 produk unggulan telah tercapai. Hapus salah satu produk di bawah jika ingin menambahkan produk lain.</span>
                </div>
              )}

              {/* Real-time Search Results Dropdown */}
              {isSearchOpen && searchQuery.trim().length > 0 && featuredProductIds.length < 5 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {filteredSearchProducts.length === 0 ? (
                    <div className="p-3.5 text-center text-xs text-slate-400">
                      Tidak ada produk aktif yang cocok dengan &quot;<strong className="text-slate-600">{searchQuery}</strong>&quot;
                    </div>
                  ) : (
                    filteredSearchProducts.map((prod: ProductItem) => {
                      const prodImage = prod.image || (prod as any).image_url;
                      return (
                        <div
                          key={prod.id}
                          onClick={() => handleAddFeaturedProduct(String(prod.id))}
                          className="flex items-center gap-3 p-2.5 hover:bg-indigo-50/60 transition cursor-pointer group"
                        >
                          {prodImage ? (
                            <img
                              src={prodImage}
                              alt={prod.name}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                              {prod.name}
                            </div>
                            <div className="text-[11px] font-semibold text-emerald-600">
                              {Number(prod.price) === 0 ? 'Gratis' : `Rp ${Number(prod.price).toLocaleString('id-ID')}`}
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white px-2.5 py-1 rounded-lg transition-all shrink-0">
                            <Plus className="w-3 h-3" />
                            <span>Pilih</span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* DAFTAR PRODUK UNGGULAN TERPILIH (CHIP / KARTU KECIL) */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-slate-700 block">
                Produk Unggulan Terpilih ({featuredProductIds.length}/5):
              </span>

              {isLoadingProducts ? (
                <div className="p-4 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Memuat daftar produk toko...</span>
                </div>
              ) : featuredProductIds.length === 0 ? (
                <div className="p-4 rounded-xl bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400 space-y-1">
                  <p>Belum ada produk unggulan yang dipilih untuk bio storefront.</p>
                  <p className="text-[11px] text-slate-400">Gunakan form pencarian di atas untuk menambahkan produk unggulan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {featuredProductIds.map((prodId) => {
                    const prod = availableProducts.find((p: ProductItem) => String(p.id) === String(prodId)) || {
                      id: prodId,
                      name: `Produk (${prodId})`,
                      price: 0,
                      image: '',
                    };
                    const prodImage = prod.image || (prod as any).image_url;

                    return (
                      <div
                        key={prodId}
                        className="flex items-center gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition relative group"
                      >
                        {prodImage ? (
                          <img
                            src={prodImage}
                            alt={prod.name}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 pr-6">
                          <h5 className="text-xs font-bold text-slate-900 truncate" title={prod.name}>
                            {prod.name}
                          </h5>
                          <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                            {Number(prod.price) === 0 ? 'Gratis' : `Rp ${Number(prod.price).toLocaleString('id-ID')}`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFeaturedProduct(prodId)}
                          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Hapus dari produk unggulan"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

          {/* Action Bar: Simpan Perubahan Tampilan */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Simpan tema visual dan preferensi tampilan untuk pengunjung storefront Anda.
            </p>
            <button
              type="button"
              onClick={() => saveThemeConfig(selectedTheme, chatEnabled)}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Simpan Perubahan Tampilan</span>
            </button>
          </div>
        </div>

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
