'use client';

// Dashboard Page: Dynamic binding for orders, inbox conversations, and financial reports
// Synchronized for multi-tenant architecture (100% dynamic, zero hardcode)

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Store,
  ExternalLink,
  Calendar,
  Download,
  ShoppingBag,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import LockedFeatureCard from './components/LockedFeatureCard';
import { getSupabase } from '@/lib/supabaseClient';

import DashboardSidebar from './components/sidebar/DashboardSidebar';
import LivePhonePreview from './components/preview/LivePhonePreview';
import StorefrontThemeCard, { VisualThemeType } from './components/settings/StorefrontThemeCard';
import CustomDomainCard from './components/settings/CustomDomainCard';
import OrderNotificationBell from './components/navbar/OrderNotificationBell';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import TrialBanner from './components/navbar/TrialBanner';
import TrialQuotaProgressBar from './components/TrialQuotaProgressBar';
import ProductsTab from './components/tabs/ProductsTab';
import AdsTrackingTab from './components/tabs/AdsTrackingTab';
import TeamChatTab from './components/tabs/TeamChatTab';
import OverviewTab from './components/tabs/OverviewTab';
import SettingsTab from './components/tabs/SettingsTab';
import MicrositeTab from './components/tabs/MicrositeTab';
import DashboardOverviewTab from './components/tabs/DashboardOverviewTab';
import WhatsAppTab from './components/tabs/WhatsAppTab';
import AiKnowledgeTab from './components/AiKnowledgeTab';
import BiteshipCourierConfig from './components/BiteshipCourierConfig';
import WhatsAppBroadcastManager from './components/WhatsAppBroadcastManager';
import WhatsAppAutoReplyManager from './components/WhatsAppAutoReplyManager';
import WhatsAppRotatorManager from './components/WhatsAppRotatorManager';
import BoonPilotWidget from '@/components/BoonPilotWidget';
import StoreBioLinkWidget from './components/StoreBioLinkWidget';
import ProductFormModal from './components/ProductFormModal';
import SinglePageBuilderModal from './components/SinglePageBuilderModal';
import BulkImportModal from './components/modals/BulkImportModal';
import UpsellModal from './components/modals/UpsellModal';
import UpgradePaymentModal from './components/modals/UpgradePaymentModal';
import LocalServiceConfigForm from '@/app/components/LocalServiceConfigForm';
import OrdersTab from './components/tabs/OrdersTab';
import {
  ModularVerticalTabDispatcher,
  ModularAiKnowledgeDispatcher,
  resolveDomainVertical,
} from './components/modules';
import { useTenantDashboard } from './hooks/useTenantDashboard';

export default function TenantDashboardPage() {
  const {
    tenantSlug,
    displayName,
    isCheckoutLite,
    activeProductsCount,
    isTeamScale,
    isAdsPerformance,
    isProScale,
    isGrowthPlus,
    isGrowth,
    isAdsTrackingUnlocked,
    isSoloOrTrial,
    isTrialActive,
    tierLabel,
    handleUpgradeTier,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    targetUpgradeTier,
    openUpgradeModal,

    trialDaysLeft,
    trialEndsAt,
    subscriptionStatus,
    tenantFeatureFlags,
    isAiBotAllowed,
    isUpsellModalOpen,
    setIsUpsellModalOpen,

    storeCategory,
    businessType,
    capabilities,
    storeDisplayName,
    setStoreDisplayName,
    storeBio,
    setStoreBio,
    storeWhatsapp,
    setStoreWhatsapp,
    nameError,
    setNameError,
    storeQrisUrl,
    storeQrisPayload,
    setStoreQrisPayload,
    handleQrisUpload,
    isUploadingQris,
    storeLogoUrl,
    handleLogoUpload,
    isUploadingLogo,
    isStoreSettingsOpen,
    setIsStoreSettingsOpen,

    activeTab,
    setActiveTab,
    saveFeedback,
    setSaveFeedback,
    isSimulatorOpen,
    setIsSimulatorOpen,

    products,
    refreshProducts,
    isProductModalOpen,
    setIsProductModalOpen,
    editingProductId,
    productForm,
    setProductForm,
    openNewProductModal,
    openEditProductModal,
    handleQuickStockChange,
    handleSaveProductForm,
    handleDeleteProduct,

    isBulkImportModalOpen,
    setIsBulkImportModalOpen,

    isSinglePageModalOpen,
    setIsSinglePageModalOpen,
    activeSinglePageProduct,
    singlePageForm,
    setSinglePageForm,
    openSinglePageBuilder,
    handleSaveSinglePageConfig,

    aiForm,
    setAiForm,
    faqs,
    setFaqs,
    interactiveMenus,
    setInteractiveMenus,
    botStrategy,
    setBotStrategy,
    botMode,
    setBotMode,
    isSavingAi,
    isLoadingAi,
    isSavingStrategy,
    strategyFeedback,
    handleSaveBotStrategy,
    handleSaveAiKnowledge,

    waMode,
    setWaMode,
    waStatus,
    setWaStatus,
    waProvider,
    waConnectionMode,
    qrCodeUrl,
    setQrCodeUrl,
    isQrLoading,
    waErrorMessage,
    connectedPhone,
    setConnectedPhone,
    handleConnectGrowthSession,

    conversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    replyText,
    setReplyText,
    handleSendMessage,

    bankForm,
    setBankForm,
    transactions,
    orders,
    totalOmzet,
    readyBalance,
    isWithdrawModalOpen,
    setIsWithdrawModalOpen,
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    handleProcessWithdraw,
  } = useTenantDashboard();

  const renderLockedFeatureCard = (cardProps: {
    title: string;
    badge: string;
    description: string;
    targetTier: 'ads_performance' | 'team_scale';
    targetTierLabel: string;
  }) => <LockedFeatureCard {...cardProps} onUpgrade={handleUpgradeTier} />;

  const renderVerticalModule = () => {
    const vKey = resolveDomainVertical(storeCategory);
    return (
      <div className="mb-6 animate-in fade-in duration-200">
        <ModularAiKnowledgeDispatcher verticalKey={vKey} tenantSlug={tenantSlug} />
      </div>
    );
  };

  const [activeVisualTheme, setActiveVisualTheme] = React.useState<VisualThemeType>('aurora_gradient');
  const [livePreviewButtons, setLivePreviewButtons] = React.useState<any[]>([]);
  const [livePreviewShowProducts, setLivePreviewShowProducts] = React.useState(true);
  const [livePreviewFeaturedProductIds, setLivePreviewFeaturedProductIds] = React.useState<string[]>([]);
  const hasLoadedPreviewDataRef = React.useRef(false);

  React.useEffect(() => {
    if (!tenantSlug || hasLoadedPreviewDataRef.current) return;
    hasLoadedPreviewDataRef.current = true;

    async function loadInitialData() {
      try {
        const supabase = getSupabase();
        let meta: any = null;
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();
          meta = tenantRow?.metadata;
        }

        if (meta) {
          const vTheme = meta.theme?.visual_theme || meta.visual_theme || 'aurora_gradient';
          setActiveVisualTheme(vTheme);
          if (Array.isArray(meta.microsite?.buttons) && meta.microsite.buttons.length > 0) {
            setLivePreviewButtons(meta.microsite.buttons);
          }
          const showProd = Boolean(meta.microsite?.show_products ?? meta.microsite_show_products ?? true);
          setLivePreviewShowProducts(showProd);

          const rawFeat =
            meta.featured_product_ids ||
            meta.microsite?.featured_product_ids ||
            meta.microsite_featured_product_ids;
          if (Array.isArray(rawFeat) && rawFeat.length > 0) {
            setLivePreviewFeaturedProductIds(rawFeat.map(String).slice(0, 5));
          }
        } else {
          const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/theme`);
          if (res.ok) {
            const data = await res.json();
            if (data?.theme?.visual_theme) {
              setActiveVisualTheme(data.theme.visual_theme);
            }
          }
        }
      } catch (err) {
        console.warn('Load initial preview data note:', err);
      }
    }
    loadInitialData();
  }, [tenantSlug]);

  const handleThemeChange = React.useCallback((themeId: VisualThemeType) => {
    setActiveVisualTheme(themeId);
    setSaveFeedback('✅ Tema visual storefront berhasil diubah!');
    setTimeout(() => setSaveFeedback(null), 3000);
  }, []);

  React.useEffect(() => {
    function handleThemeEvent(e: any) {
      if (e.detail?.visual_theme) {
        setActiveVisualTheme(e.detail.visual_theme);
      }
    }
    function handleButtonsEvent(e: any) {
      if (Array.isArray(e.detail?.buttons)) {
        setLivePreviewButtons(e.detail.buttons);
      }
    }
    window.addEventListener('storefront-theme-changed', handleThemeEvent);
    window.addEventListener('storefront-buttons-changed', handleButtonsEvent);
    return () => {
      window.removeEventListener('storefront-theme-changed', handleThemeEvent);
      window.removeEventListener('storefront-buttons-changed', handleButtonsEvent);
    };
  }, []);

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);
  const storeHeaderName = storeDisplayName || displayName || tenantSlug;

  // Theme Toggle (Light & Dark Mode)
  const [themeMode, setThemeMode] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('boontrack_theme') as 'light' | 'dark' | null;
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setThemeMode(savedTheme);
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        // Default to light mode
        document.documentElement.classList.remove('dark');
      }
    } catch (_) {}
  }, []);

  const toggleTheme = React.useCallback(() => {
    setThemeMode((prev) => {
      const nextTheme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('boontrack_theme', nextTheme);
      } catch (_) {}
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return nextTheme;
    });
  }, []);

  const isPreviewEnabledTab =
    activeTab === 'themes' ||
    activeTab === 'storefront' ||
    activeTab === 'microsite' ||
    activeTab === 'links';

  return (
    <main className={`min-h-[100dvh] font-sans flex flex-col lg:flex-row antialiased dashboard-theme-container ${
      themeMode === 'dark'
        ? 'bg-[#0B0F19] text-slate-100 selection:bg-emerald-500 selection:text-slate-950'
        : 'bg-[#F8FAFC] text-slate-900 selection:bg-blue-100 selection:text-blue-900'
    }`}>
      {/* MOBILE SLIDE-OVER DRAWER / SHEET (< lg) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Sheet Container */}
          <div className="fixed inset-y-0 left-0 w-[290px] sm:w-[320px] max-w-[85vw] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-left duration-250">
            <div className="absolute top-3 right-3 z-50">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                aria-label="Tutup Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DashboardSidebar
              className="w-full h-full border-r-0 static"
              tenantSlug={tenantSlug}
              displayName={displayName}
              storeDisplayName={storeDisplayName}
              storeLogoUrl={storeLogoUrl}
              storeCategory={storeCategory || businessType}
              businessType={businessType || storeCategory}
              capabilities={capabilities}
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsMobileDrawerOpen(false);
              }}
              isTeamScale={isTeamScale}
              isAdsPerformance={isAdsPerformance}
              isAdsTrackingUnlocked={isAdsTrackingUnlocked}
              isSoloOrTrial={isSoloOrTrial}
              isCheckoutLite={isCheckoutLite}
              isTrialActive={isTrialActive}
              tierLabel={tierLabel}
              trialDaysLeft={trialDaysLeft}
              productCount={products.length}
              activeProductCount={activeProductsCount}
              orderCount={transactions.length}
              inboxCount={conversations.length}
              onOpenStoreSettings={() => {
                setNameError(null);
                setIsStoreSettingsOpen(true);
                setIsMobileDrawerOpen(false);
              }}
              onOpenUpgradeModal={() => {
                openUpgradeModal('ads_performance');
                setIsMobileDrawerOpen(false);
              }}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* KOLOM 1: SIDEBAR KIRI STATIS DESKTOP (hidden lg:flex) */}
      <DashboardSidebar
        className="hidden lg:flex"
        tenantSlug={tenantSlug}
        displayName={displayName}
        storeDisplayName={storeDisplayName}
        storeLogoUrl={storeLogoUrl}
        storeCategory={storeCategory || businessType}
        businessType={businessType || storeCategory}
        capabilities={capabilities}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isTeamScale={isTeamScale}
        isAdsPerformance={isAdsPerformance}
        isAdsTrackingUnlocked={isAdsTrackingUnlocked}
        isSoloOrTrial={isSoloOrTrial}
        isCheckoutLite={isCheckoutLite}
        isTrialActive={isTrialActive}
        tierLabel={tierLabel}
        trialDaysLeft={trialDaysLeft}
        productCount={products.length}
        activeProductCount={activeProductsCount}
        orderCount={transactions.length}
        inboxCount={conversations.length}
        onOpenStoreSettings={() => {
          setNameError(null);
          setIsStoreSettingsOpen(true);
        }}
        onOpenUpgradeModal={() => openUpgradeModal('ads_performance')}
      />

      {/* KOLOM 2 & 3 WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full">
        {/* TOP MOBILE NAVBAR (< lg) */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-2xs">
          {/* Sisi Kiri: Tombol Hamburger Menu */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="p-2 -ml-1.5 rounded-xl text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              aria-label="Buka Menu Navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <OrderNotificationBell tenantSlug={tenantSlug} />
          </div>

          {/* Sisi Tengah: Nama & Logo Toko Ringkas */}
          <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={storeHeaderName}
                className="w-6 h-6 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 uppercase">
                {storeHeaderName.charAt(0)}
              </div>
            )}
            <span className="text-xs font-black text-slate-900 truncate">
              {storeHeaderName}
            </span>
          </div>

          {/* Sisi Kanan: Theme Toggle & Status Aktif */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme Switcher Mobile */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-emerald-400 hover:text-emerald-600 transition active:scale-95 cursor-pointer theme-toggle-btn"
              title={themeMode === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
              aria-label="Toggle Theme"
            >
              {themeMode === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Install App Button Mobile Header */}
            <PwaInstallPrompt tenantSlug={tenantSlug} variant="button" showNotificationButton={false} />

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`p-1.5 rounded-lg border transition ${
                activeTab === 'orders'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Pesanan"
            >
              <ShoppingBag className="w-4 h-4" />
            </button>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Store Online</span>
              <span className="sm:hidden">Live</span>
            </span>
          </div>
        </header>

        {/* SLIM MOBILE PWA INSTALL BANNER */}
        <PwaInstallPrompt tenantSlug={tenantSlug} variant="banner" />

        {/* TOP BAR RINGKAS DESKTOP (Header Canvas - hidden on mobile, flex on desktop) */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 xl:px-8 py-2.5 items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Shortcut Pesanan */}
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                activeTab === 'orders'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
              title="Akses Pesanan & Order"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Pesanan &amp; Order</span>
              {transactions?.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeTab === 'orders' ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {transactions.length}
                </span>
              )}
            </button>

            <OrderNotificationBell tenantSlug={tenantSlug} />
            <PwaInstallPrompt tenantSlug={tenantSlug} variant="button" />

            {saveFeedback && (
              <span className="text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fadeIn truncate">
                {saveFeedback}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Theme Toggle Desktop (Matahari / Bulan) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 font-bold flex items-center gap-2 text-xs transition active:scale-95 cursor-pointer shadow-2xs theme-toggle-btn"
              title={themeMode === 'dark' ? 'Beralih ke Mode Terang (Light Mode)' : 'Beralih ke Mode Gelap (Dark Mode)'}
            >
              {themeMode === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-slate-200">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-[11px] font-semibold text-slate-700">Dark Mode</span>
                </>
              )}
            </button>

            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Storefront Online</span>
            </span>
          </div>
        </header>

        {/* TRIAL BANNER IF ACTIVE */}
        <TrialBanner
          daysLeft={trialDaysLeft}
          trialEndsAt={trialEndsAt}
          tier={tenantFeatureFlags?.tier}
          onUpgrade={handleUpgradeTier}
        />

        {/* TRIAL QUOTA PROGRESS BAR (30 Order, 50 Interaksi AI, 15 Notifikasi WA) */}
        {isTrialActive && (
          <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-0 max-w-7xl mx-auto">
            <TrialQuotaProgressBar
              tenantSlug={tenantSlug}
              onUpgradeClick={() => handleUpgradeTier('ads_performance')}
            />
          </div>
        )}

        {/* CONTENT CANVAS AREA (KOLOM 2 & KOLOM 3) */}
        <div className="flex-1 flex items-start gap-6 p-4 sm:p-6 lg:p-8 min-w-0 w-full">
          {/* KOLOM 2: CANVAS FORM MODUL AKTIF (Full Width on Mobile) */}
          <div className="flex-1 min-w-0 w-full">
          {/* TAB 0: DASHBOARD UTAMA (ONBOARDING, ANALYTICS, INTEGRATED STOREFRONT HUB) */}
      {(activeTab === 'dashboard' || activeTab === 'overview') && (
        <DashboardOverviewTab
          tenantSlug={tenantSlug}
          displayName={displayName}
          storeDisplayName={storeDisplayName}
          storeBio={storeBio}
          storeLogoUrl={storeLogoUrl}
          storeQrisUrl={storeQrisUrl}
          waStatus={waStatus}
          connectedPhone={connectedPhone}
          products={products}
          transactions={transactions}
          totalOmzet={totalOmzet}
          isTeamScale={isTeamScale}
          isAdsPerformance={isAdsPerformance}
          isSoloOrTrial={isSoloOrTrial}
          isCheckoutLite={isCheckoutLite}
          isTrialActive={isTrialActive}
          tierLabel={tierLabel}
          trialDaysLeft={trialDaysLeft}
          storeCategory={storeCategory || businessType}
          chatConversationsCount={conversations.length}
          onOpenStoreSettings={() => {
            setNameError(null);
            setIsStoreSettingsOpen(true);
          }}
          onOpenNewProduct={openNewProductModal}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onSavedFeedback={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB 1: LIVE CHAT CS OMNICHANNEL */}
      {activeTab === 'inbox' && (
        <TeamChatTab
          tenantSlug={tenantSlug}
          conversations={conversations}
          activeConversation={activeConversation}
          activeConversationId={activeConversationId}
          setActiveConversationId={setActiveConversationId}
          replyText={replyText}
          setReplyText={setReplyText}
          handleSendMessage={handleSendMessage}
          isProScale={isProScale}
          isGrowthPlus={isGrowthPlus}
          isGrowth={isGrowth}
          isTeamScale={isTeamScale}
          isAdsPerformance={isAdsPerformance}
          handleUpgradeTier={handleUpgradeTier}
          isSoloOrTrial={isSoloOrTrial}
          trialDaysLeft={trialDaysLeft}
          trialEndsAt={trialEndsAt}
        />
      )}

      {/* TAB: PESANAN / ORDERS */}
      {activeTab === 'orders' && <OrdersTab tenantSlug={tenantSlug} orders={orders} />}

      {/* TAB 2: KATALOG MULTI-PRODUK */}
      {(activeTab === 'catalog' || activeTab === 'products') && (
        <ProductsTab
          products={products}
          tenantSlug={tenantSlug}
          openNewProductModal={openNewProductModal}
          openEditProductModal={openEditProductModal}
          handleDeleteProduct={handleDeleteProduct}
          handleQuickStockChange={handleQuickStockChange}
          openSinglePageBuilder={openSinglePageBuilder}
          onOpenBulkImport={() => setIsBulkImportModalOpen(true)}
          storeCategory={storeCategory}
          isCheckoutLite={isCheckoutLite}
          activeProductsCount={activeProductsCount}
        />
      )}

      {/* TAB: LINKS (TAUTAN & MICROSITE) */}
      {(activeTab === 'microsite' || activeTab === 'links') && (
        <MicrositeTab
          tenantSlug={tenantSlug}
          displayName={displayName}
          products={products}
          isTeamScale={isTeamScale}
          onLivePreviewUpdate={(data) => {
            if (data.bio !== undefined) setStoreBio(data.bio);
            if (data.buttons !== undefined) setLivePreviewButtons(data.buttons);
            if (data.showProducts !== undefined) setLivePreviewShowProducts(data.showProducts);
            if (data.featuredProductIds !== undefined) setLivePreviewFeaturedProductIds(data.featuredProductIds);
          }}
          onNavigateTab={(tab) => setActiveTab(tab as any)}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB: TAMPILAN (DESIGN & THEMES) */}
      {(activeTab === 'themes' || activeTab === 'storefront') && (
        <div className="max-w-4xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
          <StorefrontThemeCard
            tenantSlug={tenantSlug}
            isTeamScale={isTeamScale}
            isAdsPerformance={isAdsPerformance}
            currentVisualTheme={activeVisualTheme}
            products={products}
            initialButtons={livePreviewButtons}
            storeWhatsapp={storeWhatsapp}
            onThemeChange={handleThemeChange}
            onButtonsChange={(btns) => setLivePreviewButtons(btns)}
            onFeaturedProductsChange={(ids) => setLivePreviewFeaturedProductIds(ids)}
            onSaved={(msg) => {
              setSaveFeedback(msg);
              setTimeout(() => setSaveFeedback(null), 3500);
            }}
          />

          <CustomDomainCard tenantSlug={tenantSlug} isTeamScale={isTeamScale} />
        </div>
      )}

      {/* TAB 3: AI Knowledge */}
      {activeTab === 'ai_knowledge' && (
        <AiKnowledgeTab
          tenantSlug={tenantSlug}
          aiForm={aiForm}
          setAiForm={setAiForm}
          faqs={faqs}
          setFaqs={setFaqs}
          interactiveMenus={interactiveMenus}
          setInteractiveMenus={setInteractiveMenus}
          botStrategy={botStrategy}
          setBotStrategy={setBotStrategy}
          botMode={botMode}
          setBotMode={setBotMode}
          handleSaveAiKnowledge={handleSaveAiKnowledge}
          handleSaveBotStrategy={handleSaveBotStrategy}
          isSavingAi={isSavingAi}
          isLoadingAi={isLoadingAi}
          isSavingStrategy={isSavingStrategy}
          strategyFeedback={strategyFeedback}
          isSimulatorOpen={isSimulatorOpen}
          setIsSimulatorOpen={setIsSimulatorOpen}
          storeCategory={storeCategory}
          renderVerticalModule={renderVerticalModule}
        />
      )}

      {/* TAB: LAPORAN & KEUANGAN */}
      {(activeTab === 'finance' || activeTab === 'integration' || activeTab === 'overview' || activeTab === 'analytics') && (
        isSoloOrTrial ? (
          <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
            {renderLockedFeatureCard({
              title: 'Laporan & Keuangan',
              badge: 'Fitur Eksklusif Ads Performance & Team Scale',
              description:
                'Akses laporan omzet, riwayat transaksi, analitik konversi, dan manajemen penarikan saldo. Tersedia di paket Ads Performance (Rp 299k) atau Team Scale.',
              targetTier: 'ads_performance',
              targetTierLabel: 'Ads Performance',
            })}
          </div>
        ) : (
          <OverviewTab
            totalOmzet={totalOmzet}
            readyBalance={readyBalance}
            bankForm={bankForm}
            setBankForm={setBankForm}
            displayName={displayName}
            transactions={transactions && transactions.length > 0 ? transactions : orders}
            isWithdrawModalOpen={isWithdrawModalOpen}
            setIsWithdrawModalOpen={setIsWithdrawModalOpen}
            withdrawAmount={withdrawAmount}
            setWithdrawAmount={setWithdrawAmount}
            handleProcessWithdraw={handleProcessWithdraw}
            isWithdrawing={isWithdrawing}
          />
        )
      )}

      {/* TAB: SETTINGS & PROFIL TOKO */}
      {activeTab === 'settings' && (
        <SettingsTab
          tenantSlug={tenantSlug}
          storeDisplayName={storeDisplayName}
          setStoreDisplayName={setStoreDisplayName}
          storeBio={storeBio}
          setStoreBio={setStoreBio}
          storeWhatsapp={storeWhatsapp}
          setStoreWhatsapp={setStoreWhatsapp}
          storeQrisUrl={storeQrisUrl}
          storeQrisPayload={storeQrisPayload}
          setStoreQrisPayload={setStoreQrisPayload}
          handleQrisUpload={handleQrisUpload}
          isUploadingQris={isUploadingQris}
          storeLogoUrl={storeLogoUrl}
          handleLogoUpload={handleLogoUpload}
          isUploadingLogo={isUploadingLogo}
          nameError={nameError}
          setNameError={setNameError}
          isTeamScale={isTeamScale}
          isCheckoutLite={isCheckoutLite}
          isModal={false}
          onSavedSuccess={() => {
            setSaveFeedback('Profil toko berhasil disimpan.');
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB 5: WHATSAPP & BROADCAST UNIFIED HUB */}
      {(activeTab === 'whatsapp' || activeTab === 'broadcast' || activeTab === 'auto_reply' || activeTab === 'rotator') && (
        <div className="flex-1 flex flex-col">
          {/* Sub Navigation Hub */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-2.5 flex items-center justify-between gap-3">
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 items-center">
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'whatsapp'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Koneksi Gateway & Bot
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('auto_reply')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'auto_reply'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aturan Auto-Reply (Keyword)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('broadcast')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'broadcast'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Broadcast WA Massal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rotator')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'rotator'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🔄 CS / WhatsApp Rotator</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Pusat automasi & penyiaran pesan pelanggan WhatsApp
            </span>
          </div>

          {activeTab === 'whatsapp' && (
            <WhatsAppTab
              tenantSlug={tenantSlug}
              displayName={displayName}
              waMode={waMode}
              setWaMode={setWaMode}
              waStatus={waStatus}
              setWaStatus={setWaStatus}
              waProvider={waProvider}
              waConnectionMode={waConnectionMode}
              qrCodeUrl={qrCodeUrl}
              setQrCodeUrl={setQrCodeUrl}
              isQrLoading={isQrLoading}
              waErrorMessage={waErrorMessage}
              connectedPhone={connectedPhone}
              setConnectedPhone={setConnectedPhone}
              handleConnectGrowthSession={handleConnectGrowthSession}
              botStrategy={botStrategy}
              setBotStrategy={setBotStrategy}
              handleSaveBotStrategy={handleSaveBotStrategy}
              isSavingStrategy={isSavingStrategy}
              isLoadingAi={isLoadingAi}
              strategyFeedback={strategyFeedback}
              isProScale={isProScale}
              renderLockedFeatureCard={renderLockedFeatureCard}
              setSaveFeedback={setSaveFeedback}
            />
          )}

          {activeTab === 'auto_reply' && (
            <WhatsAppAutoReplyManager
              tenantSlug={tenantSlug}
              displayName={displayName}
              onSaved={(msg) => {
                setSaveFeedback(msg);
                setTimeout(() => setSaveFeedback(null), 4000);
              }}
            />
          )}

          {activeTab === 'rotator' && (
            <WhatsAppRotatorManager
              tenantSlug={tenantSlug}
              displayName={displayName}
              onSaved={(msg) => {
                setSaveFeedback(msg);
                setTimeout(() => setSaveFeedback(null), 4000);
              }}
            />
          )}

          {activeTab === 'broadcast' &&
            (!isProScale ? (
              <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
                {renderLockedFeatureCard({
                  title: 'Broadcast WA Massal (Meta Cloud API)',
                  badge: 'Fitur Eksklusif Team Scale (Official WABA)',
                  description:
                    'Fitur Eksklusif Team Scale (Official WABA). Kirim pesan promosi massal resmi anti-banned langsung lewat Meta Cloud API.',
                  targetTier: 'team_scale',
                  targetTierLabel: 'Team Scale',
                })}
              </div>
            ) : (
              <WhatsAppBroadcastManager
                tenantSlug={tenantSlug}
                displayName={displayName}
                onSaved={(msg) => {
                  setSaveFeedback(msg);
                  setTimeout(() => setSaveFeedback(null), 4000);
                }}
              />
            ))}
        </div>
      )}

      {/* TAB: ADS TRACKING PRO & CAPI */}
      {activeTab === 'ads_tracking' && (
        <AdsTrackingTab
          isAdsTrackingUnlocked={isAdsTrackingUnlocked}
          isCheckoutLite={isCheckoutLite}
          tenantSlug={tenantSlug}
          displayName={displayName}
          onUpgradeTier={handleUpgradeTier}
          renderLockedFeatureCard={renderLockedFeatureCard}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB: LOGISTIK & EKSPEDISI MULTI-KURIR (HANYA PRODUK FISIK) */}
      {(activeTab === 'shipping' || activeTab === 'biteship') && (
        resolveDomainVertical(storeCategory) === 'fnb-culinary' ? (
          <ModularVerticalTabDispatcher
            verticalKey="fnb-culinary"
            tenantSlug={tenantSlug}
          />
        ) : (
          <BiteshipCourierConfig
            tenantSlug={tenantSlug}
            displayName={displayName}
            onSaved={(msg) => {
              setSaveFeedback(msg);
              setTimeout(() => setSaveFeedback(null), 3000);
            }}
          />
        )
      )}

      {/* TAB: BOOKING & JADWAL (FIELD SERVICE / JASA / PRO SERVICE) */}
      {activeTab === 'booking' && (
        <ModularVerticalTabDispatcher
          verticalKey={resolveDomainVertical(storeCategory)}
          tenantSlug={tenantSlug}
        />
      )}

      {/* TAB: AKSES UNDUH & DIGITAL DELIVERY (PRODUK DIGITAL) */}
      {activeTab === 'downloads' && (
        <ModularVerticalTabDispatcher
          verticalKey="digital-product"
          tenantSlug={tenantSlug}
        />
      )}

      {/* TAB: MANAJEMEN KAMPANYE & UGC (CREATOR AGENCY) */}
      {activeTab === 'campaigns' && (
        <ModularVerticalTabDispatcher
          verticalKey="creator-agency"
          tenantSlug={tenantSlug}
        />
      )}

            {/* MOBILE LIVE PHONE PREVIEW (< lg, smartphone) */}
            {isPreviewEnabledTab && (
              <div className="lg:hidden mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center">
                <div className="w-full max-w-[360px]">
                  <div className="mb-3 px-1 text-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Pratinjau Langsung Mobile (Live Preview)
                    </span>
                  </div>
                  <LivePhonePreview
                    tenantSlug={tenantSlug}
                    displayName={storeDisplayName || displayName}
                    storeBio={storeBio}
                    storeLogoUrl={storeLogoUrl}
                    storeWhatsapp={storeWhatsapp}
                    visualTheme={activeVisualTheme}
                    buttons={livePreviewButtons}
                    showProducts={livePreviewShowProducts}
                    products={products}
                    featuredProductIds={livePreviewFeaturedProductIds}
                  />
                </div>
              </div>
            )}
          </div>

          {/* KOLOM 3: STICKY LIVE PHONE PREVIEW DESKTOP (SPLIT-SCREEN DUA KOLOM, >= lg) */}
          {isPreviewEnabledTab && (
            <div className="hidden lg:block w-[360px] xl:w-[380px] sticky top-20 shrink-0 self-start">
              <LivePhonePreview
                tenantSlug={tenantSlug}
                displayName={storeDisplayName || displayName}
                storeBio={storeBio}
                storeLogoUrl={storeLogoUrl}
                storeWhatsapp={storeWhatsapp}
                visualTheme={activeVisualTheme}
                buttons={livePreviewButtons}
                showProducts={livePreviewShowProducts}
                products={products}
                featuredProductIds={livePreviewFeaturedProductIds}
              />
            </div>
          )}
        </div>
      </div>

      {/* BOONPILOT AI COPILOT FLOATING WIDGET */}
      <BoonPilotWidget
        tenantSlug={tenantSlug}
        storeCategory={storeCategory}
        businessType={businessType || storeCategory}
        storeName={displayName}
        isProductsEmpty={products.length === 0}
        onOpenBulkImport={() => setIsBulkImportModalOpen(true)}
        onOpenNewProduct={openNewProductModal}
        productsCount={products.length}
        botConnected={waStatus === 'CONNECTED' || !!connectedPhone}
        isQrisUploaded={!!storeQrisUrl}
        subscriptionPlan={tenantFeatureFlags.tier || (isSoloOrTrial ? 'SOLO_TRIAL' : 'GROWTH')}
      />

      {/* MODAL BULK IMPORT */}
      <BulkImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        tenantSlug={tenantSlug}
        onSuccess={(count) => {
          setSaveFeedback(`✅ Berhasil mengimpor ${count} produk baru!`);
          setTimeout(() => setSaveFeedback(null), 4000);
        }}
        refreshProducts={refreshProducts}
      />

      {/* MODAL FORM PRODUK */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProductForm}
        productForm={productForm}
        setProductForm={setProductForm}
        editingProductId={editingProductId}
        storeCategory={storeCategory}
        tenantSlug={tenantSlug}
        isCheckoutLite={isCheckoutLite}
        activeProductsCount={activeProductsCount}
      />

      {/* MODAL BUILDER SINGLE PAGE CHECKOUT */}
      <SinglePageBuilderModal
        isOpen={isSinglePageModalOpen}
        onClose={() => setIsSinglePageModalOpen(false)}
        activeProduct={activeSinglePageProduct}
        singlePageForm={singlePageForm}
        setSinglePageForm={setSinglePageForm}
        onSave={handleSaveSinglePageConfig}
        tenantSlug={tenantSlug}
      />

      {/* MODAL EDIT PROFIL TOKO */}
      {isStoreSettingsOpen && (
        <SettingsTab
          tenantSlug={tenantSlug}
          storeDisplayName={storeDisplayName}
          setStoreDisplayName={setStoreDisplayName}
          storeBio={storeBio}
          setStoreBio={setStoreBio}
          storeWhatsapp={storeWhatsapp}
          setStoreWhatsapp={setStoreWhatsapp}
          storeQrisUrl={storeQrisUrl}
          storeQrisPayload={storeQrisPayload}
          setStoreQrisPayload={setStoreQrisPayload}
          handleQrisUpload={handleQrisUpload}
          isUploadingQris={isUploadingQris}
          storeLogoUrl={storeLogoUrl}
          handleLogoUpload={handleLogoUpload}
          isUploadingLogo={isUploadingLogo}
          nameError={nameError}
          setNameError={setNameError}
          isTeamScale={isTeamScale}
          isCheckoutLite={isCheckoutLite}
          isModal={true}
          isOpen={isStoreSettingsOpen}
          onClose={() => setIsStoreSettingsOpen(false)}
          onSavedSuccess={() => {
            setSaveFeedback('Profil toko berhasil disimpan.');
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* MODAL UPSELL REVERSE TRIAL / FITUR RESTRICTED */}
      <UpsellModal
        isOpen={isUpsellModalOpen}
        onClose={() => setIsUpsellModalOpen(false)}
        onUpgrade={() => handleUpgradeTier('ads_performance')}
      />

      {/* MODAL PEMBAYARAN UPGRADE LANGSUNG & PILIHAN PAKET (XENDIT & QRIS) */}
      <UpgradePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tenantSlug={tenantSlug}
        displayName={displayName}
        targetTier={targetUpgradeTier}
        currentTier={tenantFeatureFlags?.tier || (isCheckoutLite ? 'CHECKOUT_LITE' : isSoloOrTrial ? 'SOLO' : isAdsPerformance ? 'ADS_PERFORMANCE' : 'PRO_SCALE')}
        isTrial={isTrialActive}
        subscriptionStatus={subscriptionStatus || (isTrialActive ? 'trial' : 'active')}
      />
    </main>
  );
}