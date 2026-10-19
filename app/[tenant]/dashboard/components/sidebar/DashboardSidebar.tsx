'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Store,
  ExternalLink,
  ChevronsUpDown,
  User,
  Crown,
  Globe,
  LogOut,
  Sparkles,
  LayoutDashboard,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { hasTierAccess } from '@/lib/subscription-tiers';
import { getStorefrontUrl } from '@/lib/utils/storefrontUrl';
import PwaInstallPrompt from '../PwaInstallPrompt';
import {
  buildMenuRegistry,
  findParentGroupId,
  isTabActiveInItem,
  NavMenuGroup,
  NavMenuItem,
  NavBadgeConfig,
} from './menuRegistry';

interface DashboardSidebarProps {
  tenant?: { tier?: string; [key: string]: any } | null;
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
  isTrialActive?: boolean;
  isGrant?: boolean;
  grantDaysLeft?: number | null;
  grantValidUntil?: string | null;
  tierLabel?: string;
  trialDaysLeft?: number | null;
  productCount?: number;
  activeProductCount?: number;
  orderCount?: number;
  inboxCount?: number;
  storeCategory?: string;
  businessType?: string;
  capabilities?: {
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    [key: string]: any;
  } | null;
  isCrmEnabled?: boolean;
  isAiBotAllowed?: boolean;
  customDomain?: string | null;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
  onCloseMobileDrawer?: () => void;
  className?: string;
}

function NavBadgeRenderer({ badge }: { badge?: NavBadgeConfig | null }) {
  if (!badge || (!badge.text && !badge.isLock)) return null;

  const variantClass = (() => {
    switch (badge.variant) {
      case 'info':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60';
      case 'success':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
      case 'purple':
        return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
      case 'locked':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
      case 'neutral':
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  })();

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-bold border shrink-0 ${variantClass}`}
    >
      {badge.isLock && <Lock className="w-2.5 h-2.5 shrink-0" />}
      {badge.text ? <span>{badge.text}</span> : null}
    </span>
  );
}

export default function DashboardSidebar({
  tenant,
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
  isCheckoutLite: isCheckoutLiteProp = false,
  isTrialActive = false,
  isGrant = false,
  grantDaysLeft = null,
  grantValidUntil,
  tierLabel,
  trialDaysLeft,
  productCount = 0,
  activeProductCount = 0,
  orderCount = 0,
  inboxCount = 0,
  storeCategory,
  businessType,
  capabilities,
  isCrmEnabled = false,
  isAiBotAllowed,
  customDomain,
  onOpenStoreSettings,
  onOpenUpgradeModal,
  onCloseMobileDrawer,
  className = '',
}: DashboardSidebarProps) {
  const effectiveCustomDomain = customDomain || tenant?.custom_domain || tenant?.metadata?.custom_domain || null;
  const storefrontUrl = getStorefrontUrl(tenantSlug, effectiveCustomDomain);
  const currentTier = String(tenant?.tier || '').toUpperCase();
  const isCheckoutLite = currentTier === 'CHECKOUT_LITE' || currentTier === 'LITE' || Boolean(isCheckoutLiteProp);
  const isCrmEffective = Boolean(isCrmEnabled || (isTeamScale && hasTierAccess(tenant, 'crm')));
  const isResellerEffective = Boolean(isTeamScale || hasTierAccess(tenant, 'reseller'));
  const isAiBotEffective =
    isAiBotAllowed !== undefined
      ? isAiBotAllowed
      : Boolean(!isCheckoutLite && (isAdsPerformance || isTeamScale || hasTierAccess(tenant, 'ai_bot')));

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Persistent Collapsed Sidebar State
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch (_) {}
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (_) {}
      return next;
    });
  };

  const isEffectivelyCollapsed = isCollapsed && !className?.includes('static');

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

  // Build Centralized Navigation Registry
  const menuGroups = useMemo(
    () =>
      buildMenuRegistry({
        storeCategory,
        businessType,
        capabilities,
        productCount,
        activeProductCount,
        orderCount,
        inboxCount,
        isCheckoutLite,
        isTeamScale,
        isAdsPerformance,
        isAdsTrackingUnlocked,
        isSoloOrTrial,
        isCrmEffective,
        isResellerEffective,
        isAiBotEffective,
        tierLabel,
        grantDaysLeft,
      }),
    [
      storeCategory,
      businessType,
      capabilities,
      productCount,
      activeProductCount,
      orderCount,
      inboxCount,
      isCheckoutLite,
      isTeamScale,
      isAdsPerformance,
      isAdsTrackingUnlocked,
      isSoloOrTrial,
      isCrmEffective,
      isResellerEffective,
      isAiBotEffective,
      tierLabel,
      grantDaysLeft,
    ]
  );

  // Multi-Open Accordion State (Set<string>)
  // - Default state: parent group of activeTab is initially open (if activeTab is in a collapsible group)
  // - State-aware routing: automatically adds parent group of activeTab into openGroupIds on mount or tab change
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => {
    const initialSet = new Set<string>();
    const parent = findParentGroupId(activeTab, menuGroups);
    if (parent && parent !== 'ringkasan') {
      initialSet.add(parent);
    }
    return initialSet;
  });

  // State-Aware Routing: Auto-include the parent group of activeTab into openGroupIds
  useEffect(() => {
    const parent = findParentGroupId(activeTab, menuGroups);
    if (parent && parent !== 'ringkasan') {
      setOpenGroupIds((prev) => {
        if (prev.has(parent)) return prev;
        const next = new Set(prev);
        next.add(parent);
        return next;
      });
    }
  }, [activeTab, menuGroups]);

  // Independent Toggle per Group (multi-open: does not close other groups)
  const handleToggleGroup = (groupId: string) => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSelectTab = (tab: string) => {
    const targetTab = tab === 'microsite' || tab === 'links' ? 'dashboard' : tab;
    setActiveTab(targetTab);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  // Extract Ringkasan & Secondary Collapsible Groups
  const ringkasanGroup = menuGroups.find((g) => g.id === 'ringkasan');
  const ringkasanItem = ringkasanGroup?.items[0];
  const collapsibleGroups = menuGroups.filter((g) => g.isCollapsible);

  return (
    <aside
      className={`${
        isEffectivelyCollapsed ? 'w-[72px] min-w-[72px] max-w-[72px]' : 'w-64 xl:w-72'
      } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0 self-start flex flex-col justify-between shrink-0 select-none z-40 overflow-hidden transition-[width] duration-200 ${className}`}
    >
      {/* ======================================================== */}
      {/* 1. TOP SECTION: KARTU PROFIL TOKO & POPOVER (STICKY TOP) */}
      {/* ======================================================== */}
      <div
        className={`${isEffectivelyCollapsed ? 'p-2' : 'p-3'} border-b border-slate-200 dark:border-slate-800 relative bg-white dark:bg-slate-900 shrink-0`}
        ref={popoverRef}
      >
        {isEffectivelyCollapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            {/* Tombol Perlebar Sidebar (Chevron Right) */}
            <button
              type="button"
              onClick={toggleCollapse}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white transition-colors shadow-2xs cursor-pointer"
              title="Perlebar Sidebar"
              aria-label="Perlebar Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Avatar Profil Mini dengan Popover & Tooltip */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setIsPopoverOpen((prev) => !prev)}
                className={`w-9 h-9 rounded-xl border transition cursor-pointer flex items-center justify-center overflow-hidden shadow-2xs ${
                  isPopoverOpen
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
                aria-expanded={isPopoverOpen}
                aria-label={nameToShow}
              >
                {storeLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storeLogoUrl} alt={nameToShow} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white font-black text-xs flex items-center justify-center uppercase">
                    {nameToShow.charAt(0)}
                  </div>
                )}
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100 flex flex-col gap-0.5">
                <span className="font-bold">{nameToShow}</span>
                <span className="text-[10px] text-slate-400">{tierLabel || 'BoonTrack'}</span>
              </div>
            </div>

            {/* Shortcut Langsung ke Pengaturan Toko */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white transition-colors shadow-2xs cursor-pointer"
                title="Pengaturan Toko"
                aria-label="Pengaturan Toko"
              >
                <Settings className="w-4 h-4" />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                Pengaturan Toko
              </div>
            </div>

            {/* Quick Action: Lihat Tampilan Toko Icon-Only */}
            <div className="relative group">
              <Link
                href={storefrontUrl}
                target="_blank"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 text-slate-400 hover:text-white transition-colors shadow-2xs"
                aria-label="Lihat Tampilan Toko"
              >
                <Store className="w-4 h-4" />
              </Link>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                Lihat Tampilan Toko
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPopoverOpen((prev) => !prev)}
                className={`flex-1 min-w-0 flex items-center justify-between p-2 rounded-2xl border transition-colors cursor-pointer text-left ${
                  isPopoverOpen
                    ? 'bg-slate-800/90 border-indigo-500/60 shadow-sm ring-1 ring-indigo-500/30'
                    : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80 shadow-2xs text-slate-300'
                }`}
                aria-expanded={isPopoverOpen}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Store Logo / Avatar */}
                  {storeLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={storeLogoUrl}
                      alt={nameToShow}
                      className="w-8 h-8 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-2xs">
                      {nameToShow.charAt(0)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {nameToShow}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full border leading-tight ${
                          isGrant || (tierLabel && tierLabel.toLowerCase().includes('grant'))
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-extrabold shadow-2xs'
                            : isCheckoutLite || (tierLabel && tierLabel.toLowerCase().includes('checkout'))
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : isTeamScale || (tierLabel && tierLabel.toLowerCase().includes('team'))
                            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                            : isAdsPerformance || (tierLabel && (tierLabel.toLowerCase().includes('ads') || tierLabel.toLowerCase().includes('performance')))
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {(isGrant || (tierLabel && tierLabel.toLowerCase().includes('grant'))) && (
                          <Sparkles className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        )}
                        <span>
                          {tierLabel && tierLabel !== 'Paket Solo' && tierLabel !== 'Paket Checkout'
                            ? tierLabel
                            : isCheckoutLite
                            ? 'Checkout Lite'
                            : isTeamScale
                            ? 'Team Scale'
                            : isAdsPerformance
                            ? isTrialActive || trialDaysLeft !== null
                              ? 'Ads Performance'
                              : 'Ads Performance'
                            : 'Paket Starter'}
                        </span>
                      </span>

                      {(isGrant || (tierLabel && tierLabel.toLowerCase().includes('grant'))) && grantDaysLeft !== null && (
                        <span className="text-[9px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-300 dark:border-amber-800">
                          {grantDaysLeft > 0 ? `${grantDaysLeft}h` : 'Aktif'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              </button>

              {/* Shortcut Langsung ke Pengaturan Toko */}
              <button
                type="button"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="p-2 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white transition-colors shadow-2xs cursor-pointer shrink-0"
                title="Buka Pengaturan Toko (Profil, Jam Buka, Domain, Pembayaran)"
                aria-label="Pengaturan Toko"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Tombol Toggle Collapse (Chevron Left) */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="p-2 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white transition-colors shadow-2xs cursor-pointer shrink-0"
                title="Ciutkan Sidebar"
                aria-label="Ciutkan Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action: Lihat Tampilan Toko */}
            <div className="mt-2">
              <Link
                href={storefrontUrl}
                target="_blank"
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 text-slate-400 hover:text-white text-[11px] font-bold transition-colors group shadow-2xs"
              >
                <span className="flex items-center gap-2 truncate">
                  <Store className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 shrink-0 transition-colors" />
                  <span className="truncate">Lihat Tampilan Toko</span>
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </Link>
            </div>
          </>
        )}

        {/* POPOVER MENU (side="bottom" align="start") */}
        {isPopoverOpen && (
          <div className="absolute top-full left-2 right-2 sm:left-3 sm:right-3 mt-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 z-50">
            {/* Header info in popover */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-black text-slate-900 dark:text-white truncate">{nameToShow}</p>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate">
                {effectiveCustomDomain
                  ? effectiveCustomDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
                  : `shop.boontrack.com/${tenantSlug}`}
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
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-left cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
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
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Billing &amp; Langganan</span>
              </div>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
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
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-left cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
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

            <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

            {/* Menu 5: Keluar (Logout) */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition text-left cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span>Keluar (Logout)</span>
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. MIDDLE SECTION: NAVIGATION REFACTOR BERBASIS REGISTRY */}
      {/* ======================================================== */}
      <div className={`flex-1 overflow-y-auto ${isEffectivelyCollapsed ? 'px-2 py-2 space-y-2' : 'px-3 py-3 space-y-3'} no-scrollbar`}>
        {isEffectivelyCollapsed ? (
          /* COLLAPSED ICON-ONLY NAVIGATION WITH FLOATING TOOLTIPS */
          <div className="flex flex-col items-center gap-1.5 py-1">
            {/* Ringkasan Dashboard */}
            {ringkasanItem && (
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => handleSelectTab(ringkasanItem.targetTab)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                    isTabActiveInItem(ringkasanItem, activeTab)
                      ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-medium'
                      : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`}
                  aria-label={ringkasanItem.label}
                >
                  <ringkasanItem.icon className="w-4 h-4" />
                </button>
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100 flex flex-col gap-0.5">
                  <span className="font-bold">{ringkasanItem.label}</span>
                  <span className="text-[10px] text-slate-400">{ringkasanItem.subtitle || ringkasanItem.description}</span>
                </div>
              </div>
            )}

            <div className="w-8 h-[1px] bg-slate-200/80 dark:bg-slate-800 my-1" />

            {/* Collapsible Groups Flattened into Icons */}
            {collapsibleGroups.map((group) => (
              <React.Fragment key={group.id}>
                {group.items.map((item) => {
                  const isItemActive = isTabActiveInItem(item, activeTab);
                  const ItemIcon = item.icon;

                  return (
                    <div key={item.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => handleSelectTab(item.targetTab)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                          isItemActive
                            ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-medium'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                        }`}
                        aria-label={item.label}
                      >
                        <ItemIcon className="w-4 h-4" />
                      </button>
                      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{item.label}</span>
                          {item.badge?.text && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-500 text-white font-bold">
                              {item.badge.text}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <span className="text-[10px] text-slate-400">{item.subtitle}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="w-6 h-[1px] bg-slate-100 dark:bg-slate-800 my-0.5" />
              </React.Fragment>
            ))}
          </div>
        ) : (
          /* EXPANDED DETAILED NAVIGATION WITH SUBTITLE MICRO-COPY */
          <>
            {/* GRUP 1: RINGKASAN (Dashboard, metrik penting, aktivitas terbaru) */}
            {ringkasanItem && (
              <div>
                {(() => {
                  const isRingkasanActive = isTabActiveInItem(ringkasanItem, activeTab);
                  const RingkasanIcon = ringkasanItem.icon;
                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectTab(ringkasanItem.targetTab)}
                      className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                        isRingkasanActive
                          ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-medium'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
                      }`}
                      title={ringkasanItem.description || 'Dashboard, metrik penting, aktivitas terbaru'}
                    >
                      {isRingkasanActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo-500 rounded-r" />
                      )}
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            isRingkasanActive
                              ? 'bg-slate-700/60 text-indigo-400'
                              : 'bg-slate-800/80 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
                          }`}
                        >
                          <RingkasanIcon className="w-4 h-4" />
                        </div>
                        <div className="text-left truncate">
                          <span className="truncate block font-bold leading-tight">
                            {ringkasanItem.label}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate block leading-tight mt-0.5">
                            {ringkasanItem.subtitle || ringkasanItem.description || 'Aktivitas & Info Update'}
                          </span>
                        </div>
                      </div>
                      <NavBadgeRenderer badge={ringkasanItem.badge} />
                    </button>
                  );
                })()}
              </div>
            )}

            <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

            {/* ACCORDION GROUPS (Kelola Toko, Pesan & Pelanggan, Kembangkan Bisnis) */}
            <div className="space-y-1.5">
              {collapsibleGroups.map((group) => {
                const isOpen = openGroupIds.has(group.id);
                const GroupIcon = group.icon || Store;
                const hasActiveChild = group.items.some((it) => isTabActiveInItem(it, activeTab));

                // Calculate group-level badges (e.g. orderCount or unread inboxCount)
                const groupBadgeCount = (() => {
                  if (group.id === 'kelola-toko' && orderCount > 0) return orderCount;
                  if (group.id === 'pesan-pelanggan' && inboxCount > 0) return inboxCount;
                  return 0;
                })();

                return (
                  <div
                    key={group.id}
                    className="bg-transparent dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl transition-all duration-200 overflow-hidden"
                  >
                    {/* Accordion Group Header (Single / Controlled Accordion) */}
                    <button
                      type="button"
                      onClick={() => handleToggleGroup(group.id)}
                      aria-expanded={isOpen}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer select-none text-left ${
                        isOpen
                          ? 'text-white'
                          : hasActiveChild
                          ? 'text-indigo-400'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            isOpen || hasActiveChild
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <GroupIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate">{group.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        {groupBadgeCount > 0 && !isOpen && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            {groupBadgeCount}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Collapsible Children Container (Smooth CSS Grid Animation) */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
                        isOpen
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      }`}
                    >
                      <div className="overflow-hidden bg-transparent">
                        <div className="pt-0.5 pb-2 px-1.5 space-y-0.5 bg-transparent">
                          {group.items.map((item) => {
                            const isItemActive = isTabActiveInItem(item, activeTab);
                            const ItemIcon = item.icon;

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSelectTab(item.targetTab)}
                                className={`relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left group ${
                                  isItemActive
                                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-medium'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
                                }`}
                              >
                                {isItemActive && (
                                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-indigo-500 rounded-r" />
                                )}
                                <div className="flex items-center gap-2 truncate min-w-0 flex-1 pr-1">
                                  <ItemIcon
                                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                      isItemActive ? 'text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  />
                                  <div className="truncate text-left min-w-0">
                                    <span className="truncate block font-bold leading-tight">{item.label}</span>
                                    {item.subtitle && (
                                      <span className={`text-[11px] font-normal truncate block leading-tight mt-0.5 ${
                                        isItemActive ? 'text-indigo-300/70' : 'text-slate-500 dark:text-slate-400'
                                      }`}>
                                        {item.subtitle}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <NavBadgeRenderer badge={item.badge} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upgrade Callout Banner for Checkout Lite & Starter */}
            {isCheckoutLite && (
              <div className="mt-4 p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-indigo-500/10 dark:from-amber-950/20 dark:via-purple-950/10 dark:to-indigo-950/20 border border-amber-200/70 dark:border-amber-900/40 text-slate-700 dark:text-slate-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-black text-xs text-amber-900 dark:text-amber-300">
                  <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Paket Checkout Lite</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Buka WhatsApp Broadcast, CAPI Tracking, dan multi-seat CS dengan upgrade ke Pro.
                </p>
                <button
                  type="button"
                  onClick={onOpenUpgradeModal}
                  className="w-full py-1.5 px-3 bg-gradient-to-r from-amber-600 to-indigo-600 text-white font-bold rounded-xl text-[11px] hover:opacity-95 transition active:scale-98 shadow-xs cursor-pointer text-center"
                >
                  Upgrade Paket
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. PINNED BOTTOM SECTION: PROFIL, AKUN & PENGATURAN TOKO */}
      {/* ======================================================== */}
      <div
        className={`mt-auto shrink-0 sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 ${
          isEffectivelyCollapsed ? 'p-2 space-y-2' : 'p-2.5 sm:p-3 space-y-1.5'
        } z-10`}
      >
        {isEffectivelyCollapsed ? (
          /* COLLAPSED PINNED BOTTOM SECTION */
          <div className="flex flex-col items-center gap-2">
            {/* Pinned 1: Profil & Akun */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-10 h-10 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 text-slate-400 hover:text-white border border-slate-800/80 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                aria-label="Profil & Akun Toko"
              >
                <User className="w-4 h-4" />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                Profil &amp; Akun Toko
              </div>
            </div>

            {/* Pinned 2: Pengaturan Toko */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-10 h-10 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 text-slate-400 hover:text-white border border-slate-800/80 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                aria-label="Pengaturan Toko"
              >
                <Settings className="w-4 h-4" />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                Pengaturan Toko
              </div>
            </div>

            {/* Compact Brand Logo */}
            <div className="relative group pt-1">
              <div className="w-6 h-6 flex items-center justify-center cursor-default">
                <Image
                  src="/logo-master.png"
                  alt="BoonTrack"
                  width={22}
                  height={22}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                BoonTrack Shop Engine
              </div>
            </div>
          </div>
        ) : (
          /* EXPANDED PINNED BOTTOM SECTION */
          <>
            <div className="space-y-0.5">
              {/* Pinned 1: Profil & Akun */}
              <button
                type="button"
                onClick={() => {
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent hover:border-slate-800/80 transition-colors cursor-pointer group shadow-2xs text-left"
                title="Profil &amp; Akun Toko"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
                    Profil &amp; Akun
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-white font-black shrink-0 transition-colors">
                  👤
                </span>
              </button>

              {/* Pinned 2: Pengaturan Toko */}
              <button
                type="button"
                onClick={() => {
                  onOpenStoreSettings();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent hover:border-slate-800/80 transition-colors cursor-pointer group shadow-2xs text-left"
                title="Pengaturan Toko (Profil, Jam Buka, Domain, Rekening Pembayaran)"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                    <Settings className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
                    Pengaturan Toko
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-white font-black shrink-0 transition-colors">
                  ⚙️
                </span>
              </button>
            </div>

            {/* Tombol Install App / PWA di Footer */}
            <PwaInstallPrompt
              tenantSlug={tenantSlug}
              variant="menu-item"
              onActionComplete={() => {
                if (onCloseMobileDrawer) onCloseMobileDrawer();
              }}
            />

            {/* Compact BoonTrack Shop Brand Footer */}
            <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80 transition-colors">
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <Image
                  src="/logo-master.png"
                  alt="BoonTrack"
                  width={20}
                  height={20}
                  priority
                  className="w-full h-full object-contain drop-shadow-2xs"
                />
              </div>
              <div className="min-w-0 flex-1 flex items-center justify-between">
                <div className="flex items-center gap-1 leading-none">
                  <span className="text-[11px] font-black text-slate-200 tracking-tight">BoonTrack</span>
                  <span className="text-[11px] font-extrabold text-indigo-400">Shop</span>
                </div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                  ENGINE
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
