'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Store,
  ExternalLink,
  Link as LinkIcon,
  Package,
  Brain,
  Radio,
  MessageSquare,
  Target,
  CreditCard,
  Lock,
  ShoppingBag,
  ChevronsUpDown,
  User,
  Crown,
  Globe,
  LogOut,
  Palette,
  Sparkles,
  LayoutDashboard,
  Wrench,
  FileText,
  Calendar,
  Video,
  UtensilsCrossed,
  Truck,
  Bike,
  CalendarCheck,
  FolderKey,
  Share2,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { resolveDomainVertical, DomainVerticalKey } from '@/app/[tenant]/dashboard/components/modules';
import PwaInstallPrompt from '../PwaInstallPrompt';

function getVerticalMenuConfig(storeCategory?: string) {
  const norm = (storeCategory || '').toUpperCase().trim();
  const isProService = ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'TRAVEL', 'UMROH'].some((k) => norm.includes(k));
  const isFieldService = !isProService && ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'REPAIR', 'TEKNISI'].some((k) => norm.includes(k));

  if (isProService) {
    return {
      label: 'Katalog Jasa & Konsultasi',
      badge: 'Jasa',
      icon: Calendar,
    };
  }

  if (isFieldService) {
    return {
      label: 'Layanan & Servis Lapangan',
      badge: 'Jasa',
      icon: Wrench,
    };
  }

  const verticalKey = resolveDomainVertical(storeCategory);
  switch (verticalKey) {
    case 'field-service':
      return {
        label: 'Layanan & Servis Lapangan',
        badge: 'Jasa',
        icon: Wrench,
      };
    case 'digital-product':
      return {
        label: 'Produk & Materi Digital',
        badge: 'Digital',
        icon: FileText,
      };
    case 'pro-service':
      return {
        label: 'Katalog Jasa & Konsultasi',
        badge: 'Jasa',
        icon: Calendar,
      };
    case 'creator-agency':
      return {
        label: 'Paket & Jasa Kreator',
        badge: 'Agency',
        icon: Video,
      };
    case 'fnb-culinary':
      return {
        label: 'Menu Kuliner & FnB',
        badge: 'FnB',
        icon: UtensilsCrossed,
      };
    case 'physical-retail':
    default:
      return {
        label: 'Katalog & Produk',
        badge: 'Fisik',
        icon: Package,
      };
  }
}

function getVerticalOperationalMenuConfig(
  storeCategory?: string,
  capabilities?: { shipping?: boolean; booking?: boolean; digital_fulfillment?: boolean; [key: string]: any } | null
) {
  const norm = (storeCategory || '').toUpperCase().trim();
  const isDigital = ['DIGITAL', 'COURSE', 'SOFTWARE', 'EBOOK'].some((k) => norm.includes(k)) || capabilities?.digital_fulfillment === true;
  const isProService = ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'TRAVEL', 'UMROH'].some((k) => norm.includes(k));
  const isFieldService = !isProService && (['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'REPAIR', 'TEKNISI', 'BOOKING'].some((k) => norm.includes(k)) || capabilities?.booking === true);
  const isFood = ['FOOD', 'FNB', 'KULINER'].some((k) => norm.includes(k));

  if (isDigital) {
    return {
      label: 'Akses Unduh & Lisensi',
      targetTab: 'downloads',
      badge: 'AKSES',
      icon: FolderKey,
      colorClass: 'bg-indigo-50 text-indigo-600',
      hideShipping: true,
    };
  }

  if (isProService) {
    return {
      label: 'Jadwal & Sesi Konsultasi',
      targetTab: 'booking',
      badge: 'SESI',
      icon: Calendar,
      colorClass: 'bg-blue-50 text-blue-600',
      hideShipping: true,
    };
  }

  if (isFieldService) {
    return {
      label: 'Jadwal & Booking Servis',
      targetTab: 'booking',
      badge: 'SLOT',
      icon: CalendarCheck,
      colorClass: 'bg-emerald-50 text-emerald-600',
      hideShipping: true,
    };
  }

  if (isFood) {
    return {
      label: 'Kurir Instan & Dapur',
      targetTab: 'shipping',
      badge: 'INSTAN',
      icon: Bike,
      colorClass: 'bg-amber-50 text-amber-600',
      hideShipping: false,
    };
  }

  const verticalKey = resolveDomainVertical(storeCategory);
  if (verticalKey === 'field-service' || capabilities?.booking === true) {
    return {
      label: 'Jadwal & Booking Servis',
      targetTab: 'booking',
      badge: 'SLOT',
      icon: CalendarCheck,
      colorClass: 'bg-emerald-50 text-emerald-600',
      hideShipping: true,
    };
  }

  if (verticalKey === 'digital-product' || capabilities?.digital_fulfillment === true) {
    return {
      label: 'Akses Unduh & Lisensi',
      targetTab: 'downloads',
      badge: 'AKSES',
      icon: FolderKey,
      colorClass: 'bg-indigo-50 text-indigo-600',
      hideShipping: true,
    };
  }

  if (verticalKey === 'creator-agency') {
    return {
      label: 'Manajemen Kampanye & UGC',
      targetTab: 'campaigns',
      badge: 'UGC',
      icon: Share2,
      colorClass: 'bg-pink-50 text-pink-600',
      hideShipping: true,
    };
  }

  // Guard ketat untuk PHYSICAL: HARUS business_type === 'PHYSICAL' && capabilities?.shipping !== false
  const isPhysicalShippingAllowed =
    (norm === 'PHYSICAL' || norm === 'RETAIL' || !norm) &&
    capabilities?.shipping !== false;

  if (isPhysicalShippingAllowed) {
    return {
      label: 'Logistik & Ekspedisi',
      targetTab: 'shipping',
      badge: 'KURIR',
      icon: Truck,
      colorClass: 'bg-teal-50 text-teal-600',
      hideShipping: false,
    };
  }

  // Fallback jika capabilities.shipping false: ganti dengan modul Booking atau Downloads
  if (capabilities?.booking) {
    return {
      label: 'Jadwal & Booking Servis',
      targetTab: 'booking',
      badge: 'SLOT',
      icon: CalendarCheck,
      colorClass: 'bg-emerald-50 text-emerald-600',
      hideShipping: true,
    };
  }

  return {
    label: 'Akses Unduh & Lisensi',
    targetTab: 'downloads',
    badge: 'AKSES',
    icon: FolderKey,
    colorClass: 'bg-indigo-50 text-indigo-600',
    hideShipping: true,
  };
}

interface DashboardSidebarProps {
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeLogoUrl?: string | null;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isAdsTrackingUnlocked?: boolean;
  isSoloOrTrial?: boolean;
  isCheckoutLite?: boolean;
  productCount?: number;
  activeProductCount?: number;
  orderCount?: number;
  storeCategory?: string;
  businessType?: string;
  capabilities?: {
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    [key: string]: any;
  } | null;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
  onCloseMobileDrawer?: () => void;
  className?: string;
}

export default function DashboardSidebar({
  tenantSlug,
  displayName,
  storeDisplayName,
  storeLogoUrl,
  activeTab,
  setActiveTab,
  isTeamScale = false,
  isAdsPerformance = false,
  isAdsTrackingUnlocked = false,
  isSoloOrTrial = false,
  isCheckoutLite = false,
  productCount = 0,
  activeProductCount,
  orderCount = 0,
  storeCategory,
  businessType,
  capabilities,
  onOpenStoreSettings,
  onOpenUpgradeModal,
  onCloseMobileDrawer,
  className = '',
}: DashboardSidebarProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Logout note:', err);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
  };

  const nameToShow = storeDisplayName || displayName || tenantSlug;

  const isMainTabActive = (tab: string) => {
    if (tab === 'dashboard' && (activeTab === 'dashboard' || activeTab === 'overview' || activeTab === 'microsite' || activeTab === 'links')) return true;
    if (tab === 'catalog' && (activeTab === 'catalog' || activeTab === 'products')) return true;
    if (tab === 'themes' && (activeTab === 'themes' || activeTab === 'storefront')) return true;
    if (tab === 'ai_knowledge' && activeTab === 'ai_knowledge') return true;
    return false;
  };

  const isPowerTabActive = (tab: string) => {
    if (tab === 'whatsapp' && (activeTab === 'whatsapp' || activeTab === 'broadcast' || activeTab === 'auto_reply')) return true;
    if (tab === 'inbox' && activeTab === 'inbox') return true;
    if (tab === 'ads_tracking' && activeTab === 'ads_tracking') return true;
    if (tab === 'finance' && activeTab === 'finance') return true;
    if (tab === 'orders' && activeTab === 'orders') return true;
    return false;
  };

  const handleSelectTab = (tab: string) => {
    const targetTab = (tab === 'microsite' || tab === 'links') ? 'dashboard' : tab;
    setActiveTab(targetTab);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  return (
    <aside
      className={`w-64 xl:w-72 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col justify-between shrink-0 select-none z-40 ${className}`}
    >
      {/* ======================================================== */}
      {/* 1. TOP SECTION: KARTU PROFIL TOKO & POPOVER (PALING ATAS) */}
      {/* ======================================================== */}
      <div className="p-3 border-b border-slate-100 relative bg-white" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsPopoverOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between p-2 rounded-2xl border transition cursor-pointer text-left ${
            isPopoverOpen
              ? 'bg-slate-50 border-indigo-400 shadow-sm ring-2 ring-indigo-500/10'
              : 'bg-white hover:bg-slate-50/90 border-slate-200 shadow-2xs'
          }`}
          aria-expanded={isPopoverOpen}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Store Logo / Avatar */}
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={nameToShow}
                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-2xs">
                {nameToShow.charAt(0)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-slate-900 truncate">
                  {nameToShow}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded-full border leading-tight ${
                    isCheckoutLite
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : isTeamScale
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : isAdsPerformance
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {isCheckoutLite
                    ? 'Checkout Lite'
                    : isTeamScale
                    ? 'Team Scale'
                    : isAdsPerformance
                    ? 'Ads Performance'
                    : 'Solo Starter'}
                </span>
              </div>
            </div>
          </div>

          <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        </button>

        {/* POPOVER MENU (Terbuka Presisi ke Bawah: side="bottom" align="start") */}
        {isPopoverOpen && (
          <div className="absolute top-full left-3 right-3 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 z-50">
            {/* Header info in popover */}
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-black text-slate-900 truncate">{nameToShow}</p>
              <p className="text-[10px] font-semibold text-slate-400 truncate">
                boontrack.com/{tenantSlug}
              </p>
            </div>

            {/* Menu 1: Akun & Profil */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                onOpenStoreSettings();
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition text-left cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Akun &amp; Profil Toko</span>
            </button>

            {/* Menu 2: Billing & Langganan Paket */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                onOpenUpgradeModal();
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Crown className="w-3.5 h-3.5 text-purple-600" />
                <span>Billing &amp; Langganan</span>
              </div>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                UPGRADE
              </span>
            </button>

            {/* Menu 3: Pengaturan Domain (Hidden on Checkout Lite) */}
            {!isCheckoutLite && (
              <button
                type="button"
                onClick={() => {
                  setIsPopoverOpen(false);
                  handleSelectTab('themes');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition text-left cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span>Pengaturan Domain</span>
              </button>
            )}

            {/* Menu 4: Install App / PWA */}
            <PwaInstallPrompt
              tenantSlug={tenantSlug}
              variant="menu-item"
              onActionComplete={() => {
                setIsPopoverOpen(false);
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
            />

            <div className="h-[1px] bg-slate-100 my-1" />

            {/* Menu 4: Keluar (Logout) */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Keluar (Logout)</span>
            </button>
          </div>
        )}

        {/* Quick Action: Lihat Etalase Toko */}
        <div className="mt-2">
          <Link
            href={`https://boontrack.com/${tenantSlug}`}
            target="_blank"
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 text-slate-600 hover:text-indigo-600 text-[11px] font-bold transition group shadow-2xs"
          >
            <span className="flex items-center gap-2 truncate">
              <Store className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
              <span className="truncate">Lihat Etalase Toko</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 shrink-0" />
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. MIDDLE SECTION: NAVIGATION DENGAN MODERN SAAS MAKEOVER */}
      {/* ======================================================== */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 no-scrollbar">
        {isCheckoutLite ? (
          <div>
            <div className="flex items-center justify-between px-3 pt-1 pb-2">
              <span className="text-[10px] font-bold tracking-widest text-amber-700 uppercase">
                CHECKOUT LITE MENU
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                4 MENU
              </span>
            </div>

            <div className="space-y-1">
              {/* 1. Dashboard: Metrik ringkas (omzet, volume order, status pesanan) */}
              <button
                type="button"
                onClick={() => handleSelectTab('dashboard')}
                className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                  activeTab === 'dashboard' || activeTab === 'overview'
                    ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                {(activeTab === 'dashboard' || activeTab === 'overview') && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                )}
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-indigo-50 text-indigo-600">
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  <span className="truncate">Dashboard</span>
                </div>
                <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold bg-slate-100 text-slate-600">
                  Ringkas
                </span>
              </button>

              {/* 2. Products / Katalog Produk: Daftar produk dengan visual indikator kuota (X/3 Produk Aktif) */}
              <button
                type="button"
                onClick={() => handleSelectTab('catalog')}
                className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                  activeTab === 'catalog' || activeTab === 'products'
                    ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                {(activeTab === 'catalog' || activeTab === 'products') && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                )}
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-sky-50 text-sky-600">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="truncate">Katalog Produk</span>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {activeProductCount !== undefined ? activeProductCount : productCount}/3 Aktif
                </span>
              </button>

              {/* 3. Orders / Pesanan: Tabel pemantauan pesanan masuk */}
              <button
                type="button"
                onClick={() => handleSelectTab('orders')}
                className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-emerald-50/80 text-emerald-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                {activeTab === 'orders' && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-emerald-600 rounded-r" />
                )}
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-emerald-50 text-emerald-600">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <span className="truncate">Pesanan Masuk</span>
                </div>
                {orderCount > 0 ? (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white">
                    {orderCount}
                  </span>
                ) : null}
              </button>

              {/* 4. Store Settings: Batasi khusus 4 sub-menu saja */}
              <button
                type="button"
                onClick={() => handleSelectTab('settings')}
                className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                {activeTab === 'settings' && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                )}
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-purple-50 text-purple-600">
                    <Store className="w-4 h-4" />
                  </div>
                  <span className="truncate">Pengaturan Toko</span>
                </div>
                <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold bg-slate-100 text-slate-600">
                  4 Sub-menu
                </span>
              </button>
            </div>

            {/* Banner Upgrade Tier Callout */}
            <div className="mt-6 p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-indigo-500/10 border border-amber-200/70 text-slate-700 space-y-2">
              <div className="flex items-center gap-1.5 font-black text-xs text-amber-900">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span>Paket Checkout Lite</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Broadcast, CAPI Tracking, Multi-User CS, dan custom domain dinonaktifkan di tier Lite.
              </p>
              <button
                type="button"
                onClick={onOpenUpgradeModal}
                className="w-full py-2 px-3 bg-gradient-to-r from-amber-600 to-indigo-600 text-white font-bold rounded-xl text-xs hover:opacity-95 transition active:scale-98 shadow-xs cursor-pointer text-center"
              >
                Upgrade ke Pro / Enterprise
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* KATEGORI 1: STORE ENGINE */}
            <div>
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase px-3 pt-1 pb-2 block">
                STORE ENGINE
              </span>

              <div className="space-y-1">
                {/* 1. Dashboard / Beranda */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('dashboard')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isMainTabActive('dashboard')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isMainTabActive('dashboard') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-indigo-50 text-indigo-600">
                      <LayoutDashboard className="w-4 h-4" />
                    </div>
                    <span className="truncate">Dashboard</span>
                  </div>
                </button>

                {/* 2. Katalog / Layanan Dinamis Sesuai 6 Kategori Bisnis */}
                {(() => {
                  const verticalConfig = getVerticalMenuConfig(storeCategory);
                  const VerticalIcon = verticalConfig.icon;
                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectTab('catalog')}
                      className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                        isMainTabActive('catalog')
                          ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      {isMainTabActive('catalog') && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                      )}
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-sky-50 text-sky-600">
                          <VerticalIcon className="w-4 h-4" />
                        </div>
                        <span className="truncate">{verticalConfig.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200 uppercase">
                          {verticalConfig.badge}
                        </span>
                        {productCount > 0 ? (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {productCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })()}

                {/* 3. Menu Operasional Khusus Dinamis Sesuai 6 Kategori Bisnis */}
                {(() => {
                  const opConfig = getVerticalOperationalMenuConfig(storeCategory, capabilities);
                  if (opConfig.targetTab === 'shipping' && opConfig.hideShipping) {
                    return null;
                  }

                  const OpIcon = opConfig.icon;
                  const isOpActive =
                    activeTab === opConfig.targetTab ||
                    (opConfig.targetTab === 'shipping' && activeTab === 'biteship');

                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectTab(opConfig.targetTab)}
                      className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                        isOpActive
                          ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      {isOpActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                      )}
                      <div className="flex items-center gap-2.5 truncate">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${opConfig.colorClass}`}>
                          <OpIcon className="w-4 h-4" />
                        </div>
                        <span className="truncate">{opConfig.label}</span>
                      </div>
                      <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                        {opConfig.badge}
                      </span>
                    </button>
                  );
                })()}

                {/* Tampilan (Design & Themes) */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('themes')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isMainTabActive('themes')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isMainTabActive('themes') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-purple-50 text-purple-600">
                      <Palette className="w-4 h-4" />
                    </div>
                    <span className="truncate">Tampilan &amp; Tema</span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                    5 TEMA
                  </span>
                </button>

                {/* AI Knowledge & Bot */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('ai_knowledge')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isMainTabActive('ai_knowledge')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isMainTabActive('ai_knowledge') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-violet-50 text-violet-600">
                      <Brain className="w-4 h-4" />
                    </div>
                    <span className="truncate">AI Knowledge &amp; Bot</span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                    AI
                  </span>
                </button>
              </div>
            </div>

            {/* KATEGORI 2: GROWTH & CONVERSIONS */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase px-3 pt-2 pb-2 block">
                GROWTH &amp; CONVERSIONS
              </span>

              <div className="space-y-1">
                {/* WhatsApp & Broadcast */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('whatsapp')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isPowerTabActive('whatsapp')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isPowerTabActive('whatsapp') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-emerald-50 text-emerald-600">
                      <Radio className="w-4 h-4" />
                    </div>
                    <span className="truncate">WhatsApp &amp; Broadcast</span>
                  </div>
                  {isTeamScale ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      WABA
                    </span>
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>

                {/* BoonTrack Inbox (Live CS) */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('inbox')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isPowerTabActive('inbox')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isPowerTabActive('inbox') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-indigo-50 text-indigo-600">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className="truncate">BoonTrack Inbox</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                      isTeamScale
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : isAdsPerformance
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-0.5'
                    }`}
                  >
                    {!isTeamScale && !isAdsPerformance && <Lock className="w-2.5 h-2.5" />}
                    {isTeamScale ? 'PRO' : isAdsPerformance ? '2 SEATS' : '199k'}
                  </span>
                </button>

                {/* Ads Tracking Pro */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('ads_tracking')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isPowerTabActive('ads_tracking')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isPowerTabActive('ads_tracking') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-amber-50 text-amber-600">
                      <Target className="w-4 h-4" />
                    </div>
                    <span className="truncate">Ads Tracking Pro</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                      isAdsTrackingUnlocked
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-0.5'
                    }`}
                  >
                    {!isAdsTrackingUnlocked && <Lock className="w-2.5 h-2.5" />}
                    {isAdsTrackingUnlocked ? 'CAPI' : '299k'}
                  </span>
                </button>

                {/* Laporan Keuangan */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('finance')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isPowerTabActive('finance')
                      ? 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isPowerTabActive('finance') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-slate-100 text-slate-700">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <span className="truncate">Laporan Keuangan</span>
                  </div>
                  {isSoloOrTrial ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> PRO
                    </span>
                  ) : null}
                </button>

                {/* Pesanan & Order */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('orders')}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isPowerTabActive('orders')
                      ? 'bg-emerald-50/80 text-emerald-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  {isPowerTabActive('orders') && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-emerald-600 rounded-r" />
                  )}
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 bg-emerald-50 text-emerald-600">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <span className="truncate">Pesanan &amp; Order</span>
                  </div>
                  {orderCount > 0 ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white">
                      {orderCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. BOTTOM SECTION: BOONTRACK HUB LOGO & FOOTER (BAWAH)  */}
      {/* ======================================================== */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/20 shrink-0 text-xs">
            B
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-900 tracking-tight">BoonTrack</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[8px] border border-indigo-100">
                HUB
              </span>
            </div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Merchant Console
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
