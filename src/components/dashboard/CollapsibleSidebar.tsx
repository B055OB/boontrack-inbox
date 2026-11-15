'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Sparkles,
  Wallet,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Store,
  ExternalLink,
  User,
  Crown,
  Globe,
  LogOut,
  Lock,
  Radio,
  Users,
  Target,
  Send,
  Palette,
  Truck,
  Bike,
  Calendar,
  CalendarCheck,
  FolderKey,
  Share2,
  BookOpen,
} from 'lucide-react';
import { getStorefrontUrl } from '@/lib/utils/storefrontUrl';
import { resolveDomainVertical } from '@/app/[tenant]/dashboard/components/modules';
import PwaInstallPrompt from '@/app/[tenant]/dashboard/components/PwaInstallPrompt';

export interface SidebarSubItem {
  id: string;
  label: string;
  description?: string;
  targetTab?: string;
  href?: string;
  external?: boolean;
  action?: () => void;
  icon?: React.ElementType;
  badgeText?: string | number | null;
  badgeVariant?: 'neutral' | 'info' | 'success' | 'warning' | 'purple' | 'locked';
  isLocked?: boolean;
}

export interface SidebarNavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  targetTab?: string;
  matchedTabs: string[];
  badgeText?: string | number | null;
  isLocked?: boolean;
  disableFlyout?: boolean;
  subItems?: SidebarSubItem[];
}

export interface CollapsibleSidebarProps {
  tenant?: {
    tier?: string;
    custom_domain?: string | null;
    metadata?: { custom_domain?: string | null; [key: string]: unknown };
  } | null;
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeLogoUrl?: string | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isAdsTrackingUnlocked?: boolean;
  isSoloOrTrial?: boolean;
  isCheckoutLite?: boolean;
  isGrant?: boolean;
  grantDaysLeft?: number | null;
  tierLabel?: string;
  productCount?: number;
  orderCount?: number;
  inboxCount?: number;
  storeCategory?: string;
  businessType?: string;
  capabilities?: {
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    field_service?: boolean;
    [key: string]: unknown;
  } | null;
  isCrmEnabled?: boolean;
  isAiBotAllowed?: boolean;
  isResellerUnlocked?: boolean;
  customDomain?: string | null;
  isLiveMode?: boolean;
  forceExpanded?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
  onLogout: () => Promise<void> | void;
  onCloseMobileDrawer?: () => void;
  className?: string;
}

export default function CollapsibleSidebar({
  tenant,
  tenantSlug,
  displayName,
  storeDisplayName,
  storeLogoUrl,
  activeTab,
  onSelectTab,
  isTeamScale = false,
  isAdsPerformance = false,
  isAdsTrackingUnlocked = false,
  isSoloOrTrial = false,
  isCheckoutLite = false,
  isGrant = false,
  grantDaysLeft = null,
  tierLabel,
  productCount = 0,
  orderCount = 0,
  inboxCount = 0,
  storeCategory,
  businessType,
  capabilities,
  isCrmEnabled = false,
  isAiBotAllowed = false,
  isResellerUnlocked = false,
  customDomain,
  forceExpanded = false,
  isExpanded: isExpandedProp,
  onToggleExpand: onToggleExpandProp,
  onOpenStoreSettings,
  onOpenUpgradeModal,
  onLogout,
  onCloseMobileDrawer,
  className = '',
}: CollapsibleSidebarProps) {
  // Default is 64px slim icon bar (isExpanded = false) per Dodo Payments pattern
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<boolean>(forceExpanded);
  const isExpanded = forceExpanded
    ? true
    : isExpandedProp !== undefined
    ? isExpandedProp
    : uncontrolledExpanded;

  const [isTenantPopoverOpen, setIsTenantPopoverOpen] = useState(false);
  const [manualAccordionId, setManualAccordionId] = useState<string | null | undefined>(undefined);

  // Floating flyout state for slim (w-16) hover/focus interaction
  const [hoveredFlyout, setHoveredFlyout] = useState<{
    groupId: string;
    top: number;
    left: number;
  } | null>(null);

  const flyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantPopoverRef = useRef<HTMLDivElement | null>(null);
  const navContainerRef = useRef<HTMLElement | null>(null);

  const toggleExpand = useCallback(() => {
    if (forceExpanded) return;
    setHoveredFlyout(null);
    if (onToggleExpandProp) {
      onToggleExpandProp();
      return;
    }
    setUncontrolledExpanded((prev) => !prev);
  }, [forceExpanded, onToggleExpandProp]);

  // Close tenant switcher popover on outside click or Escape
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (tenantPopoverRef.current && !tenantPopoverRef.current.contains(e.target as Node)) {
        setIsTenantPopoverOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsTenantPopoverOpen(false);
        setHoveredFlyout(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    };
  }, []);

  const effectiveCustomDomain =
    customDomain || tenant?.custom_domain || tenant?.metadata?.custom_domain || null;
  const storefrontUrl = getStorefrontUrl(tenantSlug, effectiveCustomDomain);
  const brandName = storeDisplayName || displayName || tenantSlug || 'Store';
  const brandInitial = brandName.charAt(0).toUpperCase();

  const categoryOrType = storeCategory || businessType;
  const normCategory = (categoryOrType || '').toUpperCase().trim();
  const isFood = ['FOOD', 'FNB', 'KULINER', 'MAKANAN', 'RESTO'].some((k) => normCategory.includes(k));
  const isDigital =
    ['DIGITAL_PRODUCT', 'DIGITAL_FILE', 'DIGITAL', 'COURSE', 'SOFTWARE', 'EBOOK', 'DOWNLOAD', 'DAKWAH', 'KAJIAN', 'MAJELIS'].some((k) =>
      normCategory.includes(k)
    ) || capabilities?.digital_fulfillment === true;
  const isProService =
    !isDigital &&
    ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'KLINIK', 'DOKTER', 'TRAVEL', 'UMROH'].some((k) =>
      normCategory.includes(k)
    );
  const isFieldService =
    !isDigital &&
    !isProService &&
    capabilities?.field_service !== false &&
    ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'TOREN', 'REPAIR', 'CLEANING', 'TEKNISI'].some((k) =>
      normCategory.includes(k)
    );
  const isBookingActive =
    capabilities?.booking !== false && !isDigital && (isProService || isFieldService || capabilities?.booking === true);
  const isAgency =
    ['CREATOR_AGENCY', 'AGENCY', 'CREATOR', 'CAMPAIGN', 'TALENT', 'AFFILIATE'].some((k) => normCategory.includes(k)) ||
    resolveDomainVertical(categoryOrType) === 'creator-agency';
  const isPhysical =
    (!isDigital && !isProService && !isFieldService && !isAgency) ||
    normCategory === 'PHYSICAL' ||
    normCategory === 'RETAIL' ||
    isFood;
  const showShipping = (isPhysical || isFood || capabilities?.shipping === true) && capabilities?.shipping !== false && !isDigital;

  const navGroups: SidebarNavGroup[] = useMemo(() => {
    const catalogSubItems: SidebarSubItem[] = [
      {
        id: 'catalog-all',
        label: 'Semua Produk',
        description: 'Daftar produk & aset aktif',
        targetTab: 'catalog',
        icon: Package,
        badgeText: productCount > 0 ? productCount : null,
      },
      {
        id: 'catalog-categories',
        label: 'Kategori',
        description: 'Kelompokkan etalase produk',
        targetTab: 'catalog',
        icon: Store,
      },
      {
        id: 'catalog-variants',
        label: 'Varian',
        description: 'Opsi ukuran, paket & stok',
        targetTab: 'catalog',
        icon: Palette,
      },
    ];

    if (showShipping) {
      catalogSubItems.push({
        id: 'catalog-shipping',
        label: 'Pengiriman & Kurir',
        description: 'Area kirim & ekspedisi',
        targetTab: 'shipping',
        icon: isFood ? Bike : Truck,
      });
    }
    if (isBookingActive) {
      catalogSubItems.push({
        id: 'catalog-booking',
        label: 'Jadwal & Booking',
        description: 'Kalender & slot layanan',
        targetTab: 'booking',
        icon: isProService ? Calendar : CalendarCheck,
      });
    }
    if (isDigital) {
      catalogSubItems.push({
        id: 'catalog-downloads',
        label: 'Akses Unduh & Lisensi',
        description: 'Pengiriman produk digital',
        targetTab: 'downloads',
        icon: FolderKey,
      });
    }

    const salesSubItems: SidebarSubItem[] = [
      {
        id: 'sales-orders',
        label: 'Pesanan',
        description: 'Antrean order & konfirmasi',
        targetTab: 'orders',
        icon: ShoppingBag,
        badgeText: orderCount > 0 ? orderCount : null,
        badgeVariant: 'success',
      },
      {
        id: 'sales-invoices',
        label: 'Invoices',
        description: 'Tagihan QRIS & bukti bayar',
        targetTab: 'orders',
        icon: ExternalLink,
      },
      {
        id: 'sales-reseller',
        label: 'Program Reseller',
        description: 'Komisi & mitra penjualan',
        targetTab: 'reseller',
        icon: Users,
        isLocked: !isResellerUnlocked && !isTeamScale,
        badgeText: !isResellerUnlocked && !isTeamScale ? 'SCALE' : undefined,
      },
    ];

    const channelsSubItems: SidebarSubItem[] = [
      {
        id: 'channels-inbox',
        label: 'Smart Chatbox',
        description: 'Inbox CS omnichannel',
        targetTab: 'inbox',
        icon: MessageSquare,
        badgeText: inboxCount > 0 ? inboxCount : undefined,
        isLocked: isCheckoutLite || (!isTeamScale && !isAdsPerformance),
      },
      {
        id: 'channels-customers',
        label: 'Pelanggan (CRM)',
        description: 'Database & riwayat pembeli',
        targetTab: 'customers',
        icon: Users,
        isLocked: !isCrmEnabled,
        badgeText: isCrmEnabled ? 'CRM' : 'SCALE',
      },
      {
        id: 'channels-whatsapp',
        label: 'WhatsApp Connect',
        description: 'Sesi bot & auto-reply',
        targetTab: 'whatsapp',
        icon: Radio,
        isLocked: !isTeamScale,
      },
      {
        id: 'channels-broadcast',
        label: 'Broadcast WA',
        description: 'Siaran promo massal',
        targetTab: 'broadcast',
        icon: Radio,
        isLocked: !isTeamScale,
      },
      {
        id: 'channels-ai-bot',
        label: 'AI Knowledge & Bot',
        description: 'Latih asisten toko 24/7',
        targetTab: 'ai_knowledge',
        icon: Sparkles,
        isLocked: !isAiBotAllowed,
        badgeText: isAiBotAllowed ? 'AI' : 'PRO',
      },
      {
        id: 'channels-telegram',
        label: 'Telegram Connect',
        description: 'Alert notifikasi order',
        targetTab: 'telegram_alerts',
        icon: Send,
      },
      {
        id: 'channels-ads',
        label: 'Ads Tracking (CAPI)',
        description: 'Meta Pixel & TikTok CAPI',
        targetTab: 'ads_tracking',
        icon: Target,
        isLocked: !isAdsTrackingUnlocked && !isCheckoutLite,
      },
    ];

    if (isAgency) {
      channelsSubItems.push({
        id: 'channels-campaigns',
        label: 'Kampanye & UGC',
        description: 'Brief & manajemen kreator',
        targetTab: 'campaigns',
        icon: Share2,
      });
    }

    const settingsSubItems: SidebarSubItem[] = [
      {
        id: 'settings-general',
        label: 'Pengaturan Toko',
        description: 'Profil, pembayaran & domain',
        targetTab: 'settings',
        icon: Settings,
      },
      {
        id: 'settings-themes',
        label: 'Tampilan & Tema Toko',
        description: 'Kustomisasi storefront',
        targetTab: 'themes',
        icon: Palette,
      },
      {
        id: 'settings-modal',
        label: 'Edit Cepat Profil',
        description: 'Buka dialog pengaturan',
        action: onOpenStoreSettings,
        icon: User,
      },
      {
        id: 'settings-docs',
        label: 'Dokumentasi & Panduan',
        description: 'Panduan integrasi API & WA',
        targetTab: 'docs',
        icon: BookOpen,
      },
    ];

    return [
      {
        id: 'home',
        label: 'Home',
        icon: LayoutDashboard,
        targetTab: 'dashboard',
        matchedTabs: ['dashboard', 'overview', 'beranda', 'microsite', 'links'],
        disableFlyout: true,
      },
      {
        id: 'catalog',
        label: 'Katalog / Products',
        icon: Package,
        targetTab: 'catalog',
        matchedTabs: ['catalog', 'products', 'shipping', 'biteship', 'booking', 'downloads'],
        badgeText: productCount > 0 ? productCount : null,
        subItems: catalogSubItems,
      },
      {
        id: 'sales',
        label: 'Transaksi / Sales',
        icon: ShoppingBag,
        targetTab: 'orders',
        matchedTabs: ['orders', 'pesanan', 'reseller', 'affiliate'],
        badgeText: orderCount > 0 ? orderCount : null,
        subItems: salesSubItems,
      },
      {
        id: 'payouts',
        label: 'Payouts / Keuangan',
        icon: Wallet,
        targetTab: 'finance',
        matchedTabs: ['finance', 'overview_finance', 'integration', 'analytics'],
        isLocked: isSoloOrTrial || isCheckoutLite,
      },
      {
        id: 'channels',
        label: 'Inbox & Channels',
        icon: MessageSquare,
        targetTab: 'inbox',
        matchedTabs: ['inbox', 'customers', 'crm', 'whatsapp', 'auto_reply', 'rotator', 'broadcast', 'telegram_alerts', 'ads_tracking', 'ai_knowledge', 'campaigns'],
        badgeText: inboxCount > 0 ? inboxCount : null,
        subItems: channelsSubItems,
      },
      {
        id: 'settings',
        label: 'Pengaturan',
        icon: Settings,
        targetTab: 'settings',
        matchedTabs: ['settings', 'themes', 'storefront', 'docs', 'documentation'],
        subItems: settingsSubItems,
      },
    ];
  }, [
    productCount,
    orderCount,
    inboxCount,
    showShipping,
    isFood,
    isBookingActive,
    isProService,
    isDigital,
    isAgency,
    isResellerUnlocked,
    isTeamScale,
    isAiBotAllowed,
    isAdsPerformance,
    isCheckoutLite,
    isCrmEnabled,
    isAdsTrackingUnlocked,
    isSoloOrTrial,
    onOpenStoreSettings,
  ]);

  const activeGroupId = useMemo(() => {
    const match = navGroups.find((g) =>
      g.matchedTabs.some((t) => t.toLowerCase() === activeTab.toLowerCase())
    );
    return match?.subItems ? match.id : null;
  }, [activeTab, navGroups]);

  const effectiveAccordionId =
    manualAccordionId !== undefined ? manualAccordionId : activeGroupId;

  const handleNavigateTab = useCallback(
    (tab: string) => {
      setManualAccordionId(undefined);
      onSelectTab(tab);
      setHoveredFlyout(null);
      if (onCloseMobileDrawer) {
        onCloseMobileDrawer();
      }
    },
    [onSelectTab, onCloseMobileDrawer]
  );

  const openFlyoutForElement = useCallback(
    (groupId: string, targetEl: HTMLElement) => {
      if (isExpanded) return;
      if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
      const rect = targetEl.getBoundingClientRect();
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const estimatedMenuHeight = 260;
      const clampedTop = Math.max(12, Math.min(rect.top, viewportH - estimatedMenuHeight - 16));
      setHoveredFlyout({
        groupId,
        top: clampedTop,
        left: rect.right + 10,
      });
    },
    [isExpanded]
  );

  const scheduleCloseFlyout = useCallback(() => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    flyoutTimerRef.current = setTimeout(() => {
      setHoveredFlyout(null);
    }, 140);
  }, []);

  const cancelCloseFlyout = useCallback(() => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
  }, []);

  const hoveredGroup = useMemo(
    () => navGroups.find((g) => g.id === hoveredFlyout?.groupId) || null,
    [navGroups, hoveredFlyout]
  );

  return (
    <aside
      ref={navContainerRef}
      aria-label="Dashboard Sidebar"
      className={`${
        isExpanded ? 'w-56' : 'w-16'
      } h-screen sticky top-0 shrink-0 flex flex-col justify-between bg-white dark:bg-[#090D16] border-r border-slate-200 dark:border-slate-800 select-none z-40 transition-[width] duration-200 ease-out ${className}`}
    >
      {/* 1. HEADER: Tenant Brand Switcher & Popover */}
      <div
        ref={tenantPopoverRef}
        className={`relative border-b border-slate-200 dark:border-slate-800 ${
          isExpanded ? 'p-2.5' : 'p-2 flex justify-center'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsTenantPopoverOpen((prev) => !prev)}
          aria-expanded={isTenantPopoverOpen}
          aria-label={`Menu toko ${brandName}`}
          title={brandName}
          className={`flex items-center rounded-xl border transition-colors cursor-pointer ${
            isExpanded
              ? 'w-full justify-between px-2.5 py-2 gap-2'
              : 'w-10 h-10 justify-center p-0'
          } ${
            isTenantPopoverOpen
              ? 'bg-slate-100 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700'
              : 'bg-slate-50/80 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={brandName}
                className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                {brandInitial}
              </div>
            )}

            {isExpanded && (
              <div className="min-w-0 text-left">
                <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {brandName}
                </span>
                <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {tierLabel || (isTeamScale ? 'Team Scale' : isAdsPerformance ? 'Ads Performance' : 'Starter')}
                </span>
              </div>
            )}
          </div>

          {isExpanded && (
            <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          )}
        </button>

        {/* Tenant Switcher Popover */}
        {isTenantPopoverOpen && (
          <div
            role="menu"
            className={`absolute z-50 w-60 rounded-xl bg-white dark:bg-[#0D121F] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/50 p-1.5 space-y-0.5 ${
              isExpanded ? 'top-full left-2.5 mt-1.5' : 'top-2 left-full ml-2.5'
            }`}
          >
            <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {brandName}
                </p>
                {isGrant && grantDaysLeft !== null && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    {grantDaysLeft > 0 ? `${grantDaysLeft}h` : 'Aktif'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {storefrontUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}
              </p>
            </div>

            <Link
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsTenantPopoverOpen(false)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Lihat Tampilan Toko</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsTenantPopoverOpen(false);
                onOpenStoreSettings();
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Akun &amp; Profil Toko</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsTenantPopoverOpen(false);
                onOpenUpgradeModal();
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Crown className="w-3.5 h-3.5" />
                <span>Billing &amp; Langganan</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                Plan
              </span>
            </button>

            {!isCheckoutLite && (
              <button
                type="button"
                onClick={() => {
                  setIsTenantPopoverOpen(false);
                  handleNavigateTab('themes');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Pengaturan Domain</span>
              </button>
            )}

            <PwaInstallPrompt
              tenantSlug={tenantSlug}
              variant="menu-item"
              onActionComplete={() => {
                setIsTenantPopoverOpen(false);
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
            />

            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

            <button
              type="button"
              onClick={() => {
                setIsTenantPopoverOpen(false);
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

      {/* 2. NAVIGATION ITEMS (6 Core Groups) */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 no-scrollbar">
        {navGroups.map((group) => {
          const GroupIcon = group.icon;
          const hasSubItems = Boolean(group.subItems && group.subItems.length > 0);
          const hasFlyout = !group.disableFlyout;
          const isActive = group.matchedTabs.some(
            (t) => t.toLowerCase() === activeTab.toLowerCase()
          );
          const isAccordionOpen = isExpanded && effectiveAccordionId === group.id;

          if (!isExpanded) {
            return (
              <div
                key={group.id}
                className="relative flex justify-center"
                onMouseEnter={(e) => {
                  if (hasFlyout) {
                    openFlyoutForElement(group.id, e.currentTarget);
                  } else {
                    cancelCloseFlyout();
                    setHoveredFlyout(null);
                  }
                }}
                onMouseLeave={hasFlyout ? scheduleCloseFlyout : undefined}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    if (group.targetTab && !hasSubItems) {
                      handleNavigateTab(group.targetTab);
                    } else if (hasSubItems) {
                      // Click toggles flyout on touch or selects primary tab on second click
                      if (hoveredFlyout?.groupId === group.id && group.targetTab) {
                        handleNavigateTab(group.targetTab);
                      } else {
                        openFlyoutForElement(group.id, e.currentTarget);
                      }
                    }
                  }}
                  onFocus={(e) => {
                    if (hasFlyout) {
                      openFlyoutForElement(group.id, e.currentTarget);
                    } else {
                      cancelCloseFlyout();
                      setHoveredFlyout(null);
                    }
                  }}
                  title={!hasFlyout ? group.label : undefined}
                  aria-label={group.label}
                  aria-expanded={hasFlyout ? hoveredFlyout?.groupId === group.id : undefined}
                  className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <GroupIcon className="w-[18px] h-[18px]" />
                  {group.badgeText ? (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#090D16]" />
                  ) : null}
                </button>
              </div>
            );
          }

          return (
            <div key={group.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  if (hasSubItems) {
                    setManualAccordionId(effectiveAccordionId === group.id ? null : group.id);
                    if (group.targetTab && !isActive) {
                      onSelectTab(group.targetTab);
                    }
                  } else if (group.targetTab) {
                    handleNavigateTab(group.targetTab);
                  }
                }}
                aria-expanded={hasSubItems ? isAccordionOpen : undefined}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 font-semibold dark:bg-slate-800/90 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <GroupIcon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span className="truncate">{group.label}</span>
                </span>

                <span className="flex items-center gap-1.5 shrink-0">
                  {group.isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                  {group.badgeText && !hasSubItems && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {group.badgeText}
                    </span>
                  )}
                  {hasSubItems && (
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                        isAccordionOpen ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </span>
              </button>

              {hasSubItems && isAccordionOpen && (
                <div className="pl-7 pr-1 py-0.5 space-y-0.5">
                  {group.subItems!.map((sub) => {
                    const isSubActive = Boolean(
                      sub.targetTab && sub.targetTab.toLowerCase() === activeTab.toLowerCase()
                    );
                    if (sub.href) {
                      return (
                        <a
                          key={sub.id}
                          href={sub.href}
                          target={sub.external ? '_blank' : undefined}
                          rel={sub.external ? 'noopener noreferrer' : undefined}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <span className="truncate">{sub.label}</span>
                          <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                        </a>
                      );
                    }
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          if (sub.action) {
                            sub.action();
                            if (onCloseMobileDrawer) onCloseMobileDrawer();
                          } else if (sub.targetTab) {
                            handleNavigateTab(sub.targetTab);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors cursor-pointer ${
                          isSubActive
                            ? 'text-slate-900 dark:text-white font-semibold bg-slate-100/90 dark:bg-slate-800/70'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <span className="truncate">{sub.label}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {sub.isLocked && <Lock className="w-2.5 h-2.5 text-slate-400" />}
                          {sub.badgeText !== undefined && sub.badgeText !== null && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {sub.badgeText}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FLOATING FLYOUT POPOVER WHEN SLIM (w-16) */}
      {!isExpanded && hoveredFlyout && hoveredGroup && !hoveredGroup.disableFlyout && (
        <div
          onMouseEnter={cancelCloseFlyout}
          onMouseLeave={scheduleCloseFlyout}
          style={{ top: hoveredFlyout.top, left: hoveredFlyout.left }}
          className="fixed z-50 w-56 rounded-xl bg-white dark:bg-[#0D121F] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {hoveredGroup.label}
            </span>
            {hoveredGroup.isLocked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <Lock className="w-2.5 h-2.5" /> PRO
              </span>
            )}
          </div>

          {hoveredGroup.subItems && hoveredGroup.subItems.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {hoveredGroup.subItems.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive = Boolean(
                  sub.targetTab && sub.targetTab.toLowerCase() === activeTab.toLowerCase()
                );

                if (sub.href) {
                  return (
                    <a
                      key={sub.id}
                      href={sub.href}
                      target={sub.external ? '_blank' : undefined}
                      rel={sub.external ? 'noopener noreferrer' : undefined}
                      onClick={() => setHoveredFlyout(null)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {SubIcon && <SubIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className="truncate font-medium">{sub.label}</span>
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </a>
                  );
                }

                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      if (sub.action) {
                        setHoveredFlyout(null);
                        sub.action();
                      } else if (sub.targetTab) {
                        handleNavigateTab(sub.targetTab);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                      isSubActive
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {SubIcon && (
                        <SubIcon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSubActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'
                          }`}
                        />
                      )}
                      <span className="truncate">{sub.label}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 ml-2">
                      {sub.isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                      {sub.badgeText !== undefined && sub.badgeText !== null && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {sub.badgeText}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => hoveredGroup.targetTab && handleNavigateTab(hoveredGroup.targetTab)}
              className="mt-1 w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left"
            >
              <span>Buka {hoveredGroup.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      )}

      {/* 3. FOOTER: Expand/Collapse Toggle */}
      {!forceExpanded && (
        <div
          className={`border-t border-slate-200 dark:border-slate-800 p-2.5 flex ${
            isExpanded ? '' : 'justify-center'
          }`}
        >
          <button
            type="button"
            onClick={toggleExpand}
            title={isExpanded ? 'Ciutkan Sidebar (64px)' : 'Perlebar Sidebar'}
            aria-label={isExpanded ? 'Ciutkan Sidebar' : 'Perlebar Sidebar'}
            className={`flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer ${
              isExpanded ? 'w-full h-9 gap-2 px-3 text-xs font-medium' : 'w-10 h-9'
            }`}
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span>Ciutkan Sidebar</span>
              </>
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
