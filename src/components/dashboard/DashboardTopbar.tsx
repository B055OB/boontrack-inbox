'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Menu,
  Search,
  Sparkles,
  Sun,
  Moon,
  Store,
  ExternalLink,
  Settings,
  User,
  Crown,
  LogOut,
  ChevronDown,
  Package,
  ShoppingBag,
  Wallet,
  LayoutDashboard,
  MessageSquare,
  Users,
  Radio,
  Target,
  Palette,
  CornerDownLeft,
  X,
} from 'lucide-react';
import { getStorefrontUrl } from '@/lib/utils/storefrontUrl';

export interface CommandPaletteItem {
  id: string;
  label: string;
  section: string;
  icon: React.ElementType;
  keywords?: string;
  onSelect: () => void;
}

export interface DashboardTopbarProps {
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeLogoUrl?: string | null;
  customDomain?: string | null;
  tierLabel?: string;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
  themeToggleClassName?: string;
  saveFeedback?: string | null;
  orderCount?: number;
  productCount?: number;
  onOpenMobileDrawer: () => void;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
  onOpenNewProduct?: () => void;
  onOpenAiAssistant?: () => void;
  onLogout: () => Promise<void> | void;
  storeStatus?: 'open' | 'break';
  onToggleStoreStatus?: () => void;
  notificationSlot?: React.ReactNode;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Home',
  overview: 'Home',
  catalog: 'Katalog / Products',
  products: 'Katalog / Products',
  orders: 'Transaksi / Sales',
  pesanan: 'Transaksi / Sales',
  finance: 'Payouts / Keuangan',
  themes: 'Tampilan & Tema',
  storefront: 'Tampilan & Tema',
  ai_knowledge: 'AI Knowledge & Bot',
  inbox: 'Smart Chatbox',
  customers: 'Pelanggan (CRM)',
  crm: 'Pelanggan (CRM)',
  whatsapp: 'WhatsApp Connect',
  auto_reply: 'Aturan Auto-Reply',
  broadcast: 'Broadcast WA',
  rotator: 'CS Rotator',
  telegram_alerts: 'Telegram Connect',
  ads_tracking: 'Ads Tracking (CAPI)',
  shipping: 'Pengiriman & Kurir',
  biteship: 'Pengiriman & Kurir',
  booking: 'Jadwal & Booking',
  downloads: 'Akses Unduh & Lisensi',
  campaigns: 'Kampanye & UGC',
  reseller: 'Program Reseller',
  settings: 'Pengaturan Toko',
  docs: 'Dokumentasi & Panduan',
  documentation: 'Dokumentasi & Panduan',
};

export default function DashboardTopbar({
  tenantSlug,
  displayName,
  storeDisplayName,
  storeLogoUrl,
  customDomain,
  tierLabel,
  activeTab,
  onSelectTab,
  themeMode,
  onToggleTheme,
  themeToggleClassName = 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
  saveFeedback,
  orderCount = 0,
  productCount = 0,
  onOpenMobileDrawer,
  onOpenStoreSettings,
  onOpenUpgradeModal,
  onOpenNewProduct,
  onOpenAiAssistant,
  onLogout,
  storeStatus: storeStatusProp,
  onToggleStoreStatus: onToggleStoreStatusProp,
  notificationSlot,
}: DashboardTopbarProps) {
  const brandName = storeDisplayName || displayName || tenantSlug || 'Store';
  const brandInitial = brandName.charAt(0).toUpperCase();
  const storefrontUrl = getStorefrontUrl(tenantSlug, customDomain);
  const activeSectionTitle = TAB_TITLES[activeTab?.toLowerCase()] || 'Dashboard';

  // Store Operational Status Toggle (Toko Buka / Istirahat) — controlled via DashboardShell or local fallback
  const [uncontrolledStatus, setUncontrolledStatus] = useState<'open' | 'break'>('open');
  const storeStatus = storeStatusProp ?? uncontrolledStatus;

  const toggleStoreStatus = useCallback(() => {
    if (onToggleStoreStatusProp) {
      onToggleStoreStatusProp();
      return;
    }
    setUncontrolledStatus((prev) => (prev === 'open' ? 'break' : 'open'));
  }, [onToggleStoreStatusProp]);

  // Avatar Dropdown
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setIsAvatarOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsAvatarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Native <dialog> Command Palette ("Press /")
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const pressedOutsideRef = useRef(false);

  const openCommandPalette = useCallback(() => {
    setSearchQuery('');
    setSelectedIdx(0);
    setIsPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsPaletteOpen(false);
  }, []);

  // Sync native top-layer <dialog> with declarative React state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isPaletteOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isPaletteOpen]);

  // Keyboard shortcut: "/" opens Command Palette when not typing in an editable field
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' && !(e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === '/' && isEditable) return;

      e.preventDefault();
      if (isPaletteOpen) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isPaletteOpen, openCommandPalette, closeCommandPalette]);

  const handleTriggerAiAssistant = useCallback(() => {
    if (onOpenAiAssistant) {
      onOpenAiAssistant();
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-boonpilot'));
    }
  }, [onOpenAiAssistant]);

  const commandItems: CommandPaletteItem[] = useMemo(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'cmd-home',
        label: 'Home & Ringkasan Bisnis',
        section: 'Navigasi',
        icon: LayoutDashboard,
        keywords: 'home overview dashboard beranda statistik',
        onSelect: () => onSelectTab('dashboard'),
      },
      {
        id: 'cmd-products',
        label: `Semua Produk & Katalog${productCount > 0 ? ` (${productCount})` : ''}`,
        section: 'Katalog',
        icon: Package,
        keywords: 'produk katalog barang kategori varian stok',
        onSelect: () => onSelectTab('catalog'),
      },
      {
        id: 'cmd-orders',
        label: `Pesanan & Invoices${orderCount > 0 ? ` (${orderCount})` : ''}`,
        section: 'Transaksi',
        icon: ShoppingBag,
        keywords: 'pesanan order transaksi sales invoice qris',
        onSelect: () => onSelectTab('orders'),
      },
      {
        id: 'cmd-payouts',
        label: 'Payouts & Laporan Keuangan',
        section: 'Keuangan',
        icon: Wallet,
        keywords: 'keuangan payout saldo withdraw omzet mutasi',
        onSelect: () => onSelectTab('finance'),
      },
      {
        id: 'cmd-inbox',
        label: 'Smart Chatbox (Inbox CS)',
        section: 'Pelanggan & Channel',
        icon: MessageSquare,
        keywords: 'inbox chat cs pesan whatsapp',
        onSelect: () => onSelectTab('inbox'),
      },
      {
        id: 'cmd-customers',
        label: 'Pelanggan (CRM)',
        section: 'Pelanggan & Channel',
        icon: Users,
        keywords: 'pelanggan crm kontak pembeli',
        onSelect: () => onSelectTab('customers'),
      },
      {
        id: 'cmd-whatsapp',
        label: 'WhatsApp Connect & Broadcast',
        section: 'Pelanggan & Channel',
        icon: Radio,
        keywords: 'whatsapp waba broadcast autoreply rotator',
        onSelect: () => onSelectTab('whatsapp'),
      },
      {
        id: 'cmd-ads',
        label: 'Ads Tracking (Meta Pixel & CAPI)',
        section: 'Marketing',
        icon: Target,
        keywords: 'ads pixel capi tracking tiktok meta',
        onSelect: () => onSelectTab('ads_tracking'),
      },
      {
        id: 'cmd-themes',
        label: 'Tampilan & Tema Toko',
        section: 'Kustomisasi',
        icon: Palette,
        keywords: 'tema theme storefront desain tampilan domain',
        onSelect: () => onSelectTab('themes'),
      },
      {
        id: 'cmd-studio',
        label: 'Buka BoonTrack Studio (Naskah, Video, Carousel)',
        section: 'Studio',
        icon: Sparkles,
        keywords: 'studio ugc video naskah carousel konten',
        onSelect: () => {
          const isLocal =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1' ||
              window.location.hostname.endsWith('.localhost'));
          window.open(isLocal ? '/studio/desk' : 'https://studio.boontrack.com/desk', '_blank', 'noopener,noreferrer');
        },
      },
      {
        id: 'cmd-settings',
        label: 'Pengaturan Toko',
        section: 'Pengaturan',
        icon: Settings,
        keywords: 'pengaturan settings profil qris bank domain',
        onSelect: () => onSelectTab('settings'),
      },
      {
        id: 'cmd-storefront',
        label: 'Lihat Storefront Publik',
        section: 'Aksi Cepat',
        icon: Store,
        keywords: 'toko storefront etalase publik url',
        onSelect: () => window.open(storefrontUrl, '_blank', 'noopener,noreferrer'),
      },
      {
        id: 'cmd-ai',
        label: 'Buka AI Assistant (BoonPilot)',
        section: 'Aksi Cepat',
        icon: Sparkles,
        keywords: 'ai assistant boonpilot copilot tanya',
        onSelect: handleTriggerAiAssistant,
      },
    ];

    if (onOpenNewProduct) {
      items.splice(2, 0, {
        id: 'cmd-new-product',
        label: '+ Tambah Produk Baru',
        section: 'Aksi Cepat',
        icon: Package,
        keywords: 'tambah buat produk baru',
        onSelect: onOpenNewProduct,
      });
    }

    return items;
  }, [
    onSelectTab,
    productCount,
    orderCount,
    storefrontUrl,
    handleTriggerAiAssistant,
    onOpenNewProduct,
  ]);

  const filteredCommands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return commandItems;
    return commandItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        (item.keywords && item.keywords.toLowerCase().includes(q))
    );
  }, [commandItems, searchQuery]);

  const executeCommand = (item: CommandPaletteItem) => {
    setIsPaletteOpen(false);
    item.onSelect();
  };

  const handlePaletteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredCommands.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredCommands[selectedIdx];
      if (target) {
        setIsPaletteOpen(false);
        target.onSelect();
      }
    }
  };

  return (
    <>
      <header className="h-14 sticky top-0 z-30 bg-white/95 dark:bg-[#090D16]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Mobile Drawer Trigger + Section Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            aria-label="Buka Menu Navigasi"
            className="lg:hidden p-2 -ml-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeSectionTitle}
            </span>
            <Link
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Buka Halaman Storefront Toko"
              className="hidden xl:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
            >
              <Store className="w-3 h-3" />
              <span>Etalase</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70" />
            </Link>
          </div>

          {saveFeedback && (
            <span className="hidden md:inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 truncate max-w-[220px]">
              {saveFeedback}
            </span>
          )}
        </div>

        {/* Center: Minimalist Command Search Bar ("Press /") */}
        <div className="flex-1 flex justify-center max-w-md min-w-0">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Buka Pencarian & Command Palette (Tekan /)"
            className="w-full h-9 px-3 rounded-lg bg-slate-100/80 hover:bg-slate-100 dark:bg-slate-900/90 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline truncate">Cari menu, pesanan, produk...</span>
              <span className="sm:hidden truncate">Cari...</span>
            </span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
              Press /
            </kbd>
          </button>
        </div>

        {/* Right: Store Operational Toggle, Notification, AI Assistant, Theme Toggle, User Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. Toggle Status Operasional Toko */}
          <button
            type="button"
            onClick={toggleStoreStatus}
            title="Ubah Status Operasional Toko (Buka / Istirahat)"
            aria-pressed={storeStatus === 'open'}
            className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              storeStatus === 'open'
                ? 'bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
                : 'bg-amber-50/90 hover:bg-amber-100/80 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                storeStatus === 'open' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="hidden sm:inline">
              {storeStatus === 'open' ? 'Toko Buka' : 'Istirahat'}
            </span>
          </button>

          {/* 2. Realtime Notification Bell Slot */}
          {notificationSlot && <div className="shrink-0">{notificationSlot}</div>}

          {/* 3. AI Assistant Drawer Trigger */}
          <button
            type="button"
            onClick={handleTriggerAiAssistant}
            title="Buka AI Assistant (BoonPilot)"
            aria-label="Buka AI Assistant"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* 4. Dark / Light Mode Toggle Icon */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={themeMode === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            aria-label="Toggle Theme"
            className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${themeToggleClassName}`}
          >
            {themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* 5. Compact User Avatar Dropdown */}
          <div className="relative" ref={avatarRef}>
            <button
              type="button"
              onClick={() => setIsAvatarOpen((prev) => !prev)}
              aria-expanded={isAvatarOpen}
              aria-label={`Menu akun ${brandName}`}
              className="h-8 pl-1 pr-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {storeLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={storeLogoUrl}
                  alt={brandName}
                  className="w-6 h-6 rounded-md object-cover shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-bold flex items-center justify-center uppercase shrink-0">
                  {brandInitial}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 hidden sm:block" />
            </button>

            {isAvatarOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-white dark:bg-[#0D121F] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/50 p-1.5 space-y-0.5 z-50"
              >
                <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {brandName}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      /{tenantSlug}
                    </span>
                    {tierLabel && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {tierLabel}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsAvatarOpen(false);
                    onOpenStoreSettings();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Profil &amp; Pengaturan Toko</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAvatarOpen(false);
                    onOpenUpgradeModal();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors text-left cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Billing &amp; Langganan</span>
                </button>

                <Link
                  href={storefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsAvatarOpen(false)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-slate-400" />
                    <span>Buka Storefront</span>
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </Link>

                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsAvatarOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar (Logout)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Native <dialog> Command Palette */}
      <dialog
        ref={dialogRef}
        aria-label="Command Palette Dashboard"
        onClose={() => setIsPaletteOpen(false)}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          pressedOutsideRef.current =
            e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        }}
        onPointerUp={(e) => {
          if (!pressedOutsideRef.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const stillOutside =
            e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
          if (stillOutside) setIsPaletteOpen(false);
          pressedOutsideRef.current = false;
        }}
        className="m-auto mt-20 w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D121F] text-slate-900 dark:text-slate-100 shadow-2xl p-0 backdrop:bg-slate-900/50 backdrop:backdrop-blur-xs overscroll-contain"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handlePaletteKeyDown}
            placeholder="Ketik nama menu, fitur, atau aksi cepat..."
            aria-label="Cari perintah dashboard"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={closeCommandPalette}
            aria-label="Tutup pencarian"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Tidak ada menu atau perintah yang cocok dengan &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const CmdIcon = cmd.icon;
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => executeCommand(cmd)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <CmdIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium truncate">{cmd.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-slate-400">{cmd.section}</span>
                    {isSelected && <CornerDownLeft className="w-3 h-3 text-slate-400" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Gunakan ↑ ↓ untuk memilih, Enter untuk membuka</span>
          <span className="font-mono">ESC tutup</span>
        </div>
      </dialog>
    </>
  );
}
