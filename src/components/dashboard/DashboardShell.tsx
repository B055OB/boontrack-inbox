'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import CollapsibleSidebar from './CollapsibleSidebar';
import DashboardTopbar from './DashboardTopbar';

const LOCAL_PREF_EVENT = 'bt:local-pref-changed';

/**
 * Hydration-safe persistent localStorage preference hook powered by useSyncExternalStore.
 */
export function useLocalStorageValue(
  key: string,
  defaultValue: string
): [string, (next: string) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const handleStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === key) onStoreChange();
      };
      const handleCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ key?: string }>).detail;
        if (!detail?.key || detail.key === key) onStoreChange();
      };
      window.addEventListener('storage', handleStorage);
      window.addEventListener(LOCAL_PREF_EVENT, handleCustom);
      return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(LOCAL_PREF_EVENT, handleCustom);
      };
    },
    [key]
  );

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Ignore storage restrictions
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(LOCAL_PREF_EVENT, { detail: { key } }));
      }
    },
    [key]
  );

  return [value, setValue];
}

export interface DashboardShellProps {
  tenant?: { tier?: string; custom_domain?: string | null; metadata?: Record<string, unknown> } | null;
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeLogoUrl?: string | null;
  customDomain?: string | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
  themeToggleClassName?: string;
  saveFeedback?: string | null;
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
  isLiveMode?: boolean;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
  onOpenNewProduct?: () => void;
  onOpenAiAssistant?: () => void;
  onLogout?: () => Promise<void> | void;
  notificationSlot?: React.ReactNode;
  topBanners?: React.ReactNode;
  asideSlot?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardShell({
  tenant,
  tenantSlug,
  displayName,
  storeDisplayName,
  storeLogoUrl,
  customDomain,
  activeTab,
  onSelectTab,
  themeMode,
  onToggleTheme,
  themeToggleClassName,
  saveFeedback,
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
  isLiveMode = true,
  onOpenStoreSettings,
  onOpenUpgradeModal,
  onOpenNewProduct,
  onOpenAiAssistant,
  onLogout: onLogoutProp,
  notificationSlot,
  topBanners,
  asideSlot,
  children,
}: DashboardShellProps) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [sidebarExpandedRaw, setSidebarExpandedRaw] = useLocalStorageValue(
    'bt_dodo_sidebar_expanded',
    'false'
  );
  const isSidebarExpanded = sidebarExpandedRaw === 'true';

  const statusKey = `bt_store_operational_status:${(tenantSlug || 'default').toLowerCase().trim()}`;
  const [storeStatusRaw, setStoreStatusRaw] = useLocalStorageValue(statusKey, 'open');
  const storeStatus: 'open' | 'break' = storeStatusRaw === 'break' ? 'break' : 'open';

  const handleToggleSidebar = useCallback(() => {
    setSidebarExpandedRaw(isSidebarExpanded ? 'false' : 'true');
  }, [isSidebarExpanded, setSidebarExpandedRaw]);

  const handleToggleStoreStatus = useCallback(() => {
    setStoreStatusRaw(storeStatus === 'open' ? 'break' : 'open');
  }, [storeStatus, setStoreStatusRaw]);

  const handleLogout = useCallback(async () => {
    if (onLogoutProp) {
      await onLogoutProp();
      return;
    }
    try {
      const res = await fetch('/api/v1/auth/logout', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Gagal mengakhiri sesi pada server. Silakan coba lagi.');
      }

      try {
        const supabase = getSupabase();
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch (sbErr) {
        console.warn('Supabase signout note:', sbErr);
      }

      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.replace(`${window.location.origin}/login`);
      }
    } catch (err: unknown) {
      console.error('Logout error:', err);
      const message = err instanceof Error ? err.message : 'Gagal logout. Silakan periksa koneksi internet Anda.';
      alert(message);
    }
  }, [onLogoutProp]);

  const effectiveCustomDomain =
    customDomain || tenant?.custom_domain || (tenant?.metadata?.custom_domain as string | null | undefined) || null;

  return (
    <div
      className={`min-h-screen bg-[#FAFAFA] dark:bg-[#0A0D14] text-slate-900 dark:text-slate-100 font-sans antialiased flex flex-col lg:flex-row ${
        themeMode === 'dark'
          ? 'selection:bg-indigo-900/50 selection:text-indigo-200'
          : 'selection:bg-indigo-100 selection:text-indigo-900'
      }`}
    >
      {/* Mobile Slide-Over Sidebar Drawer (< lg) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-white dark:bg-[#090D16] border-r border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col">
            <div className="absolute top-2.5 right-2.5 z-50">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Tutup Menu"
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CollapsibleSidebar
              className="w-full h-full border-r-0 static"
              forceExpanded
              tenant={tenant}
              tenantSlug={tenantSlug}
              displayName={displayName}
              storeDisplayName={storeDisplayName}
              storeLogoUrl={storeLogoUrl}
              customDomain={effectiveCustomDomain}
              activeTab={activeTab}
              onSelectTab={(tab) => {
                onSelectTab(tab);
                setIsMobileDrawerOpen(false);
              }}
              isTeamScale={isTeamScale}
              isAdsPerformance={isAdsPerformance}
              isAdsTrackingUnlocked={isAdsTrackingUnlocked}
              isSoloOrTrial={isSoloOrTrial}
              isCheckoutLite={isCheckoutLite}
              isGrant={isGrant}
              grantDaysLeft={grantDaysLeft}
              tierLabel={tierLabel}
              productCount={productCount}
              orderCount={orderCount}
              inboxCount={inboxCount}
              storeCategory={storeCategory}
              businessType={businessType}
              capabilities={capabilities}
              isCrmEnabled={isCrmEnabled}
              isAiBotAllowed={isAiBotAllowed}
              isResellerUnlocked={isResellerUnlocked}
              isLiveMode={isLiveMode}
              onOpenStoreSettings={() => {
                onOpenStoreSettings();
                setIsMobileDrawerOpen(false);
              }}
              onOpenUpgradeModal={() => {
                onOpenUpgradeModal();
                setIsMobileDrawerOpen(false);
              }}
              onLogout={handleLogout}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Desktop Collapsible Sidebar (64px w-16 default -> w-56 expanded) */}
      <CollapsibleSidebar
        className="hidden lg:flex"
        tenant={tenant}
        tenantSlug={tenantSlug}
        displayName={displayName}
        storeDisplayName={storeDisplayName}
        storeLogoUrl={storeLogoUrl}
        customDomain={effectiveCustomDomain}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        isExpanded={isSidebarExpanded}
        onToggleExpand={handleToggleSidebar}
        isTeamScale={isTeamScale}
        isAdsPerformance={isAdsPerformance}
        isAdsTrackingUnlocked={isAdsTrackingUnlocked}
        isSoloOrTrial={isSoloOrTrial}
        isCheckoutLite={isCheckoutLite}
        isGrant={isGrant}
        grantDaysLeft={grantDaysLeft}
        tierLabel={tierLabel}
        productCount={productCount}
        orderCount={orderCount}
        inboxCount={inboxCount}
        storeCategory={storeCategory}
        businessType={businessType}
        capabilities={capabilities}
        isCrmEnabled={isCrmEnabled}
        isAiBotAllowed={isAiBotAllowed}
        isResellerUnlocked={isResellerUnlocked}
        isLiveMode={isLiveMode}
        onOpenStoreSettings={onOpenStoreSettings}
        onOpenUpgradeModal={onOpenUpgradeModal}
        onLogout={handleLogout}
      />

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full">
        {/* Minimalist Dodo-Style Topbar (h-14) */}
        <DashboardTopbar
          tenantSlug={tenantSlug}
          displayName={displayName}
          storeDisplayName={storeDisplayName}
          storeLogoUrl={storeLogoUrl}
          customDomain={effectiveCustomDomain}
          tierLabel={tierLabel}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          themeMode={themeMode}
          onToggleTheme={onToggleTheme}
          themeToggleClassName={themeToggleClassName}
          saveFeedback={saveFeedback}
          orderCount={orderCount}
          productCount={productCount}
          storeStatus={storeStatus}
          onToggleStoreStatus={handleToggleStoreStatus}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          onOpenStoreSettings={onOpenStoreSettings}
          onOpenUpgradeModal={onOpenUpgradeModal}
          onOpenNewProduct={onOpenNewProduct}
          onOpenAiAssistant={onOpenAiAssistant}
          onLogout={handleLogout}
          notificationSlot={notificationSlot}
        />

        {/* Optional Top Banners (e.g. Trial status / PWA bar) */}
        {topBanners}

        {/* Main Workspace Canvas (Clean, spacious, data-first) */}
        <main className="flex-1 w-full min-w-0">
          <div className="max-w-[1400px] mx-auto px-6 py-6 flex items-start gap-6 min-w-0 w-full">
            <div className="flex-1 min-w-0 w-full">{children}</div>
            {asideSlot}
          </div>
        </main>
      </div>
    </div>
  );
}
